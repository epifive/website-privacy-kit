import fs from "node:fs";
import path from "node:path";
import { Kysely, MysqlDialect, SqliteDialect } from "kysely";
import { createPool } from "mysql2";
import { ensureIntegrityTriggers } from "@/lib/db/integrity";
import { migrateToLatestWith } from "@/lib/db/migrate";
import type { Database } from "@/lib/db/schema";
import { openSqlite } from "@/lib/db/sqlite";
import { createMysqlDatabase, mysqlAdmin, TEST_MYSQL_URL, usingMysql } from "../helpers/db";

/**
 * Database for one e2e file: a SQLite file in the test's temp folder by default, or, with
 * WPK_TEST_MYSQL_URL set, a fresh MySQL database set up exactly like production
 * (scripts/mysql-grants.sql with its three users): the test seeds and migrates as the schema
 * owner `wpk_owner`, the server runs as `wpk_app` (no DDL, SELECT/INSERT only on the insert-only
 * tables) with DB_MIGRATE_USER / DB_MAINT_USER, so grants and triggers are exercised over HTTP.
 */
const PASSWORDS = { wpk_owner: "e2e-owner-pw-0001", wpk_app: "e2e-app-pw-0001", wpk_maint: "e2e-maint-pw-0001" } as const;
const ROOT = path.resolve(__dirname, "../..");

export function e2eDatabase(tmp: string) {
  const file = path.join(tmp, "e2e.sqlite");
  let database = "";
  const u = usingMysql() ? new URL(TEST_MYSQL_URL) : null;

  const mysqlAs = (user: keyof typeof PASSWORDS) =>
    new Kysely<Database>({
      dialect: new MysqlDialect({
        pool: createPool({ host: u!.hostname, port: Number(u!.port || 3306), user, password: PASSWORDS[user], database, connectionLimit: 3, charset: "utf8mb4" }),
      }),
    });

  return {
    mysql: usingMysql(),
    get name() {
      return database;
    },
    /** Create the database and the users with the production grants (MySQL only). */
    async init(): Promise<void> {
      if (!u) return;
      database = await createMysqlDatabase("wpk_e2e");
      const grants = fs
        .readFileSync(path.join(ROOT, "scripts/mysql-grants.sql"), "utf8")
        .replaceAll("`privacykit`", `\`${database}\``)
        .replace(/'CHANGE-ME-(owner|app|maint)-password'/g, (_m, who: "owner" | "app" | "maint") => `'${PASSWORDS[`wpk_${who}`]}'`);
      // Same order as deploy/db-setup.sh: users + owner grant, migrations as the owner, then the table grants.
      await mysqlAdmin(grants.split("-- ---- TABLE GRANTS")[0]);
      const owner = mysqlAs("wpk_owner");
      try {
        await migrateToLatestWith(owner);
        // The insert-only guards must be there (MySQL with binary logging needs log_bin_trust_function_creators=1).
        const { missing, error } = await ensureIntegrityTriggers(owner);
        if (missing.length && process.env.WPK_TEST_ALLOW_MISSING_TRIGGERS !== "1") throw new Error(`integrity triggers missing on MySQL: ${missing.join(", ")} (${error ?? ""})`);
      } finally {
        await owner.destroy();
      }
      await mysqlAdmin(grants);
    },
    /** Connection as the schema owner (seed data, migrations, checks). */
    open(): Kysely<Database> {
      if (u) return mysqlAs("wpk_owner");
      return new Kysely<Database>({ dialect: new SqliteDialect({ database: openSqlite(file) }) });
    },
    /** Connection as the restricted app user (to check what the grants allow). */
    openApp(): Kysely<Database> {
      return u ? mysqlAs("wpk_app") : this.open();
    },
    /** Environment for `next start`. */
    env(): Record<string, string> {
      if (!u) return { DB_DRIVER: "sqlite", DB_FILE: file };
      const host = `${u.hostname}:${u.port || 3306}`;
      return {
        DATABASE_URL: `mysql://wpk_app:${PASSWORDS.wpk_app}@${host}/${database}`,
        DB_MIGRATE_USER: "wpk_owner",
        DB_MIGRATE_PASSWORD: PASSWORDS.wpk_owner,
        DB_MAINT_USER: "wpk_maint",
        DB_MAINT_PASSWORD: PASSWORDS.wpk_maint,
      };
    },
    async drop(): Promise<void> {
      if (u && database) await mysqlAdmin(`DROP DATABASE IF EXISTS \`${database}\``).catch(() => undefined);
    },
  };
}
