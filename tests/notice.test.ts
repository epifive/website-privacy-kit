import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dataItemLabel } from "@/core/data-items";
import { renderMarkdown } from "@/core/notice/markdown";
import {
  buildContactBlock,
  buildLegacyMessage,
  buildNoticeMarkdown,
  buildShortNotice,
  clampResponseDays,
  renderNotice,
  renderStandaloneHtml,
  sha256Hex,
  validateNoticeInput,
} from "@/core/notice/render";
import { BOARD_URL, TEMPLATE_STATUS, TEMPLATES } from "@/core/notice/templates";
import { getNoticeVersion, listNoticeVersions, publishNotice, verifyNoticeVersion } from "@/lib/privacy/notices";
import { deleteContact, listPurposes, updatePurpose } from "@/lib/privacy/registers";
import { createTestDb } from "./helpers/db";
import { BASE_URL, createReadyOrg, sampleInput } from "./helpers/fixtures";

const input = sampleInput();
const en = buildNoticeMarkdown(input, "en");
const hi = buildNoticeMarkdown(input, "hi");

describe("N1 — notice states data + purpose, withdrawal, grievance and Board complaint (Act s.5(1))", () => {
  it("N1-01 lists the data items of every purpose", () => {
    for (const p of input.purposes) {
      expect(en).toContain(p.name.en);
      for (const item of p.items) expect(en).toContain(`- ${dataItemLabel(item, "en")}`);
    }
  });

  it("N1-02 contains the withdraw link and explains withdrawal", () => {
    expect(en).toContain(TEMPLATES.en.withdrawHeading);
    expect(en).toContain(`(${input.links.withdraw})`);
    expect(en).toMatch(/as easy as giving consent/);
  });

  it("N1-03 contains the grievance contact and the rights link", () => {
    expect(en).toContain(TEMPLATES.en.contactGrievance);
    expect(en).toContain("Anita Sharma");
    expect(en).toContain("mailto:anita@sharmaphysio.in");
    expect(en).toContain(`(${input.links.rights})`);
  });

  it("N1-04 explains how to complain to the Data Protection Board", () => {
    expect(en).toContain(TEMPLATES.en.boardHeading);
    expect(en).toContain(BOARD_URL);
  });

  it("N1-05 publishing is refused while a required element is missing", () => {
    expect(validateNoticeInput(input)).toEqual([]);
    const noContact = validateNoticeInput(sampleInput({ contacts: { grievance: null, dpo: null } }));
    expect(noContact.map((i) => i.code)).toContain("no_contact");
    const noLinks = validateNoticeInput(sampleInput({ links: { notice: "", withdraw: "", rights: "" } }));
    expect(noLinks.map((i) => i.code)).toContain("links");
    expect(validateNoticeInput(sampleInput({ purposes: [] })).map((i) => i.code)).toContain("no_purposes");
  });
});

describe("N2 — standalone, itemised notice (Rule 3(a), 3(b))", () => {
  const rendered = renderNotice(input);
  const html = renderStandaloneHtml(rendered[0], { lang: "hi", href: "?lang=hi" });

  it("N2-01 renders as a standalone page with no external dependency", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script|<link|<iframe|<img|@import|url\(|src=/i);
    expect(html).toContain("<style>");
    expect(html).toContain(`<meta name="notice-sha256" content="${rendered[0].sha256}">`);
    // Does not depend on another document to be understood.
    expect(en).not.toMatch(/see our (privacy )?policy|terms and conditions/i);
  });

  it("N2-02 renders each data item as its own list item", () => {
    const fragment = renderMarkdown(en);
    for (const p of input.purposes) for (const item of p.items) expect(fragment).toContain(`<li>${dataItemLabel(item, "en")}</li>`);
  });

  it("N2-03 describes the goods or services", () => {
    expect(en).toContain("Physiotherapy and rehabilitation.");
    expect(hi).toContain("फ़िज़ियोथेरेपी और पुनर्वास।");
  });

  it("N2-04 a purpose without data items cannot be published", () => {
    const bad = sampleInput({ purposes: [{ ...input.purposes[0], items: [] }] });
    expect(validateNoticeInput(bad)).toContainEqual({ code: "purpose_no_items", ref: "appointments" });
  });

  it("N2-05 business text cannot inject HTML or formatting", () => {
    const fragment = renderMarkdown(en);
    expect(fragment).not.toContain("<Clinic>");
    expect(fragment).toContain("&lt;Clinic&gt; *Best*");
    const evil = sampleInput({ org: { ...input.org, name: "[x](javascript:alert(1)) <script>alert(1)</script>" } });
    const evilHtml = renderMarkdown(buildNoticeMarkdown(evil, "en"));
    expect(evilHtml).not.toMatch(/<script|href="javascript/i);
  });
});

