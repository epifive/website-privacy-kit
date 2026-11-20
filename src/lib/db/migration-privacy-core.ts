import "server-only";
import { sql, SqliteAdapter, type Kysely } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * 2026_11_19_000003_privacy_core — tenant tables for plan §7.4.
 * Every tenant table carries org_id and an index that starts with it, so
 * tenant-scoped queries (src/lib/db/tenant.ts) never scan other tenants.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const TABLES = ["audit_log", "questionnaires", "notice_versions", "retention_rules", "vendors", "purposes", "contacts", "sites", "memberships", "orgs"];

async function createImmutableTrigger(db: AnyDb): Promise<void> {
  if (db.getExecutor().adapter instanceof SqliteAdapter) {
    await sql`CREATE TRIGGER notice_versions_no_update BEFORE UPDATE ON notice_versions BEGIN SELECT RAISE(ABORT, 'notice_versions rows are immutable'); END`.execute(db);
    return;
  }
  try {
    await sql`CREATE TRIGGER notice_versions_no_update BEFORE UPDATE ON notice_versions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'notice_versions rows are immutable'`.execute(db);
  } catch (error) {
    // Some managed MySQL plans refuse CREATE TRIGGER without extra privileges.
    // Immutability is still enforced by the application (no update path) and by
    // the per-version SHA-256; the INSERT/SELECT-only grant arrives in P7.
    console.warn("[migrations] notice_versions trigger not created:", error instanceof Error ? error.message : error);
  }
}

