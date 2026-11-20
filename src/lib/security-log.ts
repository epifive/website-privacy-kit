import "server-only";
import type { Kysely } from "kysely";
import type { Database, SecurityEventsTable } from "./db/schema";
import { truncateIp, uaFamily } from "./privacy/consent";

/**
 * Platform audit log (plan §7.6): sign-in, 2FA, password and session events
 * and administrator actions. Insert-only in the database (triggers) and kept
 * for at least one year (Rule 6(1)(e), 8(3)); IPs are truncated (/24, /48)
 * and only the browser family is kept.
 */

export type SecurityAction =
  | "login.success"
  | "login.failed"
  | "login.locked"
  | "login.2fa_failed"
  | "login.recovery_code"
  | "logout"
  | "register"
  | "password.changed"
  | "password.reset_requested"
  | "password.reset"
  | "password.rehashed"
  | "2fa.enabled"
  | "2fa.disabled"
  | "2fa.recovery_regenerated"
  | "session.revoked_others"
  | "csrf.rejected"
  | "admin.settings"
  | "admin.user_saved"
  | "admin.user_deleted"
  | "admin.payment_approved"
  | "admin.payment_rejected"
  | "admin.manual_payment"
  | "admin.plan_saved"
  | "admin.mail_test"
  | "admin.suppression";

export interface SecurityEventInput {
  action: SecurityAction;
  userId?: number | null;
  actorId?: number | null;
  target?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export async function logSecurityEvent(db: Kysely<Database>, e: SecurityEventInput): Promise<void> {
  const row: Omit<SecurityEventsTable, "id"> = {
    user_id: e.userId ?? null,
    actor_id: e.actorId ?? null,
    action: e.action,
    target: (e.target ?? "").slice(0, 190),
    ip_trunc: truncateIp(e.ip ?? undefined).slice(0, 45),
    ua_family: uaFamily(e.userAgent ?? undefined).slice(0, 40),
    created_at: new Date().toISOString(),
  };
  try {
    await db.insertInto("security_events").values(row).execute();
  } catch (error) {
    // Never let logging break sign-in; the failure itself goes to the server log.
    console.error("[security-log]", e.action, error instanceof Error ? error.message : error);
  }
}

export function listSecurityEvents(db: Kysely<Database>, opts: { userId?: number; limit?: number; offset?: number } = {}) {
  let q = db.selectFrom("security_events").selectAll();
  if (opts.userId) q = q.where("user_id", "=", opts.userId);
  return q.orderBy("id", "desc").limit(Math.min(500, opts.limit ?? 100)).offset(opts.offset ?? 0).execute();
}
