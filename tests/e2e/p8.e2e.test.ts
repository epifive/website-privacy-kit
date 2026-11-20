import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyChain, type ChainRow } from "@/core/consent/chain";
import { hashPassword } from "@/lib/auth/password";
import { seedDemoData } from "@/lib/db/demo-seed";
import { missingTriggers } from "@/lib/db/integrity";
import { migrateToLatestWith } from "@/lib/db/migrate";
import type { Database } from "@/lib/db/schema";
import { publishNotice } from "@/lib/privacy/notices";
import { createSite } from "@/lib/privacy/registers";
import { setMasterKeyForTests } from "@/lib/secrets";
import { createReadyOrg, createUser } from "../helpers/fixtures";
import { launch, sleep } from "./cdp.mjs";
import { e2eDatabase } from "./harness";

/**
 * P8: the rest of the plan §10 test plan over HTTP and in headless Chrome against the production
 * build (`npm run build` first; SQLite by default, MySQL with WPK_TEST_MYSQL_URL):
 *   TP-5-01  the whole owner → visitor → requester journey through the real UI (Free: sign-in, CSV/JSON exports)
 *   TP-4-01  route × role fuzz: every dashboard and admin route with another organisation's ids
 *   TP-6-03  axe accessibility scan (0 serious / critical) on the banner, preference centre and pages
 *   TP-6-04  the widget on a host page with a strict CSP (no unsafe-inline anywhere)
 *   TP-7-03  XSS attempts in purpose names (notice + banner) and in the rights request form
 */

type Cdp = {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  evaluate: <T = unknown>(expression: string) => Promise<T>;
  close: () => Promise<void>;
  errors: string[];
};

const ROOT = path.resolve(__dirname, "../..");
const TMP = path.join(process.env.TEMP || ROOT, `wpk-e2e-p8-${process.pid}`);
const APP_PORT = 5900 + Math.floor(Math.random() * 300);
const STATIC_PORT = APP_PORT + 400;
const APP = `http://127.0.0.1:${APP_PORT}`;
const SITE = `http://localhost:${STATIC_PORT}`;
const MASTER = "8".repeat(64);
const NONCE = "p8-host-page-nonce";
const XSS_NAME = `Analytics <img src=x onerror="window.__xss=1">`;
const E2E_DB = e2eDatabase(TMP);
const openDb = (): Kysely<Database> => E2E_DB.open();

const SESSIONS = { owner: crypto.randomBytes(24).toString("hex"), viewer: crypto.randomBytes(24).toString("hex"), outsider: crypto.randomBytes(24).toString("hex"), business: crypto.randomBytes(24).toString("hex") };
let server: ChildProcess | null = null;
let staticServer: http.Server | null = null;
let chrome: Cdp | null = null;
const serverLog: string[] = [];
let pkA = "";
let slugA = "";
let siteIdA = 0;
/** Another organisation (the demo clinic) and its row ids per table. */
const B = { orgId: 0, ids: {} as Record<string, number>, markers: [] as string[] };

const as = (who: keyof typeof SESSIONS | null, url: string, init: RequestInit = {}) =>
  fetch(`${APP}${url}`, { ...init, headers: { ...(init.headers ?? {}), ...(who ? { Cookie: `wpk_session=${SESSIONS[who]}` } : {}) }, redirect: "manual" });

async function waitUntil<T>(expression: string, timeout = 20000): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await chrome!.evaluate(expression).catch(() => undefined);
    if (v) return v as T;
    if (Date.now() > end) {
      const where = await chrome!.evaluate<string>(`location.href + " :: " + (document.body?.innerText || "").slice(0, 600)`).catch(() => "?");
      throw new Error(`timeout waiting for: ${expression}\nat ${where}\n${chrome!.errors.join("\n")}\n${serverLog.join("").slice(-1500)}`);
    }
    await sleep(100);
  }
}

async function goto(url: string) {
  // Wait for the NEW document: the old one may still answer readyState === complete right after navigate.
  const before = await chrome!.evaluate<number>("performance.timeOrigin").catch(() => 0);
  await chrome!.send("Page.navigate", { url });
  await waitUntil(`performance.timeOrigin !== ${before} && document.readyState === 'complete'`);
}

