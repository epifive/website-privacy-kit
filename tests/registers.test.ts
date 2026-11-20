import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPreset, SECTOR_PRESETS, SECTORS } from "@/core/presets";
import { businessStep, contactStep, deriveFlags, rightsStep } from "@/core/questionnaire";
import { LOG_FLOOR_DAYS, validateRetentionRule } from "@/core/retention";
import { dataItemLabel, isCatalogueKey } from "@/core/data-items";
import { buildNoticeInput } from "@/lib/privacy/notices";
import { createOrg } from "@/lib/privacy/orgs";
import { createRetentionRule, createVendor, listPurposes, listRetentionRules, listVendors, vendorsWithoutContract } from "@/lib/privacy/registers";
import { applyPreset } from "@/lib/privacy/setup";
import { tenantDb } from "@/lib/db/tenant";
import { validateNoticeInput } from "@/core/notice/render";
import { createTestDb } from "./helpers/db";
import { BASE_URL, createUser } from "./helpers/fixtures";

describe("sector presets (clinic, coaching, D2C, agent, CA firm)", () => {
  it("cover the five sectors from the plan with bilingual, itemised purposes", () => {
    for (const sector of ["clinic", "coaching", "d2c", "agent", "ca_firm"] as const) expect(SECTORS).toContain(sector);
    for (const preset of Object.values(SECTOR_PRESETS)) {
      for (const p of preset.purposes) {
        expect(p.items.length, `${preset.sector}/${p.key}`).toBeGreaterThan(0);
        for (const key of p.items) expect(isCatalogueKey(key), key).toBe(true);
        expect(p.name.hi).toMatch(/[ऀ-ॿ]/);
        expect(p.description.hi).toMatch(/[ऀ-ॿ]/);
        for (const v of p.vendors ?? []) expect(preset.vendors.map((x) => x.name), `${preset.sector}: ${v}`).toContain(v);
        if (p.retention) expect(preset.retention.map((r) => r.category), `${preset.sector}: ${p.retention}`).toContain(p.retention);
      }
      for (const r of preset.retention) expect(validateRetentionRule({ ...r, isLogs: Boolean(r.isLogs), preNoticeHours: null }), r.category).toEqual([]);
    }
  });

  it("C1/K1: tracking purposes are consent-based, never 'necessary'", () => {
    for (const preset of Object.values(SECTOR_PRESETS)) for (const p of preset.purposes.filter((x) => x.isTracking)) expect(p.basis).toBe("consent");
  });

  it("K3-01 Fourth Schedule notes are informational only (clinic, coaching)", () => {
    expect(getPreset("clinic").exemptionNote?.en).toMatch(/lawyer/);
    expect(getPreset("coaching").exemptionNote?.en).toMatch(/lawyer/);
    expect(getPreset("unknown").sector).toBe("other");
  });

  it("every catalogue label has Hindi", () => {
    expect(dataItemLabel({ key: "mobile" }, "hi")).toBe("मोबाइल नंबर");
  });
});

