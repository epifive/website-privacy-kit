import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Kysely } from "kysely";
import { storagePath } from "./config";
import type { Database } from "./db/schema";

/**
 * Keys and envelope encryption (plan §7.4 "Minimisation", §7.6 "Secrets"; P7).
 *
 * Master key (KEK source): WPK_MASTER_KEY (64 hex characters or base64 of 32
 * bytes) or a file named by WPK_MASTER_KEY_FILE. In production one of them is
 * required (startup check in src/instrumentation.ts). Outside production a
 * key is created in storage/master.key on first use, for development and
 * single-server self-hosting.
 *
 * The master key never encrypts data itself. It derives a key-encryption key
 * (KEK = HKDF(master, "wpk-kek-v1")) that wraps data keys stored in org_keys:
 *
 *   - org_keys(org 0, v1): the platform root key (random 256-bit; for
 *     databases that already held data before P7 it is the old master key, so
 *     existing ciphertexts and links keep working). Version-1 keys of every
 *     organisation, the lookup HMAC keys and link-signing keys are derived
 *     from it with HKDF-SHA256 per organisation and purpose.
 *   - org_keys(org N, v2+): random per-organisation data keys created by
 *     `node scripts/keys.mjs rotate-org N`. New data of that organisation is
 *     encrypted with the newest version ("k2.iv.tag.ct"); older versions stay
 *     readable. Lookup HMACs keep using version 1 so searches still match.
 *
 * Rotating the master key re-wraps the stored keys only (no data is
 * re-encrypted): `WPK_MASTER_KEY_OLD=… WPK_MASTER_KEY=… node scripts/keys.mjs rewrap`.
 * Each wrapped key records the KEK fingerprint; the app refuses to start when
 * the configured master key does not unwrap the platform key.
 *
 * Keep the master key out of database backups: anyone holding both can
 * decrypt stored emails and phone numbers and forge withdraw links.
 */

let cachedMaster: Buffer | null = null;

export class MasterKeyError extends Error {}

export function parseKey(value: string): Buffer | null {
  const v = value.trim();
  if (/^[0-9a-f]{64}$/i.test(v)) return Buffer.from(v, "hex");
  const b = Buffer.from(v, "base64");
  return b.length === 32 ? b : null;
}

/** Where the master key comes from, without loading it (startup check). */
export function masterKeySource(env: NodeJS.ProcessEnv = process.env): "env" | "file" | "storage" | "missing" {
  if (env.WPK_MASTER_KEY) return "env";
  if (env.WPK_MASTER_KEY_FILE) return "file";
  return env.NODE_ENV === "production" ? "missing" : "storage";
}

export function masterKey(): Buffer {
  if (cachedMaster) return cachedMaster;
  const fromEnv = process.env.WPK_MASTER_KEY;
  if (fromEnv) {
    const key = parseKey(fromEnv);
    if (!key) throw new MasterKeyError("WPK_MASTER_KEY must be 32 bytes (64 hex characters or base64).");
    return (cachedMaster = key);
  }
  if (process.env.WPK_MASTER_KEY_FILE) {
    let raw: string;
    try {
      raw = fs.readFileSync(process.env.WPK_MASTER_KEY_FILE, "utf8");
    } catch {
      throw new MasterKeyError(`WPK_MASTER_KEY_FILE (${process.env.WPK_MASTER_KEY_FILE}) can't be read.`);
    }
    const key = parseKey(raw);
    if (!key) throw new MasterKeyError("The file in WPK_MASTER_KEY_FILE must hold 32 bytes (64 hex characters or base64).");
    return (cachedMaster = key);
  }
  if (process.env.NODE_ENV === "production") {
    throw new MasterKeyError("WPK_MASTER_KEY (or WPK_MASTER_KEY_FILE) is required in production. Generate one with: node scripts/keys.mjs generate");
  }
  const file = storagePath("master.key");
  try {
    const key = parseKey(fs.readFileSync(file, "utf8"));
    if (key) return (cachedMaster = key);
  } catch {
    // Not created yet.
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, key.toString("hex") + "\n", { mode: 0o600, flag: "wx" });
  } catch {
    const theirs = parseKey(fs.readFileSync(file, "utf8"));
    if (!theirs) throw new MasterKeyError("storage/master.key is unreadable.");
    return (cachedMaster = theirs);
  }
  return (cachedMaster = key);
}

