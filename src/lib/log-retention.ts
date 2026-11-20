import "server-only";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema";

/**
 * Log retention (plan §7.6; Rule 6(1)(e) and 8(3): logs kept for at least one
 * year; CERT-In: ICT logs 180 days in India).
 *
 * WPK_LOG_RETENTION_DAYS (default 400, never less than 365) decides when the
 * platform's own logs may be deleted: security_events, mail_log (masked
 * recipients, no bodies) and processed webhook_events. The database refuses to
 * delete security_events younger than one year in any case (migration 000013).
 * Organisation audit logs (audit_log) and consent records follow the
 * organisation's retention instead and are not touched here.
 *
 * Server and proxy logs on the VPS follow the same number of days: see the
 * logrotate/journald/Caddy settings in docs/SECURITY.md.
 */

export const MIN_LOG_RETENTION_DAYS = 365;

export function logRetentionDays(env: string | undefined = process.env.WPK_LOG_RETENTION_DAYS): number {
  const n = Math.floor(Number(env));
  return Number.isFinite(n) && n > 0 ? Math.max(MIN_LOG_RETENTION_DAYS, n) : 400;
}

export interface LogPurgeResult {
  days: number;
  cutoff: string;
  dryRun: boolean;
  securityEvents: number;
  mailLog: number;
}

export async function purgeOldLogs(db: Kysely<Database>, opts: { days?: number; dryRun?: boolean; now?: Date } = {}): Promise<LogPurgeResult> {
  const days = Math.max(MIN_LOG_RETENTION_DAYS, opts.days ?? logRetentionDays());
  const cutoff = new Date((opts.now ?? new Date()).getTime() - days * 86_400_000).toISOString();
  const dryRun = opts.dryRun ?? true;
  const count = async (table: "security_events" | "mail_log", column: "created_at") =>
    Number((await db.selectFrom(table).select((eb) => eb.fn.countAll<number>().as("n")).where(column, "<", cutoff).executeTakeFirst())?.n ?? 0);
  const result: LogPurgeResult = { days, cutoff, dryRun, securityEvents: await count("security_events", "created_at"), mailLog: await count("mail_log", "created_at") };
  if (!dryRun) {
    await db.deleteFrom("security_events").where("created_at", "<", cutoff).execute();
    await db.deleteFrom("mail_log").where("created_at", "<", cutoff).execute();
  }
  return result;
}
