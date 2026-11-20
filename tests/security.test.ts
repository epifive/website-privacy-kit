import crypto from "node:crypto";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { authenticate, createChallenge, enableTotp, LOCK_AFTER, readChallenge, twoFactorRequired, verifySecondFactor } from "@/lib/auth/service";
import { sessionAlive, SESSION_LIMITS } from "@/lib/auth/session";
import { base32Decode, base32Encode, generateTotpSecret, otpauthQrSvg, otpauthUri, timeStep, totpCode, verifyTotp } from "@/lib/auth/totp";
import QRCode from "qrcode";
import { decryptBytesForOrg, decryptForOrg, encryptBytesForOrg, encryptForOrg, identifierHmac, loadKeyring, masterKey, MasterKeyError, rewrapKeys, rotateOrgKey, setMasterKeyForTests, signToken } from "@/lib/secrets";
import { logSecurityEvent } from "@/lib/security-log";
import { createTestDb } from "./helpers/db";
import { createReadyOrg, createUser } from "./helpers/fixtures";

/** P7 security (plan §7.6): SEC-PW, SEC-LOCK, SEC-2FA, SEC-SESS, SEC-LOG, SEC-KEY. */

const MASTER = Buffer.alloc(32, 11);

describe("SEC passwords, lockout, 2FA, sessions, audit log", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    setMasterKeyForTests(MASTER);
    db = await createTestDb();
  });
  afterAll(async () => {
    setMasterKeyForTests(null);
    await db.destroy();
  });

  it("SEC-PW-01 argon2id PHC hashes; legacy scrypt hashes verify and are upgraded on the next good sign-in", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
    // An scrypt hash as written before P7.
    const salt = crypto.randomBytes(16);
    const key = await (promisify(crypto.scrypt) as (p: string, s: Buffer, l: number, o: crypto.ScryptOptions) => Promise<Buffer>)("old password!", salt, 64, { N: 16384, r: 8, p: 1 });
    const legacy = ["scrypt", 16384, 8, 1, salt.toString("base64"), key.toString("base64")].join("$");
    expect(await verifyPassword("old password!", legacy)).toBe(true);
    expect(needsRehash(legacy)).toBe(true);
    const id = await createUser(db, "legacy@test.in");
    await db.updateTable("users").set({ password_hash: legacy }).where("id", "=", id).execute();
    const result = await authenticate(db, "legacy@test.in", "old password!");
    expect(result.ok).toBe(true);
    const stored = (await db.selectFrom("users").select("password_hash").where("id", "=", id).executeTakeFirstOrThrow()).password_hash;
    expect(stored.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("old password!", stored)).toBe(true);
    const events = await db.selectFrom("security_events").select("action").where("user_id", "=", id).execute();
    expect(events.map((e) => e.action)).toContain("password.rehashed");
  });

  it("SEC-LOCK-01 ten wrong passwords lock the account for 15 minutes; unknown accounts get the same answer", async () => {
    const id = await createUser(db, "lock@test.in");
    await db.updateTable("users").set({ password_hash: await hashPassword("right password") }).where("id", "=", id).execute();
    const t0 = Date.now();
    for (let i = 1; i < LOCK_AFTER; i++) expect(await authenticate(db, "lock@test.in", "nope", {}, t0)).toEqual({ ok: false, reason: "invalid" });
    expect(await authenticate(db, "lock@test.in", "nope", {}, t0)).toEqual({ ok: false, reason: "locked" });
    expect(await authenticate(db, "lock@test.in", "right password", {}, t0 + 60_000)).toEqual({ ok: false, reason: "locked" });
    expect((await authenticate(db, "lock@test.in", "right password", {}, t0 + 16 * 60_000)).ok).toBe(true);
    expect(await authenticate(db, "nobody@test.in", "x")).toEqual({ ok: false, reason: "invalid" });
    const actions = (await db.selectFrom("security_events").select("action").where("user_id", "=", id).execute()).map((e) => e.action);
    expect(actions.filter((a) => a === "login.failed")).toHaveLength(LOCK_AFTER - 1);
    expect(actions).toContain("login.locked");
  });

  it("SEC-2FA-01 TOTP matches RFC 6238, allows ±1 step, refuses replays; recovery codes work once", async () => {
    const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));
    expect(rfcSecret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(rfcSecret).toString()).toBe("12345678901234567890");
    expect(totpCode(rfcSecret, 1)).toBe("287082"); // T = 59 s (RFC 6238 appendix B, last 6 digits)
    expect(totpCode(rfcSecret, timeStep(1111111109_000))).toBe("081804");
    const secret = generateTotpSecret();
    const now = Date.now();
    const step = timeStep(now);
    expect(verifyTotp(secret, totpCode(secret, step), 0, now)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), 0, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step - 2), 0, now)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step), step, now)).toBeNull();

    const id = await createUser(db, "twofa@test.in");
    expect((await enableTotp(db, id, secret, "000000", {}, now)).ok).toBe(false);
    const enabled = await enableTotp(db, id, secret, totpCode(secret, step), {}, now);
    if (!enabled.ok) throw new Error("not enabled");
    expect(enabled.recoveryCodes).toHaveLength(10);
    const row = await db.selectFrom("users").select(["totp_secret_enc", "recovery_codes"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(row.totp_secret_enc).not.toContain(secret);
    expect(row.recovery_codes).not.toContain(enabled.recoveryCodes[0]);
    // The code used to enable can't be used again; the next step works once.
    expect(await verifySecondFactor(db, id, totpCode(secret, step), {}, now)).toBeNull();
    expect(await verifySecondFactor(db, id, totpCode(secret, step + 1), {}, now + 30_000)).toBe("totp");
    expect(await verifySecondFactor(db, id, totpCode(secret, step + 1), {}, now + 30_000)).toBeNull();
    expect(await verifySecondFactor(db, id, enabled.recoveryCodes[0].toUpperCase(), {}, now)).toBe("recovery");
    expect(await verifySecondFactor(db, id, enabled.recoveryCodes[0], {}, now)).toBeNull();
    const auth = await authenticate(db, "twofa@test.in", "x");
    expect(auth.ok).toBe(false);
  });

  it("SEC-2FA-04 the setup page QR code is an SVG of the otpauth link (key kept as text fallback)", async () => {
    const secret = generateTotpSecret();
    const uri = otpauthUri(secret, "owner@test.in", "Privacy Kit");
    const svg = await otpauthQrSvg(uri);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox");
    expect(svg).not.toMatch(/<script|on\w+=/i);
    const qr = QRCode.create(uri, { errorCorrectionLevel: "M" });
    const data = qr.segments.map((s) => Buffer.from((s as unknown as { data: Uint8Array }).data).toString("utf8")).join("");
    expect(data).toBe(uri);
    expect(svg).toContain(`viewBox="0 0 ${qr.modules.size + 8} ${qr.modules.size + 8}"`);
  });

  it("SEC-2FA-02 the password→code challenge is signed and expires after 5 minutes; administrators need 2FA", () => {
    const now = Date.now();
    const token = createChallenge(42, now);
    expect(readChallenge(token, now + 60_000)).toBe(42);
    expect(readChallenge(token, now + 6 * 60_000)).toBeNull();
    expect(readChallenge(token.replace(/^42\./, "43."), now)).toBeNull();
    expect(readChallenge(`42.${now + 999_999}.${signToken("other-scope", `42.${now + 999_999}`)}`, now)).toBeNull();
    expect(twoFactorRequired({ role: "admin" })).toBe(true);
    expect(twoFactorRequired({ role: "user" })).toBe(false);
    process.env.WPK_ADMIN_2FA = "off";
    expect(twoFactorRequired({ role: "admin" })).toBe(false);
    delete process.env.WPK_ADMIN_2FA;
  });

  it("SEC-SESS-01 sessions end after the idle period and the absolute lifetime, sooner for administrators", () => {
    const created = Date.parse("2026-11-20T00:00:00.000Z");
    const row = (lastSeenMs: number) => ({ created_at: new Date(created).toISOString(), last_seen_at: new Date(lastSeenMs).toISOString(), expires_at: new Date(created + SESSION_LIMITS.user.absoluteMs).toISOString() });
    expect(sessionAlive(row(created), "user", created + 2 * 86_400_000)).toBe(true);
    expect(sessionAlive(row(created), "user", created + 4 * 86_400_000)).toBe(false);
    expect(sessionAlive(row(created + 29 * 86_400_000), "user", created + 30 * 86_400_000 + 1)).toBe(false);
    expect(sessionAlive(row(created), "admin", created + 3 * 3_600_000)).toBe(false);
    expect(sessionAlive(row(created + 11 * 3_600_000), "admin", created + 12 * 3_600_000 + 1)).toBe(false);
    expect(sessionAlive(row(created + 3_600_000), "admin", created + 2 * 3_600_000)).toBe(true);
  });

  it("SEC-LOG-01 security_events and audit_log are insert-only and keep rows for at least one year", async () => {
    await logSecurityEvent(db, { action: "login.success", userId: 1, ip: "203.0.113.77", userAgent: "Mozilla/5.0 Chrome/140.0 Safari/537.36" });
    const ev = await db.selectFrom("security_events").selectAll().orderBy("id", "desc").executeTakeFirstOrThrow();
    expect(ev.ip_trunc).toBe("203.0.113.0/24");
    expect(ev.ua_family).toMatch(/Chrome/);
    await expect(db.updateTable("security_events").set({ action: "x" }).where("id", "=", ev.id).execute()).rejects.toThrow(/insert-only/);
    await expect(db.deleteFrom("security_events").where("id", "=", ev.id).execute()).rejects.toThrow(/one year/);
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
    await db.insertInto("security_events").values({ user_id: 1, actor_id: null, action: "login.success", target: "", ip_trunc: "", ua_family: "", created_at: old }).execute();
    const purged = await db.deleteFrom("security_events").where("created_at", "=", old).executeTakeFirst();
    expect(Number(purged.numDeletedRows)).toBe(1);
    const org = await createReadyOrg(db, "audit@test.in", "Audit Org");
    await org.t.insertInto("audit_log", { user_id: org.userId, action: "x", target: "", created_at: new Date().toISOString() });
    await expect(org.t.updateTable("audit_log").set({ action: "y" }).execute()).rejects.toThrow(/insert-only/);
    await expect(org.t.deleteFrom("audit_log").execute()).rejects.toThrow(/one year/);
  });
});