/** Fill named fields of the form that contains `[name=first key]`, then press its submit button. */
async function fillAndSubmit(fields: Record<string, string | boolean | string[]>, formSelector?: string) {
  const json = JSON.stringify(fields);
  await chrome!.evaluate(`(() => {
    const fields = ${json};
    const first = Object.keys(fields)[0];
    const form = ${formSelector ? `document.querySelector(${JSON.stringify(formSelector)})` : `document.querySelector('[name="' + first + '"]')?.closest('form')`};
    if (!form) throw new Error('no form for ' + first + ' at ' + location.href + ' :: ' + document.body.innerText.slice(0, 400));
    for (const [name, value] of Object.entries(fields)) {
      const els = form.querySelectorAll('[name="' + name + '"]');
      if (!els.length) throw new Error('no field ' + name);
      for (const el of els) {
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = Array.isArray(value) ? value.includes(el.value) : typeof value === 'boolean' ? value : el.value === value;
        else el.value = value;
      }
    }
    form.querySelector('button[type=submit], button:not([type])').click();
    return true;
  })()`);
}

const root = (sel: string) => `document.getElementById('wpk-root')?.shadowRoot?.querySelector(${JSON.stringify(sel)})`;
const widgetClick = (sel: string) => chrome!.evaluate(`(${root(sel)}).click(), true`);

async function codeFor(email: string): Promise<string> {
  const end = Date.now() + 10_000;
  for (;;) {
    const parts = serverLog.join("").split("[mail:console] ").filter((p) => p.startsWith(`to=${email} `));
    const code = parts.pop()?.match(/is: (\d{6})/)?.[1];
    if (code) return code;
    if (Date.now() > end) throw new Error(`no code for ${email}`);
    await sleep(100);
  }
}

