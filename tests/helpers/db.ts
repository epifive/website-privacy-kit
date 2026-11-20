import crypto from "node:crypto";
import { Kysely, MysqlDialect, SqliteDialect } from "kysely";
import { migrateToLatestWith } from "@/lib/db/migrate";
import { openSqlite } from "@/lib/db/sqlite";
import type { Database } from "@/lib/db/schema";

/**
 * Test databases. SQLite in memory by default; MySQL 8 when WPK_TEST_MYSQL_URL is set to an
 * administrator URL such as mysql://root:secret@127.0.0.1:3306 (see docs/TESTING.md). Each call
 * then creates its own throw-away database `wpk_t_<random>` on that server.
 */
export const TEST_MYSQL_URL = process.env.WPK_TEST_MYSQL_URL ?? "";
export const usingMysql = () => TEST_MYSQL_URL !== "";

export async function mysqlPool(database?: string, url = TEST_MYSQL_URL) {
  const { createPool } = await import("mysql2");
  const u = new URL(url);
  return createPool({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    connectionLimit: 4,
    charset: "utf8mb4",
    multipleStatements: true,
  });
}

/** Run admin statements (CREATE DATABASE, grants) on the test MySQL server. */
export async function mysqlAdmin(statements: string): Promise<void> {
  const pool = await mysqlPool();
  try {
    await pool.promise().query(statements);
  } finally {
    await pool.promise().end();
  }
}

/** Create an empty MySQL database with a unique name and return the name. */
export async function createMysqlDatabase(prefix = "wpk_t"): Promise<string> {
  const name = `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
  await mysqlAdmin(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  return name;
}

export async function openMysql(database: string, url = TEST_MYSQL_URL): Promise<Kysely<Database>> {
  return new Kysely<Database>({ dialect: new MysqlDialect({ pool: await mysqlPool(database, url) }) });
}

/** A fresh, fully migrated database for one test file (SQLite in memory, or MySQL; see above). */
export async function createTestDb(): Promise<Kysely<Database>> {
  const db = usingMysql()
    ? await openMysql(await createMysqlDatabase())
    : new Kysely<Database>({ dialect: new SqliteDialect({ database: openSqlite(":memory:") }) });
  await migrateToLatestWith(db);
  return db;
}
