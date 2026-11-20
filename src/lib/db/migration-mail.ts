import "server-only";
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";

/**
 * 2026_11_20_000012_mail_suppressions — bounce-safe email (P7).
 *
 * Addresses that hard-bounced or complained (added by an administrator in Admin → Email)
 * are not emailed again. Platform data:
 * the address is kept only as a keyed HMAC plus a masked form for the admin list.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export const mailMigration: Migration = {
  async up(db: AnyDb) {
    await db.schema
      .createTable("mail_suppressions")
      .addColumn("email_hmac", "varchar(64)", (c) => c.primaryKey())
      .addColumn("email_masked", "varchar(200)", (c) => c.notNull())
      .addColumn("reason", "varchar(12)", (c) => c.notNull())
      .addColumn("detail", "varchar(255)", (c) => c.notNull().defaultTo(""))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
  },
  async down(db: AnyDb) {
    await db.schema.dropTable("mail_suppressions").ifExists().execute();
  },
};
