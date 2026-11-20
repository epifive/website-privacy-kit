import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateToLatestWith } from "@/lib/db/migrate";
import type { Database } from "@/lib/db/schema";
import { createBreach } from "@/lib/privacy/breaches";
import { publishNotice } from "@/lib/privacy/notices";
import { createSite } from "@/lib/privacy/registers";
import { ensureRuleTasks } from "@/lib/privacy/retention";
import { setMasterKeyForTests } from "@/lib/secrets";
import { createReadyOrg } from "../helpers/fixtures";
import { sleep } from "./cdp.mjs";
import { e2eDatabase } from "./harness";

/**
 * P5 over HTTP against the production build: breach register pages and the
 * timers banner, retention tasks, children page (age gate),
 * exports (CSV, JSON proof), the breach print view, and the separate cron and
 * maintenance secrets. No browser.
 *
 *   npm run build && npm run test:e2e
 */

const ROOT = path.resolve(__dirname, "../..");
const TMP = path.join(process.env.TEMP || ROOT, `wpk-e2e-p5-${process.pid}`);
const PORT = 5200 + Math.floor(Math.random() * 300);
const APP = `http://127.0.0.1:${PORT}`;
const MASTER = "3".repeat(64);
const CRON = "cron-secret-for-p5-e2e";
const MAINT = "maintenance-secret-for-p5-e2e";
const SESSION = crypto.randomBytes(24).toString("hex");

let server: ChildProcess | null = null;
const serverLog: string[] = [];
let slug = "";
let breachId = 0;
let otherBreachId = 0;
let siteKey = "";

const E2E_DB = e2eDatabase(TMP);
const openDb = (): Kysely<Database> => E2E_DB.open();
const dash = (url: string) => fetch(`${APP}${url}`, { headers: { Cookie: `wpk_session=${SESSION}` }, redirect: "manual" });

beforeAll(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  await E2E_DB.init();
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("Run `npm run build` before the e2e tests.");
  fs.mkdirSync(TMP, { recursive: true });
  setMasterKeyForTests(Buffer.from(MASTER, "hex"));
  const db = openDb();
  await migrateToLatestWith(db);
  const org = await createReadyOrg(db, "owner@clinic.e2e", "Sharma Physio", "clinic");
  if (!(await publishNotice(org.t, { baseUrl: APP, userId: org.userId })).ok) throw new Error("notice not published");
  slug = (await org.t.org())!.slug;
  const site = await createSite(org.t, { name: "Clinic", domain: "localhost", allowedOrigins: [], childrenMode: true });
  siteKey = (await org.t.selectFrom("sites").select("public_key").where("id", "=", site).executeTakeFirstOrThrow()).public_key;
  // Noticed 5 h 30 min ago: the CERT-In 6-hour report is due within 30 minutes.
  const b = await createBreach(org.t, { title: "Reception PC infected", noticedAt: new Date(Date.now() - 5.5 * 3_600_000).toISOString(), awareAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), affectedCount: 12, certinApplicable: true, details: { nature: "Ransomware on the reception PC" } }, org.userId);
  if (!b.ok) throw new Error(b.error);
  breachId = b.id;
  await ensureRuleTasks(org.t);
  const other = await createReadyOrg(db, "owner@store.e2e", "Other Store", "d2c");
  const ob = await createBreach(other.t, { title: "Other org incident", noticedAt: new Date().toISOString(), awareAt: new Date().toISOString(), affectedCount: 1, certinApplicable: false, details: {} }, other.userId);
  if (ob.ok) otherBreachId = ob.id;
  const ts = new Date().toISOString();
  await db.insertInto("sessions").values({ id: crypto.createHash("sha256").update(SESSION).digest("hex"), user_id: org.userId, expires_at: new Date(Date.now() + 3600_000).toISOString(), ip: null, user_agent: null, created_at: ts }).execute();
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