// ── Key wrapping (same format as scripts/keys.mjs) ──

export function kekFrom(master: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", master, Buffer.from("wpk-kek-v1"), Buffer.from("kek"), 32));
}

/** First 16 hex characters of SHA-256(KEK): which master key wrapped a key (never the key itself). */
export function kekId(kek: Buffer): string {
  return crypto.createHash("sha256").update(kek).digest("hex").slice(0, 16);
}

const wrapAad = (orgId: number, version: number) => Buffer.from(`wpk-key:${orgId}:${version}`);

export function wrapKey(kek: Buffer, key: Buffer, orgId: number, version: number): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);
  cipher.setAAD(wrapAad(orgId, version));
  const ct = Buffer.concat([cipher.update(key), cipher.final()]);
  return ["w1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function unwrapKey(kek: Buffer, wrapped: string, orgId: number, version: number): Buffer {
  const [v, iv, tag, ct] = wrapped.split(".");
  if (v !== "w1" || !iv || !tag || !ct) throw new MasterKeyError("Unknown wrapped-key format.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", kek, Buffer.from(iv, "base64url"));
  decipher.setAAD(wrapAad(orgId, version));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]);
  } catch {
    throw new MasterKeyError("The master key does not unwrap the stored keys. Use the WPK_MASTER_KEY this database was set up with (or run scripts/keys.mjs rewrap).");
  }
}

// ── Keyring (process-wide cache) ──

interface Keyring {
  root: Buffer | null;
  orgKeys: Map<number, Map<number, Buffer>>;
  loadedAt: number;
}

const store = globalThis as unknown as { __wpkKeyring?: Keyring };
const ring = (): Keyring => (store.__wpkKeyring ??= { root: null, orgKeys: new Map(), loadedAt: 0 });

/** For tests only: use a fixed master key (and forget any loaded keyring). */
export function setMasterKeyForTests(key: Buffer | null): void {
  cachedMaster = key;
  store.__wpkKeyring = undefined;
}

/**
 * Load (and on first run create) the wrapped keys. Called once per process
 * from getDb() and every few minutes after that, so keys rotated by
 * scripts/keys.mjs are picked up. Throws MasterKeyError when the configured
 * master key does not match the database.
 */
export async function loadKeyring(db: Kysely<Database>, opts: { force?: boolean } = {}): Promise<void> {
  const r = ring();
  if (!opts.force && r.root && Date.now() - r.loadedAt < 300_000) return;
  const kek = kekFrom(masterKey());
  let rows = await db.selectFrom("org_keys").selectAll().execute();
  if (!rows.some((row) => row.org_id === 0 && row.version === 1)) {
    // Databases that already hold encrypted data keep the old master key as the root, so nothing changes for them.
    const orgs = await db.selectFrom("orgs").select("id").limit(1).executeTakeFirst();
    const root = orgs ? masterKey() : crypto.randomBytes(32);
    try {
      await db.insertInto("org_keys").values({ org_id: 0, version: 1, wrapped_key: wrapKey(kek, root, 0, 1), kek_id: kekId(kek), created_at: new Date().toISOString() }).execute();
    } catch {
      // Another process created it first.
    }
    rows = await db.selectFrom("org_keys").selectAll().execute();
  }
  const orgKeys = new Map<number, Map<number, Buffer>>();
  let root: Buffer | null = null;
  for (const row of rows) {
    const key = unwrapKey(kek, row.wrapped_key, row.org_id, row.version);
    if (row.org_id === 0 && row.version === 1) root = key;
    else if (row.version >= 2) {
      if (!orgKeys.has(row.org_id)) orgKeys.set(row.org_id, new Map());
      orgKeys.get(row.org_id)!.set(row.version, key);
    }
  }
  store.__wpkKeyring = { root, orgKeys, loadedAt: Date.now() };
}

/** Create a new random data-key version for an organisation (scripts/keys.mjs uses the same format). */
export async function rotateOrgKey(db: Kysely<Database>, orgId: number): Promise<number> {
  const kek = kekFrom(masterKey());
  const last = await db.selectFrom("org_keys").select((eb) => eb.fn.max("version").as("v")).where("org_id", "=", orgId).executeTakeFirst();
  const version = Math.max(1, Number(last?.v ?? 1)) + 1;
  await db.insertInto("org_keys").values({ org_id: orgId, version, wrapped_key: wrapKey(kek, crypto.randomBytes(32), orgId, version), kek_id: kekId(kek), created_at: new Date().toISOString() }).execute();
  await loadKeyring(db, { force: true });
  return version;
}

