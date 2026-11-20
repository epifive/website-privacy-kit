import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, now } from "../db";
import type { User } from "../db/schema";
import { twoFactorRequired } from "./service";

/**
 * Sessions (plan §7.6). The cookie holds a random 256-bit token; the database
 * keeps only its SHA-256. Cookie: HttpOnly, SameSite=Lax, Secure on HTTPS
 * (always in production unless WPK_INSECURE_COOKIES=1 for a plain-HTTP LAN).
 * A new token is issued on every sign-in and password change (no fixation),
 * the old one is deleted. Sessions end after an idle period and an absolute
 * lifetime, shorter for administrators.
 */

export const SESSION_COOKIE = "wpk_session";
export const CHALLENGE_COOKIE = "wpk_2fa";

export const SESSION_LIMITS = {
  user: { absoluteMs: 30 * 86_400_000, idleMs: 3 * 86_400_000 },
  admin: { absoluteMs: 12 * 3_600_000, idleMs: 2 * 3_600_000 },
} as const;
const TOUCH_MS = 5 * 60_000;

export type SessionUser = Pick<User, "id" | "name" | "email" | "role" | "status" | "created_at" | "updated_at"> & {
  /** The session was created after a second factor. */
  mfa: boolean;
  /** The account has TOTP 2FA on. */
  totpEnabled: boolean;
};

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function isHttps(): Promise<boolean> {
  if (process.env.NODE_ENV === "production" && process.env.WPK_INSECURE_COOKIES !== "1") return true;
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return (h.get("origin") ?? h.get("referer") ?? "").startsWith("https://");
}

export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = (h.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const hops = Math.min(10, Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1));
  const ip = forwarded.length ? forwarded[Math.max(0, forwarded.length - hops)] : h.get("x-real-ip");
  return { ip: ip ? ip.slice(0, 64) : null, userAgent: (h.get("user-agent") ?? "").slice(0, 255) || null };
}

/** Create a session for the user and set the session cookie. Server Actions / Route Handlers only. */
export async function createSession(userId: number, opts: { mfa?: boolean } = {}): Promise<void> {
  const jar = await cookies();
  const db = await getDb();
  // Session fixation: whatever session the browser had is dropped, a fresh token is issued.
  const previous = jar.get(SESSION_COOKIE)?.value;
  if (previous) await db.deleteFrom("sessions").where("id", "=", hashToken(previous)).execute();
  const user = await db.selectFrom("users").select("role").where("id", "=", userId).executeTakeFirst();
  const limits = user?.role === "admin" ? SESSION_LIMITS.admin : SESSION_LIMITS.user;
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + limits.absoluteMs);
  const ctx = await requestContext();
  const ts = now();
  await db
    .insertInto("sessions")
    .values({ id: hashToken(token), user_id: userId, expires_at: expires.toISOString(), ip: ctx.ip, user_agent: ctx.userAgent, created_at: ts, last_seen_at: ts, mfa: opts.mfa ? 1 : 0 })
    .execute();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: await isHttps(), path: "/", expires });
  jar.delete(CHALLENGE_COOKIE);
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.deleteFrom("sessions").where("id", "=", hashToken(token)).execute();
  }
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: number): Promise<void> {
  const db = await getDb();
  await db.deleteFrom("sessions").where("user_id", "=", userId).execute();
}

/** Sign out every other device; the current session stays. */
export async function destroyOtherSessions(userId: number): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = await getDb();
  let q = db.deleteFrom("sessions").where("user_id", "=", userId);
  if (token) q = q.where("id", "!=", hashToken(token));
  return Number((await q.executeTakeFirst()).numDeletedRows ?? 0);
}

/** Whether a session row is still valid at `nowMs` (absolute expiry and idle timeout). */
export function sessionAlive(row: { expires_at: string; created_at: string; last_seen_at: string | null }, role: string, nowMs = Date.now()): boolean {
  const limits = role === "admin" ? SESSION_LIMITS.admin : SESSION_LIMITS.user;
  if (Date.parse(row.expires_at) <= nowMs) return false;
  if (Date.parse(row.created_at) + limits.absoluteMs <= nowMs) return false;
  return Date.parse(row.last_seen_at ?? row.created_at) + limits.idleMs > nowMs;
}

/** The signed-in user for the current request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const id = hashToken(token);
  const row = await db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.user_id")
    .select([
      "users.id",
      "users.name",
      "users.email",
      "users.role",
      "users.status",
      "users.created_at",
      "users.updated_at",
      "users.totp_enabled_at",
      "sessions.expires_at",
      "sessions.created_at as session_created_at",
      "sessions.last_seen_at",
      "sessions.mfa",
    ])
    .where("sessions.id", "=", id)
    .executeTakeFirst();
  if (!row || row.status !== "active") return null;
  const nowMs = Date.now();
  if (!sessionAlive({ expires_at: row.expires_at, created_at: row.session_created_at, last_seen_at: row.last_seen_at }, row.role, nowMs)) {
    await db.deleteFrom("sessions").where("id", "=", id).execute();
    return null;
  }
  if (nowMs - Date.parse(row.last_seen_at ?? row.session_created_at) > TOUCH_MS) {
    await db.updateTable("sessions").set({ last_seen_at: new Date(nowMs).toISOString() }).where("id", "=", id).execute();
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    mfa: row.mfa === 1,
    totpEnabled: Boolean(row.totp_enabled_at),
  };
});

export async function requireUser(next = "/account"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** An administrator may act as one only after a second factor (when required). */
export function adminVerified(user: SessionUser): boolean {
  return user.role === "admin" && (!twoFactorRequired(user) || (user.totpEnabled && user.mfa));
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/");
  if (!adminVerified(user)) redirect(user.totpEnabled ? "/login?next=/admin&reauth=1" : "/account/security?required=1");
  return user;
}

/** For Server Actions: throws instead of redirecting so the action fails loudly. */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !adminVerified(user)) throw new Error("Unauthorized");
  return user;
}

export async function cleanupExpiredSessions(): Promise<number> {
  const db = await getDb();
  const r = await db.deleteFrom("sessions").where("expires_at", "<", now()).executeTakeFirst();
  await db.deleteFrom("password_resets").where("expires_at", "<", now()).execute();
  return Number(r.numDeletedRows ?? 0);
}
