import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adultByYearOfBirth, isChildBlockedPurpose } from "@/core/children";
import type { Site } from "@/lib/db/schema";
import { setMailTransport, type MailMessage } from "@/lib/mail";
import { childPurposes } from "@/lib/privacy/children";
import { buildSiteConfig, recordConsent } from "@/lib/privacy/consent";
import { publishNotice } from "@/lib/privacy/notices";
import { createSite, getSite, listPurposes } from "@/lib/privacy/registers";
import { setMasterKeyForTests } from "@/lib/secrets";
import { createTestDb } from "./helpers/db";
import { BASE_URL, createReadyOrg } from "./helpers/fixtures";

describe("children mode, Free edition: age gate (K1)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let org: Awaited<ReturnType<typeof createReadyOrg>>;
  let site: Site;
  let plain: Site;
  const outbox: MailMessage[] = [];
  let n = 0;
  const childId = () => `child-browser-${String(++n).padStart(8, "0")}`;

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 31));
    setMailTransport(async (m) => {
      outbox.push(m);
    });
    db = await createTestDb();
    org = await createReadyOrg(db, "owner@coaching.test", "Bright Clinic", "clinic"); // clinic preset: analytics (tracking) + WhatsApp offers (consent)
    expect((await publishNotice(org.t, { baseUrl: BASE_URL, userId: org.userId })).ok).toBe(true);
    site = (await getSite(org.t, await createSite(org.t, { name: "Coaching", domain: "bright.example.in", allowedOrigins: [], childrenMode: true })))!;
    plain = (await getSite(org.t, await createSite(org.t, { name: "Shop", domain: "shop.example.in", allowedOrigins: [], childrenMode: false })))!;
    await org.t.updateOrg({ children_mode: 0 });
  });
  afterAll(async () => {
    setMailTransport(null);
    setMasterKeyForTests(null);
    await db.destroy();
  });

  it("K1-01 tracking, analytics and ads purposes are marked and never offered to a child", async () => {
    expect(isChildBlockedPurpose({ is_tracking: 1, purpose_key: "x" })).toBe(true);
    expect(isChildBlockedPurpose({ is_tracking: 0, purpose_key: "website_analytics" })).toBe(true);
    expect(isChildBlockedPurpose({ is_tracking: 0, purpose_key: "remarketing_ads" })).toBe(true);
    expect(isChildBlockedPurpose({ is_tracking: 0, purpose_key: "parent_updates" })).toBe(false);
    const config = await buildSiteConfig(org.t, site, BASE_URL);
    expect(config.children).toBe(true);
    expect("parent" in config.links).toBe(false); // the parental-consent flow is in the Pro edition
    const analytics = config.purposes.find((p) => p.key === "analytics");
    expect(analytics?.tracking).toBe(true);
    const allowed = (await childPurposes(org.t, site.id)).map((p) => p.purpose_key);
    expect(allowed).not.toContain("analytics");
    expect(allowed.length).toBeGreaterThan(0);
    expect((await buildSiteConfig(org.t, plain, BASE_URL)).children).toBe(false);
  });

  it("K1-01 an under-18 visitor's own choices are never recorded", async () => {
    const r = await recordConsent(org.t, site, { subjectRef: childId(), choices: { analytics: true }, lang: "en", channel: "banner", noticeVersion: 1, under18: true });
    expect(r).toEqual({ ok: false, error: "children" });
    expect(await org.t.selectFrom("consent_events").select("id").execute()).toEqual([]);
  });

  it("adulthood from a year of birth is accepted only when 18 years are certainly complete", () => {
    const now = new Date("2026-11-19T00:00:00Z");
    expect(adultByYearOfBirth(2007, now)).toBe(true);
    expect(adultByYearOfBirth(2008, now)).toBe(false);
    expect(adultByYearOfBirth(1899, now)).toBe(false);
  });

  it("tenant scope: tracking purposes of the org are listed by the shared rule", async () => {
    const all = await listPurposes(org.t);
    expect(all.filter((p) => isChildBlockedPurpose(p)).map((p) => p.purpose_key)).toContain("analytics");
  });
});
