import { describe, expect, it } from "vitest";
import { brandFrom, EPIFIVE_BRAND } from "@/lib/branding";
import { EDITION } from "@/lib/edition-meta";
import { hostedLinks, renderHub } from "@/lib/privacy/hosted-pages";

/** BRAND-01..02: the branding line under the banner and on the privacy hub (Free: fixed; Pro: white-label). */
describe("branding", () => {
  it("BRAND-01 Free shows the EpiFive link; Pro shows the white-label setting, nothing when empty, https links only", () => {
    if (EDITION === "free") {
      expect(brandFrom({ branding_text: "", branding_url: "" })).toEqual(EPIFIVE_BRAND);
      expect(brandFrom({ branding_text: "Acme", branding_url: "https://acme.example.in" })).toEqual(EPIFIVE_BRAND);
      expect(EPIFIVE_BRAND.url).toMatch(/^https:\/\//);
    } else {
      expect(brandFrom({ branding_text: "  ", branding_url: "https://acme.example.in" })).toBeNull();
      expect(brandFrom({ branding_text: "Privacy by Acme Web Studio", branding_url: "https://acme.example.in" })).toEqual({ text: "Privacy by Acme Web Studio", url: "https://acme.example.in" });
      expect(brandFrom({ branding_text: "Acme", branding_url: "javascript:alert(1)" })).toEqual({ text: "Acme", url: "" });
    }
  });

  it("BRAND-02 the hub prints the branding escaped, and nothing without it", () => {
    const base = { lang: "en" as const, orgName: "X", links: hostedLinks("https://privacy.example.com", "x"), notice: null, contacts: { dpo: null, grievance: null }, responseDays: 30, identifiers: [] };
    const html = renderHub({ ...base, brand: { text: "Privacy <by> Acme", url: "https://acme.example.in" } });
    expect(html).toContain("Privacy &lt;by&gt; Acme");
    expect(html).toContain('href="https://acme.example.in"');
    expect(renderHub({ ...base, brand: null })).not.toContain("acme.example.in");
  });
});