describe("P5 dashboard pages over HTTP", () => {
  it("breach register, incident page with four clocks and Rule 7 texts, and the timers banner on every page", async () => {
    const list = await dash("/dashboard/breaches");
    expect(list.status).toBe(200);
    const html = await list.text();
    expect(html).toContain("Reception PC infected");
    expect(html).toContain("Breach register");
    const page = await dash(`/dashboard/breaches/${breachId}`);
    expect(page.status).toBe(200);
    const detail = await page.text();
    for (const s of ["CERT-In report (6 hours)", "Board intimation (without delay)", "Detailed Board report (72 hours)", "Tell affected people (without delay)", "(vi) Report on intimations", "incident@cert-in.org.in"]) expect(detail).toContain(s);
    // The shell banner points to the incident whose deadline is close.
    const overview = await (await dash("/dashboard")).text();
    expect(overview).toContain(`/dashboard/breaches/${breachId}`);
    // Another organisation's incident is not found (the dashboard streams, so the not-found view comes with status 200).
    const foreign = await (await dash(`/dashboard/breaches/${otherBreachId}`)).text();
    expect(foreign).not.toContain("Other org incident");
    expect(foreign).not.toContain("Ransomware");
  });

  it("retention page with erasure tasks and settings; children page; exports page", async () => {
    const ret = await (await dash("/dashboard/retention")).text();
    expect(ret).toContain("Erasure tasks");
    expect(ret).toContain("Send a notice before erasure (optional)");
    const db = openDb();
    const task = await db.selectFrom("erasure_tasks").select("id").executeTakeFirstOrThrow();
    await db.destroy();
    const tp = await dash(`/dashboard/retention/tasks/${task.id}`);
    expect(tp.status).toBe(200);
    expect(await tp.text()).toContain("Sign off");
    const kids = await (await dash("/dashboard/children")).text();
    expect(kids).toContain("Children mode is on");
    const ex = await (await dash("/dashboard/exports")).text();
    expect(ex).toContain("Download proof.json");
    expect(ex).toContain("Evidence pack and print views (Pro)");
  });

  it("CSV registers and the JSON proof download for members only; the breach print view renders", async () => {
    const breaches = await dash("/dashboard/exports/breaches");
    expect(breaches.status).toBe(200);
    const text = await breaches.text();
    expect(text).toContain("Reception PC infected");
    expect(text).not.toContain("Other org incident");
    const csv = await dash("/dashboard/exports/vendors");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const proof = await dash("/dashboard/exports/proof.json");
    expect(proof.headers.get("content-type")).toContain("application/json");
    expect((await proof.json()).notices.map((n: { lang: string }) => n.lang).sort()).toEqual(["en", "hi"]);
    expect((await fetch(`${APP}/dashboard/exports/proof.json`, { redirect: "manual" })).status).toBe(401);
    expect((await dash("/dashboard/exports/evidence-pack")).status).toBe(404);
    const print = await dash(`/print/breach/${breachId}`);
    expect(print.status).toBe(200);
    const ph = await print.text();
    expect(ph).toContain("@media print");
    expect(ph).toContain("Annex 1");
    expect((await dash(`/print/breach/${otherBreachId}`)).status).toBe(404);
  });
});

describe("P5 public pages and jobs", () => {
  it("there are no parental-consent pages in the Free edition", async () => {
    expect((await fetch(`${APP}/p/${slug}/parent?s=${siteKey}&r=e2e-child-browser-0001`)).status).toBe(404);
  });

  it("cron and maintenance endpoints use separate secrets; the purge is a dry run unless ?apply=1", async () => {
    const post = (url: string, secret: string) => fetch(`${APP}${url}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    expect((await post("/api/v1/cron/breach-timers", "wrong-secret-0000000")).status).toBe(404);
    const timers = await post("/api/v1/cron/breach-timers", CRON);
    expect(timers.status).toBe(200);
    expect((await timers.json()).sent).toBeGreaterThan(0);
    expect((await post("/api/v1/cron/retention-reminders", CRON)).status).toBe(200);
    // The cron secret cannot run the purge.
    expect((await post("/api/v1/maintenance/consent-purge", CRON)).status).toBe(404);
    const dry = await post("/api/v1/maintenance/consent-purge", MAINT);
    expect(dry.status).toBe(200);
    expect(await dry.json()).toMatchObject({ dryRun: true, purged: 0 });
    expect(serverLog.join("")).toContain("[mail:console]");
  });
});