/** Re-wrap every stored key from an old master key to a new one (no data is re-encrypted). */
export async function rewrapKeys(db: Kysely<Database>, oldMaster: Buffer, newMaster: Buffer): Promise<number> {
  const oldKek = kekFrom(oldMaster);
  const newKek = kekFrom(newMaster);
  const rows = await db.selectFrom("org_keys").selectAll().execute();
  await db.transaction().execute(async (trx) => {
    for (const row of rows) {
      const key = unwrapKey(oldKek, row.wrapped_key, row.org_id, row.version);
      await trx.updateTable("org_keys").set({ wrapped_key: wrapKey(newKek, key, row.org_id, row.version), kek_id: kekId(newKek) }).where("org_id", "=", row.org_id).where("version", "=", row.version).execute();
    }
  });
  return rows.length;
}

function rootKey(): Buffer {
  return ring().root ?? masterKey();
}

function latestVersion(orgId: number): number {
  const versions = ring().orgKeys.get(orgId);
  return versions?.size ? Math.max(...versions.keys()) : 1;
}

function derive(purpose: string, orgId = 0, version = 1): Buffer {
  const base = version === 1 ? rootKey() : ring().orgKeys.get(orgId)?.get(version);
  if (!base) throw new MasterKeyError(`Key version ${version} of organisation ${orgId} is not loaded. Restart the app after rotating keys.`);
  return Buffer.from(crypto.hkdfSync("sha256", base, Buffer.from("wpk-v1"), Buffer.from(`${purpose}:${orgId}`), 32));
}

/** Normalised identifier: emails lower-cased, phone numbers reduced to digits (Indian 10-digit numbers get 91). */
export function normalizeIdentifier(kind: "email" | "phone", value: string): string | null {
  if (kind === "email") {
    const v = value.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 190 ? v : null;
  }
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** HMAC-SHA256 lookup value for an identifier, per organisation (always key version 1, so lookups survive rotation). */
export function identifierHmac(orgId: number, kind: "email" | "phone", normalized: string): string {
  return crypto.createHmac("sha256", derive("lookup", orgId)).update(`${kind}:${normalized}`).digest("hex");
}

/** AES-256-GCM: "v1.iv.tag.ciphertext" (key version 1) or "k{n}.iv.tag.ciphertext" (rotated key n). */
export function encryptForOrg(orgId: number, plaintext: string): string {
  const version = latestVersion(orgId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derive("data", orgId, version), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [version === 1 ? "v1" : `k${version}`, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptForOrg(orgId: number, value: string): string | null {
  const [v, iv, tag, ct] = value.split(".");
  const version = v === "v1" ? 1 : /^k\d{1,3}$/.test(v ?? "") ? Number(v.slice(1)) : 0;
  if (!version || !iv || !tag || !ct) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", derive("data", orgId, version), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** AES-256-GCM for files (attachments): [key version 1–255][12-byte IV][16-byte tag][ciphertext]. */
export function encryptBytesForOrg(orgId: number, data: Uint8Array): Buffer {
  const version = Math.min(255, latestVersion(orgId));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derive("file", orgId, version), iv);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([Buffer.from([version]), iv, cipher.getAuthTag(), ct]);
}

export function decryptBytesForOrg(orgId: number, data: Uint8Array): Buffer | null {
  const buf = Buffer.from(data);
  if (buf.length < 29 || buf[0] < 1) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", derive("file", orgId, buf[0]), buf.subarray(1, 13));
    decipher.setAuthTag(buf.subarray(13, 29));
    return Buffer.concat([decipher.update(buf.subarray(29)), decipher.final()]);
  } catch {
    return null;
  }
}

/** HMAC signature for signed links (withdraw links, plan M5). */
export function signToken(scope: string, payload: string): string {
  return crypto.createHmac("sha256", derive(`token:${scope}`)).update(payload).digest("base64url");
}

export function verifyTokenSignature(scope: string, payload: string, signature: string): boolean {
  const expected = Buffer.from(signToken(scope, payload));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Platform secrets (2FA seeds): AES-256-GCM with the platform data key (organisation 0). */
export const encryptPlatform = (plaintext: string) => encryptForOrg(0, plaintext);
export const decryptPlatform = (value: string) => decryptForOrg(0, value);
