import { describe, expect, it } from "vitest";
import hi from "../languages/hi.json";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { MESSAGES } from "@/lib/i18n/messages";
import { createTestDb } from "./helpers/db";

describe("base: auth", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("base: database", () => {
  it("migrates an empty database and seeds English", async () => {
    const db = await createTestDb();
    const languages = await db.selectFrom("languages").select("code").execute();
    expect(languages.map((l) => l.code)).toContain("en");
    await db.destroy();
  });

  it("has no social-proof or hosted billing tables", async () => {
    const db = await createTestDb();
    const tables = (await db.introspection.getTables()).map((t) => t.name);
    for (const gone of ["widgets", "events", "testimonials", "leads", "widget_stats_daily", "presence", "plans", "payments", "subscriptions", "invoices", "sales_leads", "posts", "pages"]) expect(tables).not.toContain(gone);
    await db.destroy();
  });
});

describe("base: i18n (plan §10.2 — no missing HI keys)", () => {
  const translations = (hi as { translations: Record<string, string> }).translations;

  it("has a Hindi translation for every interface string", () => {
    const missing = Object.keys(MESSAGES).filter((k) => !translations[k]?.trim());
    expect(missing).toEqual([]);
  });

  it("keeps the same {placeholders} in Hindi", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const broken = Object.entries(MESSAGES).filter(([k, en]) => translations[k] && vars(translations[k]).join() !== vars(en).join());
    expect(broken.map(([k]) => k)).toEqual([]);
  });
});

describe("base: guardrails (plan §3.2–3.3)", () => {
  const all = Object.values(MESSAGES).join("\n");

  it("never presents the product as a Consent Manager", () => {
    for (const m of all.matchAll(/[^.]*Consent Manager[^.]*/g)) expect(m[0]).toMatch(/\bnot\b|\bNo\b|^\s*A Consent Manager is/);
  });

  it("never claims compliance, certification or guarantees", () => {
    expect(all).not.toMatch(/DPDP[- ]compliant|certified|guarantee/i);
  });

  it("ships a not-legal-advice disclaimer", () => {
    expect(MESSAGES["legal.disclaimer"]).toMatch(/not legal advice/);
    expect(MESSAGES["legal.disclaimer"]).toMatch(/not a Consent Manager/);
  });
});
