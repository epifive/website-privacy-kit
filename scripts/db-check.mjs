#!/usr/bin/env node
/**
 * Integrity check of a Website Privacy Kit database (after a restore).
 * Read-only. Needs no master key: it checks what can be proven without decrypting.
 *
 *   DATABASE_URL=mysql://user:pw@host:3306/privacykit node scripts/db-check.mjs [--counts counts.tsv] [--write-counts out.tsv]
 *   DB_DRIVER=sqlite DB_FILE=/path/database.sqlite node scripts/db-check.mjs
 *
 * Checks: row count of every table (and, with --counts, equality with the counts recorded at
 * backup time); every site's consent hash chain from its latest purge checkpoint to the stored
 * chain head; every notice version's SHA-256; the 12 integrity triggers; and, when WPK_MASTER_KEY is
 * set, that it unwraps every stored data key (the restored data is readable). Exit 1 on any failure.
 * Node.js 24 (imports the TypeScript chain module directly).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { GENESIS_HASH, verifyChain } from "../src/core/consent/chain.ts";
import { dbConfig, kekFrom, openDb, parseKey, unwrapKey } from "./keys.mjs";

const TRIGGERS = [
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

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const config = dbConfig();
const db = await openDb(config);
const mysql = config.driver === "mysql";
const problems = [];

const tables = mysql
  ? (await db.all("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME")).map((r) => r.name)
  : (await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => r.name);
const counts = {};
for (const t of tables) counts[t] = Number((await db.all(`SELECT COUNT(*) AS n FROM ${mysql ? `\`${t}\`` : `"${t}"`}`))[0].n);

const countFile = arg("--counts");
if (countFile) {
  const expected = Object.fromEntries(
    fs.readFileSync(countFile, "utf8").trim().split("\n").filter(Boolean).map((line) => {
      const [t, n] = line.split("\t");
      return [t, Number(n)];
    }),
  );
  for (const [t, n] of Object.entries(expected)) if (counts[t] !== n) problems.push(`count ${t}: backup ${n}, restored ${counts[t] ?? "missing"}`);
}
const writeCounts = arg("--write-counts");
if (writeCounts) fs.writeFileSync(writeCounts, Object.entries(counts).map(([t, n]) => `${t}\t${n}`).join("\n") + "\n");

// Consent chains: from the latest checkpoint (or genesis) to the stored head.
const sites = await db.all("SELECT id, org_id FROM sites ORDER BY id");
const chains = [];
for (const site of sites) {
  const cp = (await db.all("SELECT through_seq, through_hash FROM consent_purge_checkpoints WHERE site_id = ? ORDER BY through_seq DESC LIMIT 1", [site.id]))[0];
  const head = (await db.all("SELECT seq, hash FROM consent_chain_heads WHERE site_id = ?", [site.id]))[0];
  const start = cp ? { seq: Number(cp.through_seq), hash: cp.through_hash } : { seq: 0, hash: GENESIS_HASH };
  const rows = await db.all("SELECT * FROM consent_events WHERE site_id = ? AND seq > ? ORDER BY seq", [site.id, start.seq]);
  const r = verifyChain(rows, { start, head: head ? { seq: Number(head.seq), hash: head.hash } : { seq: start.seq, hash: start.hash } });
  chains.push({ site: site.id, org: site.org_id, events: r.count, ok: r.ok, head: r.head.slice(0, 16) });
  if (!r.ok) problems.push(`consent chain of site ${site.id}: ${r.error?.reason} at seq ${r.error?.seq}`);
}

// Notice versions: body hash.
let notices = 0;
for (const n of await db.all("SELECT id, body_md, sha256 FROM notice_versions")) {
  notices += 1;
  if (crypto.createHash("sha256").update(n.body_md, "utf8").digest("hex") !== n.sha256) problems.push(`notice_versions ${n.id}: SHA-256 does not match`);
}

const present = new Set(
  (mysql
    ? await db.all("SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()")
    : await db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'")
  ).map((r) => r.name),
);
// Master key: every wrapped key in org_keys must unwrap (nothing is decrypted beyond the keys).
let keys = null;
const master = parseKey(process.env.WPK_MASTER_KEY ?? "");
if (master) {
  const kek = kekFrom(master);
  keys = { total: 0, ok: 0 };
  for (const k of await db.all("SELECT org_id, version, wrapped_key FROM org_keys")) {
    keys.total += 1;
    try {
      unwrapKey(kek, k.wrapped_key, Number(k.org_id), Number(k.version));
      keys.ok += 1;
    } catch {
      problems.push(`org_keys ${k.org_id}/v${k.version} does not unwrap with this WPK_MASTER_KEY`);
    }
  }
}

const missingTriggers = TRIGGERS.filter((t) => !present.has(t));
if (missingTriggers.length) problems.push(`missing triggers: ${missingTriggers.join(", ")}`);
await db.close();

const report = { ok: problems.length === 0, driver: config.driver, tables: tables.length, counts, chains, notices, keys, triggers: TRIGGERS.length - missingTriggers.length, problems };
if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`[db-check] ${config.driver}: ${tables.length} tables, ${Object.values(counts).reduce((a, b) => a + b, 0)} rows`);
  for (const c of chains) console.log(`[db-check] site ${c.site} (org ${c.org}): ${c.events} consent events, chain ${c.ok ? "verified" : "BROKEN"}, head ${c.head}…`);
  console.log(`[db-check] notice versions re-hashed: ${notices}; integrity triggers: ${report.triggers}/${TRIGGERS.length}`);
  console.log(keys ? `[db-check] master key unwraps ${keys.ok}/${keys.total} stored data keys` : "[db-check] WPK_MASTER_KEY not set: data keys not checked");
  if (countFile) console.log(`[db-check] row counts ${problems.some((p) => p.startsWith("count ")) ? "DIFFER" : "equal to the backup's"} (${Object.keys(counts).length} tables)`);
  for (const p of problems) console.log(`[db-check] PROBLEM ${p}`);
  console.log(`[db-check] ${report.ok ? "OK" : "FAILED"}`);
}
process.exit(report.ok ? 0 : 1);
