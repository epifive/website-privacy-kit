import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Kysely, sql, SqliteDialect } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateToLatestWith } from "@/lib/db/migrate";
import type { Database } from "@/lib/db/schema";
import { openSqlite } from "@/lib/db/sqlite";
import { logRetentionDays, purgeOldLogs } from "@/lib/log-retention";
import { setMailTransport, type MailMessage } from "@/lib/mail";
import { decryptForOrg, encryptForOrg, kekFrom, loadKeyring, setMasterKeyForTests, unwrapKey, wrapKey } from "@/lib/secrets";
import { startupProblems } from "@/lib/startup-check";
import { ensureIntegrityTriggers, integrityReport, INTEGRITY_TRIGGERS, missingTriggers } from "@/lib/db/integrity";
import { createTestDb, usingMysql } from "./helpers/db";
import { createReadyOrg } from "./helpers/fixtures";
import * as keysScript from "../scripts/keys.mjs";

/** Operations: OPS-GRANTS-01, OPS-KEYS-01..02, OPS-LOG-01, OPS-START-01. */

const ROOT = path.resolve(__dirname, "..");

/** Triggers the migrations must leave in place (C3-03, N4-02, B3-01, SEC-LOG-01, T-PURGE-01). */
const EXPECTED_TRIGGERS = [
  "notice_versions_no_update",
  "consent_events_no_update",
  "consent_events_delete_guard",
  "consent_purge_checkpoints_floor",
  "consent_purge_checkpoints_no_update",
  "consent_purge_checkpoints_no_delete",
  "breach_events_no_update",
  "breach_events_no_delete",
  "audit_log_no_update",
  "audit_log_retention_floor",
  "security_events_no_update",
  "security_events_retention_floor",
];

