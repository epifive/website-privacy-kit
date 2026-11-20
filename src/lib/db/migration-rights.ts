import "server-only";
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * 2026_11_19_000005_rights_requests — Data Principal requests (plan §7.4, M6–M7; R1–R5).
 *
 * Personal data in requests (name, email, identifiers, message, nominee) is
 * stored as AES-256-GCM ciphertext with a per-organisation key; the email also
 * has an HMAC for lookups (rate limits, nominations, consent withdrawal).
 * mail_log records every email sent for a tenant, without bodies.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export const rightsMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema.alterTable("orgs").addColumn("internal_target_days", "integer", (c) => c.notNull().defaultTo(0)).execute();

    await db.schema
      .createTable("rights_requests")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("ref", "varchar(16)", (c) => c.notNull().unique())
      .addColumn("type", "varchar(12)", (c) => c.notNull())
      .addColumn("status", "varchar(12)", (c) => c.notNull())
      .addColumn("outcome", "varchar(24)")
      .addColumn("lang", "varchar(8)", (c) => c.notNull())
      .addColumn("requester_name_enc", "text", (c) => c.notNull())
      .addColumn("email_enc", "text", (c) => c.notNull())
      .addColumn("email_hmac", "varchar(64)", (c) => c.notNull())
      .addColumn("payload_enc", "text", (c) => c.notNull())
      .addColumn("otp_hash", "varchar(64)")
      .addColumn("otp_expires_at", "varchar(32)")
      .addColumn("otp_attempts", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("otp_sends", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("otp_last_sent_at", "varchar(32)")
      .addColumn("verified_at", "varchar(32)")
      .addColumn("received_at", "varchar(32)", (c) => c.notNull())
      .addColumn("due_at", "varchar(32)", (c) => c.notNull())
      .addColumn("target_at", "varchar(32)")
      .addColumn("closed_at", "varchar(32)")
      .addColumn("assignee_user_id", "integer")
      .addColumn("legal_hold_reason", "varchar(400)", (c) => c.notNull().defaultTo(""))
      .addColumn("reminded_t7_at", "varchar(32)")
      .addColumn("reminded_t1_at", "varchar(32)")
      .addColumn("reminded_overdue_at", "varchar(32)")
      .addColumn("ip_trunc", "varchar(64)", (c) => c.notNull().defaultTo(""))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("rights_requests_org_status_idx").on("rights_requests").columns(["org_id", "status", "due_at"]).execute();
    await db.schema.createIndex("rights_requests_org_email_idx").on("rights_requests").columns(["org_id", "email_hmac"]).execute();

    await db.schema
      .createTable("request_events")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("request_id", "integer", (c) => c.notNull())
      .addColumn("kind", "varchar(20)", (c) => c.notNull())
      .addColumn("meta", "varchar(400)", (c) => c.notNull().defaultTo(""))
      .addColumn("body_enc", "text")
      .addColumn("by_user_id", "integer")
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("request_events_org_request_idx").on("request_events").columns(["org_id", "request_id", "id"]).execute();

    await db.schema
      .createTable("request_attachments")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("request_id", "integer", (c) => c.notNull())
      .addColumn("filename", "varchar(120)", (c) => c.notNull())
      .addColumn("mime", "varchar(40)", (c) => c.notNull())
      .addColumn("size", "integer", (c) => c.notNull())
      .addColumn("sha256", "varchar(64)", (c) => c.notNull())
      .addColumn("storage_key", "varchar(80)", (c) => c.notNull())
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("request_attachments_org_request_idx").on("request_attachments").columns(["org_id", "request_id"]).execute();

    await db.schema
      .createTable("nominations")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("request_id", "integer")
      .addColumn("principal_email_hmac", "varchar(64)", (c) => c.notNull())
      .addColumn("principal_name_enc", "text", (c) => c.notNull())
      .addColumn("nominee_name_enc", "text", (c) => c.notNull())
      .addColumn("nominee_relation", "varchar(60)", (c) => c.notNull().defaultTo(""))
      .addColumn("nominee_contact_enc", "text", (c) => c.notNull())
      .addColumn("status", "varchar(10)", (c) => c.notNull())
      .addColumn("recorded_at", "varchar(32)", (c) => c.notNull())
      .addColumn("recorded_by", "integer")
      .addColumn("revoked_at", "varchar(32)")
      .execute();
    await db.schema.createIndex("nominations_org_principal_idx").on("nominations").columns(["org_id", "principal_email_hmac"]).execute();

    await db.schema
      .createTable("mail_log")
      .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("request_id", "integer")
      .addColumn("kind", "varchar(30)", (c) => c.notNull())
      .addColumn("to_masked", "varchar(200)", (c) => c.notNull())
      .addColumn("to_hmac", "varchar(64)", (c) => c.notNull())
      .addColumn("subject", "varchar(255)", (c) => c.notNull())
      .addColumn("status", "varchar(10)", (c) => c.notNull())
      .addColumn("provider", "varchar(12)", (c) => c.notNull())
      .addColumn("error", "varchar(255)", (c) => c.notNull().defaultTo(""))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("mail_log_org_created_idx").on("mail_log").columns(["org_id", "created_at"]).execute();
  },
  async down(db: AnyDb) {
    for (const table of ["mail_log", "nominations", "request_attachments", "request_events", "rights_requests"]) await db.schema.dropTable(table).ifExists().execute();
    await db.schema.alterTable("orgs").dropColumn("internal_target_days").execute();
  },
};
