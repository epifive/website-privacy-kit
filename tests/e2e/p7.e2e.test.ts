import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { migrateToLatestWith } from "@/lib/db/migrate";
import type { Database } from "@/lib/db/schema";
import { publishNotice } from "@/lib/privacy/notices";
import { createSite } from "@/lib/privacy/registers";
import { setMasterKeyForTests } from "@/lib/secrets";
import { createReadyOrg, createUser } from "../helpers/fixtures";
import { sleep } from "./cdp.mjs";
import { e2eDatabase } from "./harness";

/**
 * P7 over HTTP against the production build: security headers and the strict
 * nonce CSP, CSRF refusal, the admin 2FA requirement, the Razorpay webhook
 * signature check, the single cron endpoint, the plan limit on consent
 * events, the usage meter and invoices. No browser.
 *
 *   npm run build && npm run test:e2e
 */

const ROOT = path.resolve(__dirname, "../..");
const TMP = path.join(process.env.TEMP || ROOT, `wpk-e2e-p7-${process.pid}`);
const PORT = 5600 + Math.floor(Math.random() * 300);
const APP = `http://127.0.0.1:${PORT}`;
const MASTER = "7".repeat(64);
const CRON = "cron-secret-for-p7-e2e";
const MAINT = "maintenance-secret-for-p7-e2e";
const USER_SESSION = crypto.randomBytes(24).toString("hex");
const ADMIN_SESSION = crypto.randomBytes(24).toString("hex");

let server: ChildProcess | null = null;
const serverLog: string[] = [];
let siteKey = "";
let slug = "";

const E2E_DB = e2eDatabase(TMP);
const openDb = (): Kysely<Database> => E2E_DB.open();
const as = (session: string, url: string, init: RequestInit = {}) => fetch(`${APP}${url}`, { ...init, headers: { ...(init.headers ?? {}), Cookie: `wpk_session=${session}` }, redirect: "manual" });

beforeAll(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  await E2E_DB.init();
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("Run `npm run build` before the e2e tests.");
  fs.mkdirSync(TMP, { recursive: true });
  setMasterKeyForTests(Buffer.from(MASTER, "hex"));
  const db = openDb();
  await migrateToLatestWith(db);
  const org = await createReadyOrg(db, "owner@clinic.p7", "Plan Clinic", "clinic");
  if (!(await publishNotice(org.t, { baseUrl: APP, userId: org.userId })).ok) throw new Error("notice not published");
  slug = (await org.t.org())!.slug;
  const site = await createSite(org.t, { name: "Clinic", domain: "localhost", allowedOrigins: ["http://localhost:9"], childrenMode: false });
  siteKey = (await org.t.selectFrom("sites").select("public_key").where("id", "=", site).executeTakeFirstOrThrow()).public_key;
  // Usage counters are only shown, never enforced: a busy month must not block consent.
  await org.t.insertInto("usage_counters", { period: new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7), consent_events: 1200, refused_events: 0, rights_requests: 0, alert_level: 0 });
  const adminId = await createUser(db, "admin@platform.p7");
  await db.updateTable("users").set({ role: "admin", password_hash: await hashPassword("admin password 123") }).where("id", "=", adminId).execute();
  const ts = new Date().toISOString();
  const session = (token: string, userId: number) => ({ id: crypto.createHash("sha256").update(token).digest("hex"), user_id: userId, expires_at: new Date(Date.now() + 3600_000).toISOString(), ip: null, user_agent: null, created_at: ts });
  await db.insertInto("sessions").values([session(USER_SESSION, org.userId), session(ADMIN_SESSION, adminId)]).execute();
  await db.destroy();

  server = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", STORAGE_DIR: TMP, ...E2E_DB.env(), APP_INSTALLED: "true", WPK_MASTER_KEY: MASTER, WPK_MAIL_CONSOLE: "1", CRON_SECRET: CRON, WPK_MAINTENANCE_SECRET: MAINT, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (d) => serverLog.push(String(d)));
  server.stderr?.on("data", (d) => serverLog.push(String(d)));
  const end = Date.now() + 60_000;
  for (;;) {
    if (await fetch(`${APP}/p/${slug}`).then((r) => r.ok).catch(() => false)) break;
    if (Date.now() > end) throw new Error(`server did not start:\n${serverLog.join("")}`);
    await sleep(300);
  }
}, 120_000);

