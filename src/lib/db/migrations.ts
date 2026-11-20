import "server-only";
import { sql, type Kysely } from "kysely";
import type { Migration, MigrationProvider } from "kysely/migration";
import { breachesMigration } from "./migration-breaches";
import { childrenMigration } from "./migration-children";
import { consentMigration } from "./migration-consent";
import { detailsRequiredMigration } from "./migration-details";
import { mailMigration } from "./migration-mail";
import { privacyCoreMigration } from "./migration-privacy-core";
import { retentionMigration } from "./migration-retention";
import { rightsMigration } from "./migration-rights";
import { securityMigration } from "./migration-security";
import { usageMigration, chainDigestMigration } from "./migration-usage";

/**
 * Versioned schema migrations. They run automatically on first database
 * access after an update, so buyers only need to replace files and restart.
 * Never edit a released migration: add a new one instead.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const migrations: Record<string, Migration> = {
  "2026_11_19_000001_initial_schema": {
    async up(db: AnyDb) {
      await db.schema
        .createTable("settings")
        .addColumn("key", "varchar(100)", (c) => c.primaryKey())
        .addColumn("value", "text")
        .execute();

      await db.schema
        .createTable("users")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("name", "varchar(120)", (c) => c.notNull())
        .addColumn("email", "varchar(190)", (c) => c.notNull().unique())
        .addColumn("password_hash", "varchar(255)", (c) => c.notNull())
        .addColumn("role", "varchar(20)", (c) => c.notNull().defaultTo("user"))
        .addColumn("status", "varchar(20)", (c) => c.notNull().defaultTo("active"))
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("sessions")
        .addColumn("id", "varchar(64)", (c) => c.primaryKey())
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("expires_at", "varchar(32)", (c) => c.notNull())
        .addColumn("ip", "varchar(64)")
        .addColumn("user_agent", "varchar(255)")
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("sessions_user_id_idx").on("sessions").column("user_id").execute();

      await db.schema
        .createTable("password_resets")
        .addColumn("token_hash", "varchar(64)", (c) => c.primaryKey())
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("expires_at", "varchar(32)", (c) => c.notNull())
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("languages")
        .addColumn("code", "varchar(12)", (c) => c.primaryKey())
        .addColumn("name", "varchar(60)", (c) => c.notNull())
        .addColumn("native_name", "varchar(60)", (c) => c.notNull())
        .addColumn("direction", "varchar(3)", (c) => c.notNull().defaultTo("ltr"))
        .addColumn("is_active", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("sort_order", "integer", (c) => c.notNull().defaultTo(0))
        .execute();

      await db.schema
        .createTable("translations")
        .addColumn("lang", "varchar(12)", (c) => c.notNull())
        .addColumn("key", "varchar(190)", (c) => c.notNull())
        .addColumn("value", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint("translations_pk", ["lang", "key"])
        .execute();

    },
    async down(db: AnyDb) {
      for (const table of [
        "translations",
        "languages",
        "password_resets",
        "sessions",
        "users",
        "settings",
      ]) {
        await db.schema.dropTable(table).ifExists().execute();
      }
    },
  },

  "2026_11_19_000002_seed_defaults": {
    async up(db: AnyDb) {
      await db.insertInto("languages").values({ code: "en", name: "English", native_name: "English", direction: "ltr", is_active: 1, sort_order: 0 }).execute();
    },
    async down(db: AnyDb) {
      for (const table of ["languages"]) await sql`DELETE FROM ${sql.table(table)}`.execute(db);
    },
  },

  "2026_11_19_000003_privacy_core": privacyCoreMigration,
  "2026_11_19_000004_consent_records": consentMigration,
  "2026_11_19_000005_rights_requests": rightsMigration,
  "2026_11_19_000006_breaches": breachesMigration,
  "2026_11_19_000007_retention": retentionMigration,
  "2026_11_19_000008_parental_consents": childrenMigration,
  "2026_11_19_000009_details_required": detailsRequiredMigration,
  "2026_11_20_000011_usage_counters": usageMigration,
  "2026_11_20_000012_mail_suppressions": mailMigration,
  "2026_11_20_000013_security": securityMigration,
  "2026_11_20_000014_chain_digest": chainDigestMigration,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
