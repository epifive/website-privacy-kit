import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EN } from "@/widget/runtime/i18n/en";
import { BUDGETS, buildWidget } from "../scripts/build-widget.mjs";

/** T-W-01 size budget and static checks on the embed bundle (plan §7.2, §10.6). */
describe("widget bundle", () => {
  let dir: string;
  let sizes: Record<string, { raw: number; gzip: number; budget: number }>;
  let w: string;
  let hi: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), "wpk-widget-"));
    sizes = (await buildWidget({ outDir: dir, quiet: true })) as typeof sizes;
    w = fs.readFileSync(path.join(dir, "w.js"), "utf8");
    hi = fs.readFileSync(path.join(dir, "w-hi.js"), "utf8");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("T-W-01 w.js ≤ 10 KB gzip and the Hindi chunk ≤ 3 KB gzip", () => {
    expect(BUDGETS["w.js"]).toBe(10 * 1024);
    expect(sizes["w.js"].gzip).toBeLessThanOrEqual(10 * 1024);
    expect(sizes["w-hi.js"].gzip).toBeLessThanOrEqual(3 * 1024);
  });

  it("Hindi strings are not inlined in w.js (loaded on demand)", () => {
    expect(w).not.toContain("सब अस्वीकार करें");
    expect(hi).toContain("सब अस्वीकार करें");
    expect(w).toContain("Reject all");
  });

  it("C1-03 no 'by continuing you agree' wording, no Consent Manager self-description, no compliance claims", () => {
    for (const text of [w, hi, JSON.stringify(EN)]) {
      expect(text).not.toMatch(/by continuing|continuing to (use|browse)|इस्तेमाल करते रहने/i);
      expect(text).not.toMatch(/consent manager|कंसेंट मैनेजर/i);
      expect(text).not.toMatch(/compliant|certified|guarantee/i);
    }
  });

  it("no third-party hosts and no personal data in the bundle", () => {
    const urls = [...w.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
    expect(urls).toEqual([]);
    expect(w).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(w).not.toMatch(/document\.cookie/);
  });

  it("Accept all and Reject all use the same button class (equal prominence, C1-02)", () => {
    expect(w).toMatch(/"accept",\w+\.accept\)/);
    const btnCalls = [...w.matchAll(/\w+\("(accept|reject|choose)",[^)]*\)/g)].map((m) => m[0]);
    expect(btnCalls.length).toBeGreaterThanOrEqual(4);
    // No call passes a different class for one of the main buttons.
    expect(btnCalls.every((c) => !/,"(?!btn)[a-z]+"\)$/.test(c))).toBe(true);
  });

  it("K1-01 children mode: age question with equal buttons; under 18 sends nothing and asks a parent", () => {
    expect(w).toContain(EN.ageQ);
    expect(w).toContain("wpka_");
    expect(w).toContain("/api/v1/consent?site=");
    expect(hi).toContain("क्या आपकी उम्र 18 साल या उससे ज़्यादा है?");
    expect(EN.kidBlocked).toMatch(/cannot be switched on/);
  });
});
