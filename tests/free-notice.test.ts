import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFreeNoticeInput, generatorSectors, identifierOptions, readFreeNoticeForm, type FreeNoticeAnswers } from "@/core/free-notice";
import { renderNotice, renderStandaloneHtml, validateNoticeInput } from "@/core/notice/render";
import { SECTOR_PRESETS, SECTORS } from "@/core/presets";

/** P6 free notice generator (no login): L-NG-01..04. */

const answers = (over: Partial<FreeNoticeAnswers> = {}): FreeNoticeAnswers => ({
  sector: "coaching",
  orgName: "Bright Future Classes",
  legalName: "",
  goodsEn: "",
  goodsHi: "",
  website: "brightfuture.example.in",
  noticeUrl: "",
  purposes: SECTOR_PRESETS.coaching.purposes.map((p) => p.key),
  childrenMode: true,
  contactName: "Centre Manager",
  contactDesignation: "",
  contactEmail: "privacy@brightfuture.example.in",
  contactPhone: "+91 90000 00000",
  contactAddress: "",
  responseDays: 30,
  identifiers: ["email", "mobile"],
  ...over,
});

describe("L-NG-01 questionnaire → notice input", () => {
  it("builds an input the renderer accepts, using the sector preset for purposes, items, vendors and retention", () => {
    const r = buildFreeNoticeInput(answers());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The only difference from a publishable notice: withdrawal and requests go to mailto: links instead of hosted pages.
    expect(validateNoticeInput(r.input)).toEqual([{ code: "links" }]);
    expect(r.input.org.legalName).toBe("Bright Future Classes");
    expect(r.input.org.websiteUrl).toBe("https://brightfuture.example.in/");
    expect(r.input.links.notice).toBe("https://brightfuture.example.in/");
    expect(r.input.org.goodsServices).toEqual(SECTOR_PRESETS.coaching.goodsServices);
    expect(r.input.purposes.map((p) => p.key)).toEqual(SECTOR_PRESETS.coaching.purposes.map((p) => p.key));
    expect(r.input.purposes.every((p) => p.items.length > 0)).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("keeps only ticked purposes and ignores unknown purpose keys", () => {
    const keys = SECTOR_PRESETS.coaching.purposes.map((p) => p.key);
    const r = buildFreeNoticeInput(answers({ purposes: [keys[0], "steal_data"] }));
    expect(r.ok && r.input.purposes.map((p) => p.key)).toEqual([keys[0]]);
  });

  it.each([
    [{ orgName: "" }, "orgName"],
    [{ website: "" }, "website"],
    [{ website: "ftp://x.example" }, "website"],
    [{ noticeUrl: "javascript:alert(1)" }, "noticeUrl"],
    [{ purposes: [] }, "purposes"],
    [{ contactName: "" }, "contactName"],
    [{ contactEmail: "nope" }, "contactEmail"],
    [{ identifiers: [] }, "identifiers"],
  ])("rejects %o with %s", (over, error) => {
    expect(buildFreeNoticeInput(answers(over as Partial<FreeNoticeAnswers>))).toEqual({ ok: false, error });
  });

  it("reads the form: caps the response period at 90 days, drops unknown identifiers and sectors", () => {
    const form = new Map<string, unknown[]>([
      ["sector", ["casino"]],
      ["org_name", ["  Shop   One "]],
      ["response_days", ["365"]],
      ["identifiers", ["email", "aadhaar", "mobile"]],
      ["purposes", ["contact_form"]],
      ["children", ["on"]],
    ]);
    const a = readFreeNoticeForm(
      (n) => form.get(n)?.[0] ?? null,
      (n) => form.get(n) ?? [],
    );
    expect(a.sector).toBe("other");
    expect(a.orgName).toBe("Shop One");
    expect(a.responseDays).toBe(90);
    expect(a.identifiers).toEqual(["email", "mobile"]);
    expect(a.childrenMode).toBe(true);
  });

  it("warns when the Hindi notice would repeat a custom English description", () => {
    const r = buildFreeNoticeInput(answers({ goodsEn: "Maths and science coaching for classes 8 to 12." }));
    expect(r.ok && r.warnings).toEqual(["goodsHiMissing"]);
    const r2 = buildFreeNoticeInput(answers({ goodsEn: "Maths coaching.", goodsHi: "गणित की कोचिंग।" }));
    expect(r2.ok && r2.warnings).toEqual([]);
  });
});

describe("L-NG-02 rendered draft (EN + HI)", () => {
  const built = buildFreeNoticeInput(answers());
  if (!built.ok) throw new Error("fixture");
  const [en, hi] = renderNotice(built.input);

  it("produces both languages with the draft / not-legal-advice banner and a fingerprint", () => {
    expect(en.lang).toBe("en");
    expect(hi.lang).toBe("hi");
    expect(en.bodyMd).toMatch(/draft — pending lawyer review/i);
    expect(en.bodyMd).toMatch(/not legal advice/i);
    expect(hi.bodyMd).toMatch(/कानूनी सलाह नहीं/);
    expect(en.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lists every data item, sends withdrawal and rights requests to the business email, and includes the Board and children sections", () => {
    expect(en.bodyMd).toContain("mailto:privacy@brightfuture.example.in");
    expect(en.bodyMd).toMatch(/Data Protection Board/);
    expect(en.bodyMd).toMatch(/children|under 18|child/i);
    for (const item of ["Student's name", "Parent or guardian's mobile number"]) expect(en.bodyMd).toContain(item.replace(/'/g, "'"));
  });

  it("the downloadable page is standalone: no scripts, external styles, images or frames", () => {
    const html = renderStandaloneHtml(en);
    expect(html).not.toMatch(/<script|<link|<img|<iframe/i);
    expect(html).toContain('<html lang="en">');
  });

  it("escapes business input so it cannot inject HTML or links", () => {
    const r = buildFreeNoticeInput(answers({ orgName: '<img src=x onerror=alert(1)> [click](https://evil.example)' }));
    if (!r.ok) throw new Error("fixture");
    const html = renderStandaloneHtml(renderNotice(r.input)[0]);
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="https://evil.example"');
  });
});

describe("L-NG-03 form data for every sector", () => {
  it("offers every sector with its purposes and items in both languages", () => {
    for (const lang of ["en", "hi"] as const) {
      const sectors = generatorSectors(lang);
      expect(sectors.map((s) => s.id)).toEqual([...SECTORS]);
      for (const s of sectors) {
        expect(s.purposes.length).toBeGreaterThan(0);
        if (lang === "hi") for (const p of s.purposes) expect(p.name).toMatch(/[ऀ-ॿ]/);
      }
      expect(identifierOptions(lang).length).toBeGreaterThan(3);
    }
  });

  it("every sector preset renders a valid notice with all purposes ticked", () => {
    for (const sector of SECTORS) {
      // "Other" has no standard description, so the business must write one.
      const goods = sector === "other" ? { goodsEn: "Mobile phone repairs.", goodsHi: "मोबाइल फ़ोन की मरम्मत।" } : {};
      if (sector === "other") expect(buildFreeNoticeInput(answers({ sector }))).toEqual({ ok: false, error: "goods" });
      const r = buildFreeNoticeInput(answers({ sector, ...goods, purposes: SECTOR_PRESETS[sector].purposes.map((p) => p.key) }));
      expect(r.ok, sector).toBe(true);
      if (r.ok) expect(validateNoticeInput(r.input).filter((i) => i.code !== "links"), sector).toEqual([]);
    }
  });
});

describe("L-NG-04 nothing stored", () => {
  it("the generator action and core never touch the database", () => {
    for (const file of ["src/app/actions/free-notice.ts", "src/core/free-notice.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
      expect(src, file).not.toMatch(/@\/lib\/db|getDb|insertInto|kysely/);
    }
  });
});