describe("questionnaire", () => {
  it("validates the business step and flags Third Schedule classes (E2-01) and SDFs (X1)", () => {
    const ok = businessStep.safeParse({
      name: "Shop",
      legal_name: "Shop Pvt Ltd",
      sector: "d2c",
      goods_services_en: "Shoes",
      goods_services_hi: "जूते",
      website_url: "https://shop.in",
      third_schedule: "ecommerce_2cr",
      is_sdf: false,
    });
    expect(ok.success).toBe(true);
    expect(deriveFlags(ok.data!)).toEqual({ thirdSchedule: true, sdfOutOfScope: false });
    expect(businessStep.safeParse({ ...ok.data, website_url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("R3-02 caps the response period at 90 days and keeps only known identifiers", () => {
    const r = rightsStep.parse({ response_days: 365, identifiers: ["mobile", "bogus"], children_mode: false });
    expect(r.response_days).toBe(90);
    expect(r.identifiers).toEqual(["mobile"]);
    expect(rightsStep.safeParse({ response_days: 30, identifiers: ["bogus"], children_mode: false }).success).toBe(false);
  });

  it("R4: a grievance contact needs a name and an email or phone", () => {
    const empty = { name: "", designation: "", email: "", phone: "", address: "" };
    expect(contactStep.safeParse({ grievance: empty, dpo_same: true, dpo: empty }).success).toBe(false);
    expect(contactStep.safeParse({ grievance: { ...empty, name: "Officer", phone: "98" }, dpo_same: true, dpo: empty }).success).toBe(true);
  });
});

describe("registers", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(() => db.destroy());

  it("applying a preset is idempotent and links purposes to vendors and retention rules", async () => {
    const user = await createUser(db, "coach@test.in");
    const org = await createOrg(db, user, { name: "Bright Coaching", sector: "coaching" });
    const t = tenantDb(db, org.id);
    const first = await applyPreset(t, "coaching");
    const second = await applyPreset(t, "coaching");
    expect(first.purposes).toBe(SECTOR_PRESETS.coaching.purposes.length);
    expect(second).toEqual({ purposes: 0, vendors: 0, retention: 0 });
    const purposes = await listPurposes(t);
    const classes = purposes.find((p) => p.purpose_key === "classes")!;
    expect(JSON.parse(classes.vendor_ids).length).toBe(1);
    expect(classes.retention_rule_id).not.toBeNull();
    expect((await t.org())?.children_mode).toBe(1);
    const input = await buildNoticeInput(t, { baseUrl: BASE_URL, version: 1 });
    // Only the missing contact blocks publishing.
    expect(validateNoticeInput(input).map((i) => i.code)).toEqual(["no_contact"]);
  });

  it("P1-01/02, S1-03 vendor register records contract status and flags missing contracts", async () => {
    const user = await createUser(db, "ca@test.in");
    const org = await createOrg(db, user, { name: "Gupta & Co", sector: "ca_firm" });
    const t = tenantDb(db, org.id);
    await createVendor(t, { name: "Signed Ltd", service: "Email", dataShared: ["email"], location: "abroad", contractStatus: "signed", contractDate: "2026-11-01", securityClause: true, reviewAt: "2027-11-01", erasureContact: "dpo@signed.example" });
    await createVendor(t, { name: "No Contract Ltd", service: "SMS", dataShared: ["mobile"], location: "india", contractStatus: "none", contractDate: "not-a-date", securityClause: false, reviewAt: null, erasureContact: "" });
    const vendors = await listVendors(t);
    expect(vendors.find((v) => v.name === "Signed Ltd")).toMatchObject({ contract_status: "signed", contract_date: "2026-11-01", security_clause: 1, location: "abroad" });
    expect(vendors.find((v) => v.name === "No Contract Ltd")?.contract_date).toBeNull();
    expect(vendorsWithoutContract(vendors).map((v) => v.name)).toEqual(["No Contract Ltd"]);
  });

  it("E1-01 / E3-01 retention rules: logs below one year are rejected", async () => {
    const user = await createUser(db, "agent@test.in");
    const org = await createOrg(db, user, { name: "Prime Realty", sector: "agent" });
    const t = tenantDb(db, org.id);
    const base = { category: "Server logs", categoryHi: "सर्वर लॉग", lawRef: "Rule 8(3)", trigger: "collection", action: "erase", preNoticeHours: null, isLogs: true };
    expect(await createRetentionRule(t, { ...base, periodDays: 90 })).toEqual({ issues: ["log_floor"] });
    expect(await createRetentionRule(t, { ...base, periodDays: LOG_FLOOR_DAYS })).toHaveProperty("id");
    expect(await createRetentionRule(t, { ...base, category: "Leads", isLogs: false, periodDays: 30, preNoticeHours: 48 })).toHaveProperty("id");
    expect(await createRetentionRule(t, { ...base, category: "", isLogs: false, periodDays: -1 })).toEqual({ issues: ["category", "period"] });
    expect((await listRetentionRules(t)).length).toBe(2);
  });
});
