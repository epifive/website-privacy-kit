import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateToLatestWith } from "@/lib/db/migrate";
import type { Database } from "@/lib/db/schema";
import { publishNotice } from "@/lib/privacy/notices";
import { setMasterKeyForTests } from "@/lib/secrets";
import { createReadyOrg } from "../helpers/fixtures";
import { sleep } from "./cdp.mjs";
import { e2eDatabase } from "./harness";

/**
 * Hosted privacy page and rights requests end to end over HTTP (plan §9 P4
 * exit check; §10.5 "request submitted, verified and closed"): the production
 * build against a throw-away SQLite database, emails printed to the server log
 * (WPK_MAIL_CONSOLE=1) so the test can read the one-time code. No browser.
 *
 *   npm run build && npm run test:e2e
 */

const ROOT = path.resolve(__dirname, "../..");
const TMP = path.join(process.env.TEMP || ROOT, `wpk-e2e-rights-${process.pid}`);
const PORT = 4800 + Math.floor(Math.random() * 300);
const APP = `http://127.0.0.1:${PORT}`;
const MASTER = "5".repeat(64);
const CRON = "cron-secret-for-e2e-tests";
const SESSION = crypto.randomBytes(24).toString("hex");
const PDF = Buffer.from("%PDF-1.4\n% e2e attachment\n%%EOF\n");

let server: ChildProcess | null = null;
const serverLog: string[] = [];
let slug = "";
let otherSlug = "";

const E2E_DB = e2eDatabase(TMP);
const openDb = (): Kysely<Database> => E2E_DB.open();

/** The latest one-time code printed for an address by the console mail transport. */
async function codeFor(email: string): Promise<string> {
  const end = Date.now() + 10_000;
  for (;;) {
    const log = serverLog.join("");
    const parts = log.split("[mail:console] ").filter((p) => p.startsWith(`to=${email} `));
    const code = parts.pop()?.match(/is: (\d{6})/)?.[1];
    if (code) return code;
    if (Date.now() > end) throw new Error(`no code for ${email}\n${log.slice(-2000)}`);
    await sleep(100);
  }
}

const dash = (url: string) => fetch(`${APP}${url}`, { headers: { Cookie: `wpk_session=${SESSION}` }, redirect: "manual" });

function requestForm(fields: Record<string, string>, files: Array<{ name: string; bytes: Buffer; type: string }> = []): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  for (const f of files) fd.append("files", new Blob([new Uint8Array(f.bytes)], { type: f.type }), f.name);
  return fd;
}

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
  const other = await createReadyOrg(db, "owner@store.e2e", "Other Store", "d2c");
  otherSlug = (await other.t.org())!.slug;
  const ts = new Date().toISOString();
  await db
    .insertInto("sessions")
    .values({ id: crypto.createHash("sha256").update(SESSION).digest("hex"), user_id: org.userId, expires_at: new Date(Date.now() + 3600_000).toISOString(), ip: null, user_agent: null, created_at: ts })
    .execute();
  await db.destroy();

  server = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      STORAGE_DIR: TMP,
      ...E2E_DB.env(),
      APP_INSTALLED: "true",
      WPK_MASTER_KEY: MASTER,
      WPK_MAIL_CONSOLE: "1",
      WPK_TURNSTILE: "off",
      CRON_SECRET: CRON,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (d) => serverLog.push(String(d)));
  server.stderr?.on("data", (d) => serverLog.push(String(d)));
  const end = Date.now() + 60_000;
  for (;;) {
    const ok = await fetch(`${APP}/p/${slug}`).then((r) => r.ok).catch(() => false);
    if (ok) break;
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
});

