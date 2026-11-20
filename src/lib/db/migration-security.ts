import "server-only";
import { sql, SqliteAdapter, type Kysely } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * 2026_11_20_000013_security — plan §7.6 (P7).
 *
 * - users: TOTP 2FA (secret encrypted with the platform key, last used time
 *   step against replays, recovery codes as keyed hashes), failed sign-ins
 *   and lockout, password change time.
 * - sessions: last activity (idle timeout) and the 2FA flag.
 * - security_events: platform audit log for sign-in, 2FA, password, session
 *   and administrator events. Insert-only: database triggers reject UPDATE,
 *   and DELETE of rows younger than one year (Rule 6(1)(e), 8(3) log retention).
 * - audit_log (organisation audit) gets ip_trunc and the same triggers.
 * - org_keys: wrapped data keys for envelope encryption (src/lib/secrets.ts).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const LOG_TABLES = ["security_events", "audit_log"] as const;

async function insertOnlyTriggers(db: AnyDb): Promise<void> {
  const sqlite = db.getExecutor().adapter instanceof SqliteAdapter;
  for (const table of LOG_TABLES) {
    const upd = `${table} rows are insert-only`;
    const del = `${table} rows are kept for at least one year (Rule 6(1)(e), 8(3))`;
    if (sqlite) {
      await sql.raw(`CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${upd}'); END`).execute(db);
      await sql.raw(`CREATE TRIGGER ${table}_retention_floor BEFORE DELETE ON ${table} WHEN substr(OLD.created_at, 1, 10) > date('now', '-1 year') BEGIN SELECT RAISE(ABORT, '${del}'); END`).execute(db);
      continue;
    }
    try {
      await sql.raw(`CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${upd}'`).execute(db);
      await sql.raw(`CREATE TRIGGER ${table}_retention_floor BEFORE DELETE ON ${table} FOR EACH ROW
        BEGIN
          IF LEFT(OLD.created_at, 10) > DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 1 YEAR, '%Y-%m-%d') THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${del}';
          END IF;
        END`).execute(db);
    } catch (error) {
      // Without the TRIGGER privilege, scripts/mysql-grants.sql (SELECT/INSERT only for the app user) is the guard.
      console.warn(`[migrations] ${table} triggers not created:`, error instanceof Error ? error.message : error);
    }
  }
}

export const securityMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema.alterTable("users").addColumn("totp_secret_enc", "varchar(255)").execute();
    await db.schema.alterTable("users").addColumn("totp_enabled_at", "varchar(32)").execute();
    await db.schema.alterTable("users").addColumn("totp_last_step", "integer", (c) => c.notNull().defaultTo(0)).execute();
    await db.schema.alterTable("users").addColumn("recovery_codes", "text").execute();
    await db.schema.alterTable("users").addColumn("failed_logins", "integer", (c) => c.notNull().defaultTo(0)).execute();
    await db.schema.alterTable("users").addColumn("locked_until", "varchar(32)").execute();
    await db.schema.alterTable("users").addColumn("password_changed_at", "varchar(32)").execute();

    await db.schema.alterTable("sessions").addColumn("last_seen_at", "varchar(32)").execute();
    await db.schema.alterTable("sessions").addColumn("mfa", "integer", (c) => c.notNull().defaultTo(0)).execute();

    await db.schema.alterTable("audit_log").addColumn("ip_trunc", "varchar(45)", (c) => c.notNull().defaultTo("")).execute();

    await db.schema
      .createTable("security_events")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("user_id", "integer")
      .addColumn("actor_id", "integer")
      .addColumn("action", "varchar(60)", (c) => c.notNull())
      .addColumn("target", "varchar(190)", (c) => c.notNull().defaultTo(""))
      .addColumn("ip_trunc", "varchar(45)", (c) => c.notNull().defaultTo(""))
      .addColumn("ua_family", "varchar(40)", (c) => c.notNull().defaultTo(""))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("security_events_created_idx").on("security_events").column("created_at").execute();
    await db.schema.createIndex("security_events_user_idx").on("security_events").columns(["user_id", "created_at"]).execute();

    await db.schema
      .createTable("org_keys")
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("version", "integer", (c) => c.notNull())
      .addColumn("wrapped_key", "varchar(255)", (c) => c.notNull())
      .addColumn("kek_id", "varchar(16)", (c) => c.notNull())
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addPrimaryKeyConstraint("org_keys_pk", ["org_id", "version"])
      .execute();

    await insertOnlyTriggers(db);
  },
  async down(db: AnyDb) {
    for (const table of LOG_TABLES) {
      await sql.raw(`DROP TRIGGER IF EXISTS ${table}_no_update`).execute(db).catch(() => undefined);
      await sql.raw(`DROP TRIGGER IF EXISTS ${table}_retention_floor`).execute(db).catch(() => undefined);
    }
    await db.schema.dropTable("org_keys").ifExists().execute();
    await db.schema.dropTable("security_events").ifExists().execute();
  },
};