beforeAll(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  await E2E_DB.init();
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("Run `npm run build` before the e2e tests.");
  setMasterKeyForTests(Buffer.from(MASTER, "hex"));
  const db = openDb();
  await migrateToLatestWith(db);

  // Organisation B: the demo clinic (requests, breach, erasure tasks, vendor, site, notice) owned by an administrator.
  const adminId = await createUser(db, "admin@platform.p8");
  await db.updateTable("users").set({ role: "admin", password_hash: await hashPassword("admin password 123") }).where("id", "=", adminId).execute();
  await seedDemoData(db);
  const orgB = await db.selectFrom("orgs").select(["id", "slug"]).where("owner_user_id", "=", adminId).orderBy("id").executeTakeFirstOrThrow();
  B.orgId = orgB.id;
  const firstId = async (table: keyof Database & string) =>
    Number((await db.selectFrom(table as "sites").select("id").where("org_id", "=", B.orgId).orderBy("id").executeTakeFirst())?.id ?? 0);
  for (const table of ["sites", "purposes", "vendors", "retention_rules", "erasure_tasks", "rights_requests", "breaches"] as const) B.ids[table] = await firstId(table);
  const bSite = await db.selectFrom("sites").select(["domain", "public_key"]).where("id", "=", B.ids.sites).executeTakeFirstOrThrow();
  const bBreach = await db.selectFrom("breaches").select("title").where("id", "=", B.ids.breaches).executeTakeFirstOrThrow();
  const bRefs = (await db.selectFrom("rights_requests").select("ref").where("org_id", "=", B.orgId).execute()).map((r) => r.ref);
  // Rows that look like A's (same sector preset) get a unique marker so a leak is visible.
  for (const p of await db.selectFrom("purposes").select(["id", "name_en"]).where("org_id", "=", B.orgId).execute()) await db.updateTable("purposes").set({ name_en: `${p.name_en} ZZB-MARK` }).where("id", "=", p.id).execute();
  for (const v of await db.selectFrom("vendors").select(["id", "name"]).where("org_id", "=", B.orgId).execute()) await db.updateTable("vendors").set({ name: `${v.name} ZZB-MARK` }).where("id", "=", v.id).execute();
  for (const r of await db.selectFrom("retention_rules").select(["id", "category"]).where("org_id", "=", B.orgId).execute()) await db.updateTable("retention_rules").set({ category: `${r.category} ZZB-MARK` }).where("id", "=", r.id).execute();
  for (const e of await db.selectFrom("erasure_tasks").select(["id", "title"]).where("org_id", "=", B.orgId).execute()) await db.updateTable("erasure_tasks").set({ title: `${e.title} ZZB-MARK` }).where("id", "=", e.id).execute();
  await db.updateTable("sites").set({ name: "Clinic website ZZB-MARK" }).where("org_id", "=", B.orgId).execute();
  B.markers = ["ZZB-MARK", "admin@platform.p8", bSite.domain, bSite.public_key, bBreach.title, ...bRefs];
  // Give B a request attachment id to probe (no file needed: the route must refuse before reading it).
  B.ids.request_attachments = 999_999;

  // Organisation A: owner + viewer; an outsider with no organisation.
  const org = await createReadyOrg(db, "owner@alpha.p8", "Alpha Clinic", "clinic");
  await org.t.updateOrg({ children_mode: 0 });
  // TP-7-03: a purpose name with markup must stay text in the notice, the hosted page and the banner.
  const analytics = await org.t.selectFrom("purposes").select(["id"]).where("purpose_key", "=", "analytics").executeTakeFirstOrThrow();
  await org.t.updateTable("purposes").set({ name_en: XSS_NAME }).where("id", "=", analytics.id).execute();
  if (!(await publishNotice(org.t, { baseUrl: APP, userId: org.userId })).ok) throw new Error("notice not published");
  slugA = (await org.t.org())!.slug;
  siteIdA = await createSite(org.t, { name: "Alpha site", domain: "localhost", allowedOrigins: [], childrenMode: false });
  pkA = (await org.t.selectFrom("sites").select("public_key").where("id", "=", siteIdA).executeTakeFirstOrThrow()).public_key;
  const viewerId = await createUser(db, "viewer@alpha.p8");
  await db.insertInto("memberships").values({ org_id: org.orgId, user_id: viewerId, role: "viewer", created_at: new Date().toISOString() }).execute();
  const outsiderId = await createUser(db, "outsider@nowhere.p8");
  const ts = new Date().toISOString();
  const session = (token: string, userId: number) => ({ id: crypto.createHash("sha256").update(token).digest("hex"), user_id: userId, expires_at: new Date(Date.now() + 3600_000).toISOString(), ip: null, user_agent: null, created_at: ts });
  // TP-5-01: the journey owner (the installer creates the one user of a Free installation).
  const journeyId = await createUser(db, "owner@journey.example.in");
  await db.updateTable("users").set({ name: "Journey Owner", password_hash: await hashPassword("journey password 123") }).where("id", "=", journeyId).execute();
  await db.insertInto("sessions").values([session(SESSIONS.owner, org.userId), session(SESSIONS.viewer, viewerId), session(SESSIONS.outsider, outsiderId)]).execute();
  await db.destroy();

  server = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", STORAGE_DIR: TMP, ...E2E_DB.env(), APP_INSTALLED: "true", WPK_MASTER_KEY: MASTER, WPK_MAIL_CONSOLE: "1", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (d) => serverLog.push(String(d)));
  server.stderr?.on("data", (d) => serverLog.push(String(d)));
  const end = Date.now() + 90_000;
  for (;;) {
    if (await fetch(`${APP}/w.js`).then((r) => r.ok).catch(() => false)) break;
    if (Date.now() > end) throw new Error(`server did not start:\n${serverLog.join("")}`);
    await sleep(300);
  }

  // The customer's website on another origin; strict-csp.html is served with a strict CSP header.
  staticServer = http.createServer((req, res) => {
    const url = new URL(req.url || "/", SITE);
    const name = path.basename(url.pathname.replace(/^\//, "") || "plain.html");
    const file = path.join(__dirname, "pages", name);
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
    if (name === "strict-csp.html") headers["Content-Security-Policy"] = `default-src 'none'; script-src ${APP} 'nonce-${NONCE}'; connect-src ${APP}; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'`;
    res.writeHead(200, headers);
    res.end(fs.readFileSync(file, "utf8").replaceAll("{{APP}}", APP).replaceAll("{{PK}}", url.searchParams.get("pk") ?? pkA).replaceAll("{{NONCE}}", NONCE));
  });
  await new Promise<void>((r) => staticServer!.listen(STATIC_PORT, "127.0.0.1", r));

  chrome = (await launch()) as unknown as Cdp;
  await chrome.send("Page.enable");
  await chrome.send("Runtime.enable");
  await chrome.send("Network.enable");
}, 180_000);

afterAll(async () => {
  await E2E_DB.drop();
  setMasterKeyForTests(null);
  await chrome?.close().catch(() => undefined);
  await new Promise<void>((r) => (staticServer ? staticServer.close(() => r()) : r()));
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

// ── TP-4-01: route × role ──

/** Every dashboard and admin route from the file system, with another organisation's ids filled in. */
function routes(): string[] {
  const out: string[] = [];
  const walk = (dir: string, url: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const seg = entry.name.startsWith("(") ? "" : `/${entry.name}`;
        walk(path.join(dir, entry.name), url + seg);
      } else if (entry.name === "page.tsx" || entry.name === "route.ts") out.push(url || "/");
    }
  };
  walk(path.join(ROOT, "src/app/(dashboard)"), "");
  walk(path.join(ROOT, "src/app/admin"), "/admin");
  walk(path.join(ROOT, "src/app/print"), "/print");
  const table: Record<string, string> = {
    "breaches/[id]": "breaches",
    "requests/[id]": "rights_requests",
    "purposes/[id]": "purposes",
    "retention/[id]": "retention_rules",
    "tasks/[id]": "erasure_tasks",
    "sites/[id]": "sites",
    "vendors/[id]": "vendors",
    "switch/[id]": "orgs",
    "[fileId]": "request_attachments",
    "breach/[id]": "breaches",
  };
  return out.map((r) =>
    r
      .replace(/(\w+)\/\[id\]/g, (_m, parent: string) => `${parent}/${parent === "switch" ? B.orgId : B.ids[table[`${parent}/[id]`]] ?? 1}`)
      .replace("[fileId]", String(B.ids.request_attachments))
      .replace("[version]", "1")
      .replace("/exports/[kind]", "/exports/breaches")
      .replace("[code]", "en")
      .replace("[section]", "general"),
  );
}

describe("TP-4-01 route × role fuzz (plan §10.4)", () => {
  it("no route answers with another organisation's data, for anonymous, outsider, viewer and owner", async () => {
    const list = routes();
    expect(list.length).toBeGreaterThan(35);
    const leaks: string[] = [];
    for (const url of list) {
      if (url.includes("/switch/")) continue; // checked below (it changes state)
      for (const who of [null, "outsider", "viewer", "owner"] as const) {
        const res = await as(who, url);
        const body = res.status === 200 ? Buffer.from(await res.arrayBuffer()).toString("latin1") : "";
        // The dashboard streams (loading.tsx), so notFound()/redirect() after the shell answer 200 with
        // Next.js's in-page not-found or redirect marker instead of a 404/307 status.
        const refused = res.status !== 200 || /NEXT_HTTP_ERROR_FALLBACK;404|__next-page-redirect|NEXT_REDIRECT/.test(body);
        if (!refused && (who === null || (who === "outsider" && url !== "/dashboard/orgs/new"))) leaks.push(`${who} rendered ${url}`);
        if (!refused && url.startsWith("/admin")) leaks.push(`${who} rendered ${url}`);
        for (const marker of B.markers) if (body.includes(marker)) leaks.push(`${who} sees "${marker}" at ${url}`);
        // A URL with B's row id must never render for A's members.
        if (!refused && /\/(breaches|breach|requests|purposes|retention|tasks|sites|vendors|files)\/\d+/.test(url)) leaks.push(`${who} rendered ${url}`);
      }
    }
    expect(leaks).toEqual([]);
  }, 300_000);

  it("switching to an organisation you don't belong to does nothing", async () => {
    await as("owner", `/dashboard/switch/${B.orgId}`);
    const dash = await (await as("owner", "/dashboard")).text();
    expect(dash).toContain("Alpha Clinic");
    for (const marker of B.markers) expect(dash).not.toContain(marker);
  });
});

// ── TP-7-03: XSS ──

describe("TP-7-03 XSS attempts stay text (plan §10.7)", () => {
  it("purpose name with markup: escaped in the hosted notice and in the banner's preference centre", async () => {
    const notice = await (await fetch(`${APP}/p/${slugA}/notice?lang=en`)).text();
    expect(notice).not.toContain('<img src=x onerror="window.__xss=1">');
    expect(notice).toMatch(/&lt;img src=x onerror=(&quot;|")window\.__xss=1(&quot;|")&gt;/);
    await chrome!.send("Storage.clearDataForOrigin", { origin: SITE, storageTypes: "local_storage,cookies" });
    await goto(`${SITE}/plain.html`);
    await waitUntil(`!!${root(".b [data-a=choose]")}`);
    await widgetClick("[data-a=choose]");
    await waitUntil(`!!${root(".sw")}`);
    expect(await chrome!.evaluate(`document.getElementById('wpk-root').shadowRoot.textContent.includes('<img src=x onerror')`)).toBe(true);
    expect(await chrome!.evaluate(`document.getElementById('wpk-root').shadowRoot.querySelectorAll('img').length`)).toBe(0);
    await sleep(300);
    expect(await chrome!.evaluate(`window.__xss === undefined`)).toBe(true);
  });

  it("rights request with script in the name and details: stored, and shown escaped in the inbox", async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ lang: "en", type: "grievance", name: `<script>window.__xss=2</script>Ravi`, email: "xss@example.in", details: `<img src=x onerror="window.__xss=3"> please fix` })) fd.set(k, v);
    const res = await fetch(`${APP}/p/${slugA}/rights`, { method: "POST", body: fd, redirect: "manual" });
    expect(res.status).toBe(303);
    const db = openDb();
    const row = await db.selectFrom("rights_requests").select("id").where("org_id", "!=", B.orgId).orderBy("id", "desc").executeTakeFirstOrThrow();
    await db.destroy();
    const html = await (await as("owner", `/dashboard/requests/${row.id}`)).text();
    expect(html).not.toContain("<script>window.__xss=2</script>");
    expect(html).not.toContain('<img src=x onerror="window.__xss=3">');
    expect(html).toContain("&lt;script&gt;window.__xss=2&lt;/script&gt;Ravi");
    await chrome!.send("Network.setCookie", { name: "wpk_session", value: SESSIONS.owner, url: APP, httpOnly: true });
    await goto(`${APP}/dashboard/requests/${row.id}`);
    await sleep(500);
    expect(await chrome!.evaluate(`window.__xss === undefined`)).toBe(true);
    await chrome!.send("Network.deleteCookies", { name: "wpk_session", url: APP });
  });
});