describe("hosted privacy page and rights requests (P4 e2e)", () => {
  let token = "";
  let ref = "";

  it("the hub is standalone HTML with notice, rights, withdraw, contact and the Board link marked unverified", async () => {
    const res = await fetch(`${APP}/p/${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toMatch(/default-src 'none'/);
    const html = await res.text();
    expect(html).not.toMatch(/<script/);
    for (const part of [`/p/${slug}/notice?lang=en`, `/p/${slug}/rights?lang=en`, `/p/${slug}/withdraw?lang=en`, "privacy@clinic.example.in", 'data-board-unverified="1"', "Current version 1"]) expect(html).toContain(part);
    const hi = await (await fetch(`${APP}/p/${slug}?lang=hi`)).text();
    expect(hi).toContain('lang="hi"');
    expect(hi).toContain("आपके अधिकार");
    expect((await fetch(`${APP}/p/no-such-org`)).status).toBe(404);
  });

  it("R2-01 the form lists the configured identifiers; a request with an attachment is stored and an email code sent", async () => {
    const form = await (await fetch(`${APP}/p/${slug}/rights?lang=en&type=access`)).text();
    expect(form).toContain('name="id_mobile"');
    expect(form).toContain('value="access" checked');
    const res = await fetch(`${APP}/p/${slug}/rights`, {
      method: "POST",
      body: requestForm({ lang: "en", type: "correction", name: "Asha Verma", email: "asha@example.in", details: "My date of birth is wrong.", id_mobile: "9876543210" }, [{ name: "dob.pdf", bytes: PDF, type: "application/pdf" }]),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toContain(`/p/${slug}/rights/verify?r=`);
    token = new URL(location, APP).searchParams.get("r")!;
    const verify = await (await fetch(`${APP}/p/${slug}/rights/verify?r=${encodeURIComponent(token)}&lang=en`)).text();
    expect(verify).toContain("a***@example.in");
  });

  it("invalid input is shown again with an error; the token does not work for another organisation", async () => {
    const res = await fetch(`${APP}/p/${slug}/rights`, { method: "POST", body: requestForm({ lang: "en", type: "grievance", name: "Asha", email: "bad-email" }) });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Enter a valid email address.");
    expect(html).toContain('value="Asha"');
    expect((await fetch(`${APP}/p/${otherSlug}/rights/verify?r=${encodeURIComponent(token)}`)).status).toBe(404);
  });

  it("OTP: a wrong code is counted; the right code confirms and acknowledges with reference and due date", async () => {
    const code = await codeFor("asha@example.in");
    const wrong = code === "000000" ? "111111" : "000000";
    const post = (c: string) => fetch(`${APP}/p/${slug}/rights/verify`, { method: "POST", body: new URLSearchParams({ r: token, lang: "en", action: "verify", code: c }) });
    const bad = await post(wrong);
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("Attempts left: 4");
    const ok = await post(code);
    expect(ok.status).toBe(200);
    const html = await ok.text();
    ref = html.match(/R-[A-Z2-9]{4}-[A-Z2-9]{4}/)![0];
    expect(html).toMatch(/We will respond by \d{4}-\d{2}-\d{2} \(within 30 days\)/);
    const log = serverLog.join("");
    expect(log).toContain(`subject="We have received your request — ref ${ref}"`);
  });

  it("the inbox lists the request; replies carry the contact block; attachments download only for members", async () => {
    const list = await dash("/dashboard/requests");
    expect(list.status).toBe(200);
    expect(await list.text()).toContain(ref);
    const db = openDb();
    const row = await db.selectFrom("rights_requests").selectAll().where("ref", "=", ref).executeTakeFirstOrThrow();
    const file = await db.selectFrom("request_attachments").selectAll().where("request_id", "=", row.id).executeTakeFirstOrThrow();
    const mails = await db.selectFrom("mail_log").select(["kind", "status", "provider"]).where("request_id", "=", row.id).execute();
    await db.destroy();
    expect(row.status).toBe("new");
    expect(mails).toEqual(expect.arrayContaining([{ kind: "rights.otp", status: "sent", provider: "console" }, { kind: "rights.ack", status: "sent", provider: "console" }]));
    const page = await (await dash(`/dashboard/requests/${row.id}?tpl=correction`)).text();
    expect(page).toContain("Reply to the requester");
    expect(page).toContain("Questions about your personal data");
    const download = await dash(`/dashboard/requests/${row.id}/files/${file.id}`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(Buffer.from(await download.arrayBuffer()).equals(PDF)).toBe(true);
    expect((await fetch(`${APP}/dashboard/requests/${row.id}/files/${file.id}`, { redirect: "manual" })).status).not.toBe(200);
  });

  it("rate limit: at most 5 requests per IP address per hour", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${APP}/p/${slug}/rights`, { method: "POST", body: requestForm({ lang: "en", type: "access", name: "Rate Test", email: `rate${i}@example.in` }), redirect: "manual" });
      statuses.push(res.status);
    }
    // One request was already made from this address above.
    expect(statuses.filter((s) => s === 303)).toHaveLength(4);
    expect(statuses.slice(-2)).toEqual([429, 429]);
  });

  it("the reminder endpoint needs the cron secret", async () => {
    expect((await fetch(`${APP}/api/v1/cron/rights-reminders`, { method: "POST" })).status).toBe(404);
    const res = await fetch(`${APP}/api/v1/cron/rights-reminders`, { method: "POST", headers: { Authorization: `Bearer ${CRON}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgs: 0, sent: 0 });
  });
});