describe("N3 — communication links for withdrawal, rights and the Board (Rule 3(c))", () => {
  it("N3-01 auto-inserts the hosted withdraw, rights and notice links in both languages", () => {
    for (const doc of [en, hi]) {
      expect(doc).toContain(`(${input.links.withdraw})`);
      expect(doc).toContain(`(${input.links.rights})`);
      expect(doc).toContain(`(${input.links.notice})`);
    }
  });

  it("N3-02 includes the website address", () => {
    expect(en).toContain("(https://sharmaphysio.in)");
  });

  it("N3-03 includes the Board link in both languages", () => {
    expect(hi).toContain(TEMPLATES.hi.boardHeading);
    expect(hi).toContain(BOARD_URL);
  });

  it("N5-01/02 legacy-customer message (s.5(2)) for email, SMS and WhatsApp carries the notice and withdraw links", () => {
    for (const lang of ["en", "hi"] as const) {
      const email = buildLegacyMessage(input, lang, "email");
      expect(email.subject).toBeTruthy();
      expect(email.body).toContain(input.links.notice);
      expect(email.body).toContain(input.links.withdraw);
      expect(buildLegacyMessage(input, lang, "whatsapp").body).toContain(input.links.withdraw);
      expect(buildLegacyMessage(input, lang, "sms").body).toContain(input.links.notice);
    }
    expect(buildShortNotice(input, "en")).toContain(input.links.withdraw);
  });
});

describe("N4 — English + Hindi, plain language, contact in every version (Act s.5(3), s.6(3))", () => {
  it("N4-01 produces an English and a Hindi version", () => {
    expect(renderNotice(input).map((r) => r.lang)).toEqual(["en", "hi"]);
  });

  it("N4-03 the Hindi version is Devanagari and contains no untranslated English template text", () => {
    expect(hi).toMatch(/[ऀ-ॿ]/);
    const t = TEMPLATES.en;
    const fixed = [t.dataHeading, t.withdrawHeading, t.withdrawText, t.rightsHeading, ...t.rightsList, t.contactHeading, t.boardHeading, t.boardText, t.languagesHeading, t.purposeItems, t.draftBanner, t.basis.consent, t.basis.s7a_voluntary];
    for (const sentence of fixed) expect(hi).not.toContain(sentence);
    for (const p of input.purposes) for (const item of p.items) expect(hi).toContain(`- ${dataItemLabel(item, "hi")}`);
    // A purpose or custom item without Hindi blocks publishing.
    const missingHi = sampleInput({ purposes: [{ ...input.purposes[1], name: { en: "Offers", hi: "Offers" } }] });
    expect(validateNoticeInput(missingHi).map((i) => i.code)).toContain("purpose_translation");
    const itemNoHi = sampleInput({ purposes: [{ ...input.purposes[1], items: [{ en: "Shoe size", hi: "" }] }] });
    expect(validateNoticeInput(itemNoHi).map((i) => i.code)).toContain("item_translation");
  });

  it("N4-04 the contact appears in both languages (R4-01)", () => {
    expect(hi).toContain(TEMPLATES.hi.contactGrievance);
    expect(hi).toContain("anita@sharmaphysio.in");
    expect(buildContactBlock(input, "hi")).toContain("Anita Sharma");
  });

  it("marks the template as a draft pending lawyer review", () => {
    expect(TEMPLATE_STATUS).toBe("draft-pending-lawyer-review");
    expect(en).toMatch(/draft — pending lawyer review/);
    expect(hi).toMatch(/ड्राफ़्ट — वकील की समीक्षा बाकी/);
    expect(en).toMatch(/Not legal advice/);
  });
});

