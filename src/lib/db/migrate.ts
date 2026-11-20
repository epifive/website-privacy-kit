import "server-only";
import type { Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import { migrationProvider } from "./migrations";
import type { Database } from "./schema";

/** Run every pending migration (kept free of config imports so tests can use it). */
export async function migrateToLatestWith(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
