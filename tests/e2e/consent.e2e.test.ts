import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyChain, type ChainRow } from "@/core/consent/chain";
import { migrateToLatestWith } from "@/lib/db/migrate";
import type { Database } from "@/lib/db/schema";
import { publishNotice } from "@/lib/privacy/notices";
import { createSite, getSite } from "@/lib/privacy/registers";
import { setMasterKeyForTests } from "@/lib/secrets";
import { createReadyOrg } from "../helpers/fixtures";
import { launch, sleep } from "./cdp.mjs";
import { e2eDatabase } from "./harness";

/**
 * C1–C3 end-to-end on three static pages (plan §9 P3 exit check, §10.5–10.6):
 * plain HTML, a page with Google tags, and a form page. Runs the production
 * build (`npm run build` first) against a throw-away SQLite database, serves
 * the pages from another origin and drives headless Chrome over CDP.
 *
 *   npm run test:e2e
 */

type Cdp = {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  evaluate: <T = unknown>(expression: string) => Promise<T>;
  close: () => Promise<void>;
  errors: string[];
  on: (fn: (msg: { method: string; params: Record<string, unknown> }) => void) => () => void;
};

const ROOT = path.resolve(__dirname, "../..");
const TMP = path.join(process.env.TEMP || ROOT, `wpk-e2e-${process.pid}`);
const APP_PORT = 4300 + Math.floor(Math.random() * 300);
const STATIC_PORT = APP_PORT + 400;
const APP = `http://127.0.0.1:${APP_PORT}`;
const SITE = `http://localhost:${STATIC_PORT}`;
const MASTER = "7".repeat(64);
const THIRD_PARTY = /googletagmanager\.com|youtube-nocookie\.com|google-analytics\.com/;

let server: ChildProcess | null = null;
let staticServer: http.Server | null = null;
let chrome: Cdp | null = null;
let pk = "";
let orgSlug = "";
let siteId = 0;
const SESSION = crypto.randomBytes(24).toString("hex");
const requests: string[] = [];
const serverLog: string[] = [];

const root = (sel: string) => `document.getElementById('wpk-root')?.shadowRoot?.querySelector(${JSON.stringify(sel)})`;

