import "server-only";
import type { Kysely } from "kysely";
import { isDemoMode } from "../config";
import type { Database, User } from "../db/schema";
import { decryptPlatform, encryptPlatform, signToken, verifyTokenSignature } from "../secrets";
import { logSecurityEvent } from "../security-log";
import { burnPasswordTime, hashPassword, needsRehash, verifyPassword } from "./password";
import { generateRecoveryCodes, normalizeRecoveryCode, verifyTotp } from "./totp";

/**
 * Sign-in rules (plan §7.6), with an explicit database so they can be tested:
 * - lockout: 10 wrong passwords in a row lock the account for 15 minutes
 *   (on top of the per-IP and per-address rate limits in the login action);
 *   the answer is the same for unknown and locked accounts;
 * - old password hashes are upgraded to argon2id on the next good sign-in;
 * - TOTP second factor with single-use recovery codes; required for
 *   administrators (except on the read-only demo and with WPK_ADMIN_2FA=off
 *   for automated tests), optional for everyone else.
 */

export const LOCK_AFTER = 10;
export const LOCK_MS = 15 * 60_000;
export const CHALLENGE_MS = 5 * 60_000;

export interface Ctx {
  ip?: string | null;
  userAgent?: string | null;
}

export type AuthResult = { ok: true; user: User; needs2fa: boolean } | { ok: false; reason: "invalid" | "locked" | "suspended" };

export async function authenticate(db: Kysely<Database>, email: string, password: string, ctx: Ctx = {}, nowMs = Date.now()): Promise<AuthResult> {
  const user = await db.selectFrom("users").selectAll().where("email", "=", email.trim().toLowerCase()).executeTakeFirst();
  if (!user) {
    await burnPasswordTime(password);
    await logSecurityEvent(db, { action: "login.failed", target: "unknown account", ...ctx });
    return { ok: false, reason: "invalid" };
  }
  const now = new Date(nowMs).toISOString();
  if (user.locked_until && user.locked_until > now) {
    await burnPasswordTime(password);
    await logSecurityEvent(db, { action: "login.locked", userId: user.id, ...ctx });
    return { ok: false, reason: "locked" };
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    const failed = (user.failed_logins ?? 0) + 1;
    const lock = failed >= LOCK_AFTER;
    await db
      .updateTable("users")
      .set({ failed_logins: lock ? 0 : failed, locked_until: lock ? new Date(nowMs + LOCK_MS).toISOString() : user.locked_until })
      .where("id", "=", user.id)
      .execute();
    await logSecurityEvent(db, { action: lock ? "login.locked" : "login.failed", userId: user.id, target: `attempt ${failed}`, ...ctx });
    return { ok: false, reason: lock ? "locked" : "invalid" };
  }
  if (user.status !== "active") return { ok: false, reason: "suspended" };
  const updates: Partial<{ failed_logins: number; locked_until: null; password_hash: string; password_changed_at: string }> = {};
  if (user.failed_logins || user.locked_until) Object.assign(updates, { failed_logins: 0, locked_until: null });
  if (needsRehash(user.password_hash)) {
    updates.password_hash = await hashPassword(password);
    await logSecurityEvent(db, { action: "password.rehashed", userId: user.id, target: "argon2id", ...ctx });
  }
  if (Object.keys(updates).length) await db.updateTable("users").set(updates).where("id", "=", user.id).execute();
  return { ok: true, user: { ...user, ...updates } as User, needs2fa: Boolean(user.totp_enabled_at && user.totp_secret_enc) };
}

/** Whether this account must use a second factor before it may act as an administrator. */
export function twoFactorRequired(user: Pick<User, "role">): boolean {
  return user.role === "admin" && !isDemoMode() && process.env.WPK_ADMIN_2FA !== "off";
}

// ── Login challenge between password and code (signed, 5 minutes) ──

export function createChallenge(userId: number, nowMs = Date.now()): string {
  const payload = `${userId}.${nowMs + CHALLENGE_MS}`;
  return `${payload}.${signToken("login-2fa", payload)}`;
}

