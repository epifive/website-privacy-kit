import "server-only";
import { sql, SqliteAdapter, type Kysely } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * 2026_11_19_000006_breaches — personal data breach register (plan §7.4, M8; B1–B4).
 *
 * breaches: one row per incident with the four timer anchors (noticed_at for
 * CERT-In, aware_at for the Board and Data Principals) and the "sent" times.
 * Narrative facts live in `details` (JSON; see src/core/breach/templates.ts).
 * breach_events: the timeline and evidence notes, insert-only (triggers).
 * breach_recipients: affected people to tell under Rule 7(1); contact
 * encrypted with the organisation's key plus an HMAC to de-duplicate.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

async function insertOnly(db: AnyDb): Promise<void> {
  if (db.getExecutor().adapter instanceof SqliteAdapter) {
    await sql`CREATE TRIGGER breach_events_no_update BEFORE UPDATE ON breach_events BEGIN SELECT RAISE(ABORT, 'breach_events rows are insert-only'); END`.execute(db);
    await sql`CREATE TRIGGER breach_events_no_delete BEFORE DELETE ON breach_events BEGIN SELECT RAISE(ABORT, 'breach_events rows are insert-only'); END`.execute(db);
    return;
  }
  try {
    await sql`CREATE TRIGGER breach_events_no_update BEFORE UPDATE ON breach_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'breach_events rows are insert-only'`.execute(db);
    await sql`CREATE TRIGGER breach_events_no_delete BEFORE DELETE ON breach_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'breach_events rows are insert-only'`.execute(db);
  } catch (error) {
    console.warn("[migrations] breach_events triggers not created:", error instanceof Error ? error.message : error);
  }
}

export const breachesMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema
      .createTable("breaches")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("ref", "varchar(16)", (c) => c.notNull().unique())
      .addColumn("title", "varchar(200)", (c) => c.notNull())
      .addColumn("status", "varchar(12)", (c) => c.notNull())
      .addColumn("noticed_at", "varchar(32)", (c) => c.notNull())
      .addColumn("aware_at", "varchar(32)", (c) => c.notNull())
      .addColumn("affected_count", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("details", "text", (c) => c.notNull())
      .addColumn("certin_applicable", "integer", (c) => c.notNull().defaultTo(1))
      .addColumn("certin_sent_at", "varchar(32)")
      .addColumn("board_initial_sent_at", "varchar(32)")
      .addColumn("board_detail_sent_at", "varchar(32)")
      .addColumn("dp_notice_sent_at", "varchar(32)")
      .addColumn("extension_requested_at", "varchar(32)")
      .addColumn("extension_until", "varchar(32)")
      .addColumn("checklist", "text", (c) => c.notNull())
      .addColumn("reminders", "text", (c) => c.notNull())
      .addColumn("created_by", "integer")
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .addColumn("closed_at", "varchar(32)")
      .execute();
    await db.schema.createIndex("breaches_org_status_idx").on("breaches").columns(["org_id", "status", "aware_at"]).execute();

    await db.schema
      .createTable("breach_events")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("breach_id", "integer", (c) => c.notNull())
      .addColumn("kind", "varchar(30)", (c) => c.notNull())
      .addColumn("meta", "varchar(400)", (c) => c.notNull().defaultTo(""))
      .addColumn("body_enc", "text")
      .addColumn("at", "varchar(32)", (c) => c.notNull())
      .addColumn("by_user_id", "integer")
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("breach_events_org_breach_idx").on("breach_events").columns(["org_id", "breach_id", "id"]).execute();
    await insertOnly(db);

    await db.schema
      .createTable("breach_recipients")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("breach_id", "integer", (c) => c.notNull())
      .addColumn("kind", "varchar(8)", (c) => c.notNull())
      .addColumn("contact_enc", "text", (c) => c.notNull())
      .addColumn("contact_hmac", "varchar(64)", (c) => c.notNull())
      .addColumn("status", "varchar(10)", (c) => c.notNull())
      .addColumn("channel", "varchar(20)", (c) => c.notNull().defaultTo(""))
      .addColumn("sent_at", "varchar(32)")
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addUniqueConstraint("breach_recipients_uq", ["breach_id", "contact_hmac"])
      .execute();
    await db.schema.createIndex("breach_recipients_org_breach_idx").on("breach_recipients").columns(["org_id", "breach_id"]).execute();
  },
  async down(db: AnyDb) {
    await sql`DROP TRIGGER IF EXISTS breach_events_no_update`.execute(db).catch(() => undefined);
    await sql`DROP TRIGGER IF EXISTS breach_events_no_delete`.execute(db).catch(() => undefined);
    for (const table of ["breach_recipients", "breach_events", "breaches"]) await db.schema.dropTable(table).ifExists().execute();
  },
};