async function waitUntil<T>(expression: string, timeout = 15000): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await chrome!.evaluate<T>(expression).catch(() => undefined);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout waiting for: ${expression}\n${chrome!.errors.join("\n")}`);
    await sleep(100);
  }
}

async function goto(url: string) {
  await chrome!.send("Page.navigate", { url });
  await waitUntil("document.readyState === 'complete'");
}

const click = (sel: string) => chrome!.evaluate(`(${root(sel)}).click(), true`);
const pageClick = (sel: string) => chrome!.evaluate(`document.querySelector(${JSON.stringify(sel)}).click(), true`);

async function pressEscape() {
  for (const type of ["keyDown", "keyUp"]) await chrome!.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
}

async function resetBrowserState() {
  await chrome!.send("Storage.clearDataForOrigin", { origin: SITE, storageTypes: "local_storage,cookies" });
}

const E2E_DB = e2eDatabase(TMP);
const openDb = (): Kysely<Database> => E2E_DB.open();

beforeAll(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  await E2E_DB.init();
  const build = path.join(ROOT, ".next", "BUILD_ID");
  if (!fs.existsSync(build)) throw new Error("Run `npm run build` before the e2e tests.");
  fs.mkdirSync(TMP, { recursive: true });

  // 1. Seed a database: one clinic organisation, a published notice, one site for http://localhost.
  setMasterKeyForTests(Buffer.from(MASTER, "hex"));
  const db = openDb();
  await migrateToLatestWith(db);
  const org = await createReadyOrg(db, "owner@clinic.e2e", "Sharma Physio", "clinic");
  // The clinic preset switches children mode on; the C1–C3 pages run without it (children mode has its own test below).
  await org.t.updateOrg({ children_mode: 0 });
  const published = await publishNotice(org.t, { baseUrl: APP, userId: org.userId });
  if (!published.ok) throw new Error("notice not published");
  const site = (await getSite(org.t, await createSite(org.t, { name: "Fixture site", domain: "localhost", allowedOrigins: [], childrenMode: false })))!;
  pk = site.public_key;
  orgSlug = (await org.t.org())!.slug;
  siteId = site.id;
  const ts = new Date().toISOString();
  await db
    .insertInto("sessions")
    .values({ id: crypto.createHash("sha256").update(SESSION).digest("hex"), user_id: org.userId, expires_at: new Date(Date.now() + 3600_000).toISOString(), ip: null, user_agent: null, created_at: ts })
    .execute();
  await db.destroy();

  // 2. The production server on its own origin.
  server = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", STORAGE_DIR: TMP, ...E2E_DB.env(), APP_INSTALLED: "true", WPK_MASTER_KEY: MASTER, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (d) => serverLog.push(String(d)));
  server.stderr?.on("data", (d) => serverLog.push(String(d)));
  const end = Date.now() + 60_000;
  for (;;) {
    const ok = await fetch(`${APP}/w.js`).then((r) => r.ok).catch(() => false);
    if (ok) break;
    if (Date.now() > end) throw new Error(`server did not start:\n${serverLog.join("")}`);
    await sleep(300);
  }

  // 3. The customer's website (another origin) serving the three fixture pages.
  staticServer = http.createServer((req, res) => {
    const name = (req.url || "/").split("?")[0].replace(/^\//, "") || "plain.html";
    const file = path.join(__dirname, "pages", path.basename(name));
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(file, "utf8").replaceAll("{{APP}}", APP).replaceAll("{{PK}}", pk));
  });
  await new Promise<void>((r) => staticServer!.listen(STATIC_PORT, "127.0.0.1", r));

  // 4. Headless Chrome; third-party requests are recorded and answered locally (never reach the internet).
  chrome = (await launch()) as unknown as Cdp;
  await chrome.send("Page.enable");
  await chrome.send("Runtime.enable");
  await chrome.send("Network.enable");
  await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*googletagmanager.com*" }, { urlPattern: "*youtube-nocookie.com*" }, { urlPattern: "*google-analytics.com*" }] });
  chrome.on((msg) => {
    if (msg.method === "Network.requestWillBeSent") requests.push(String((msg.params.request as { url: string }).url));
    if (msg.method === "Fetch.requestPaused") {
      const url = String((msg.params.request as { url: string }).url);
      const body = url.includes("gtag/js") ? "window.__gtagLoaded = (window.__gtagLoaded || 0) + 1;" : "<!doctype html><title>stub</title>";
      void chrome!.send("Fetch.fulfillRequest", {
        requestId: msg.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: url.includes("gtag/js") ? "application/javascript" : "text/html" }],
        body: Buffer.from(body).toString("base64"),
      });
    }
  });
}, 120_000);

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

describe("public API: CORS allow-list, caching and validation", () => {
  it("config: ETag + 304, Vary: Origin, CORS only for the site's origins", async () => {
    const ok = await fetch(`${APP}/api/v1/sites/${pk}/config`, { headers: { Origin: SITE } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(ok.headers.get("vary")).toMatch(/Origin/);
    expect(ok.headers.get("cache-control")).toMatch(/max-age=300/);
    const etag = ok.headers.get("etag")!;
    const config = await ok.json();
    expect(config.notice.version).toBe(1);
    expect(etag).toBe(`"${config.v}"`);
    const again = await fetch(`${APP}/api/v1/sites/${pk}/config`, { headers: { Origin: SITE, "If-None-Match": etag } });
    expect(again.status).toBe(304);
    const evil = await fetch(`${APP}/api/v1/sites/${pk}/config`, { headers: { Origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    expect((await fetch(`${APP}/api/v1/sites/pk_live_nope00000000/config`)).status).toBe(404);
  });

  it("consent: foreign origins and malformed bodies are refused", async () => {
    const body = JSON.stringify({ site: pk, sid: "api-test-subject-0001", c: { analytics: true }, l: "en", nv: 1, ch: "banner" });
    expect((await fetch(`${APP}/api/v1/consent`, { method: "POST", body, headers: { Origin: "https://evil.example", "Content-Type": "text/plain" } })).status).toBe(403);
    expect((await fetch(`${APP}/api/v1/consent`, { method: "POST", body, headers: { "Content-Type": "text/plain" } })).status).toBe(403);
    expect((await fetch(`${APP}/api/v1/consent`, { method: "POST", body: "{nope", headers: { Origin: SITE } })).status).toBe(400);
    const stale = JSON.stringify({ site: pk, sid: "api-test-subject-0001", c: { analytics: true }, l: "en", nv: 7, ch: "banner" });
    expect((await fetch(`${APP}/api/v1/consent`, { method: "POST", body: stale, headers: { Origin: SITE } })).status).toBe(422);
  });
});

describe("page 1: plain HTML (C1, N3-04, N4)", () => {
  it("C1-01..04 banner and preference centre: nothing pre-ticked, equal Accept/Reject, no 'by continuing', necessary without a toggle", async () => {
    await resetBrowserState();
    await goto(`${SITE}/plain.html`);
    await waitUntil(`!!${root(".b [data-a=accept]")}`);
    const style = await chrome!.evaluate<{ a: Record<string, string>; r: Record<string, string> }>(`(() => {
      const pick = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect();
        return { bg: s.backgroundColor, color: s.color, size: s.fontSize, weight: s.fontWeight, border: s.borderTopColor + s.borderTopWidth, w: Math.round(b.width) + "", h: Math.round(b.height) + "" }; };
      return { a: pick(${root("[data-a=accept]")}), r: pick(${root("[data-a=reject]")}) };
    })()`);
    expect(style.r).toEqual(style.a); // C1-02 same size, colours and weight
    const text = await chrome!.evaluate<string>(`document.body.innerText + ' ' + document.getElementById('wpk-root').shadowRoot.textContent`);
    expect(text).not.toMatch(/by continuing|continuing to (use|browse)/i); // C1-03
    expect(text).toMatch(/Read our full privacy notice/); // N1: notice accompanies the request
    expect(text).toMatch(/privacy@clinic\.example\.in/); // s.6(3) contact in the consent request

    await click("[data-a=choose]");
    await waitUntil(`!!${root(".sw")}`);
    const toggles = await chrome!.evaluate<string[]>(`Array.from(document.getElementById('wpk-root').shadowRoot.querySelectorAll('.sw')).map(s => s.getAttribute('aria-checked'))`);
    expect(toggles.length).toBe(2);
    expect(toggles.every((v) => v === "false")).toBe(true); // C1-01
    const centre = await chrome!.evaluate<string>(`${root(".ov")}.textContent`);
    expect(centre).toMatch(/Needed to run the website/); // C1-04
    expect(centre).toMatch(/Always on/);
    expect(await chrome!.evaluate<number>(`document.getElementById('wpk-root').shadowRoot.querySelectorAll('.sw[data-k=website_security]').length`)).toBe(0);
    expect(await chrome!.evaluate<string>(`${root(".ov .b")}.getAttribute('aria-modal')`)).toBe("true");
    await pressEscape();
    await waitUntil(`!!${root(".b [data-a=accept]")}`); // Esc returns to the banner, no consent
    expect(await chrome!.evaluate(`JSON.stringify(wpk.get())`)).toBe("{}");
  });

  it("Esc on the banner never counts as consent; no cookies at any time", async () => {
    await chrome!.evaluate(`${root("[data-a=accept]")}.focus()`);
    await pressEscape();
    await waitUntil(`!${root(".b [data-a=accept]")}`);
    expect(await chrome!.evaluate(`localStorage.getItem('wpk_${pk}')`)).toBeNull();
    expect(await chrome!.evaluate(`document.cookie`)).toBe("");
    await goto(`${SITE}/plain.html`);
    await waitUntil(`!!${root(".b [data-a=accept]")}`); // shown again on the next page
  });

  it("N4 language switch loads the Hindi chunk; the choice is recorded in Hindi (N4-05)", async () => {
    await click("[data-a=lang]");
    await waitUntil(`${root(".b")}?.textContent.includes('सब अस्वीकार करें')`);
    expect(requests.some((u) => u.startsWith(`${APP}/w-hi.js`))).toBe(true);
    await click("[data-a=reject]");
    await waitUntil(`!${root(".b [data-a=accept]")}`);
    expect(await chrome!.evaluate(`wpk.get()`)).toEqual({ analytics: false, marketing_whatsapp: false });
    expect(await chrome!.evaluate(`document.cookie`)).toBe("");
    expect(await chrome!.evaluate<boolean>(`!!${root(".f")}`)).toBe(true); // floating "Privacy choices"
    await chrome!.evaluate(`wpk.lang('en')`);
  });

  it("N3-04 withdrawing takes no more clicks than granting", async () => {
    // Grant everything from the decided state: open the preference centre + Accept all.
    let grantClicks = 0;
    await pageClick("#open");
    grantClicks++;
    await waitUntil(`!!${root(".ov [data-a=accept]")}`);
    await click(".ov [data-a=accept]");
    grantClicks++;
    await waitUntil(`wpk.get().analytics === true && wpk.get().marketing_whatsapp === true`);

    // Withdraw everything with the footer link: one click.
    let withdrawClicks = 0;
    await pageClick("#withdraw");
    withdrawClicks++;
    await waitUntil(`wpk.get().analytics === false && wpk.get().marketing_whatsapp === false`);
    expect(withdrawClicks).toBeLessThanOrEqual(grantClicks);

    // And from the preference centre: open + "Withdraw all optional consents" = the same 2 clicks.
    await pageClick("#open");
    await click(".ov [data-a=accept]");
    await waitUntil(`wpk.get().analytics === true`);
    let pcClicks = 0;
    await pageClick("#open");
    pcClicks++;
    await waitUntil(`${root(".ov [data-a=reject]")}?.textContent === 'Withdraw all optional consents'`);
    await click(".ov [data-a=reject]");
    pcClicks++;
    await waitUntil(`wpk.get().analytics === false`);
    expect(pcClicks).toBeLessThanOrEqual(grantClicks);
  });
});

describe("page 2: Google tags (gating, Consent Mode v2, C2-03, no third-party calls before consent)", () => {
  const dl = () => chrome!.evaluate<Array<Record<string, unknown>>>(`(window.dataLayer || []).map(a => Array.from(a)).filter(a => a[0] === 'consent').map(a => ({ cmd: a[1], analytics: a[2].analytics_storage, ads: a[2].ad_storage }))`);

  it("blocks Google tags and iframes until analytics is switched on", async () => {
    await resetBrowserState();
    const before = requests.length;
    await goto(`${SITE}/google.html`);
    await waitUntil(`!!${root(".b [data-a=accept]")}`);
    await sleep(300);
    const early = requests.slice(before);
    expect(early.filter((u) => THIRD_PARTY.test(u))).toEqual([]);
    expect(early.every((u) => u.startsWith(SITE) || u.startsWith(APP))).toBe(true);
    expect(await chrome!.evaluate(`window.__analyticsRan ?? null`)).toBeNull();
    expect(await chrome!.evaluate(`document.getElementById('video').getAttribute('src')`)).toBeNull();
    expect((await dl())[0]).toEqual({ cmd: "default", analytics: "denied", ads: "denied" });

    // Switch on only analytics in the preference centre.
    await click("[data-a=choose]");
    await waitUntil(`!!${root(".sw[data-k=analytics]")}`);
    await click(".sw[data-k=analytics]");
    await click("[data-a=save]");
    await waitUntil(`window.__analyticsRan === 1 && window.__gtagLoaded === 1`);
    expect(requests.some((u) => u.includes("googletagmanager.com/gtag/js"))).toBe(true);
    expect(await chrome!.evaluate(`document.getElementById('video').getAttribute('src')`)).toMatch(/youtube-nocookie/);
    expect(await chrome!.evaluate(`window.__marketingRan ?? null`)).toBeNull();
    expect((await dl()).at(-1)).toEqual({ cmd: "update", analytics: "granted", ads: "denied" });
  });

  it("C2-03 after withdrawal the gated scripts stop on the next page load", async () => {
    await goto(`${SITE}/google.html`);
    await waitUntil(`window.__analyticsRan === 1`); // still granted: runs on load
    await pageClick("#withdraw");
    await waitUntil(`wpk.get().analytics === false`);
    expect((await dl()).at(-1)).toEqual({ cmd: "update", analytics: "denied", ads: "denied" });
    const before = requests.length;
    await goto(`${SITE}/google.html`);
    await waitUntil(`!!${root(".f")}`);
    await sleep(300);
    expect(await chrome!.evaluate(`window.__analyticsRan ?? null`)).toBeNull();
    expect(requests.slice(before).filter((u) => THIRD_PARTY.test(u))).toEqual([]);
  });
});

describe("page 3: form consent (wpk.form, C2-04 signed withdraw link)", () => {
  let withdrawUrl = "";

  it("adds an unticked checkbox and the short notice, and records the form consent", async () => {
    await resetBrowserState();
    await goto(`${SITE}/form.html`);
    await waitUntil(`!!document.querySelector('[data-wpk-form]')?.shadowRoot?.querySelector('input[type=checkbox]')`);
    const box = `document.querySelector('[data-wpk-form]').shadowRoot`;
    expect(await chrome!.evaluate(`${box}.querySelector('input').checked`)).toBe(false);
    const text = await chrome!.evaluate<string>(`${box}.textContent`);
    expect(text).toMatch(/Book and manage appointments/i);
    expect(text).toMatch(/privacy notice/);
    expect(text).toMatch(new RegExp(`/p/${orgSlug}/withdraw`));
    await chrome!.evaluate(`document.querySelector('[name=email]').value = 'Asha.Rao@Example.com'`);
    await chrome!.evaluate(`${box}.querySelector('input').click()`);
    await chrome!.evaluate(`document.querySelector('[type=submit]').click()`);
    const result = await waitUntil<{ ok: boolean; withdraw: string }>(`window.__formResult`);
    expect(result.ok).toBe(true);
    expect(result.withdraw).toMatch(new RegExp(`^${APP}/p/${orgSlug}/withdraw\\?t=`));
    withdrawUrl = result.withdraw;
  });

  it("C2-04 the signed withdraw link works without login, in one click", async () => {
    await goto(withdrawUrl);
    const page = await chrome!.evaluate<string>(`document.body.innerText`);
    expect(page).toMatch(/Send you offers and updates on WhatsApp|WhatsApp/);
    expect(await chrome!.evaluate(`document.scripts.length`)).toBe(0);
    await chrome!.evaluate(`document.querySelector('button[type=submit]').click()`);
    await waitUntil(`document.body?.innerText.includes('Your consent is withdrawn')`);
    // A tampered token is refused.
    await goto(withdrawUrl.slice(0, -3) + "abc");
    expect(await chrome!.evaluate<string>(`document.body.innerText`)).toMatch(/not valid/);
  });
});

describe("dashboard: embed snippet, consent log, chain verification and CSV export", () => {
  const get = (url: string, auth = true) => fetch(`${APP}${url}`, { headers: auth ? { Cookie: `wpk_session=${SESSION}` } : {}, redirect: "manual" });

  it("website page shows the embed snippet and banner settings", async () => {
    const res = await get(`/dashboard/sites/${siteId}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`data-site=&quot;${pk}&quot;`);
    expect(html).toContain("Banner settings");
    expect(html).toContain("analytics_storage");
  });

  it("consent log verifies the chain and exports CSV with the chain head; members only", async () => {
    const page = await get(`/dashboard/sites/${siteId}/consents?verify=1`);
    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/Chain verified/);
    const csv = await get(`/dashboard/sites/${siteId}/consents/export`);
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    const body = await csv.text();
    expect(body).toContain("# chain_ok,true");
    expect(body).not.toMatch(/asha/i);
    expect((await get(`/dashboard/sites/${siteId}/consents/export`, false)).status).toBe(401);
  });
});

