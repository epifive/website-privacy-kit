import "server-only";
import crypto from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing (plan §7.6): argon2id from Node.js's built-in crypto
 * (Node 24.7+), OWASP parameters m = 19 MiB, t = 2, p = 1, stored as a PHC
 * string: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash> (base64, no padding).
 *
 * Older scrypt hashes ("scrypt$N$r$p$salt$hash") still verify; callers re-hash
 * them with argon2id on the next successful sign-in (needsRehash).
 */

const ARGON = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 } as const;

type Argon2 = (algorithm: string, params: Record<string, unknown>, callback: (err: Error | null, key: Buffer) => void) => void;
const argon2Fn = (crypto as unknown as { argon2?: Argon2 }).argon2;

export function argon2Available(): boolean {
  return typeof argon2Fn === "function";
}

function argon2id(password: string, salt: Buffer, opts: { memory: number; passes: number; parallelism: number; tagLength: number }): Promise<Buffer> {
  if (!argon2Fn) throw new Error("argon2id needs Node.js 24.7 or newer.");
  return new Promise((resolve, reject) =>
    argon2Fn("argon2id", { message: Buffer.from(password, "utf8"), nonce: salt, ...opts }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

const b64 = (b: Buffer) => b.toString("base64").replace(/=+$/, "");

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await argon2id(password, salt, ARGON);
  return `$argon2id$v=19$m=${ARGON.memory},t=${ARGON.passes},p=${ARGON.parallelism}$${b64(salt)}$${b64(hash)}`;
}

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>;

async function verifyScrypt(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, rr, pp, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: Number(rr), p: Number(pp), maxmem: 64 * 1024 * 1024 });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("scrypt$")) return verifyScrypt(password, stored);
  const m = PHC.exec(stored);
  if (!m) return false;
  const [, memory, passes, parallelism, salt, hash] = m;
  const expected = Buffer.from(hash, "base64");
  if (Number(memory) > 262_144 || Number(passes) > 10 || Number(parallelism) > 8 || expected.length < 16) return false;
  const actual = await argon2id(password, Buffer.from(salt, "base64"), { memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism), tagLength: expected.length });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** True when a stored hash should be replaced (legacy scrypt or weaker argon2id parameters). */
export function needsRehash(stored: string): boolean {
  const m = PHC.exec(stored);
  if (!m) return true;
  return Number(m[1]) < ARGON.memory || Number(m[2]) < ARGON.passes;
}

/** A dummy verification so unknown accounts take as long as known ones (no user enumeration by timing). */
let dummy: string | null = null;
export async function burnPasswordTime(password: string): Promise<void> {
  dummy ??= await hashPassword(crypto.randomBytes(12).toString("hex"));
  await verifyPassword(password, dummy);
}
