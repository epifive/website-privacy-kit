import "server-only";
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * 2026_11_20_000011_usage_counters — monthly counters per organisation (consent events, rights
 * requests) shown on the dashboard. Nothing is limited by them in the self-hosted editions.
 *
 * 2026_11_20_000014_chain_digest — orgs.chain_digest_at: last daily chain-head email to the owner
 * (consent-record integrity, so later tampering is evident).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export const usageMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema
      .createTable("usage_counters")
      .addColumn("org_id", "integer", (c) => c.notNull())
      .addColumn("period", "varchar(7)", (c) => c.notNull())
      .addColumn("consent_events", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("refused_events", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("rights_requests", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("alert_level", "integer", (c) => c.notNull().defaultTo(0))
      .addPrimaryKeyConstraint("usage_counters_pk", ["org_id", "period"])
      .execute();
  },
  async down(db: AnyDb) {
    await db.schema.dropTable("usage_counters").ifExists().execute();
  },
};

export const chainDigestMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema.alterTable("orgs").addColumn("chain_digest_at", "varchar(40)").execute();
  },
  async down(db: AnyDb) {
    await db.schema.alterTable("orgs").dropColumn("chain_digest_at").execute();
  },
};