describe("C3 proof in the database after the browser run", () => {
  it("C3-01..03 every event carries notice version, language and channel; the chain verifies; identifiers are encrypted", async () => {
    const db = openDb();
    try {
      const rows = await db.selectFrom("consent_events").selectAll().orderBy("seq").execute();
      expect(rows.length).toBeGreaterThan(8);
      for (const r of rows) {
        expect(r.notice_version).toBe(1);
        expect(r.notice_version_id).toBeGreaterThan(0);
        expect(["en", "hi"]).toContain(r.lang);
        expect(["banner", "form", "link"]).toContain(r.channel);
        expect(r.ip_trunc === "" || /\/(24|48)$/.test(r.ip_trunc)).toBe(true);
      }
      expect(rows.some((r) => r.lang === "hi" && r.action === "deny")).toBe(true);
      expect(rows.some((r) => r.channel === "form" && r.subject_kind === "email" && r.action === "grant")).toBe(true);
      expect(rows.some((r) => r.channel === "link" && r.action === "withdraw")).toBe(true);
      expect(rows.some((r) => r.channel === "banner" && r.action === "withdraw")).toBe(true);
      expect(JSON.stringify(rows)).not.toMatch(/asha/i);
      expect(rows.every((r) => !r.page_url.includes("?"))).toBe(true);
      const head = await db.selectFrom("consent_chain_heads").selectAll().executeTakeFirstOrThrow();
      expect(verifyChain(rows as unknown as ChainRow[], { head: { seq: head.seq, hash: head.hash } })).toMatchObject({ ok: true, count: rows.length });
    } finally {
      await db.destroy();
    }
    expect(chrome!.errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });
});

describe("children mode (K1-01; plan M10): age question first, under 18 sends nothing", () => {
  const setChildren = async (on: boolean) => {
    const db = openDb();
    try {
      await db.updateTable("orgs").set({ children_mode: on ? 1 : 0 }).execute();
    } finally {
      await db.destroy();
    }
  };

  it("asks the age with two equal buttons; 'under 18' records nothing and keeps tags blocked (Free: no parent link)", async () => {
    await setChildren(true);
    try {
      await chrome!.send("Network.clearBrowserCache"); // the config response is cacheable for 5 minutes
      await resetBrowserState();
      const before = requests.length;
      await goto(`${SITE}/google.html`);
      await waitUntil(`!!${root(".b [data-a=child]")}`);
      const style = await chrome!.evaluate<{ a: string; c: string }>(`(() => {
        const pick = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return [s.backgroundColor, s.color, s.fontWeight, Math.round(b.width), Math.round(b.height)].join("|"); };
        return { a: pick(${root("[data-a=adult]")}), c: pick(${root("[data-a=child]")}) };
      })()`);
      expect(style.c).toBe(style.a);
      expect(await chrome!.evaluate<string>(`${root(".b")}.textContent`)).toMatch(/Are you 18 years or older\?/);
      // No banner and no consent toggles before the age answer.
      expect(await chrome!.evaluate<boolean>(`!${root("[data-a=accept]")}`)).toBe(true);
      await click("[data-a=child]");
      await waitUntil(`!!${root("[data-a=reage]")}`);
      const kid = await chrome!.evaluate<string>(`${root(".b")}.textContent`);
      expect(kid).toMatch(/cannot be switched on/);
      expect(await chrome!.evaluate<boolean>(`!${root("a.btn")}`)).toBe(true); // the parental-consent flow is in the Pro edition
      await sleep(500);
      const after = requests.slice(before);
      expect(after.some((u) => u.startsWith(`${APP}/api/v1/consent`) && !u.includes("sid="))).toBe(false); // nothing POSTed
      expect(after.some((u) => THIRD_PARTY.test(u))).toBe(false);
      expect(await chrome!.evaluate("window.__analyticsRan || 0")).toBe(0);
      // Withdraw/accept links do nothing for a child: still nothing recorded.
      await pageClick("#withdraw");
      await sleep(300);
      expect(requests.slice(before).some((u) => u === `${APP}/api/v1/consent`)).toBe(false);

      // "I answered wrongly" → age question again; an adult then gets the normal banner.
      await click("[data-a=reage]");
      await waitUntil(`!!${root("[data-a=adult]")}`);
      await click("[data-a=adult]");
      await waitUntil(`!!${root(".b [data-a=accept]")}`);
    } finally {
      await setChildren(false);
      await resetBrowserState();
    }
  });
});
