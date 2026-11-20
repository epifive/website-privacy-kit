import { describe, expect, it } from "vitest";
import { alternateGuide, extractFaqs, getGuide, listGuides, parseFrontMatter, renderGuide, rewriteHref, slugifyHeading } from "@/lib/guides";
import { guideMetadata } from "@/lib/guide-meta";

/** P6 SEO guides (plan §11): L-SEO-01..05. */

const guides = listGuides();

describe("L-SEO-01 content loads", () => {
  it("has the 10 English and 3 Hindi guides with title, description, review date and official sources", () => {
    expect(guides.filter((g) => g.lang === "en")).toHaveLength(10);
    expect(guides.filter((g) => g.lang === "hi")).toHaveLength(3);
    for (const g of guides) {
      expect(g.title.length, g.slug).toBeGreaterThan(10);
      expect(g.description.length, g.slug).toBeGreaterThan(50);
      expect(g.lastReviewed, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.sources.some((s) => s.includes("meity.gov.in")), g.slug).toBe(true);
      expect(g.heading.length).toBeGreaterThan(5);
      expect(g.body).not.toMatch(/^---/);
      if (g.lang === "hi") expect(g.heading).toMatch(/[ऀ-ॿ]/);
    }
  });

  it("parses quoted values, lists and one level of nested maps", () => {
    const { data, body } = parseFrontMatter('---\ntitle: "A: b"\nalternate:\n  hi: /hi/x\nlist:\n  - one\n  - "two"\nempty: null\n---\n# H\n');
    expect(data).toEqual({ title: "A: b", alternate: { hi: "/hi/x" }, list: ["one", "two"], empty: null });
    expect(body).toBe("# H\n");
  });

  it("pairs every Hindi guide with its English original", () => {
    for (const g of guides.filter((x) => x.lang === "hi")) expect(alternateGuide(g)?.lang).toBe("en");
    expect(alternateGuide(getGuide("en", "dpdp-for-clinics")!)).toBeNull();
  });
});

describe("L-SEO-02 rendering", () => {
  it("renders every guide with a table of contents of unique heading ids, and no raw HTML from the source", () => {
    for (const g of guides) {
      const { html, toc } = renderGuide(g);
      expect(toc.length, g.slug).toBeGreaterThan(2);
      const ids = [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, g.slug).toBe(ids.length);
      for (const item of toc) expect(ids).toContain(item.id);
      expect(html).not.toMatch(/<script|<iframe|onerror=/i);
      expect(html).not.toMatch(/^<h1/m);
    }
  });

  it("rewrites the content repo URLs to this app's routes and never links to /dpdp/ or /website-privacy-kit", () => {
    for (const g of guides) {
      const { html } = renderGuide(g);
      expect(html, g.slug).not.toMatch(/href="\/(hi\/)?dpdp\//);
      expect(html, g.slug).not.toContain('href="/website-privacy-kit"');
      expect(html, g.slug).toMatch(g.lang === "hi" ? /href="\/hi\/readiness"/ : /href="\/readiness"/);
      for (const m of html.matchAll(/href="(\/(?:hi\/)?guides\/[^"#]+)/g)) {
        const [, lang, slug] = /^\/(?:(hi)\/)?guides\/(.+)$/.exec(m[1])!;
        expect(getGuide(lang === "hi" ? "hi" : "en", slug), `${g.slug} → ${m[1]}`).not.toBeNull();
      }
    }
    expect(rewriteHref("/dpdp/dpdp-for-clinics", "hi")).toBe("/guides/dpdp-for-clinics");
    expect(rewriteHref("/dpdp/dpdp-deadline-13-may-2027", "hi")).toBe("/hi/guides/dpdp-deadline-13-may-2027");
    expect(rewriteHref("/hi/dpdp/dpdp-checklist-small-business-2027", "en")).toBe("/hi/guides/dpdp-checklist-small-business-2027");
    expect(rewriteHref("/website-privacy-kit", "hi")).toBe("/dashboard/setup");
    expect(rewriteHref("https://www.meity.gov.in/x.pdf", "en")).toBe("https://www.meity.gov.in/x.pdf");
  });

  it("external links open safely; tables are wrapped for small screens", () => {
    const { html } = renderGuide(getGuide("en", "consent-manager-vs-consent-tool")!);
    expect(html).toMatch(/<a href="https:\/\/www\.meity\.gov\.in[^"]*" rel="noopener noreferrer" target="_blank">/);
    expect(html).toContain('<div class="table-wrap"');
  });

  it("slugifies headings, with a stable fallback for Devanagari", () => {
    expect(slugifyHeading("What the law says about **consent**", 0)).toBe("what-the-law-says-about-consent");
    expect(slugifyHeading("क्या कब लागू होता है", 3)).toBe("section-4");
  });
});

describe("L-SEO-03 FAQ structured data", () => {
  it("extracts at least 4 question/answer pairs as plain text from every guide's FAQ section", () => {
    for (const g of guides) {
      const faqs = extractFaqs(g.body);
      expect(faqs.length, g.slug).toBeGreaterThanOrEqual(4);
      for (const f of faqs) {
        expect(f.q).not.toMatch(/\*\*|\]\(/);
        expect(f.a).not.toMatch(/\]\(|\*\*/);
        expect(f.a.length).toBeGreaterThan(10);
      }
    }
  });

  it("returns nothing when there is no FAQ section", () => {
    expect(extractFaqs("## Intro\n\n**Bold** text\n")).toEqual([]);
  });
});

describe("L-SEO-04 canonical and hreflang", () => {
  it("self-canonical; hreflang en/hi/x-default only where both languages exist", () => {
    const both = guideMetadata("hi", "dpdp-deadline-13-may-2027");
    expect(both.alternates?.canonical).toBe("/hi/guides/dpdp-deadline-13-may-2027");
    expect(both.alternates?.languages).toEqual({
      hi: "/hi/guides/dpdp-deadline-13-may-2027",
      en: "/guides/dpdp-deadline-13-may-2027",
      "x-default": "/guides/dpdp-deadline-13-may-2027",
    });
    const single = guideMetadata("en", "dpdp-for-clinics");
    expect(single.alternates?.canonical).toBe("/guides/dpdp-for-clinics");
    expect(single.alternates?.languages).toBeUndefined();
    expect(guideMetadata("hi", "dpdp-for-clinics")).toEqual({});
  });
});

describe("L-SEO-05 guardrails (plan §3.2–3.3)", () => {
  it("every guide carries 'not legal advice', never claims compliance or guarantees, and never calls EpiFive a Consent Manager", () => {
    for (const g of guides) {
      expect(g.body, g.slug).toMatch(g.lang === "hi" ? /कानूनी सलाह नहीं/ : /Not legal advice/);
      expect(g.body, g.slug).not.toMatch(/DPDP[- ]compliant|we guarantee|guaranteed|EpiFive is a Consent Manager|certified by/i);
      for (const m of g.body.matchAll(/[^.\n।]*EpiFive[^.\n।]*Consent Manager[^.\n।]*/g)) expect(m[0], g.slug).toMatch(/\bnot\b|नहीं/i);
    }
  });
});
