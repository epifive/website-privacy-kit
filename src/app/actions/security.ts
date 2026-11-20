"use server";

import { getCurrentUser, createSession, destroyOtherSessions, requestContext } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { disableTotp, enableTotp, regenerateRecoveryCodes, twoFactorRequired, verifySecondFactor } from "@/lib/auth/service";
import { getDb } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTokenSignature } from "@/lib/secrets";
import { logSecurityEvent } from "@/lib/security-log";

export interface SecurityFormState {
  error?: string;
  success?: string;
  /** Recovery codes, shown once after they are created. */
  codes?: string[];
}

export async function enableTotpAction(_prev: SecurityFormState, fd: FormData): Promise<SecurityFormState> {
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  if (!user) return { error: t("auth.err.sessionExpired") };
  if (!rateLimit(`2fa-setup:${user.id}`, 10, 10 * 60_000)) return { error: t("auth.err.tooManyCodes") };
  const secret = String(fd.get("secret") ?? "");
  const sig = String(fd.get("sig") ?? "");
  if (!/^[A-Z2-7]{32}$/.test(secret) || !verifyTokenSignature("totp-setup", `${user.id}:${secret}`, sig)) return { error: t("security.err.setupExpired") };
  if (user.totpEnabled) return { error: t("security.err.alreadyOn") };
  const db = await getDb();
  const result = await enableTotp(db, user.id, secret, String(fd.get("code") ?? ""), await requestContext());
  if (!result.ok) return { error: t("auth.err.wrongCode") };
  // The user just proved the second factor: continue with a fresh, 2FA-verified session.
  await createSession(user.id, { mfa: true });
  return { success: t("security.enabled"), codes: result.recoveryCodes };
}

export async function regenerateCodesAction(_prev: SecurityFormState, fd: FormData): Promise<SecurityFormState> {
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  if (!user || !user.totpEnabled) return { error: t("auth.err.sessionExpired") };
  if (!rateLimit(`2fa:${user.id}`, 5, 5 * 60_000)) return { error: t("auth.err.tooManyCodes") };
  const db = await getDb();
  const ctx = await requestContext();
  if ((await verifySecondFactor(db, user.id, String(fd.get("code") ?? ""), ctx)) !== "totp") return { error: t("auth.err.wrongCode") };
  return { success: t("security.codesRegenerated"), codes: await regenerateRecoveryCodes(db, user.id, ctx) };
}

export async function disableTotpAction(_prev: SecurityFormState, fd: FormData): Promise<SecurityFormState> {
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  if (!user || !user.totpEnabled) return { error: t("auth.err.sessionExpired") };
  if (twoFactorRequired(user)) return { error: t("security.err.requiredForAdmins") };
  if (!rateLimit(`2fa:${user.id}`, 5, 5 * 60_000)) return { error: t("auth.err.tooManyCodes") };
  const db = await getDb();
  const row = await db.selectFrom("users").select("password_hash").where("id", "=", user.id).executeTakeFirstOrThrow();
  if (!(await verifyPassword(String(fd.get("password") ?? ""), row.password_hash))) return { error: t("auth.err.currentWrong") };
  const ctx = await requestContext();
  if (!(await verifySecondFactor(db, user.id, String(fd.get("code") ?? ""), ctx))) return { error: t("auth.err.wrongCode") };
  await disableTotp(db, user.id, ctx);
  await createSession(user.id);
  return { success: t("security.disabled") };
}

export async function signOutOthersAction(_prev: SecurityFormState): Promise<SecurityFormState> {
  void _prev;
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  if (!user) return { error: t("auth.err.sessionExpired") };
  const count = await destroyOtherSessions(user.id);
  await logSecurityEvent(await getDb(), { action: "session.revoked_others", userId: user.id, target: `${count} sessions`, ...(await requestContext()) });
  return { success: t("security.othersSignedOut", { count }) };
}
