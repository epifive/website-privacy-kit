#!/usr/bin/env node
/**
 * Master-key and data-key commands for EpiFive Website Privacy Kit.
 * Envelope format and rules: src/lib/secrets.ts (this file uses the same format).
 *
 *   node scripts/keys.mjs generate
 *       Print a new random master key (64 hex characters). Put it in WPK_MASTER_KEY
 *       (or a file named by WPK_MASTER_KEY_FILE, mode 600) and in your password manager.
 *
 *   node scripts/keys.mjs status
 *       Show the fingerprint of the configured master key and of every stored key.
 *
 *   WPK_MASTER_KEY_OLD=<old> WPK_MASTER_KEY=<new> node scripts/keys.mjs rewrap
 *       Rotate the master key: unwrap every stored key with the old master key and
 *       wrap it with the new one, in one transaction. No data is re-encrypted.
 *       Then restart the app with only the new WPK_MASTER_KEY.
 *
 *   node scripts/keys.mjs rotate-org <orgId|all>
 *       Give an organisation (or every organisation) a new random data key version.
 *       New data is encrypted with it; older versions stay readable. Restart the app
 *       (or wait 5 minutes) so it loads the new version.
 *
 * The database comes from the same settings as the app: DATABASE_URL or DB_DRIVER/DB_*
 * variables, else STORAGE_DIR/config.json (default ./storage).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function parseKey(value) {
  const v = String(value ?? "").trim();
  if (/^[0-9a-f]{64}$/i.test(v)) return Buffer.from(v, "hex");
  const b = Buffer.from(v, "base64");
  return b.length === 32 ? b : null;
}

export function kekFrom(master) {
  return Buffer.from(crypto.hkdfSync("sha256", master, Buffer.from("wpk-kek-v1"), Buffer.from("kek"), 32));
}

export function kekId(kek) {
  return crypto.createHash("sha256").update(kek).digest("hex").slice(0, 16);
}

const aad = (orgId, version) => Buffer.from(`wpk-key:${orgId}:${version}`);

export function wrapKey(kek, key, orgId, version) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);
  cipher.setAAD(aad(orgId, version));
  const ct = Buffer.concat([cipher.update(key), cipher.final()]);
  return ["w1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function unwrapKey(kek, wrapped, orgId, version) {
  const [v, iv, tag, ct] = String(wrapped).split(".");
  if (v !== "w1" || !iv || !tag || !ct) throw new Error("Unknown wrapped-key format.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", kek, Buffer.from(iv, "base64url"));
  decipher.setAAD(aad(orgId, version));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]);
  } catch {
    throw new Error(`The master key does not unwrap key ${orgId}/v${version}.`);
  }
}

function masterFromEnv(name) {
  let raw = process.env[name];
  if (!raw && name === "WPK_MASTER_KEY" && process.env.WPK_MASTER_KEY_FILE) raw = fs.readFileSync(process.env.WPK_MASTER_KEY_FILE, "utf8");
  const key = parseKey(raw);
  if (!key) throw new Error(`${name} is missing or not 32 bytes (64 hex characters or base64).`);
  return key;
}

export function dbConfig() {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    return { driver: "mysql", host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.slice(1)), ssl: /^(1|true|required|verify)/i.test(u.searchParams.get("ssl") ?? process.env.DB_SSL ?? "") };
  }
  if (process.env.DB_DRIVER === "mysql") {
    return { driver: "mysql", host: process.env.DB_HOST || "127.0.0.1", port: Number(process.env.DB_PORT || 3306), user: process.env.DB_MIGRATE_USER || process.env.DB_USER || "root", password: process.env.DB_MIGRATE_USER ? process.env.DB_MIGRATE_PASSWORD || "" : process.env.DB_PASSWORD || "", database: process.env.DB_NAME || "privacykit", ssl: /^(1|true|required)$/i.test(process.env.DB_SSL ?? "") };
  }
  const storage = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(process.cwd(), "storage");
  if (process.env.DB_DRIVER === "sqlite") {
    const file = process.env.DB_FILE || "database.sqlite";
    return { driver: "sqlite", file: path.isAbsolute(file) ? file : path.join(storage, file) };
  }
  const cfg = JSON.parse(fs.readFileSync(path.join(storage, "config.json"), "utf8")).db;
  if (cfg.driver === "sqlite") return { driver: "sqlite", file: path.isAbsolute(cfg.file) ? cfg.file : path.join(storage, cfg.file) };
  return cfg;
}

/** A tiny query interface over node:sqlite or mysql2 (all, run, transaction, close). */
export async function openDb(config = dbConfig()) {
  if (config.driver === "sqlite") {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(config.file);
    return {
      all: async (q, p = []) => db.prepare(q).all(...p),
      run: async (q, p = []) => void db.prepare(q).run(...p),
      transaction: async (fn) => {
        db.exec("BEGIN IMMEDIATE");
        try {
          await fn();
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
      close: async () => db.close(),
    };
  }
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.database, ssl: config.ssl ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined });
  return {
    all: async (q, p = []) => (await conn.execute(q, p))[0],
    run: async (q, p = []) => void (await conn.execute(q, p)),
    transaction: async (fn) => {
      await conn.beginTransaction();
      try {
        await fn();
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    },
    close: async () => conn.end(),
  };
}

export async function rewrap(db, oldMaster, newMaster) {
  const oldKek = kekFrom(oldMaster);
  const newKek = kekFrom(newMaster);
  const rows = await db.all("SELECT org_id, version, wrapped_key FROM org_keys ORDER BY org_id, version");
  // Unwrap everything first: nothing is changed unless the old key opens every row.
  const keys = rows.map((r) => ({ ...r, key: unwrapKey(oldKek, r.wrapped_key, Number(r.org_id), Number(r.version)) }));
  await db.transaction(async () => {
    for (const r of keys) {
      await db.run("UPDATE org_keys SET wrapped_key = ?, kek_id = ? WHERE org_id = ? AND version = ?", [wrapKey(newKek, r.key, Number(r.org_id), Number(r.version)), kekId(newKek), r.org_id, r.version]);
    }
  });
  return keys.length;
}

export async function rotateOrg(db, master, target) {
  const kek = kekFrom(master);
  const orgs = target === "all" ? (await db.all("SELECT id FROM orgs ORDER BY id")).map((r) => Number(r.id)) : [Number(target)];
  if (orgs.some((id) => !Number.isInteger(id) || id < 1)) throw new Error("Give an organisation id or 'all'.");
  const platform = await db.all("SELECT wrapped_key FROM org_keys WHERE org_id = 0 AND version = 1");
  if (!platform.length) throw new Error("No platform key yet: start the app once first.");
  unwrapKey(kek, platform[0].wrapped_key, 0, 1); // refuse to write keys under the wrong master key
  const created = [];
  for (const orgId of orgs) {
    const last = await db.all("SELECT MAX(version) AS v FROM org_keys WHERE org_id = ?", [orgId]);
    const version = Math.max(1, Number(last[0]?.v ?? 1)) + 1;
    await db.run("INSERT INTO org_keys (org_id, version, wrapped_key, kek_id, created_at) VALUES (?, ?, ?, ?, ?)", [orgId, version, wrapKey(kek, crypto.randomBytes(32), orgId, version), kekId(kek), new Date().toISOString()]);
    created.push({ orgId, version });
  }
  return created;
}

async function main(argv) {
  const [cmd, arg] = argv;
  if (cmd === "generate") {
    console.log(crypto.randomBytes(32).toString("hex"));
    console.error("Store it as WPK_MASTER_KEY (mode 600) AND in your password manager. It is never in the database or its backups.");
    return;
  }
  if (cmd === "fingerprint") {
    console.log(kekId(kekFrom(masterFromEnv("WPK_MASTER_KEY"))));
    return;
  }
  const db = await openDb();
  try {
    if (cmd === "status") {
      const current = kekId(kekFrom(masterFromEnv("WPK_MASTER_KEY")));
      const rows = await db.all("SELECT org_id, version, kek_id, created_at FROM org_keys ORDER BY org_id, version");
      console.log(`Configured master key fingerprint: ${current}`);
      for (const r of rows) console.log(`${r.org_id === 0 || r.org_id === "0" ? "platform" : `org ${r.org_id}`} v${r.version}  ${r.kek_id}${r.kek_id === current ? "" : "  (DIFFERENT master key)"}  ${r.created_at}`);
    } else if (cmd === "rewrap") {
      const n = await rewrap(db, masterFromEnv("WPK_MASTER_KEY_OLD"), masterFromEnv("WPK_MASTER_KEY"));
      console.log(`Re-wrapped ${n} keys. Restart the app with the new WPK_MASTER_KEY only, then destroy the old key.`);
    } else if (cmd === "rotate-org") {
      const created = await rotateOrg(db, masterFromEnv("WPK_MASTER_KEY"), arg ?? "");
      for (const c of created) console.log(`org ${c.orgId}: new data key v${c.version}`);
      console.log("Restart the app (or wait 5 minutes) so it uses the new key versions.");
    } else {
      console.log("Usage: node scripts/keys.mjs generate | fingerprint | status | rewrap | rotate-org <orgId|all>");
      process.exitCode = 1;
    }
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