describe("R2/R3/K1 notice content", () => {
  it("R2-02 lists the identifiers needed to make a request (Rule 14(5))", () => {
    expect(en).toContain(TEMPLATES.en.identifiers.mobile);
    expect(hi).toContain(TEMPLATES.hi.identifiers.customer_id);
  });

  it("R3-02 the response period is capped at 90 days", () => {
    expect(clampResponseDays(120)).toBe(90);
    expect(clampResponseDays("abc")).toBe(30);
    expect(clampResponseDays(45)).toBe(45);
    expect(validateNoticeInput(sampleInput({ rights: { responseDays: 91, identifiers: ["mobile"] } })).map((i) => i.code)).toContain("response_days");
    expect(en).toContain("within 30 days");
  });

  it("K1-02 adds the children section only when children mode is on", () => {
    expect(en).not.toContain(TEMPLATES.en.childrenHeading);
    expect(buildNoticeMarkdown(sampleInput({ childrenMode: true }), "en")).toContain(TEMPLATES.en.childrenText);
  });
});

describe("N4-02 immutable, hashed versions (database)", () => {
  let ctx: Awaited<ReturnType<typeof createReadyOrg>>;
  let db: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    db = await createTestDb();
    ctx = await createReadyOrg(db, "owner@clinic.test", "Sharma Physio");
  });
  afterAll(() => db.destroy());

  it("publishes EN + HI rows with their own SHA-256", async () => {
    const result = await publishNotice(ctx.t, { baseUrl: BASE_URL, userId: ctx.userId });
    expect(result.ok).toBe(true);
    const rows = await ctx.t.selectFrom("notice_versions").selectAll().execute();
    expect(rows.map((r) => r.lang).sort()).toEqual(["en", "hi"]);
    for (const r of rows) {
      expect(r.sha256).toBe(sha256Hex(r.body_md));
      expect(verifyNoticeVersion(r)).toBe(true);
      expect(r.template_version).toContain(TEMPLATE_STATUS);
    }
    expect(rows[0].sha256).not.toBe(rows[1].sha256);
  });

  it("rejects UPDATE on a published version (database trigger)", async () => {
    await expect(sql`UPDATE notice_versions SET body_md = 'tampered'`.execute(db)).rejects.toThrow(/immutable/);
    const row = await getNoticeVersion(ctx.t, "en");
    expect(row && verifyNoticeVersion(row)).toBe(true);
    expect(verifyNoticeVersion({ ...row!, body_md: `${row!.body_md} ` })).toBe(false);
  });

  it("a new publish creates version 2 and keeps version 1 unchanged", async () => {
    const before = await getNoticeVersion(ctx.t, "en", 1);
    const [first] = await listPurposes(ctx.t);
    await updatePurpose(ctx.t, first.id, {
      key: first.purpose_key,
      nameEn: "Changed name",
      nameHi: "बदला हुआ नाम",
      descEn: first.desc_en,
      descHi: first.desc_hi,
      basis: first.basis,
      items: [{ key: "name" }],
      vendorIds: [],
      retentionRuleId: null,
      siteId: null,
      isTracking: false,
      active: true,
    });
    const second = await publishNotice(ctx.t, { baseUrl: BASE_URL, userId: ctx.userId });
    expect(second).toMatchObject({ ok: true, version: 2 });
    const after = await getNoticeVersion(ctx.t, "en", 1);
    expect(after).toEqual(before);
    expect((await getNoticeVersion(ctx.t, "en"))?.body_md).toContain("Changed name");
    expect((await listNoticeVersions(ctx.t)).map((v) => v.version)).toEqual([2, 1]);
  });

  it("refuses to publish when the grievance contact is removed (N1-05)", async () => {
    await deleteContact(ctx.t, "grievance");
    const result = await publishNotice(ctx.t, { baseUrl: BASE_URL, userId: ctx.userId });
    expect(result.ok).toBe(false);
    expect((await listNoticeVersions(ctx.t)).length).toBe(2);
  });
});
