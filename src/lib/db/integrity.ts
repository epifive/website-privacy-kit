import "server-only";
import { sql, SqliteAdapter, type Kysely } from "kysely";

/**
 * Integrity triggers (plan §7.4 "Integrity"): the database itself refuses UPDATE on the
 * insert-only tables, DELETE of consent records not covered by a one-year-old retention
 * checkpoint, and DELETE of log rows younger than one year.
 *
 * The migrations create them, but on MySQL with binary logging a non-SUPER schema owner
 * gets ERROR 1419 unless `log_bin_trust_function_creators = 1`, and some managed plans refuse
 * CREATE TRIGGER outright. The migrations only warn in that case, so this module checks on
 * every start (after the migrations, on the owner connection), re-creates what is missing
 * when it can, and reports anything still missing loudly (server log + Admin → System).
 * The grants in scripts/mysql-grants.sql stay the second guard either way.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const GUARD_MSG = "consent_events rows are insert-only (a purge needs a retention checkpoint)";
const FLOOR_MSG = "Rule 8(3): consent records are kept for at least one year";
const CP_MSG = "consent_purge_checkpoints rows are insert-only";
const logFloor = (table: string) => `${table} rows are kept for at least one year (Rule 6(1)(e), 8(3))`;
const signal = (msg: string) => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${msg}'`;

/** MySQL definitions, identical to the ones the migrations create (000003, 000004, 000006, 000007, 000013). */
export const MYSQL_TRIGGERS: Record<string, string> = {
  notice_versions_no_update: `CREATE TRIGGER notice_versions_no_update BEFORE UPDATE ON notice_versions FOR EACH ROW ${signal("notice_versions rows are immutable")}`,
  consent_events_no_update: `CREATE TRIGGER consent_events_no_update BEFORE UPDATE ON consent_events FOR EACH ROW ${signal("consent_events rows are insert-only")}`,
  consent_events_delete_guard: `CREATE TRIGGER consent_events_delete_guard BEFORE DELETE ON consent_events FOR EACH ROW
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM consent_purge_checkpoints c WHERE c.org_id = OLD.org_id AND c.site_id = OLD.site_id AND OLD.seq <= c.through_seq AND OLD.created_at < c.cutoff_at) THEN
          ${signal(GUARD_MSG)};
        END IF;
      END`,
  consent_purge_checkpoints_floor: `CREATE TRIGGER consent_purge_checkpoints_floor BEFORE INSERT ON consent_purge_checkpoints FOR EACH ROW
      BEGIN
        IF LEFT(NEW.cutoff_at, 10) > DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 1 YEAR, '%Y-%m-%d') THEN
          ${signal(FLOOR_MSG)};
        END IF;
      END`,
  consent_purge_checkpoints_no_update: `CREATE TRIGGER consent_purge_checkpoints_no_update BEFORE UPDATE ON consent_purge_checkpoints FOR EACH ROW ${signal(CP_MSG)}`,
  consent_purge_checkpoints_no_delete: `CREATE TRIGGER consent_purge_checkpoints_no_delete BEFORE DELETE ON consent_purge_checkpoints FOR EACH ROW ${signal(CP_MSG)}`,
  breach_events_no_update: `CREATE TRIGGER breach_events_no_update BEFORE UPDATE ON breach_events FOR EACH ROW ${signal("breach_events rows are insert-only")}`,
  breach_events_no_delete: `CREATE TRIGGER breach_events_no_delete BEFORE DELETE ON breach_events FOR EACH ROW ${signal("breach_events rows are insert-only")}`,
  ...Object.fromEntries(
    (["security_events", "audit_log"] as const).flatMap((table) => [
      [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} FOR EACH ROW ${signal(`${table} rows are insert-only`)}`],
      [
        `${table}_retention_floor`,
        `CREATE TRIGGER ${table}_retention_floor BEFORE DELETE ON ${table} FOR EACH ROW
        BEGIN
          IF LEFT(OLD.created_at, 10) > DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 1 YEAR, '%Y-%m-%d') THEN
            ${signal(logFloor(table))};
          END IF;
        END`,
      ],
    ]),
  ),
};

export const INTEGRITY_TRIGGERS = Object.keys(MYSQL_TRIGGERS);

const isSqlite = (db: AnyDb) => db.getExecutor().adapter instanceof SqliteAdapter;

export async function listTriggers(db: AnyDb): Promise<string[]> {
  const rows = isSqlite(db)
    ? (await sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'trigger'`.execute(db)).rows
    : (await sql<{ name: string }>`SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()`.execute(db)).rows;
  return rows.map((r) => r.name);
}

export async function missingTriggers(db: AnyDb): Promise<string[]> {
  const present = new Set(await listTriggers(db));
  return INTEGRITY_TRIGGERS.filter((name) => !present.has(name));
}

export interface IntegrityReport {
  checkedAt: string;
  created: string[];
  missing: string[];
  error?: string;
}

const store = globalThis as unknown as { __wpkIntegrity?: IntegrityReport };

/** Last result of ensureIntegrityTriggers in this process (Admin → System). */
export function integrityReport(): IntegrityReport | null {
  return store.__wpkIntegrity ?? null;
}

/**
 * Re-create missing triggers (MySQL; SQLite migrations always create them) and report.
 * Run with the schema owner's connection. Never throws.
 */
export async function ensureIntegrityTriggers(db: AnyDb): Promise<IntegrityReport> {
  const report: IntegrityReport = { checkedAt: new Date().toISOString(), created: [], missing: [] };
  try {
    const missing = await missingTriggers(db);
    if (missing.length && !isSqlite(db)) {
      for (const name of missing) {
        try {
          await sql.raw(MYSQL_TRIGGERS[name]).execute(db);
          report.created.push(name);
        } catch (error) {
          report.error = error instanceof Error ? error.message : String(error);
        }
      }
    }
    report.missing = await missingTriggers(db);
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }
  if (report.created.length) console.warn(`[integrity] re-created database triggers: ${report.created.join(", ")}`);
  if (report.missing.length) {
    console.error(
      `[integrity] MISSING database triggers: ${report.missing.join(", ")}. Insert-only records rely on the MySQL grants alone. ` +
        `With binary logging on, set log_bin_trust_function_creators=1 (managed MySQL: in the provider's settings) or give the ` +
        `schema owner the TRIGGER privilege, then restart the app. ${report.error ?? ""}`,
    );
  }
  store.__wpkIntegrity = report;
  return report;
}