describe("OPS grants, key script, log retention, startup check", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  const sent: MailMessage[] = [];

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 21));
    db = await createTestDb();
    setMailTransport(async (m) => {
      sent.push(m);
    });
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    await db.destroy();
  });

  it("OPS-GRANTS-01 scripts/mysql-grants.sql covers every table; insert-only tables get no UPDATE for the app user", async () => {
    const grants = fs.readFileSync(path.join(ROOT, "scripts/mysql-grants.sql"), "utf8");
    const tables = (await db.introspection.getTables()).map((t) => t.name).filter((t) => !t.startsWith("kysely_"));
    const appLine = (t: string) => grants.split("\n").find((l) => l.includes(`\`${t}\``) && l.includes("'wpk_app'"));
    for (const t of tables) expect(appLine(t), `wpk_app grant for ${t}`).toBeTruthy();
    for (const t of ["consent_events", "audit_log", "security_events", "breach_events", "notice_versions", "consent_purge_checkpoints", "org_keys"]) {
      expect(appLine(t), t).not.toMatch(/UPDATE/);
    }
    for (const t of ["audit_log", "security_events"]) expect(appLine(t), t).not.toMatch(/DELETE/);
    expect(grants).toMatch(/GRANT DELETE ON `privacykit`\.`security_events` TO 'wpk_maint'/);
    expect(grants).not.toMatch(/IDENTIFIED BY '(?!CHANGE-ME)/);
  });

  it("OPS-TRIG-01 every insert-only and retention trigger exists after the migrations (SQLite and MySQL)", async () => {
    const names = usingMysql()
      ? (await sql<{ name: string }>`SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()`.execute(db)).rows.map((r) => r.name)
      : (await sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'trigger'`.execute(db)).rows.map((r) => r.name);
    for (const t of EXPECTED_TRIGGERS) expect(names, t).toContain(t);
    expect([...INTEGRITY_TRIGGERS].sort()).toEqual([...EXPECTED_TRIGGERS].sort());
    expect(await missingTriggers(db)).toEqual([]);
  });

  it("OPS-TRIG-02 a missing trigger is reported at start; on MySQL it is re-created", async () => {
    await sql`DROP TRIGGER consent_purge_checkpoints_no_update`.execute(db);
    const report = await ensureIntegrityTriggers(db);
    if (usingMysql()) {
      expect(report).toMatchObject({ created: ["consent_purge_checkpoints_no_update"], missing: [] });
      expect(await missingTriggers(db)).toEqual([]);
    } else {
      // SQLite: the migrations always create them; a dropped one is reported (Admin → System, server log).
      expect(report.missing).toEqual(["consent_purge_checkpoints_no_update"]);
      await sql.raw(`CREATE TRIGGER consent_purge_checkpoints_no_update BEFORE UPDATE ON consent_purge_checkpoints BEGIN SELECT RAISE(ABORT, 'consent_purge_checkpoints rows are insert-only'); END`).execute(db);
    }
    expect(integrityReport()?.checkedAt).toBeTruthy();
  });

  it("OPS-KEYS-01 scripts/keys.mjs uses the same wrapping format as the app", () => {
    const master = Buffer.alloc(32, 21);
    const key = Buffer.alloc(32, 5);
    expect(keysScript.kekFrom(master).equals(kekFrom(master))).toBe(true);
    expect(unwrapKey(kekFrom(master), keysScript.wrapKey(keysScript.kekFrom(master), key, 3, 2), 3, 2).equals(key)).toBe(true);
    expect(keysScript.unwrapKey(keysScript.kekFrom(master), wrapKey(kekFrom(master), key, 0, 1), 0, 1).equals(key)).toBe(true);
    expect(() => keysScript.unwrapKey(keysScript.kekFrom(master), wrapKey(kekFrom(master), key, 0, 1), 7, 1)).toThrow();
  });

  it("OPS-KEYS-02 rotate-org and rewrap through the script on a SQLite database (round trip with the app)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wpk-keys-"));
    const file = path.join(tmp, "keys.sqlite");
    const OLD = Buffer.alloc(32, 31);
    const NEW = Buffer.alloc(32, 32);
    setMasterKeyForTests(OLD);
    const fileDb = new Kysely<Database>({ dialect: new SqliteDialect({ database: openSqlite(file) }) });
    await migrateToLatestWith(fileDb);
    const org = await createReadyOrg(fileDb, "keys@test.in", "Keys Org");
    await loadKeyring(fileDb, { force: true });
    const before = encryptForOrg(org.orgId, "before rotation");

    const scriptDb = await keysScript.openDb({ driver: "sqlite", file });
    expect(await keysScript.rotateOrg(scriptDb, OLD, String(org.orgId))).toEqual([{ orgId: org.orgId, version: 2 }]);
    await expect(keysScript.rotateOrg(scriptDb, NEW, String(org.orgId))).rejects.toThrow(/does not unwrap/);
    await loadKeyring(fileDb, { force: true });
    const after = encryptForOrg(org.orgId, "after rotation");
    expect(after.startsWith("k2.")).toBe(true);

    await expect(keysScript.rewrap(scriptDb, NEW, OLD)).rejects.toThrow();
    expect(await keysScript.rewrap(scriptDb, OLD, NEW)).toBe(2);
    await scriptDb.close();

    setMasterKeyForTests(NEW);
    await loadKeyring(fileDb, { force: true });
    expect(decryptForOrg(org.orgId, before)).toBe("before rotation");
    expect(decryptForOrg(org.orgId, after)).toBe("after rotation");
    await fileDb.destroy();
    fs.rmSync(tmp, { recursive: true, force: true });
    setMasterKeyForTests(Buffer.alloc(32, 21));
  });

  it("OPS-LOG-01 log retention: never under a year; the purge removes only older platform logs, dry run first", async () => {
    expect(logRetentionDays(undefined)).toBe(400);
    expect(logRetentionDays("90")).toBe(365);
    expect(logRetentionDays("800")).toBe(800);
    const old = new Date(Date.now() - 500 * 86_400_000).toISOString();
    const recent = new Date().toISOString();
    for (const created_at of [old, recent]) await db.insertInto("security_events").values({ user_id: null, actor_id: null, action: "login.failed", target: "", ip_trunc: "", ua_family: "", created_at }).execute();
    const dry = await purgeOldLogs(db, { days: 400 });
    expect(dry).toMatchObject({ dryRun: true, securityEvents: 1 });
    expect(Number((await db.selectFrom("security_events").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst())?.n)).toBe(2);
    const applied = await purgeOldLogs(db, { days: 30, dryRun: false });
    expect(applied.days).toBe(365);
    const left = await db.selectFrom("security_events").select("created_at").execute();
    expect(left.map((r) => r.created_at)).toEqual([recent]);
  });

  it("OPS-START-01 the startup check refuses production without a master key and warns about missing job secrets", () => {
    setMasterKeyForTests(null);
    const keyless = startupProblems({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(keyless.errors.join(" ")).toMatch(/WPK_MASTER_KEY/);
    const ok = startupProblems({ NODE_ENV: "test", WPK_LOG_RETENTION_DAYS: "30" } as NodeJS.ProcessEnv);
    expect(ok.warnings.join(" ")).toMatch(/under one year/);
    const prod = startupProblems({ NODE_ENV: "production", WPK_ADMIN_2FA: "off" } as NodeJS.ProcessEnv);
    expect(prod.warnings.join(" ")).toMatch(/CRON_SECRET/);
    expect(prod.warnings.join(" ")).toMatch(/WPK_ADMIN_2FA=off/);
    setMasterKeyForTests(Buffer.alloc(32, 21));
  });
});
