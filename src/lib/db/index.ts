import "server-only";
import path from "node:path";
import { Kysely, MysqlDialect, SqliteDialect, type Dialect } from "kysely";
import { readConfig, storagePath, type DbConfig } from "../config";
import { bootstrapFromEnv } from "./bootstrap";
import { ensureIntegrityTriggers } from "./integrity";
import { migrateToLatestWith } from "./migrate";
import { loadKeyring } from "../secrets";
import { openSqlite } from "./sqlite";
import type { Database } from "./schema";

export type { Database } from "./schema";

interface DbState {
  db: Kysely<Database>;
  driver: DbConfig["driver"];
  migrated: Promise<void> | null;
}

// Survive hot reloads in development without opening new pools.
const globalForDb = globalThis as unknown as { __wpkDb?: DbState; __wpkDbInit?: Promise<DbState> };

export function sqliteFilePath(file: string): string {
  return path.isAbsolute(file) ? file : storagePath(file);
}

export async function createDialect(config: DbConfig): Promise<Dialect> {
  if (config.driver === "mysql") {
    const { createPool } = await import("mysql2");
    return new MysqlDialect({
      pool: createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        // Serverless platforms run many short-lived instances; keep each pool small there.
        connectionLimit: process.env.VERCEL ? 3 : 10,
        charset: "utf8mb4",
        ssl: config.ssl ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
      }),
    });
  }
  return new SqliteDialect({ database: openSqlite(sqliteFilePath(config.file)) });
}

/**
 * Run pending migrations. With MySQL and DB_MIGRATE_USER / DB_MIGRATE_PASSWORD
 * set, they run on a short-lived connection as that (schema-owning) user, so
 * the app's own DB_USER can be limited to the grants in scripts/mysql-grants.sql
 * (no DDL, and SELECT/INSERT only on the insert-only tables).
 */
export async function migrateToLatest(db: Kysely<Database>, config?: DbConfig): Promise<void> {
  if (config?.driver === "mysql" && process.env.DB_MIGRATE_USER) {
    const owner = new Kysely<Database>({ dialect: await createDialect({ ...config, user: process.env.DB_MIGRATE_USER, password: process.env.DB_MIGRATE_PASSWORD ?? "" }) });
    try {
      await migrateToLatestWith(owner);
      await ensureIntegrityTriggers(owner);
    } finally {
      await owner.destroy();
    }
    return;
  }
  await migrateToLatestWith(db);
  await ensureIntegrityTriggers(db);
}

const maintStore = globalThis as unknown as { __wpkMaintDb?: Kysely<Database> };

/**
 * Connection for maintenance jobs that delete old records (consent purge, log
 * purge): MySQL user DB_MAINT_USER / DB_MAINT_PASSWORD when set (the only user
 * with DELETE on the log tables), otherwise the normal connection.
 */
export async function getMaintenanceDb(): Promise<Kysely<Database>> {
  const db = await getDb();
  const config = readConfig();
  if (config?.db.driver !== "mysql" || !process.env.DB_MAINT_USER) return db;
  maintStore.__wpkMaintDb ??= new Kysely<Database>({
    dialect: await createDialect({ ...config.db, user: process.env.DB_MAINT_USER, password: process.env.DB_MAINT_PASSWORD ?? "" }),
  });
  return maintStore.__wpkMaintDb;
}

export async function getDb(): Promise<Kysely<Database>> {
  let state = globalForDb.__wpkDb;
  if (!state) {
    // Concurrent first requests share one initialisation, so they can't open two
    // connections and run the migrations twice at the same time.
    const config = readConfig();
    if (!config) throw new Error("Website Privacy Kit is not installed. Open /install to finish setup.");
    globalForDb.__wpkDbInit ??= createDialect(config.db)
      .then((dialect) => {
        const created: DbState = { db: new Kysely<Database>({ dialect }), driver: config.db.driver, migrated: null };
        globalForDb.__wpkDb = created;
        return created;
      })
      .finally(() => {
        globalForDb.__wpkDbInit = undefined;
      });
    state = await globalForDb.__wpkDbInit;
  }
  if (!state.migrated) {
    const db = state.db;
    state.migrated = migrateToLatest(db, readConfig()?.db)
      .then(() => bootstrapFromEnv(db))
      .catch((err) => {
        state.migrated = null;
        throw err;
      });
  }
  await state.migrated;
  // Envelope keys (src/lib/secrets.ts): loaded once, refreshed every few minutes; throws on a wrong master key.
  await loadKeyring(state.db);
  return state.db;
}

export function dbDriver(): DbConfig["driver"] | null {
  return globalForDb.__wpkDb?.driver ?? readConfig()?.db.driver ?? null;
}

/** Drop the cached connection, e.g. after the installer writes a new config. */
export async function resetDb(): Promise<void> {
  const state = globalForDb.__wpkDb;
  globalForDb.__wpkDb = undefined;
  await state?.db.destroy().catch(() => undefined);
}

export const now = () => new Date().toISOString();

export const today = () => new Date().toISOString().slice(0, 10);