// ── TP-6-04: strict CSP host page ──

describe("TP-6-04 widget on a host page with a strict CSP (plan §10.6)", () => {
  it("banner renders styled, consent is recorded and a nonce'd gated script runs, with no CSP violation", async () => {
    await chrome!.send("Storage.clearDataForOrigin", { origin: SITE, storageTypes: "local_storage,cookies" });
    await goto(`${SITE}/strict-csp.html`);
    await waitUntil(`!!${root(".b [data-a=accept]")}`);
    const bg = await chrome!.evaluate<string>(`getComputedStyle(${root("[data-a=accept]")}).backgroundColor`);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)"); // the stylesheet applied without 'unsafe-inline'
    expect(await chrome!.evaluate(`window.__gated`)).toBeUndefined();
    await widgetClick("[data-a=accept]");
    await waitUntil(`window.__gated === 1 || window.__violations.length > 0`);
    expect(await chrome!.evaluate(`window.__violations`)).toEqual([]);
    expect(await chrome!.evaluate(`window.__gated`)).toBe(1);
    await sleep(500);
    expect(await chrome!.evaluate(`window.__violations`)).toEqual([]);
    const db = openDb();
    const events = await db.selectFrom("consent_events").select(["action", "channel"]).where("site_id", "=", siteIdA).execute();
    await db.destroy();
    expect(events.filter((e) => e.action === "grant").length).toBeGreaterThan(0);
  });
});