export const privacyCoreMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema
      .createTable("orgs")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("slug", "varchar(64)", (c) => c.notNull().unique())
      .addColumn("name", "varchar(120)", (c) => c.notNull())
      .addColumn("legal_name", "varchar(160)", (c) => c.notNull().defaultTo(""))
      .addColumn("sector", "varchar(20)", (c) => c.notNull().defaultTo("other"))
      .addColumn("goods_services_en", "varchar(400)", (c) => c.notNull().defaultTo(""))
      .addColumn("goods_services_hi", "varchar(400)", (c) => c.notNull().defaultTo(""))
      .addColumn("website_url", "varchar(300)", (c) => c.notNull().defaultTo(""))
      .addColumn("response_days", "integer", (c) => c.notNull().defaultTo(30))
      .addColumn("identifiers", "varchar(255)", (c) => c.notNull().defaultTo("[]"))
      .addColumn("children_mode", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("third_schedule", "varchar(20)", (c) => c.notNull().defaultTo("none"))
      .addColumn("status", "varchar(12)", (c) => c.notNull().defaultTo("active"))
      .addColumn("region", "varchar(4)", (c) => c.notNull().defaultTo("IN"))
      .addColumn("owner_user_id", "integer", (c) => c.notNull())
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("orgs_owner_idx").on("orgs").column("owner_user_id").execute();

    await db.schema
      .createTable("memberships")
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("user_id", "integer", (c) => c.notNull())
      .addColumn("role", "varchar(12)", (c) => c.notNull())
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addPrimaryKeyConstraint("memberships_pk", ["org_id", "user_id"])
      .execute();
    await db.schema.createIndex("memberships_user_idx").on("memberships").column("user_id").execute();

    await db.schema
      .createTable("sites")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("name", "varchar(120)", (c) => c.notNull())
      .addColumn("domain", "varchar(190)", (c) => c.notNull())
      .addColumn("public_key", "varchar(40)", (c) => c.notNull().unique())
      .addColumn("allowed_origins", "text", (c) => c.notNull())
      .addColumn("children_mode", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("theme_json", "text", (c) => c.notNull())
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("sites_org_idx").on("sites").column("org_id").execute();

    await db.schema
      .createTable("contacts")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("kind", "varchar(20)", (c) => c.notNull())
      .addColumn("name", "varchar(120)", (c) => c.notNull())
      .addColumn("designation", "varchar(120)", (c) => c.notNull().defaultTo(""))
      .addColumn("email", "varchar(190)", (c) => c.notNull().defaultTo(""))
      .addColumn("phone", "varchar(40)", (c) => c.notNull().defaultTo(""))
      .addColumn("address", "varchar(400)", (c) => c.notNull().defaultTo(""))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .addUniqueConstraint("contacts_org_kind_uq", ["org_id", "kind"])
      .execute();

    await db.schema
      .createTable("purposes")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("site_id", "integer")
      .addColumn("purpose_key", "varchar(60)", (c) => c.notNull())
      .addColumn("name_en", "varchar(160)", (c) => c.notNull())
      .addColumn("name_hi", "varchar(160)", (c) => c.notNull().defaultTo(""))
      .addColumn("desc_en", "varchar(600)", (c) => c.notNull().defaultTo(""))
      .addColumn("desc_hi", "varchar(600)", (c) => c.notNull().defaultTo(""))
      .addColumn("basis", "varchar(20)", (c) => c.notNull())
      .addColumn("data_items", "text", (c) => c.notNull())
      .addColumn("vendor_ids", "text", (c) => c.notNull())
      .addColumn("retention_rule_id", "integer")
      .addColumn("is_tracking", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("active", "integer", (c) => c.notNull().defaultTo(1))
      .addColumn("sort_order", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .addUniqueConstraint("purposes_org_key_uq", ["org_id", "purpose_key"])
      .execute();

    await db.schema
      .createTable("vendors")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("name", "varchar(120)", (c) => c.notNull())
      .addColumn("service", "varchar(160)", (c) => c.notNull().defaultTo(""))
      .addColumn("data_shared", "text", (c) => c.notNull())
      .addColumn("location", "varchar(10)", (c) => c.notNull().defaultTo("india"))
      .addColumn("contract_status", "varchar(10)", (c) => c.notNull().defaultTo("none"))
      .addColumn("contract_date", "varchar(10)")
      .addColumn("security_clause", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("review_at", "varchar(10)")
      .addColumn("erasure_contact", "varchar(190)", (c) => c.notNull().defaultTo(""))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("vendors_org_idx").on("vendors").column("org_id").execute();

    await db.schema
      .createTable("retention_rules")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("category", "varchar(160)", (c) => c.notNull())
      .addColumn("category_hi", "varchar(160)", (c) => c.notNull().defaultTo(""))
      .addColumn("law_ref", "varchar(255)", (c) => c.notNull().defaultTo(""))
      .addColumn("period_days", "integer", (c) => c.notNull())
      .addColumn("trigger", "varchar(20)", (c) => c.notNull())
      .addColumn("action", "varchar(12)", (c) => c.notNull())
      .addColumn("pre_notice_hours", "integer")
      .addColumn("is_logs", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("retention_rules_org_idx").on("retention_rules").column("org_id").execute();

    await db.schema
      .createTable("notice_versions")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("site_id", "integer")
      .addColumn("version", "integer", (c) => c.notNull())
      .addColumn("lang", "varchar(8)", (c) => c.notNull())
      .addColumn("title", "varchar(255)", (c) => c.notNull())
      .addColumn("body_md", "text", (c) => c.notNull())
      .addColumn("sha256", "varchar(64)", (c) => c.notNull())
      .addColumn("template_version", "varchar(60)", (c) => c.notNull())
      .addColumn("published_at", "varchar(32)", (c) => c.notNull())
      .addColumn("published_by", "integer")
      .addUniqueConstraint("notice_versions_org_version_lang_uq", ["org_id", "version", "lang"])
      .execute();
    await createImmutableTrigger(db);

    await db.schema
      .createTable("questionnaires")
      .addColumn("org_id", "integer", (c) => c.primaryKey())
      .addColumn("answers", "text", (c) => c.notNull())
      .addColumn("completed_at", "varchar(32)")
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("audit_log")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("user_id", "integer")
      .addColumn("action", "varchar(60)", (c) => c.notNull())
      .addColumn("target", "varchar(190)", (c) => c.notNull().defaultTo(""))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("audit_log_org_created_idx").on("audit_log").columns(["org_id", "created_at"]).execute();
  },
  async down(db: AnyDb) {
    await sql`DROP TRIGGER IF EXISTS notice_versions_no_update`.execute(db).catch(() => undefined);
    for (const table of TABLES) await db.schema.dropTable(table).ifExists().execute();
  },
};