describe("SEC-KEY envelope encryption and key rotation", () => {
  afterEach(() => {
    setMasterKeyForTests(null);
    delete process.env.WPK_MASTER_KEY;
  });

  it("SEC-KEY-01 a fresh database gets a random platform root wrapped by the master key; a wrong master key is refused", async () => {
    setMasterKeyForTests(MASTER);
    const db = await createTestDb();
    await loadKeyring(db, { force: true });
    const row = await db.selectFrom("org_keys").selectAll().executeTakeFirstOrThrow();
    expect(row).toMatchObject({ org_id: 0, version: 1 });
    expect(row.wrapped_key).toMatch(/^w1\./);
    const ct = encryptForOrg(5, "asha@example.com");
    // Not decryptable with keys derived straight from the master key (the old scheme).
    setMasterKeyForTests(MASTER);
    expect(decryptForOrg(5, ct)).toBeNull();
    await loadKeyring(db, { force: true });
    expect(decryptForOrg(5, ct)).toBe("asha@example.com");
    setMasterKeyForTests(Buffer.alloc(32, 99));
    await expect(loadKeyring(db, { force: true })).rejects.toBeInstanceOf(MasterKeyError);
    await db.destroy();
  });

  it("SEC-KEY-02 existing data keeps working: databases with data before P7 use the old master key as the root", async () => {
    setMasterKeyForTests(MASTER);
    const db = await createTestDb();
    const org = await createReadyOrg(db, "legacy-key@test.in", "Legacy Org");
    const before = encryptForOrg(org.orgId, "+91 98765 43210");
    const hmacBefore = identifierHmac(org.orgId, "email", "a@b.in");
    const file = encryptBytesForOrg(org.orgId, Buffer.from("%PDF-1.4"));
    await loadKeyring(db, { force: true });
    expect(decryptForOrg(org.orgId, before)).toBe("+91 98765 43210");
    expect(identifierHmac(org.orgId, "email", "a@b.in")).toBe(hmacBefore);
    expect(decryptBytesForOrg(org.orgId, file)?.toString()).toBe("%PDF-1.4");
    await db.destroy();
  });

  it("SEC-KEY-03 rotate an organisation's data key and re-wrap everything under a new master key (round trip)", async () => {
    setMasterKeyForTests(MASTER);
    const db = await createTestDb();
    const org = await createReadyOrg(db, "rotate@test.in", "Rotate Org");
    await loadKeyring(db, { force: true });
    const v1 = encryptForOrg(org.orgId, "v1 secret");
    const lookup = identifierHmac(org.orgId, "phone", "919876543210");
    expect(await rotateOrgKey(db, org.orgId)).toBe(2);
    const v2 = encryptForOrg(org.orgId, "v2 secret");
    expect(v2.startsWith("k2.")).toBe(true);
    const f2 = encryptBytesForOrg(org.orgId, Buffer.from("file v2"));
    expect(f2[0]).toBe(2);
    expect(decryptForOrg(org.orgId, v1)).toBe("v1 secret");
    expect(decryptForOrg(org.orgId, v2)).toBe("v2 secret");
    expect(identifierHmac(org.orgId, "phone", "919876543210")).toBe(lookup);
    // Another organisation still uses version 1 and can't read org's v2 data.
    expect(encryptForOrg(org.orgId + 1, "x").startsWith("v1.")).toBe(true);
    expect(decryptForOrg(org.orgId + 1, v2)).toBeNull();

    const NEW = Buffer.alloc(32, 77);
    expect(await rewrapKeys(db, MASTER, NEW)).toBe(2);
    setMasterKeyForTests(MASTER);
    await expect(loadKeyring(db, { force: true })).rejects.toBeInstanceOf(MasterKeyError);
    setMasterKeyForTests(NEW);
    await loadKeyring(db, { force: true });
    expect(decryptForOrg(org.orgId, v1)).toBe("v1 secret");
    expect(decryptForOrg(org.orgId, v2)).toBe("v2 secret");
    expect(decryptBytesForOrg(org.orgId, f2)?.toString()).toBe("file v2");
    expect(identifierHmac(org.orgId, "phone", "919876543210")).toBe(lookup);
    await db.destroy();
  });

  it("SEC-KEY-04 production refuses to run without a configured master key", () => {
    setMasterKeyForTests(null);
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      expect(() => masterKey()).toThrow(/required in production/);
      env.WPK_MASTER_KEY = "not-a-key";
      setMasterKeyForTests(null);
      expect(() => masterKey()).toThrow(/32 bytes/);
      env.WPK_MASTER_KEY = "ab".repeat(32);
      setMasterKeyForTests(null);
      expect(masterKey().toString("hex")).toBe("ab".repeat(32));
    } finally {
      env.NODE_ENV = prev;
    }
  });
});
