import "server-only";
import { Kysely } from "kysely";
import { readConfig } from "../config";
import { createDialect, migrateToLatest } from "./index";
import type { Database } from "./schema";

/**
 * `WPK_MIGRATE_ONLY=1 node server.js` (deploy/db-setup.sh): run the migrations (as
 * DB_MIGRATE_USER when set), check the integrity triggers, then exit without serving.
 * Needed on a fresh MySQL database because the app user's table grants
 * (scripts/mysql-grants.sql) can only be given once the tables exist.
 */
export async function runMigrationsAndExit(): Promise<never> {
  const config = readConfig();
  if (!config) {
    console.error("[migrate] no database configured (DATABASE_URL or DB_DRIVER/DB_*)");
    process.exit(1);
  }
  const db = new Kysely<Database>({ dialect: await createDialect(config.db) });
  let code = 0;
  try {
    await migrateToLatest(db, config.db);
    console.log("[migrate] database is up to date");
  } catch (error) {
    console.error("[migrate] failed:", error instanceof Error ? error.message : error);
    code = 1;
  } finally {
    await db.destroy().catch(() => undefined);
  }
  process.exit(code);
}
