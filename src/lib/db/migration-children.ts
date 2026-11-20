import "server-only";
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * 2026_11_19_000008_parental_consents — children mode (plan §7.4, M10; K1–K2).
 *
 * One row per parental consent request. The child is identified only by the
 * pseudonymous browser id from the widget (no child data before consent);
 * the parent's contact is encrypted with an HMAC for lookups. Each row records
 * the verification method, time, notice version and an evidence note — never
 * a copy of an identity document (Rule 10; K2-01).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export const childrenMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema
      .createTable("parental_consents")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("site_id", "integer", (c) => c.notNull())
      .addColumn("ref", "varchar(16)", (c) => c.notNull().unique())
      .addColumn("child_subject_ref", "varchar(64)", (c) => c.notNull())
      .addColumn("child_label_enc", "text")
      .addColumn("parent_contact_enc", "text", (c) => c.notNull())
      .addColumn("parent_contact_hmac", "varchar(64)", (c) => c.notNull())
      .addColumn("parent_name_enc", "text")
      .addColumn("method", "varchar(20)")
      .addColumn("declared_parent", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("declared_adult", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("status", "varchar(16)", (c) => c.notNull())
      .addColumn("purposes", "text", (c) => c.notNull())
      .addColumn("notice_version", "integer")
      .addColumn("notice_version_id", "integer")
      .addColumn("lang", "varchar(8)", (c) => c.notNull())
      .addColumn("evidence_note", "varchar(600)", (c) => c.notNull().defaultTo(""))
      .addColumn("token_hash", "varchar(64)")
      .addColumn("link_expires_at", "varchar(32)")
      .addColumn("ip_trunc", "varchar(64)", (c) => c.notNull().defaultTo(""))
      .addColumn("requested_at", "varchar(32)", (c) => c.notNull())
      .addColumn("responded_at", "varchar(32)")
      .addColumn("verified_at", "varchar(32)")
      .addColumn("verified_by", "integer")
      .addColumn("revoked_at", "varchar(32)")
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("parental_consents_org_site_child_idx").on("parental_consents").columns(["org_id", "site_id", "child_subject_ref"]).execute();
    await db.schema.createIndex("parental_consents_token_idx").on("parental_consents").column("token_hash").execute();
  },
  async down(db: AnyDb) {
    await db.schema.dropTable("parental_consents").ifExists().execute();
  },
};