// ── TP-6-03: axe ──

const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

async function axe(label: string): Promise<string[]> {
  await chrome!.evaluate(`${AXE};true`);
  const result = await chrome!.evaluate<Array<{ id: string; impact: string; nodes: number; help: string }>>(`axe.run(document, { resultTypes: ['violations'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help + " " + v.nodes.slice(0, 3).map(n => n.target.join(" ") + " " + (n.failureSummary || "").replace(/\\s+/g, " ").slice(0, 160)).join(" | ") })))`);
  return result.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${label}: ${v.id} (${v.impact}, ${v.nodes}) ${v.help}`);
}

describe("TP-6-03 axe accessibility scan, 0 serious or critical issues (plan §10.6)", () => {
  it("banner, preference centre (EN and HI) and the age question on a host page", async () => {
    const found: string[] = [];
    await chrome!.send("Storage.clearDataForOrigin", { origin: SITE, storageTypes: "local_storage,cookies" });
    await goto(`${SITE}/plain.html`);
    await waitUntil(`!!${root(".b [data-a=accept]")}`);
    found.push(...(await axe("banner")));
    await widgetClick("[data-a=choose]");
    await waitUntil(`!!${root(".sw")}`);
    found.push(...(await axe("preference centre")));
    await widgetClick("[data-a=lang]");
    await waitUntil(`${root(".b")}?.getAttribute('lang') === 'hi'`);
    found.push(...(await axe("preference centre (hi)")));
    expect(found).toEqual([]);
  });

  it("public pages, the hosted privacy pages and the dashboard", async () => {
    const found: string[] = [];
    for (const url of ["/", "/readiness", "/notice-generator", "/login", "/register", `/p/${slugA}`, `/p/${slugA}/notice?lang=en`, `/p/${slugA}/rights?lang=en`, `/p/${slugA}/withdraw?lang=en`, `/p/${slugA}?lang=hi`]) {
      await goto(`${APP}${url}`);
      found.push(...(await axe(url)));
    }
    await chrome!.send("Network.setCookie", { name: "wpk_session", value: SESSIONS.owner, url: APP, httpOnly: true });
    for (const url of ["/dashboard", "/dashboard/setup", "/dashboard/purposes", "/dashboard/sites", `/dashboard/sites/${siteIdA}`, "/dashboard/requests", "/dashboard/breaches", "/dashboard/retention", "/dashboard/exports", "/account", "/account/security"]) {
      await goto(`${APP}${url}`);
      found.push(...(await axe(url)));
    }
    await chrome!.send("Network.deleteCookies", { name: "wpk_session", url: APP });
    expect(found).toEqual([]);
  }, 180_000);
});

// ── TP-5-01: the whole journey through the UI ──

describe("TP-5-01 owner sign-in → questionnaire → publish → embed → visitor → request → breach → exports (plan §10.5)", () => {
  const email = "owner@journey.example.in";
  let slug = "";
  let pk = "";
  let siteId = 0;

  it("the owner signs in, answers the questionnaire, publishes the notice and adds a website", async () => {
    await chrome!.send("Network.clearBrowserCookies");
    await goto(`${APP}/login?next=${encodeURIComponent("/dashboard/orgs/new")}`);
    await fillAndSubmit({ email, password: "journey password 123" });
    await waitUntil(`location.pathname === '/dashboard/orgs/new'`);
    await fillAndSubmit({ name: "Journey Store", sector: "d2c" });
    await waitUntil(`location.pathname === '/dashboard/setup' && location.search.includes('step=1')`);
    await fillAndSubmit({ legal_name: "Journey Store Pvt Ltd", website_url: "https://journey.example.in", goods_services_en: "Handmade soaps sold online across India.", goods_services_hi: "पूरे भारत में ऑनलाइन बिकने वाले हस्तनिर्मित साबुन।" });
    await waitUntil(`location.search.includes('step=2')`);
    await fillAndSubmit({ g_name: "Grievance Desk", g_designation: "Founder", g_email: "privacy@journey.example.in", g_phone: "+91 98111 22333", g_address: "4 Park Street, Kolkata 700016", dpo_same: true });
    await waitUntil(`location.search.includes('step=3')`);
    await chrome!.evaluate(`document.querySelector('[name=purpose]').closest('form').querySelector('button[type=submit], button:not([type])').click(), true`);
    await waitUntil(`location.search.includes('step=4')`);
    await fillAndSubmit({ response_days: "30", identifiers: ["order_id"], children_mode: false });
    await waitUntil(`location.pathname === '/dashboard/notices'`);
    await waitUntil(`[...document.querySelectorAll('button')].some(b => /publish/i.test(b.textContent))`, 5000);
    await chrome!.evaluate(`[...document.querySelectorAll('button')].find(b => /publish/i.test(b.textContent)).click(), true`);
    await waitUntil(`location.pathname === '/dashboard/notices/1'`);

    await goto(`${APP}/dashboard/sites`);
    await fillAndSubmit({ name: "Journey shop", domain: "localhost" });
    const db = openDb();
    const end = Date.now() + 15_000;
    let site: { id: number; public_key: string; org_id: number } | undefined;
    while (!site && Date.now() < end) {
      site = await db.selectFrom("sites").innerJoin("orgs", "orgs.id", "sites.org_id").select(["sites.id", "sites.public_key", "sites.org_id"]).where("orgs.name", "=", "Journey Store").executeTakeFirst();
      if (!site) await sleep(200);
    }
    slug = (await db.selectFrom("orgs").select("slug").where("name", "=", "Journey Store").executeTakeFirstOrThrow()).slug;
    const versions = await db.selectFrom("notice_versions").select(["lang", "sha256"]).where("org_id", "=", site!.org_id).execute();
    await db.destroy();
    expect(site).toBeTruthy();
    pk = site!.public_key;
    siteId = site!.id;
    expect(versions.map((v) => v.lang).sort()).toEqual(["en", "hi"]);
  }, 120_000);

  it("a visitor accepts, another rejects, the first withdraws: three events in a verified chain", async () => {
    await chrome!.send("Storage.clearDataForOrigin", { origin: SITE, storageTypes: "local_storage,cookies" });
    await goto(`${SITE}/plain.html?pk=${pk}`);
    await waitUntil(`!!${root(".b [data-a=accept]")}`);
    await widgetClick("[data-a=accept]");
    await waitUntil(`Object.values(wpk.get()).length > 0 && Object.values(wpk.get()).every(Boolean)`);
    const stored = await chrome!.evaluate<string>(`localStorage.getItem('wpk_${pk}')`);
    await chrome!.send("Storage.clearDataForOrigin", { origin: SITE, storageTypes: "local_storage,cookies" });
    await goto(`${SITE}/plain.html?pk=${pk}`);
    await waitUntil(`!!${root(".b [data-a=reject]")}`);
    await widgetClick("[data-a=reject]");
    await waitUntil(`Object.values(wpk.get()).length > 0 && Object.values(wpk.get()).every(v => !v)`);
    // Back to the first visitor, who withdraws everything from the floating button.
    await chrome!.evaluate(`localStorage.setItem('wpk_${pk}', ${JSON.stringify(stored)}), true`);
    await goto(`${SITE}/plain.html?pk=${pk}`);
    await waitUntil(`typeof wpk !== 'undefined' && Object.values(wpk.get()).some(Boolean)`);
    await chrome!.evaluate(`wpk.open(), true`);
    await waitUntil(`!!${root(".ov [data-a=reject]")}`);
    await widgetClick(".ov [data-a=reject]");
    await waitUntil(`Object.values(wpk.get()).every(v => !v)`);
    await sleep(800);
    const db = openDb();
    const rows = await db.selectFrom("consent_events").selectAll().where("site_id", "=", siteId).orderBy("seq").execute();
    await db.destroy();
    const actions = new Set(rows.map((r) => r.action));
    expect([...actions].sort()).toEqual(["deny", "grant", "withdraw"]);
    expect(verifyChain(rows as unknown as ChainRow[]).ok).toBe(true);
  });

  it("a person makes a rights request on the hosted page, confirms the email code, and the owner closes it", async () => {
    await goto(`${APP}/p/${slug}/rights?lang=en&type=access`);
    await fillAndSubmit({ name: "Meera Iyer", email: "meera@example.in", details: "Please tell me what you hold about me.", id_order_id: "ORD-1042" });
    await waitUntil(`location.pathname.endsWith('/rights/verify')`);
    const code = await codeFor("meera@example.in");
    await fillAndSubmit({ code });
    const ref = await waitUntil<string>(`(document.body.innerText.match(/R-[A-Z2-9]{4}-[A-Z2-9]{4}/) || [])[0]`);
    const db = openDb();
    const row = await db.selectFrom("rights_requests").select(["id", "status"]).where("ref", "=", ref).executeTakeFirstOrThrow();
    expect(row.status).not.toBe("unverified");
    await goto(`${APP}/dashboard/requests/${row.id}`);
    await waitUntil(`!!document.querySelector('[name=text]')`);
    await fillAndSubmit({ send: true }, `form:has(#close-text)`);
    let closed = "";
    const end = Date.now() + 15_000;
    while (closed !== "closed" && Date.now() < end) {
      closed = (await db.selectFrom("rights_requests").select("status").where("id", "=", row.id).executeTakeFirstOrThrow()).status;
      if (closed !== "closed") await sleep(200);
    }
    await db.destroy();
    expect(closed).toBe("closed");
    expect(serverLog.join("")).toContain("to=meera@example.in");
  });

  it("the owner records a breach and downloads the registers and the proof export, which hold everything above", async () => {
    await goto(`${APP}/dashboard/breaches`);
    const local = new Date(Date.now() + 330 * 60_000 - 2 * 3_600_000).toISOString().slice(0, 16);
    await fillAndSubmit({ title: "Order export emailed to the wrong courier", noticed_at: local, aware_at: local, affected_count: "12" });
    await waitUntil(`/\\/dashboard\\/breaches\\/\\d+/.test(location.pathname)`);
    const cookies = (await chrome!.send("Network.getCookies", { urls: [APP] })) as { cookies: Array<{ name: string; value: string }> };
    const session = cookies.cookies.find((c) => c.name === "wpk_session")!.value;
    const get = async (path: string) => {
      const res = await fetch(`${APP}${path}`, { headers: { Cookie: `wpk_session=${session}` } });
      expect(res.status, path).toBe(200);
      return res.text();
    };
    const breaches = await get("/dashboard/exports/breaches");
    const requests = await get("/dashboard/exports/requests");
    const consents = await get(`/dashboard/sites/${siteId}/consents/export`);
    const proof = JSON.parse(await get("/dashboard/exports/proof.json"));
    expect(breaches).toContain("Order export emailed to the wrong courier");
    expect(requests).toMatch(/R-[A-Z2-9]{4}-[A-Z2-9]{4}/);
    expect(consents).toMatch(/withdraw/);
    expect(consents).toContain("# chain_ok,true");
    expect(proof.notices).toHaveLength(2);
    expect(proof.consent_chains.sites.find((x: { site_id: number }) => x.site_id === siteId)).toMatchObject({ ok: true });
    const all = [breaches, requests, consents, JSON.stringify(proof)].join("\n");
    expect(all).not.toContain("Alpha Clinic");
    expect((await fetch(`${APP}/dashboard/exports/evidence-pack`, { headers: { Cookie: `wpk_session=${session}` } })).status).toBe(404);
  });
});

