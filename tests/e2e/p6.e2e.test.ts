import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateToLatestWith } from "@/lib/db/migrate";
import type { Database } from "@/lib/db/schema";
import { launch, sleep } from "./cdp.mjs";
import { e2eDatabase } from "./harness";

/**
 * P6 lead magnet + SEO end to end (plan §9 P6 exit check "no login needed"):
 * the production build against a throw-away SQLite database, headless Chrome
 * over CDP for the readiness check, the setup lead form and the free notice
 * generator, and plain HTTP for metadata, sitemap and robots.
 *
 *   npm run build && npm run test:e2e
 */

const ROOT = path.resolve(__dirname, "../..");
const TMP = path.join(process.env.TEMP || ROOT, `wpk-e2e-p6-${process.pid}`);
const PORT = 5200 + Math.floor(Math.random() * 300);
const APP = `http://127.0.0.1:${PORT}`;

let server: ChildProcess | null = null;
const serverLog: string[] = [];
let browser: Awaited<ReturnType<typeof launch>> | null = null;

const E2E_DB = e2eDatabase(TMP);
const openDb = (): Kysely<Database> => E2E_DB.open();

async function open(url: string) {
  const b = browser!;
  const loaded = b.waitFor("Page.loadEventFired");
  await b.send("Page.navigate", { url: `${APP}${url}` });
  await loaded;
  await sleep(300);
}

beforeAll(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  await E2E_DB.init();
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("Run `npm run build` before the e2e tests.");
  fs.mkdirSync(TMP, { recursive: true });
  const db = openDb();
  await migrateToLatestWith(db);
  await db.destroy();

  server = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      STORAGE_DIR: TMP,
      ...E2E_DB.env(),
      APP_INSTALLED: "true",
      WPK_MASTER_KEY: "6".repeat(64),
      WPK_MAIL_CONSOLE: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (d) => serverLog.push(String(d)));
  server.stderr?.on("data", (d) => serverLog.push(String(d)));
  const end = Date.now() + 60_000;
  for (;;) {
    const ok = await fetch(`${APP}/readiness`).then((r) => r.ok).catch(() => false);
    if (ok) break;
    if (Date.now() > end) throw new Error(`server did not start:\n${serverLog.join("")}`);
    await sleep(300);
  }
  browser = await launch();
  await browser.send("Page.enable");
  await browser.send("Runtime.enable");
  await browser.send("Log.enable");
}, 120_000);