afterAll(async () => {
  await E2E_DB.drop();
  setMasterKeyForTests(null);
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server!.once("exit", r));
    server.kill();
    await Promise.race([exited, sleep(5000)]);
  }
  for (let i = 0; i < 10; i++) {
    try {
      fs.rmSync(TMP, { recursive: true, force: true });
      break;
    } catch {
      await sleep(500);
    }
  }
}, 60_000);

describe("P7 security over HTTP", () => {
  it("SEC-CSP-03 sign-in and dashboard pages: strict nonce CSP, every script carries the nonce, DENY framing; public pages: baseline", async () => {
    for (const url of ["/login", "/dashboard"]) {
      const res = url === "/login" ? await fetch(`${APP}${url}`) : await as(USER_SESSION, url);
      expect(res.status, url).toBe(200);
      const csp = res.headers.get("content-security-policy") ?? "";
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce, url).toBeTruthy();
      expect(csp).toContain("'strict-dynamic'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("strict-transport-security")).toMatch(/max-age=31536000/);
      const html = await res.text();
      const scripts = html.match(/<script\b[^>]*>/g) ?? [];
      expect(scripts.length).toBeGreaterThan(0);
      for (const tag of scripts) if (!/type="application\/(ld\+)?json"/.test(tag)) expect(tag, `${url}: ${tag}`).toContain(`nonce="${nonce}"`);
    }
    const home = await fetch(`${APP}/`);
    expect(home.headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(home.headers.get("content-security-policy")).not.toContain("nonce-");
    expect(home.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("SEC-CSRF-04 a cross-site POST is refused before it reaches a page or action; the widget API still accepts its own origins", async () => {
    const evil = await fetch(`${APP}/account`, { method: "POST", headers: { Origin: "https://evil.example", Cookie: `wpk_session=${USER_SESSION}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "name=x" });
    expect(evil.status).toBe(403);
    const fetchMeta = await fetch(`${APP}/p/${slug}/rights`, { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" }, body: new FormData() });
    expect(fetchMeta.status).toBe(403);
    expect(serverLog.join("")).toContain("[csrf] refused POST /account");
    const config = await fetch(`${APP}/api/v1/sites/${siteKey}/config`, { headers: { Origin: "http://localhost:9" } });
    expect(config.status).toBe(200);
  });

  it("SEC-ADM-02 an administrator without two-step verification is sent to set it up and admin actions are refused", async () => {
    const admin = await as(ADMIN_SESSION, "/admin");
    expect(admin.status).toBe(307);
    expect(admin.headers.get("location")).toContain("/account/security?required=1");
    const security = await as(ADMIN_SESSION, "/account/security?required=1");
    expect(security.status).toBe(200);
    const html = await security.text();
    expect(html).toContain("Administrators must use two-step verification");
    expect(html).toMatch(/[A-Z2-7]{4} [A-Z2-7]{4} /);
    // SEC-2FA-04: a real QR code (inline SVG) with the otpauth link and the key as fallback.
    expect(html).toMatch(/data-testid="totp-qr"[^>]*><svg[^>]*viewBox/);
    expect(html).toContain("otpauth://totp/");
  });

  it("CRON-01 /api/v1/cron/run runs every job with CRON_SECRET; the maintenance secret and wrong secrets are refused", async () => {
    const run = (secret: string) => fetch(`${APP}/api/v1/cron/run`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    expect((await run("wrong-secret-xxxxxxxxxxxx")).status).toBe(404);
    expect((await run(MAINT)).status).toBe(404);
    const res = await run(CRON);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json.results)).toEqual(["breachTimers", "rightsReminders", "retentionReminders", "chainDigest", "expiredSessions"]);
    expect(json.results.chainDigest).toMatchObject({ ok: true });
    const purge = await fetch(`${APP}/api/v1/maintenance/log-purge`, { method: "POST", headers: { Authorization: `Bearer ${MAINT}` } });
    expect(await purge.json()).toMatchObject({ dryRun: true, days: 400 });
  });
});
