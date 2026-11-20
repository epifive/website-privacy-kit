import "server-only";
import { sql, SqliteAdapter, type Kysely } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * 2026_11_19_000004_consent_records — consent log (plan §7.4, M4; C3).
 *
 * consent_events is insert-only: database triggers reject UPDATE and DELETE,
 * and every row carries prev_hash/hash so any change made around the triggers
 * (e.g. by a database administrator) breaks verification. consent_chain_heads
 * keeps the last sequence number and hash per site, so removing the newest
 * rows is detected too. consent_state is the materialised current status per
 * visitor and purpose (rebuildable from the log).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

async function createInsertOnlyTriggers(db: AnyDb): Promise<void> {
  if (db.getExecutor().adapter instanceof SqliteAdapter) {
    await sql`CREATE TRIGGER consent_events_no_update BEFORE UPDATE ON consent_events BEGIN SELECT RAISE(ABORT, 'consent_events rows are insert-only'); END`.execute(db);
    await sql`CREATE TRIGGER consent_events_no_delete BEFORE DELETE ON consent_events BEGIN SELECT RAISE(ABORT, 'consent_events rows are insert-only'); END`.execute(db);
    return;
  }
  try {
    await sql`CREATE TRIGGER consent_events_no_update BEFORE UPDATE ON consent_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'consent_events rows are insert-only'`.execute(db);
    await sql`CREATE TRIGGER consent_events_no_delete BEFORE DELETE ON consent_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'consent_events rows are insert-only'`.execute(db);
  } catch (error) {
    // Managed MySQL without TRIGGER privilege: the hash chain still makes changes evident,
    // and the INSERT/SELECT-only grant for the app user arrives with phase P7.
    console.warn("[migrations] consent_events triggers not created:", error instanceof Error ? error.message : error);
  }
}

export const consentMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema
      .createTable("consent_events")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("site_id", "integer", (c) => c.notNull())
      .addColumn("seq", "integer", (c) => c.notNull())
      .addColumn("subject_ref", "varchar(64)", (c) => c.notNull())
      .addColumn("subject_kind", "varchar(10)", (c) => c.notNull())
      .addColumn("subject_lookup_hmac", "varchar(64)")
      .addColumn("subject_enc", "text")
      .addColumn("purpose_key", "varchar(60)", (c) => c.notNull())
      .addColumn("action", "varchar(10)", (c) => c.notNull())
      .addColumn("notice_version", "integer", (c) => c.notNull())
      .addColumn("notice_version_id", "integer")
      .addColumn("lang", "varchar(8)", (c) => c.notNull())
      .addColumn("channel", "varchar(12)", (c) => c.notNull())
      .addColumn("page_url", "varchar(500)", (c) => c.notNull().defaultTo(""))
      .addColumn("ip_trunc", "varchar(64)", (c) => c.notNull().defaultTo(""))
      .addColumn("ua_family", "varchar(40)", (c) => c.notNull().defaultTo(""))
      .addColumn("widget_ver", "varchar(20)", (c) => c.notNull().defaultTo(""))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("prev_hash", "varchar(64)", (c) => c.notNull())
      .addColumn("hash", "varchar(64)", (c) => c.notNull())
      .addUniqueConstraint("consent_events_site_seq_uq", ["site_id", "seq"])
      .execute();
    await db.schema.createIndex("consent_events_org_site_idx").on("consent_events").columns(["org_id", "site_id", "seq"]).execute();
    await db.schema.createIndex("consent_events_subject_idx").on("consent_events").columns(["org_id", "site_id", "subject_ref"]).execute();
    await db.schema.createIndex("consent_events_lookup_idx").on("consent_events").columns(["org_id", "subject_lookup_hmac"]).execute();
    await createInsertOnlyTriggers(db);

    await db.schema
      .createTable("consent_state")
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("site_id", "integer", (c) => c.notNull())
      .addColumn("subject_ref", "varchar(64)", (c) => c.notNull())
      .addColumn("purpose_key", "varchar(60)", (c) => c.notNull())
      .addColumn("status", "varchar(10)", (c) => c.notNull())
      .addColumn("notice_version", "integer", (c) => c.notNull())
      .addColumn("last_event_id", "integer", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .addPrimaryKeyConstraint("consent_state_pk", ["site_id", "subject_ref", "purpose_key"])
      .execute();
    await db.schema.createIndex("consent_state_org_site_idx").on("consent_state").columns(["org_id", "site_id"]).execute();

    await db.schema
      .createTable("consent_chain_heads")
      .addColumn("site_id", "integer", (c) => c.primaryKey())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("seq", "integer", (c) => c.notNull())
      .addColumn("hash", "varchar(64)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("consent_chain_heads_org_idx").on("consent_chain_heads").column("org_id").execute();
  },
  async down(db: AnyDb) {
    await sql`DROP TRIGGER IF EXISTS consent_events_no_update`.execute(db).catch(() => undefined);
    await sql`DROP TRIGGER IF EXISTS consent_events_no_delete`.execute(db).catch(() => undefined);
    for (const table of ["consent_chain_heads", "consent_state", "consent_events"]) await db.schema.dropTable(table).ifExists().execute();
  },
};