// ── TP-3-02: MySQL least privilege and integrity triggers (only with WPK_TEST_MYSQL_URL) ──

describe("TP-3-02 MySQL: grants and triggers keep proofs and logs insert-only (plan §7.4)", () => {
  it.skipIf(!E2E_DB.mysql)("the app user may not change or delete proofs, logs or schema; the schema owner is stopped by the triggers", async () => {
    const app = E2E_DB.openApp();
    const owner = E2E_DB.open();
    try {
      expect(Number((await sql<{ n: number }>`SELECT COUNT(*) AS n FROM consent_events`.execute(owner)).rows[0].n)).toBeGreaterThan(0);
      // wpk_app (scripts/mysql-grants.sql): SELECT/INSERT only on the insert-only tables, no DDL.
      await expect(sql`UPDATE consent_events SET lang = 'xx'`.execute(app)).rejects.toThrow(/UPDATE command denied/);
      await expect(sql`UPDATE notice_versions SET body_md = 'x'`.execute(app)).rejects.toThrow(/UPDATE command denied/);
      await expect(sql`DELETE FROM audit_log`.execute(app)).rejects.toThrow(/DELETE command denied/);
      await expect(sql`DELETE FROM security_events`.execute(app)).rejects.toThrow(/DELETE command denied/);
      await expect(sql`UPDATE org_keys SET wrapped_key = 'x'`.execute(app)).rejects.toThrow(/UPDATE command denied/);
      await expect(sql`ALTER TABLE orgs ADD COLUMN x INT`.execute(app)).rejects.toThrow(/denied/);
      // wpk_owner has every privilege on the schema, but the triggers refuse.
      await expect(sql`UPDATE consent_events SET lang = 'xx'`.execute(owner)).rejects.toThrow(/insert-only/);
      await expect(sql`DELETE FROM consent_events`.execute(owner)).rejects.toThrow(/retention checkpoint/);
      await expect(sql`UPDATE notice_versions SET body_md = 'x'`.execute(owner)).rejects.toThrow(/immutable/);
      await expect(sql`DELETE FROM audit_log`.execute(owner)).rejects.toThrow(/at least one year/);
      const now = new Date().toISOString();
      await expect(
        sql`INSERT INTO consent_purge_checkpoints (org_id, site_id, from_seq, through_seq, through_hash, cutoff_at, purged_count, reason, by_user_id, created_at) VALUES (1, 1, 1, 1, ${"0".repeat(64)}, ${now}, 1, 'retention', NULL, ${now})`.execute(owner),
      ).rejects.toThrow(/Rule 8\(3\)/);
      expect(await missingTriggers(owner)).toEqual([]);
    } finally {
      await app.destroy();
      await owner.destroy();
    }
  });
});
