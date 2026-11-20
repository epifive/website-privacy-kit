import "server-only";
import { sql, SqliteAdapter, type Kysely } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * 2026_11_19_000007_retention — erasure tasks, consent-record purge and site archiving (plan M9; E1–E3).
 *
 * Consent-record retention purge — design choice: "tombstone + hash-chain
 * checkpoint" enforced by database triggers (works on SQLite and MySQL; no
 * second database user needed):
 *
 * 1. consent_purge_checkpoints is insert-only. A checkpoint row says "events
 *    of site S with seq ≤ N and created before C were purged" and stores the
 *    hash of event N, so verification continues from it (the chain still
 *    verifies; any change to the remaining rows is still detected).
 * 2. A checkpoint can only be inserted when its cut-off C is at least one
 *    calendar year back (Rule 8(3)): a trigger rejects anything newer.
 * 3. The old "no delete" trigger on consent_events is replaced by a guard that
 *    allows a DELETE only for rows covered by a checkpoint (seq ≤ N AND
 *    created_at < C). Every other delete is still rejected.
 *
 * So the purge leaves a permanent, visible tombstone (count, range, cut-off,
 * time) in the evidence pack, and it can never remove records younger than
 * one year, even if run by hand. UPDATEs stay forbidden.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const GUARD_MSG = "consent_events rows are insert-only (a purge needs a retention checkpoint)";
const FLOOR_MSG = "Rule 8(3): consent records are kept for at least one year";
const CP_MSG = "consent_purge_checkpoints rows are insert-only";

async function triggers(db: AnyDb): Promise<void> {
  if (db.getExecutor().adapter instanceof SqliteAdapter) {
    await sql`DROP TRIGGER IF EXISTS consent_events_no_delete`.execute(db);
    await sql.raw(`CREATE TRIGGER consent_events_delete_guard BEFORE DELETE ON consent_events
      WHEN NOT EXISTS (SELECT 1 FROM consent_purge_checkpoints c WHERE c.org_id = OLD.org_id AND c.site_id = OLD.site_id AND OLD.seq <= c.through_seq AND OLD.created_at < c.cutoff_at)
      BEGIN SELECT RAISE(ABORT, '${GUARD_MSG}'); END`).execute(db);
    await sql.raw(`CREATE TRIGGER consent_purge_checkpoints_floor BEFORE INSERT ON consent_purge_checkpoints
      WHEN substr(NEW.cutoff_at, 1, 10) > date('now', '-1 year')
      BEGIN SELECT RAISE(ABORT, '${FLOOR_MSG}'); END`).execute(db);
    await sql.raw(`CREATE TRIGGER consent_purge_checkpoints_no_update BEFORE UPDATE ON consent_purge_checkpoints BEGIN SELECT RAISE(ABORT, '${CP_MSG}'); END`).execute(db);
    await sql.raw(`CREATE TRIGGER consent_purge_checkpoints_no_delete BEFORE DELETE ON consent_purge_checkpoints BEGIN SELECT RAISE(ABORT, '${CP_MSG}'); END`).execute(db);
    return;
  }
  try {
    await sql`DROP TRIGGER IF EXISTS consent_events_no_delete`.execute(db);
    await sql.raw(`CREATE TRIGGER consent_events_delete_guard BEFORE DELETE ON consent_events FOR EACH ROW
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM consent_purge_checkpoints c WHERE c.org_id = OLD.org_id AND c.site_id = OLD.site_id AND OLD.seq <= c.through_seq AND OLD.created_at < c.cutoff_at) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${GUARD_MSG}';
        END IF;
      END`).execute(db);
    await sql.raw(`CREATE TRIGGER consent_purge_checkpoints_floor BEFORE INSERT ON consent_purge_checkpoints FOR EACH ROW
      BEGIN
        IF LEFT(NEW.cutoff_at, 10) > DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 1 YEAR, '%Y-%m-%d') THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${FLOOR_MSG}';
        END IF;
      END`).execute(db);
    await sql.raw(`CREATE TRIGGER consent_purge_checkpoints_no_update BEFORE UPDATE ON consent_purge_checkpoints FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${CP_MSG}'`).execute(db);
    await sql.raw(`CREATE TRIGGER consent_purge_checkpoints_no_delete BEFORE DELETE ON consent_purge_checkpoints FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${CP_MSG}'`).execute(db);
  } catch (error) {
    // Without the TRIGGER privilege the application still checks the floor and
    // the checkpoint before deleting, and the hash chain keeps changes evident.
    console.warn("[migrations] retention triggers not created:", error instanceof Error ? error.message : error);
  }
}