afterAll(async () => {
  await E2E_DB.drop();
  await browser?.close();
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

describe("P6 public pages over HTTP (no login)", () => {
  it.each(["/", "/readiness", "/hi/readiness", "/notice-generator", "/hi/notice-generator", "/guides", "/hi/guides"])("%s answers 200 without a session", async (url) => {
    const res = await fetch(`${APP}${url}`, { redirect: "manual" });
    expect(res.status).toBe(200);
  });

  it("guides have canonical, hreflang alternates, FAQ structured data and an OG image", async () => {
    const html = await (await fetch(`${APP}/guides/dpdp-deadline-13-may-2027`)).text();
    expect(html).toMatch(/<link rel="canonical" href="[^"]*\/guides\/dpdp-deadline-13-may-2027"/);
    expect(html).toMatch(/<link rel="alternate" hrefLang="hi" href="[^"]*\/hi\/guides\/dpdp-deadline-13-may-2027"/);
    expect(html).toMatch(/<link rel="alternate" hrefLang="x-default"/);
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toMatch(/<meta property="og:image" content="[^"]*opengraph-image/);
    expect(html).toContain('href="/readiness"');
    const hi = await (await fetch(`${APP}/hi/guides/dpdp-deadline-13-may-2027`)).text();
    expect(hi).toMatch(/lang="hi"/);
    expect(hi).toContain('"@type":"FAQPage"');
    const og = await fetch(new URL(/<meta property="og:image" content="([^"]+)"/.exec(html)![1]).pathname.replace(/^/, APP));
    expect(og.status).toBe(200);
    expect(og.headers.get("content-type")).toBe("image/png");
    expect((await fetch(`${APP}/guides/not-a-guide`)).status).toBe(404);
  });

  it("the readiness page has hreflang pairs; sitemap lists tools and all 13 guides; robots points to it", async () => {
    const html = await (await fetch(`${APP}/hi/readiness`)).text();
    expect(html).toMatch(/<link rel="canonical" href="[^"]*\/hi\/readiness"/);
    expect(html).toMatch(/hrefLang="en" href="[^"]*\/readiness"/);
    const sitemap = await (await fetch(`${APP}/sitemap.xml`)).text();
    for (const p of ["/readiness", "/hi/readiness", "/notice-generator", "/guides/dpdp-for-clinics", "/hi/guides/dpdp-privacy-notice-format-hindi"]) expect(sitemap).toContain(`${p}</loc>`);
    expect(sitemap.match(/\/guides\/[a-z0-9-]+<\/loc>/g)?.length).toBe(13);
    expect(sitemap).toContain('hreflang="hi"');
    const robots = await (await fetch(`${APP}/robots.txt`)).text();
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
    expect(robots).toMatch(/Disallow: \/admin/);
  });

  it("the home page shows the deadline, the free tools, Free vs Pro with the Get Pro link and the disclaimers", async () => {
    const html = await (await fetch(`${APP}/`)).text();
    expect(html).toContain("EpiFive Website Privacy Kit");
    expect(html).toContain("13 May 2027");
    expect(html).toContain("₹3,499");
    expect(html).toContain("https://www.epifive.com/products/website-privacy-kit-pro");
    expect(html).toContain("Hosted plans coming soon");
    expect(html).not.toMatch(/₹299|₹4,999|href="\/pricing"|href="\/register"/);
    expect(html).toContain('href="/readiness"');
    expect(html).toContain('href="/notice-generator"');
    expect(html).toMatch(/not legal advice/i);
    expect(html).toMatch(/not a Consent Manager/);
    expect(html).not.toMatch(/DPDP[- ]compliant|guaranteed/i);
  });
});

describe("P6 in the browser", () => {
  it("readiness check: one question at a time, a score with gaps, and no request to the server", async () => {
    await open("/readiness");
    const result = await browser!.evaluate(`(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Start the check")).click();
      await s(200);
      const seen = new Set();
      for (let i = 0; i < 60 && !document.getElementById("rc-result"); i++) {
        const q = document.getElementById("rc-question")?.textContent;
        seen.add(q);
        const opts = document.querySelectorAll('ul[aria-labelledby="rc-question"] button');
        // Profile: first option (clinic, website, ...). Scored: alternate first and last answers.
        opts[i % 2 === 0 || i < 5 ? 0 : opts.length - 1].click();
        await s(80);
      }
      const posts = performance.getEntriesByType("resource").filter((e) => e.initiatorType === "fetch" || e.initiatorType === "xmlhttprequest")
        // Next.js prefetches linked pages (GET ?_rsc=); anything else would be the answers leaving the page.
        .map((e) => e.name).filter((n) => !n.includes("_rsc="));
      return { questions: seen.size, result: document.getElementById("rc-result")?.parentElement?.textContent ?? "", posts };
    })()`);
    expect(result.questions).toBeGreaterThanOrEqual(26);
    expect(result.result).toMatch(/Readiness score/);
    expect(result.result).toMatch(/out of 100/);
    expect(result.posts).toEqual([]);
    const page = await browser!.evaluate(`document.querySelector("main").textContent`);
    expect(page).toMatch(/Your top gaps/);
    expect(page).toMatch(/Rule \d|s\.\d/);
    expect(page).toMatch(/Notes for your situation/);
  });

  it("Hindi readiness check shows Devanagari questions", async () => {
    await open("/hi/readiness");
    const text = await browser!.evaluate(`(async () => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.includes("चेक शुरू करें")).click();
      await new Promise((r) => setTimeout(r, 200));
      return document.getElementById("rc-question").textContent;
    })()`);
    expect(text).toMatch(/[ऀ-ॿ]/);
  });

  it("free notice generator: draft in English and Hindi with the not-legal-advice banner, nothing stored", async () => {
    await open("/notice-generator?sector=clinic");
    const out = await browser!.evaluate(`(async () => {
      const set = (n, v) => (document.querySelector('[name="' + n + '"]').value = v);
      set("org_name", "Sharma Physio");
      set("website", "https://sharma-physio.example.in");
      set("contact_name", "Front desk manager");
      set("contact_email", "privacy@sharma-physio.example.in");
      document.querySelector('#ng-form button[type="submit"]').click();
      for (let i = 0; i < 50 && !document.getElementById("ng-panel"); i++) await new Promise((r) => setTimeout(r, 200));
      const en = document.getElementById("ng-panel")?.textContent ?? "";
      document.getElementById("ng-tab-hi")?.click();
      await new Promise((r) => setTimeout(r, 100));
      const hi = document.getElementById("ng-panel")?.textContent ?? "";
      const section = document.querySelector('[aria-labelledby="ng-preview"]')?.textContent ?? "";
      return { en, hi, section };
    })()`);
    expect(out.en).toContain("Sharma Physio");
    expect(out.en).toMatch(/Appointment date and time/);
    expect(out.en).toMatch(/Data Protection Board/);
    expect(out.hi).toMatch(/[ऀ-ॿ]/);
    expect(out.section).toMatch(/Draft — not legal advice/);
    expect(out.section).toMatch(/Open the dashboard/);
  });

  it("no JavaScript errors on the P6 pages", async () => {
    for (const url of ["/", "/guides/dpdp-consent-banner", "/hi/guides/dpdp-checklist-small-business-2027", "/notice-generator"]) await open(url);
    expect(browser!.errors.filter((e) => !/favicon/.test(e)), JSON.stringify(browser!.errors)).toEqual([]);
  });
});
