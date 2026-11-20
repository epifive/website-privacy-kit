import "server-only";
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * 2026_11_19_000009_details_required — organisation setting: which request
 * types (access, erasure) must include a description. Corrections and
 * grievances always need one. JSON array; empty = optional (P4 behaviour).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export const detailsRequiredMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema.alterTable("orgs").addColumn("details_required", "varchar(60)", (c) => c.notNull().defaultTo("[]")).execute();
  },
  async down(db: AnyDb) {
    await db.schema.alterTable("orgs").dropColumn("details_required").execute();
  },
};