export const retentionMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema.alterTable("orgs").addColumn("consent_retention_days", "integer", (c) => c.notNull().defaultTo(1095)).execute();
    await db.schema.alterTable("orgs").addColumn("pre_erasure_notice", "integer", (c) => c.notNull().defaultTo(0)).execute();
    await db.schema.alterTable("sites").addColumn("archived_at", "varchar(32)").execute();

    await db.schema
      .createTable("erasure_tasks")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("source", "varchar(10)", (c) => c.notNull())
      .addColumn("rule_id", "integer")
      .addColumn("request_id", "integer")
      .addColumn("vendor_id", "integer")
      .addColumn("title", "varchar(255)", (c) => c.notNull())
      .addColumn("is_logs", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("cutoff_at", "varchar(32)")
      .addColumn("due_at", "varchar(32)", (c) => c.notNull())
      .addColumn("pre_notice_at", "varchar(32)")
      .addColumn("pre_notice_hours", "integer")
      .addColumn("pre_notice_sent_at", "varchar(32)")
      .addColumn("status", "varchar(10)", (c) => c.notNull())
      .addColumn("signed_off_by", "integer")
      .addColumn("signed_off_at", "varchar(32)")
      .addColumn("sign_off_note", "varchar(600)", (c) => c.notNull().defaultTo(""))
      .addColumn("reminded_pre_notice_at", "varchar(32)")
      .addColumn("reminded_soon_at", "varchar(32)")
      .addColumn("reminded_overdue_at", "varchar(32)")
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("erasure_tasks_org_status_idx").on("erasure_tasks").columns(["org_id", "status", "due_at"]).execute();

    await db.schema
      .createTable("consent_purge_checkpoints")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("site_id", "integer", (c) => c.notNull())
      .addColumn("from_seq", "integer", (c) => c.notNull())
      .addColumn("through_seq", "integer", (c) => c.notNull())
      .addColumn("through_hash", "varchar(64)", (c) => c.notNull())
      .addColumn("cutoff_at", "varchar(32)", (c) => c.notNull())
      .addColumn("purged_count", "integer", (c) => c.notNull())
      .addColumn("reason", "varchar(30)", (c) => c.notNull())
      .addColumn("by_user_id", "integer")
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("consent_purge_checkpoints_site_idx").on("consent_purge_checkpoints").columns(["org_id", "site_id", "through_seq"]).execute();
    await triggers(db);
  },
  async down(db: AnyDb) {
    for (const name of ["consent_events_delete_guard", "consent_purge_checkpoints_floor", "consent_purge_checkpoints_no_update", "consent_purge_checkpoints_no_delete"]) {
      await sql`DROP TRIGGER IF EXISTS ${sql.raw(name)}`.execute(db).catch(() => undefined);
    }
    await db.schema.dropTable("consent_purge_checkpoints").ifExists().execute();
    await db.schema.dropTable("erasure_tasks").ifExists().execute();
    await db.schema.alterTable("sites").dropColumn("archived_at").execute();
    await db.schema.alterTable("orgs").dropColumn("pre_erasure_notice").execute();
    await db.schema.alterTable("orgs").dropColumn("consent_retention_days").execute();
  },
};
