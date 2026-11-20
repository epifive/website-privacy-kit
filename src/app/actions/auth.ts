"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies } from "next/headers";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { authenticate, createChallenge, readChallenge, twoFactorRequired, verifySecondFactor } from "@/lib/auth/service";
import { CHALLENGE_COOKIE, createSession, destroyAllSessions, destroySession, getCurrentUser, isHttps, requestContext } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/security-log";
import { DEMO_MESSAGE } from "@/lib/admin";
import { isDemoMode } from "@/lib/config";
import { getDb, now } from "@/lib/db";
import type { Translator } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { mailConfigured, sendMail } from "@/lib/mail";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site";
import { safeNextPath } from "@/lib/utils";
import type { FormState } from "./types";

const emailField = (t: Translator) =>
  z.email(t("auth.err.invalidEmail")).max(190).transform((v) => v.trim().toLowerCase());
const passwordField = (t: Translator) => z.string().min(8, t("auth.err.passwordLength")).max(200);

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const ip = await clientIp();
  if (!rateLimit(`login:${ip}`, 10, 15 * 60_000)) {
    return { error: t("auth.err.tooManyLogins") };
  }
  const parsed = z
    .object({ email: emailField(t), password: z.string().min(1, t("auth.err.enterPassword")).max(200) })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Per address as well, so a botnet can't spread guesses over many IPs (same answer for unknown addresses).
  if (!rateLimit(`login:email:${parsed.data.email}`, 10, 15 * 60_000)) return { error: t("auth.err.tooManyLogins") };

  const db = await getDb();
  const ctx = await requestContext();
  const result = await authenticate(db, parsed.data.email, parsed.data.password, ctx);
  if (!result.ok) {
    if (result.reason === "suspended") return { error: t("auth.err.suspended") };
    if (result.reason === "locked") return { error: t("auth.err.locked") };
    return { error: t("auth.err.wrongCredentials") };
  }
  const user = result.user;
  const next = safeNextPath(formData.get("next"), user.role === "admin" ? "/admin" : "/account");
  if (result.needs2fa) {
    (await cookies()).set(CHALLENGE_COOKIE, createChallenge(user.id), { httpOnly: true, sameSite: "lax", secure: await isHttps(), path: "/", maxAge: 300 });
    redirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  }
  await createSession(user.id);
  await logSecurityEvent(db, { action: "login.success", userId: user.id, target: "password", ...ctx });
  // Administrators must set up a second factor before they can use the admin area.
  redirect(twoFactorRequired(user) ? "/account/security?required=1" : next);
}

/** Second step of sign-in: a code from the authenticator app or a recovery code. */
export async function verifyLogin2fa(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const jar = await cookies();
  const userId = readChallenge(jar.get(CHALLENGE_COOKIE)?.value);
  if (!userId) return { error: t("auth.err.challengeExpired") };
  if (!rateLimit(`2fa:${userId}`, 5, 5 * 60_000) || !rateLimit(`2fa:ip:${await clientIp()}`, 20, 5 * 60_000)) return { error: t("auth.err.tooManyCodes") };
  const code = String(formData.get("code") ?? "").trim().slice(0, 20);
  const db = await getDb();
  const ctx = await requestContext();
  const how = await verifySecondFactor(db, userId, code, ctx);
  if (!how) return { error: t("auth.err.wrongCode") };
  const user = await db.selectFrom("users").select(["id", "role", "status"]).where("id", "=", userId).executeTakeFirst();
  if (!user || user.status !== "active") return { error: t("auth.err.suspended") };
  await createSession(user.id, { mfa: true });
  await logSecurityEvent(db, { action: "login.success", userId: user.id, target: how === "totp" ? "password + TOTP" : "password + recovery code", ...ctx });
  redirect(safeNextPath(formData.get("next"), user.role === "admin" ? "/admin" : "/account"));
}

