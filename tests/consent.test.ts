import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contrastRatio, defaultGcmMap, parseTheme, resolveGcmMap, themeIssues } from "@/core/consent/banner";
import { canonicalJson, eventHash, GENESIS_HASH, verifyChain, type ChainRow } from "@/core/consent/chain";
import type { Site } from "@/lib/db/schema";
import {
  buildSiteConfig,
  cleanPageUrl,
  consentLogCsv,
  createWithdrawToken,
  findSiteByPublicKey,
  getConsentState,
  listConsentEvents,
  originAllowed,
  readWithdrawToken,
  recordConsent,
  truncateIp,
  uaFamily,
  verifySiteChain,
  withdrawAll,
  withdrawListeners,
  type WithdrawnEvent,
} from "@/lib/privacy/consent";
import { publishNotice } from "@/lib/privacy/notices";
import { createSite, getSite, updatePurpose, getPurpose, listPurposes } from "@/lib/privacy/registers";
import { decryptForOrg, identifierHmac, setMasterKeyForTests } from "@/lib/secrets";
import { createTestDb } from "./helpers/db";
import { BASE_URL, createReadyOrg } from "./helpers/fixtures";

const SID = "b7d1c0a2-5f4e-4a8b-9c3d-1e2f3a4b5c6d";
const SID2 = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("consent records (C1–C3, N4-05)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let org: Awaited<ReturnType<typeof createReadyOrg>>;
  let site: Site;
  let site2: Site;
  const withdrawn: WithdrawnEvent[] = [];

  beforeAll(async () => {
    setMasterKeyForTests(Buffer.alloc(32, 7));
    withdrawListeners.set("test", (e) => {
      withdrawn.push(e);
    });
    db = await createTestDb();
    org = await createReadyOrg(db, "owner@clinic.test", "Sharma Physio", "clinic");
    const published = await publishNotice(org.t, { baseUrl: BASE_URL, userId: org.userId });
    expect(published.ok).toBe(true);
    site = (await getSite(org.t, await createSite(org.t, { name: "Clinic", domain: "sharmaphysio.in", allowedOrigins: ["https://booking.partner.example"], childrenMode: false })))!;
    site2 = (await getSite(org.t, await createSite(org.t, { name: "Blog", domain: "blog.example.org", allowedOrigins: [], childrenMode: false })))!;
  });
  afterAll(async () => {
    withdrawListeners.delete("test");
    setMasterKeyForTests(null);
    await db.destroy();
  });

  const banner = (choices: Record<string, boolean>, extra: Partial<Parameters<typeof recordConsent>[2]> = {}) =>
    recordConsent(org.t, site, { subjectRef: SID, choices, lang: "en", channel: "banner", noticeVersion: 1, pageUrl: "https://sharmaphysio.in/book?name=Asha#x", ip: "203.0.113.77", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36", widgetVersion: "1.0.0", ...extra });

  it("C1-04 config: consent purposes are toggles, necessary purposes are listed with their basis, no s.7(a) toggles", async () => {
    const config = await buildSiteConfig(org.t, site, BASE_URL);
    expect(config.notice?.version).toBe(1);
    expect(config.notice?.ids.en).toBeGreaterThan(0);
    expect(config.notice?.ids.hi).toBeGreaterThan(0);
    expect(config.purposes.map((p) => p.key).sort()).toEqual(["analytics", "marketing_whatsapp"]);
    expect(config.necessary.map((p) => p.key)).toContain("website_security");
    expect(config.necessary[0].basis.en).toMatch(/needed/);
    expect(config.purposes.map((p) => p.key)).not.toContain("appointments");
    expect(config.voluntary.map((p) => p.key)).toContain("appointments");
    const analytics = config.purposes.find((p) => p.key === "analytics")!;
    expect(analytics.items.en.length).toBeGreaterThan(0);
    expect(analytics.items.hi.length).toBe(analytics.items.en.length);
    expect(analytics.vendors).toContain("Google Analytics");
    expect(config.links.withdraw).toBe(`${BASE_URL}/p/${(await org.t.org())!.slug}/withdraw`);
    expect(config.contact?.email).toBe("privacy@clinic.example.in");
    expect(config.gcm.analytics_storage).toBe("analytics");
    expect(JSON.stringify(config)).not.toMatch(/by continuing/i);
  });

  it("config version changes when a purpose changes (ETag / cache busting)", async () => {
    const before = await buildSiteConfig(org.t, site, BASE_URL);
    expect((await buildSiteConfig(org.t, site, BASE_URL)).v).toBe(before.v);
    const p = (await listPurposes(org.t)).find((x) => x.purpose_key === "analytics")!;
    const row = (await getPurpose(org.t, p.id))!;
    const input = { key: row.purpose_key, nameEn: "Website statistics", nameHi: row.name_hi, descEn: row.desc_en, descHi: row.desc_hi, basis: row.basis, items: JSON.parse(row.data_items), vendorIds: JSON.parse(row.vendor_ids), retentionRuleId: row.retention_rule_id, siteId: null, isTracking: true, active: true };
    await updatePurpose(org.t, p.id, input);
    const after = await buildSiteConfig(org.t, site, BASE_URL);
    expect(after.v).not.toBe(before.v);
    await updatePurpose(org.t, p.id, { ...input, nameEn: row.name_en });
  });

  it("CORS allow-list: site domain, its subdomains and listed origins only", () => {
    expect(originAllowed(site, "https://sharmaphysio.in")).toBe(true);
    expect(originAllowed(site, "https://www.sharmaphysio.in")).toBe(true);
    expect(originAllowed(site, "http://shop.sharmaphysio.in:8080")).toBe(true);
    expect(originAllowed(site, "https://booking.partner.example")).toBe(true);
    expect(originAllowed(site, "https://evilsharmaphysio.in")).toBe(false);
    expect(originAllowed(site, "https://sharmaphysio.in.evil.test")).toBe(false);
    expect(originAllowed(site, "https://partner.example")).toBe(false);
    expect(originAllowed(site, "null")).toBe(false);
    expect(originAllowed(site, "file:///c:/x.html")).toBe(false);
  });

  it("finds a site only by a well-formed public key", async () => {
    expect((await findSiteByPublicKey(db, site.public_key))?.site.id).toBe(site.id);
    expect(await findSiteByPublicKey(db, "pk_live_doesnotexist0000")).toBeNull();
    expect(await findSiteByPublicKey(db, "' OR 1=1 --")).toBeNull();
  });

  it("C3-01 / N4-05 each event carries notice version, language, channel and minimised context", async () => {
    const r = await banner({ analytics: true, marketing_whatsapp: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recorded).toBe(2);
    const events = (await listConsentEvents(org.t, site.id)).rows;
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.notice_version).toBe(1);
      expect(e.notice_version_id).toBeGreaterThan(0);
      expect(e.lang).toBe("en");
      expect(e.channel).toBe("banner");
      expect(e.page_url).toBe("https://sharmaphysio.in/book");
      expect(e.ip_trunc).toBe("203.0.113.0/24");
      expect(e.ua_family).toBe("Chrome");
      expect(e.subject_kind).toBe("browser");
      expect(e.subject_enc).toBeNull();
    }
    expect(events.find((e) => e.purpose_key === "analytics")?.action).toBe("grant");
    expect(events.find((e) => e.purpose_key === "marketing_whatsapp")?.action).toBe("deny");

    const hi = await recordConsent(org.t, site, { subjectRef: SID2, choices: { analytics: false }, lang: "hi", channel: "banner", noticeVersion: 1 });
    expect(hi.ok && hi.events[0].lang).toBe("hi");
    const hiNotice = await org.t.selectFrom("notice_versions").select("id").where("lang", "=", "hi").where("version", "=", 1).executeTakeFirst();
    expect(hi.ok && hi.events[0].notice_version_id).toBe(hiNotice?.id);
  });

  it("C1 rejects unknown or non-consent purposes, bad subjects and unknown notice versions", async () => {
    expect(await banner({ appointments: true, website_security: true, nope: true })).toEqual({ ok: false, error: "purposes" });
    expect(await banner({ analytics: true }, { subjectRef: "short" })).toEqual({ ok: false, error: "subject" });
    expect(await banner({ analytics: true }, { noticeVersion: 99 })).toEqual({ ok: false, error: "notice" });
  });

  it("records only changes; an unchanged choice writes nothing", async () => {
    const r = await banner({ analytics: true, marketing_whatsapp: false });
    expect(r.ok && r.recorded).toBe(0);
  });

  it("C2-01 / C2-02 withdrawal creates a withdraw event, updates state and notifies listeners", async () => {
    const r = await banner({ analytics: false });
    expect(r.ok && r.events.map((e) => [e.purpose_key, e.action])).toEqual([["analytics", "withdraw"]]);
    const state = await getConsentState(org.t, site.id, SID);
    expect(state.find((s) => s.purpose_key === "analytics")?.status).toBe("withdrawn");
    expect(withdrawn.at(-1)).toMatchObject({ orgId: org.orgId, siteId: site.id, subjectRef: SID, purposes: ["analytics"], channel: "banner" });
  });

  it("form subjects: identifier is HMAC'd and encrypted, never stored in clear", async () => {
    const r = await recordConsent(org.t, site, { subject: { kind: "email", value: "  Asha.Rao@Example.com " }, choices: { marketing_whatsapp: true }, lang: "en", channel: "form", noticeVersion: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = r.events[0];
    expect(e.subject_kind).toBe("email");
    expect(e.subject_lookup_hmac).toBe(identifierHmac(org.orgId, "email", "asha.rao@example.com"));
    expect(r.subjectRef).toBe(`e_${e.subject_lookup_hmac!.slice(0, 40)}`);
    expect(e.subject_enc).not.toContain("asha");
    expect(decryptForOrg(org.orgId, e.subject_enc!)).toBe("asha.rao@example.com");
    expect(decryptForOrg(org.orgId + 1, e.subject_enc!)).toBeNull();
    const raw = await db.selectFrom("consent_events").selectAll().execute();
    expect(JSON.stringify(raw)).not.toMatch(/asha/i);
    expect(await recordConsent(org.t, site, { subject: { kind: "email", value: "not-an-email" }, choices: { marketing_whatsapp: true }, lang: "en", channel: "form", noticeVersion: 1 })).toEqual({ ok: false, error: "subject" });
  });

  it("C2-04 signed withdraw link: verifies, rejects tampering, withdraws without login", async () => {
    const form = await recordConsent(org.t, site, { subject: { kind: "phone", value: "98765 43210" }, choices: { marketing_whatsapp: true, analytics: true }, lang: "en", channel: "form", noticeVersion: 1 });
    expect(form.ok).toBe(true);
    if (!form.ok) return;
    const token = createWithdrawToken(site.id, form.subjectRef);
    expect(readWithdrawToken(token)).toEqual({ siteId: site.id, subjectRef: form.subjectRef });
    const [payload, sig] = token.split(".");
    expect(readWithdrawToken(`${Buffer.from(`${site2.id}.${form.subjectRef}`).toString("base64url")}.${sig}`)).toBeNull();
    expect(readWithdrawToken(`${payload}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(readWithdrawToken("garbage")).toBeNull();

    const before = withdrawn.length;
    const r = await withdrawAll(org.t, site, form.subjectRef, { channel: "link", lang: "en" });
    expect(r.ok && r.events.map((e) => e.action)).toEqual(["withdraw", "withdraw"]);
    expect(r.ok && r.events.every((e) => e.subject_kind === "phone" && e.subject_lookup_hmac === form.events[0].subject_lookup_hmac)).toBe(true);
    expect(withdrawn.length).toBe(before + 1);
    expect(withdrawn.at(-1)?.subjectKind).toBe("phone");
    const again = await withdrawAll(org.t, site, form.subjectRef, { channel: "link", lang: "en" });
    expect(again.ok && again.recorded).toBe(0);
  });

  it("C3-02 the hash chain verifies per site and matches the stored head", async () => {
    await recordConsent(org.t, site2, { subjectRef: SID, choices: { analytics: true }, lang: "en", channel: "banner", noticeVersion: 1 });
    const report = await verifySiteChain(org.t, site.id);
    expect(report.ok).toBe(true);
    expect(report.count).toBeGreaterThan(5);
    expect(report.head).toBe(report.storedHead?.hash);
    const other = await verifySiteChain(org.t, site2.id);
    expect(other).toMatchObject({ ok: true, count: 1 });
    const rows = await db.selectFrom("consent_events").selectAll().where("site_id", "=", site.id).orderBy("seq").execute();
    expect(rows[0].prev_hash).toBe(GENESIS_HASH);
    for (let i = 1; i < rows.length; i++) expect(rows[i].prev_hash).toBe(rows[i - 1].hash);
    expect(rows[0].hash).toBe(eventHash(GENESIS_HASH, rows[0]));
  });

  it("C3-03 consent_events is insert-only (UPDATE and DELETE are rejected by the database)", async () => {
    await expect(db.updateTable("consent_events").set({ action: "grant" }).where("site_id", "=", site.id).execute()).rejects.toThrow(/insert-only/);
    await expect(db.deleteFrom("consent_events").where("site_id", "=", site.id).execute()).rejects.toThrow(/insert-only/);
  });

  it("C3-03 tampering with any row breaks verification (changed field, deleted row, removed tail, forged row)", async () => {
    const tdb = await createTestDb();
    const o = await createReadyOrg(tdb, "t@clinic.test", "Tamper Clinic", "clinic");
    await publishNotice(o.t, { baseUrl: BASE_URL, userId: o.userId });
    const s = (await getSite(o.t, await createSite(o.t, { name: "T", domain: "tamper.example", allowedOrigins: [], childrenMode: false })))!;
    for (let i = 0; i < 6; i++) {
      await recordConsent(o.t, s, { subjectRef: `subject-${String(i).padStart(12, "0")}`, choices: { analytics: i % 2 === 0, marketing_whatsapp: true }, lang: i % 2 ? "hi" : "en", channel: "banner", noticeVersion: 1 });
    }
    expect((await verifySiteChain(o.t, s.id)).ok).toBe(true);
    // Simulate an administrator working around the triggers.
    await sql`DROP TRIGGER consent_events_no_update`.execute(tdb);
    await sql`DROP TRIGGER consent_events_delete_guard`.execute(tdb);
    const rows = await tdb.selectFrom("consent_events").selectAll().where("site_id", "=", s.id).orderBy("seq").execute();
    expect(rows.length).toBe(12);

    // 1. A changed field (grant → deny) in the middle.
    await tdb.updateTable("consent_events").set({ action: rows[4].action === "grant" ? "deny" : "grant" }).where("id", "=", rows[4].id).execute();
    let r = await verifySiteChain(o.t, s.id);
    expect(r).toMatchObject({ ok: false, error: { seq: rows[4].seq, reason: "hash" } });
    await tdb.updateTable("consent_events").set({ action: rows[4].action }).where("id", "=", rows[4].id).execute();
    expect((await verifySiteChain(o.t, s.id)).ok).toBe(true);

    // 2. A changed timestamp with a recomputed own hash still breaks the next link.
    const forgedHash = eventHash(rows[6].prev_hash, { ...rows[6], created_at: "2020-01-01T00:00:00.000Z" });
    await tdb.updateTable("consent_events").set({ created_at: "2020-01-01T00:00:00.000Z", hash: forgedHash }).where("id", "=", rows[6].id).execute();
    r = await verifySiteChain(o.t, s.id);
    expect(r).toMatchObject({ ok: false, error: { seq: rows[7].seq, reason: "prev_hash" } });
    await tdb.updateTable("consent_events").set({ created_at: rows[6].created_at, hash: rows[6].hash }).where("id", "=", rows[6].id).execute();

    // 3. A deleted row in the middle.
    await tdb.deleteFrom("consent_events").where("id", "=", rows[3].id).execute();
    r = await verifySiteChain(o.t, s.id);
    expect(r).toMatchObject({ ok: false, error: { reason: "sequence" } });
    const { id: _id, ...restored } = rows[3];
    void _id;
    await tdb.insertInto("consent_events").values(restored).execute();
    expect((await verifySiteChain(o.t, s.id)).ok).toBe(true);

    // 4. The newest row removed: only the stored chain head notices.
    await tdb.deleteFrom("consent_events").where("id", "=", rows[11].id).execute();
    r = await verifySiteChain(o.t, s.id);
    expect(r).toMatchObject({ ok: false, error: { reason: "head_mismatch" } });

    // Pure verifier: a forged row appended with a valid-looking prev_hash but a made-up hash.
    const chain = rows.slice(0, 3) as unknown as ChainRow[];
    const forged = { ...rows[3], hash: "f".repeat(64) } as unknown as ChainRow;
    expect(verifyChain([...chain, forged])).toMatchObject({ ok: false, error: { reason: "hash" } });
    await tdb.destroy();
  });

  it("C3-04 CSV export lists events in order with the verified chain head; formulas are neutralised", async () => {
    const csv = await consentLogCsv(org.t, site.id);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toMatch(/^seq,created_at,subject_ref/);
    const report = await verifySiteChain(org.t, site.id);
    expect(csv).toContain(`# chain_ok,true`);
    expect(csv).toContain(`# chain_head_hash,${report.head}`);
    expect(csv).not.toMatch(/asha/i);
    expect(canonicalJson({ b: 1, a: "=1+1" })).toBe('{"a":"=1+1","b":1}');
  });

  it("minimisation helpers: IP truncation, browser family, page URL", () => {
    expect(truncateIp("203.0.113.77")).toBe("203.0.113.0/24");
    expect(truncateIp("::ffff:10.1.2.3")).toBe("10.1.2.0/24");
    expect(truncateIp("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3::/48");
    expect(truncateIp("2001:db8::1")).toBe("2001:db8:0::/48");
    expect(truncateIp("unknown")).toBe("");
    expect(uaFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari mobile");
    expect(uaFamily("Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("Edge");
    expect(cleanPageUrl("https://x.in/a/b?email=a@b.c#top")).toBe("https://x.in/a/b");
    expect(cleanPageUrl("javascript:alert(1)")).toBe("");
  });

  it("banner theme: parsing, contrast checks and Consent Mode mapping", () => {
    expect(parseTheme('{"primary":"#ABCDEF","position":"center","lang":"hi","floating":false}')).toMatchObject({ primary: "#abcdef", position: "center", lang: "hi", floating: false });
    expect(parseTheme('{"primary":"red","position":"top"}')).toMatchObject({ primary: "#0f5c4d", position: "bottom" });
    expect(parseTheme("not json").lang).toBe("auto");
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(themeIssues(parseTheme("{}"))).toEqual([]);
    expect(themeIssues(parseTheme('{"text":"#eeeeee"}'))).toContain("text_contrast");
    expect(defaultGcmMap(["analytics", "ads", "marketing_email"])).toEqual({ analytics_storage: "analytics", ad_storage: "ads", ad_user_data: "ads", ad_personalization: "ads", personalization_storage: "" });
    expect(resolveGcmMap(parseTheme('{"gcm":{"analytics_storage":"","ad_storage":"gone"}}'), ["analytics", "ads"])).toMatchObject({ analytics_storage: "", ad_storage: "ads" });
  });
});