export function readChallenge(token: string | undefined, nowMs = Date.now()): number | null {
  const [id, exp, sig] = (token ?? "").split(".");
  if (!id || !exp || !sig || !verifyTokenSignature("login-2fa", `${id}.${exp}`, sig)) return null;
  if (Number(exp) < nowMs) return null;
  const userId = Number(id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

// ── TOTP and recovery codes ──

/** The setup form carries the new secret with this signature, so the server never trusts a secret it didn't make. */
export function signSetupSecret(userId: number, secret: string): string {
  return signToken("totp-setup", `${userId}:${secret}`);
}

const recoveryHash = (userId: number, code: string) => signToken("recovery-code", `${userId}:${normalizeRecoveryCode(code)}`);

function parseCodes(json: string | null): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Turn 2FA on after the user typed a valid code for the new secret. Returns the recovery codes (shown once). */
export async function enableTotp(db: Kysely<Database>, userId: number, secret: string, code: string, ctx: Ctx = {}, nowMs = Date.now()): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  const step = verifyTotp(secret, code, 0, nowMs);
  if (step === null) return { ok: false };
  const codes = generateRecoveryCodes();
  await db
    .updateTable("users")
    .set({
      totp_secret_enc: encryptPlatform(secret),
      totp_enabled_at: new Date(nowMs).toISOString(),
      totp_last_step: step,
      recovery_codes: JSON.stringify(codes.map((c) => recoveryHash(userId, c))),
    })
    .where("id", "=", userId)
    .execute();
  await logSecurityEvent(db, { action: "2fa.enabled", userId, ...ctx });
  return { ok: true, recoveryCodes: codes };
}

export async function disableTotp(db: Kysely<Database>, userId: number, ctx: Ctx & { actorId?: number } = {}): Promise<void> {
  await db.updateTable("users").set({ totp_secret_enc: null, totp_enabled_at: null, totp_last_step: 0, recovery_codes: null }).where("id", "=", userId).execute();
  await logSecurityEvent(db, { action: "2fa.disabled", userId, ...ctx });
}

export async function regenerateRecoveryCodes(db: Kysely<Database>, userId: number, ctx: Ctx = {}): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.updateTable("users").set({ recovery_codes: JSON.stringify(codes.map((c) => recoveryHash(userId, c))) }).where("id", "=", userId).execute();
  await logSecurityEvent(db, { action: "2fa.recovery_regenerated", userId, ...ctx });
  return codes;
}

export async function remainingRecoveryCodes(db: Kysely<Database>, userId: number): Promise<number> {
  const row = await db.selectFrom("users").select("recovery_codes").where("id", "=", userId).executeTakeFirst();
  return parseCodes(row?.recovery_codes ?? null).length;
}

/**
 * Check a TOTP code (each time step works once) or a recovery code (removed
 * when used). Wrong codes count towards the same lockout as wrong passwords.
 */
export async function verifySecondFactor(db: Kysely<Database>, userId: number, code: string, ctx: Ctx = {}, nowMs = Date.now()): Promise<"totp" | "recovery" | null> {
  const user = await db.selectFrom("users").select(["id", "totp_secret_enc", "totp_last_step", "recovery_codes", "failed_logins", "locked_until"]).where("id", "=", userId).executeTakeFirst();
  if (!user?.totp_secret_enc) return null;
  if (user.locked_until && user.locked_until > new Date(nowMs).toISOString()) return null;
  const secret = decryptPlatform(user.totp_secret_enc);
  if (secret) {
    const step = verifyTotp(secret, code, user.totp_last_step ?? 0, nowMs);
    if (step !== null) {
      // Conditional update: two requests with the same code can't both pass.
      const r = await db.updateTable("users").set({ totp_last_step: step, failed_logins: 0 }).where("id", "=", userId).where("totp_last_step", "<", step).executeTakeFirst();
      if (Number(r.numUpdatedRows)) return "totp";
    }
  }
  const codes = parseCodes(user.recovery_codes);
  const hash = recoveryHash(userId, code);
  if (normalizeRecoveryCode(code).length === 10 && codes.includes(hash)) {
    const left = codes.filter((c) => c !== hash);
    const r = await db.updateTable("users").set({ recovery_codes: JSON.stringify(left), failed_logins: 0 }).where("id", "=", userId).where("recovery_codes", "=", user.recovery_codes).executeTakeFirst();
    if (Number(r.numUpdatedRows)) {
      await logSecurityEvent(db, { action: "login.recovery_code", userId, target: `${left.length} left`, ...ctx });
      return "recovery";
    }
  }
  const failed = (user.failed_logins ?? 0) + 1;
  const lock = failed >= LOCK_AFTER;
  await db.updateTable("users").set({ failed_logins: lock ? 0 : failed, locked_until: lock ? new Date(nowMs + LOCK_MS).toISOString() : user.locked_until }).where("id", "=", userId).execute();
  await logSecurityEvent(db, { action: lock ? "login.locked" : "login.2fa_failed", userId, ...ctx });
  return null;
}