export async function logout(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await logSecurityEvent(await getDb(), { action: "logout", userId: user.id, ...(await requestContext()) });
  await destroySession();
  redirect("/");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const [settings, t] = await Promise.all([getSettings(), getT()]);
  if (!mailConfigured(settings)) {
    return { error: t("auth.err.resetUnavailable", { email: settings.site_email }) };
  }
  const ip = await clientIp();
  if (!rateLimit(`reset:${ip}`, 5, 60 * 60_000)) return { error: t("auth.err.tooManyRequests") };

  const parsed = emailField(t).safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = await getDb();
  const user = await db.selectFrom("users").select(["id", "name", "email"]).where("email", "=", parsed.data).executeTakeFirst();
  // Always answer the same way so the form can't be used to discover accounts.
  const message = t("auth.resetSent");
  if (!user) return { success: message };

  if (!rateLimit(`reset:email:${user.id}`, 3, 60 * 60_000)) return { success: message };
  await logSecurityEvent(db, { action: "password.reset_requested", userId: user.id, ...(await requestContext()) });
  const token = crypto.randomBytes(32).toString("base64url");
  await db.deleteFrom("password_resets").where("user_id", "=", user.id).execute();
  await db
    .insertInto("password_resets")
    .values({
      token_hash: hashToken(token),
      user_id: user.id,
      expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      created_at: now(),
    })
    .execute();

  try {
    await sendMail({
      to: user.email,
      subject: `Reset your ${settings.site_name} password`,
      text: `Hi ${user.name},\n\nUse the link below to choose a new password. It expires in 1 hour.\n\n${absoluteUrl(settings, `/reset-password?token=${token}`)}\n\nIf you didn't ask for this, you can ignore this email.`,
    });
  } catch {
    return { error: t("auth.err.mailFailed") };
  }
  return { success: message };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const parsed = z
    .object({ token: z.string().min(10, t("auth.err.linkInvalid")), password: passwordField(t) })
    .safeParse({ token: formData.get("token"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = await getDb();
  const reset = await db
    .selectFrom("password_resets")
    .selectAll()
    .where("token_hash", "=", hashToken(parsed.data.token))
    .executeTakeFirst();
  if (!reset || reset.expires_at < now()) {
    return { error: t("auth.err.linkExpired") };
  }
  const ts = now();
  // A reset link proves the email address only: it unlocks the account but never skips 2FA.
  await db
    .updateTable("users")
    .set({ password_hash: await hashPassword(parsed.data.password), password_changed_at: ts, failed_logins: 0, locked_until: null, updated_at: ts })
    .where("id", "=", reset.user_id)
    .execute();
  await db.deleteFrom("password_resets").where("user_id", "=", reset.user_id).execute();
  await destroyAllSessions(reset.user_id);
  await logSecurityEvent(db, { action: "password.reset", userId: reset.user_id, ...(await requestContext()) });
  const owner = await db.selectFrom("users").select(["totp_enabled_at"]).where("id", "=", reset.user_id).executeTakeFirst();
  if (owner?.totp_enabled_at) {
    (await cookies()).set(CHALLENGE_COOKIE, createChallenge(reset.user_id), { httpOnly: true, sameSite: "lax", secure: await isHttps(), path: "/", maxAge: 300 });
    redirect("/login/2fa?next=%2Faccount%3Fpassword%3Dreset");
  }
  await createSession(reset.user_id);
  redirect("/account?password=reset");
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  if (!user) return { error: t("auth.err.sessionExpired") };
  if (isDemoMode() && user.role === "admin") return { error: DEMO_MESSAGE };
  const parsed = z
    .object({ name: z.string().trim().min(2, t("auth.err.enterName")).max(120), email: emailField(t) })
    .safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = await getDb();
  if (parsed.data.email !== user.email) {
    const taken = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", parsed.data.email)
      .where("id", "!=", user.id)
      .executeTakeFirst();
    if (taken) return { error: t("auth.err.emailInUse") };
  }
  await db
    .updateTable("users")
    .set({ name: parsed.data.name, email: parsed.data.email, updated_at: now() })
    .where("id", "=", user.id)
    .execute();
  return { success: t("auth.profileSaved") };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  if (!user) return { error: t("auth.err.sessionExpired") };
  if (isDemoMode() && user.role === "admin") return { error: DEMO_MESSAGE };
  const parsed = z
    .object({ current: z.string().min(1, t("auth.err.currentPassword")), password: passwordField(t) })
    .safeParse({ current: formData.get("current_password"), password: formData.get("new_password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = await getDb();
  const row = await db.selectFrom("users").select("password_hash").where("id", "=", user.id).executeTakeFirstOrThrow();
  if (!(await verifyPassword(parsed.data.current, row.password_hash))) {
    return { error: t("auth.err.currentWrong") };
  }
  const ts = now();
  await db
    .updateTable("users")
    .set({ password_hash: await hashPassword(parsed.data.password), password_changed_at: ts, updated_at: ts })
    .where("id", "=", user.id)
    .execute();
  // Every other device is signed out; this one gets a fresh session (same 2FA state).
  await destroyAllSessions(user.id);
  await createSession(user.id, { mfa: user.mfa });
  await logSecurityEvent(db, { action: "password.changed", userId: user.id, ...(await requestContext()) });
  return { success: t("auth.passwordChanged") };
}
