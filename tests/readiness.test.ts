import { describe, expect, it } from "vitest";
import { MARKETING_TEXT } from "@/core/marketing/text";
import {
  applicableQuestions,
  conditionMatches,
  localizeBank,
  roundHalfUp,
  scoreReadiness,
  SECTOR_TO_PRESET,
  type Answers,
  type ProfileAnswers,
  type ReadinessData,
} from "@/core/readiness/model";
import { SECTORS } from "@/core/presets";
import { QUESTION_BANK, readinessData } from "@/lib/readiness";

/** P6 readiness checker (plan §11): L-RC-01..08. */

const data = readinessData("en");
const best = (d: ReadinessData, profile: ProfileAnswers): Answers =>
  Object.fromEntries(applicableQuestions(d.questions, profile).map((q) => [q.id, q.options.find((o) => o.multiplier === 1)!.id]));
const worst = (d: ReadinessData, profile: ProfileAnswers): Answers =>
  Object.fromEntries(applicableQuestions(d.questions, profile).map((q) => [q.id, q.options.find((o) => o.multiplier === 0)!.id]));

const websiteNoKids: ProfileAnswers = { p_sector: "online_store", p_channels: "website", p_customers: "1k_10k", p_children: "no", p_third_schedule: "none" };
const coachingKids: ProfileAnswers = { p_sector: "coaching", p_channels: "website", p_customers: "lt_1k", p_children: "yes", p_third_schedule: "none" };

describe("L-RC-01 question bank shape", () => {
  it("has 5 profile and 23 scored questions, 4 bands covering 0-100 without gaps", () => {
    expect(QUESTION_BANK.profile_questions).toHaveLength(5);
    expect(QUESTION_BANK.questions).toHaveLength(23);
    const bands = [...QUESTION_BANK.result_bands].sort((a, b) => a.min - b.min);
    expect(bands[0].min).toBe(0);
    expect(bands.at(-1)!.max).toBe(100);
    for (let i = 1; i < bands.length; i++) expect(bands[i].min).toBe(bands[i - 1].max + 1);
  });

  it("every option below 1 has an EN and HI recommendation with rule references; every question has a fully-in-place option", () => {
    for (const q of QUESTION_BANK.questions) {
      expect(q.weight).toBeGreaterThan(0);
      expect(q.options.some((o) => o.multiplier === 1)).toBe(true);
      expect(q.options.some((o) => o.multiplier === 0)).toBe(true);
      for (const o of q.options) {
        if (o.multiplier === null || o.multiplier >= 1) continue;
        expect(o.recommendation?.en.trim(), `${q.id}:${o.id}`).toBeTruthy();
        expect(o.recommendation?.hi, `${q.id}:${o.id}`).toMatch(/[ऀ-ॿ]/);
        expect(o.rule_refs.length, `${q.id}:${o.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("every applies_if and flag condition refers to a real profile question and option", () => {
    const profile = new Map(QUESTION_BANK.profile_questions.map((p) => [p.id, new Set(p.options.map((o) => o.id))]));
    const conds = [
      ...QUESTION_BANK.questions.flatMap((q) => (q.applies_if ? [q.applies_if] : [])),
      ...QUESTION_BANK.flags.flatMap((f) => ("all" in f.when ? f.when.all : [f.when])),
    ];
    for (const c of conds) {
      expect(profile.has(c.profile), c.profile).toBe(true);
      for (const id of c.in) expect(profile.get(c.profile)!.has(id), `${c.profile}:${id}`).toBe(true);
    }
  });

  it("the Hindi view is complete (Devanagari in every question, option and band)", () => {
    const hi = localizeBank(QUESTION_BANK, "hi");
    const all = [
      ...hi.questions.flatMap((q) => [q.text, q.gapLabel, ...q.options.map((o) => o.label)]),
      ...hi.profile.flatMap((p) => [p.text]),
      ...hi.bands.flatMap((b) => [b.label, b.summary, b.cta]),
      hi.disclaimer,
    ];
    for (const s of all) expect(s).toMatch(/[ऀ-ॿ]/);
  });

  it("maps every sector answer to a notice-generator preset", () => {
    const sectors = QUESTION_BANK.profile_questions.find((p) => p.id === "p_sector")!.options.map((o) => o.id);
    for (const s of sectors) expect(SECTORS).toContain(SECTOR_TO_PRESET[s]);
  });
});

describe("L-RC-02 scoring extremes and N/A", () => {
  it("all in place scores 100 in the top band, nothing in place scores 0 in the bottom band", () => {
    const top = scoreReadiness(data, websiteNoKids, best(data, websiteNoKids));
    expect(top.score).toBe(100);
    expect(top.band?.id).toBe("well_prepared");
    expect(top.gaps).toEqual([]);
    const bottom = scoreReadiness(data, websiteNoKids, worst(data, websiteNoKids));
    expect(bottom.score).toBe(0);
    expect(bottom.band?.id).toBe("getting_started");
    expect(bottom.gaps).toHaveLength(bottom.answered);
  });

  it("'not applicable' options leave the question out of both total and maximum", () => {
    const answers = { ...best(data, websiteNoKids), q_banner: "no_trackers", q_legacy_notice: "na" };
    const r = scoreReadiness(data, websiteNoKids, answers);
    expect(r.score).toBe(100);
    expect(r.notApplicable).toBe(2);
    expect(r.answered).toBe(applicableQuestions(data.questions, websiteNoKids).length - 2);
  });

  it("'Not sure' counts as 0 and is listed as a gap", () => {
    const answers = { ...best(data, websiteNoKids), q_notice_exists: "not_sure" };
    const r = scoreReadiness(data, websiteNoKids, answers);
    expect(r.gaps.map((g) => g.question.id)).toEqual(["q_notice_exists"]);
    expect(r.score).toBeLessThan(100);
  });

  it("returns no score and no band when nothing scorable was answered", () => {
    const r = scoreReadiness(data, websiteNoKids, {});
    expect(r.score).toBeNull();
    expect(r.band).toBeNull();
    expect(r.enough).toBe(false);
  });
});

describe("L-RC-03 applies_if", () => {
  it("children questions apply only when the business has under-18s (or is not sure); the banner only with a website or app", () => {
    const ids = (p: ProfileAnswers) => applicableQuestions(data.questions, p).map((q) => q.id);
    expect(ids(websiteNoKids)).not.toContain("q_children_parental");
    expect(ids(coachingKids)).toContain("q_children_parental");
    expect(ids(coachingKids)).toContain("q_children_tracking");
    expect(ids({ ...websiteNoKids, p_children: "not_sure" })).toContain("q_children_tracking");
    expect(ids({ ...websiteNoKids, p_channels: "none" })).not.toContain("q_banner");
    expect(ids({ ...websiteNoKids, p_channels: "app" })).toContain("q_banner");
  });

  it("answers to questions that do not apply are ignored", () => {
    const answers = { ...best(data, websiteNoKids), q_children_parental: "no", q_children_tracking: "no" };
    expect(scoreReadiness(data, websiteNoKids, answers).score).toBe(100);
  });

  it("conditionMatches supports `all` and fails for a missing answer", () => {
    expect(conditionMatches({ all: [{ profile: "p_sector", in: ["clinic"] }, { profile: "p_children", in: ["yes"] }] }, { p_sector: "clinic", p_children: "yes" })).toBe(true);
    expect(conditionMatches({ all: [{ profile: "p_sector", in: ["clinic"] }, { profile: "p_children", in: ["yes"] }] }, { p_sector: "clinic" })).toBe(false);
    expect(conditionMatches(undefined, {})).toBe(true);
  });
});

describe("L-RC-04 weighted formula and rounding", () => {
  it("computes round(100 × Σ weight·multiplier / Σ weight) over answered questions", () => {
    // Two questions only: q_notice_exists (w6) policy_only (0.4) and q_notice_purposes (w5) in place.
    const answers: Answers = { q_notice_exists: "policy_only", q_notice_purposes: data.questions.find((q) => q.id === "q_notice_purposes")!.options.find((o) => o.multiplier === 1)!.id };
    const r = scoreReadiness(data, websiteNoKids, answers);
    expect(r.score).toBe(Math.round((100 * (6 * 0.4 + 5)) / 11)); // 67.27 → 67
    expect(r.answered).toBe(2);
    expect(r.skipped).toBe(applicableQuestions(data.questions, websiteNoKids).length - 2);
    expect(r.enough).toBe(false);
  });

  it("rounds half up and is robust to floating-point noise", () => {
    expect(roundHalfUp(62.5)).toBe(63);
    expect(roundHalfUp(62.49999999999)).toBe(63);
    expect(roundHalfUp(62.4)).toBe(62);
    expect(roundHalfUp(0)).toBe(0);
  });

  it("bands follow the score boundaries (39 → getting started, 40 → partly ready, 70, 90)", () => {
    const band = (score: number) => data.bands.find((b) => score >= b.min && score <= b.max)!.id;
    expect(band(39)).toBe("getting_started");
    expect(band(40)).toBe("partly_ready");
    expect(band(69)).toBe("partly_ready");
    expect(band(70)).toBe("good_progress");
    expect(band(89)).toBe("good_progress");
    expect(band(90)).toBe("well_prepared");
  });

  it("needs the bank's minimum number of answers for a reliable score", () => {
    const all = best(data, websiteNoKids);
    const ten = Object.fromEntries(Object.entries(all).slice(0, data.minimumAnswered));
    const nine = Object.fromEntries(Object.entries(all).slice(0, data.minimumAnswered - 1));
    expect(scoreReadiness(data, websiteNoKids, ten).enough).toBe(true);
    expect(scoreReadiness(data, websiteNoKids, nine).enough).toBe(false);
  });
});

describe("L-RC-05 gaps", () => {
  it("sorts gaps by weight × (1 − multiplier), ties in question order, and carries recommendation and rule refs", () => {
    const r = scoreReadiness(data, websiteNoKids, worst(data, websiteNoKids));
    for (let i = 1; i < r.gaps.length; i++) {
      const a = r.gaps[i - 1];
      const b = r.gaps[i];
      expect(a.impact).toBeGreaterThanOrEqual(b.impact);
      if (a.impact === b.impact) {
        expect(data.questions.findIndex((q) => q.id === a.question.id)).toBeLessThan(data.questions.findIndex((q) => q.id === b.question.id));
      }
    }
    // Heaviest questions (weight 6) come first, in bank order.
    expect(r.gaps.slice(0, 4).map((g) => g.question.id)).toEqual(["q_notice_exists", "q_notice_itemised", "q_consent_purposewise", "q_security"]);
    for (const g of r.gaps) {
      expect(g.option.recommendation).toBeTruthy();
      expect(g.option.ruleRefs.length).toBeGreaterThan(0);
    }
  });

  it("a partial answer costs less than a missing control", () => {
    const answers = { ...best(data, websiteNoKids), q_notice_exists: "policy_only", q_notice_itemised: worst(data, websiteNoKids).q_notice_itemised };
    const r = scoreReadiness(data, websiteNoKids, answers);
    expect(r.gaps.map((g) => g.question.id)).toEqual(["q_notice_itemised", "q_notice_exists"]);
  });
});

describe("L-RC-06 flags", () => {
  it("shows information notes for the matching profile only; flags never change the score", () => {
    const clinic: ProfileAnswers = { ...websiteNoKids, p_sector: "clinic", p_children: "yes", p_third_schedule: "ecommerce_2cr" };
    const r = scoreReadiness(data, clinic, best(data, clinic));
    expect(r.flags.map((f) => f.id).sort()).toEqual(["f_fourth_schedule_health", "f_third_schedule"]);
    expect(r.score).toBe(100);
    expect(scoreReadiness(data, websiteNoKids, {}).flags).toEqual([]);
    expect(scoreReadiness(data, { ...websiteNoKids, p_channels: "none" }, {}).flags.map((f) => f.id)).toEqual(["f_no_website"]);
  });
});

describe("L-RC-07 language parity", () => {
  it("scores the same answers identically in English and Hindi", () => {
    const hi = readinessData("hi");
    const answers = { ...best(data, coachingKids), q_vendors: worst(data, coachingKids).q_vendors, q_logs: "not_sure" };
    const en = scoreReadiness(data, coachingKids, answers);
    const h = scoreReadiness(hi, coachingKids, answers);
    expect(h.score).toBe(en.score);
    expect(h.gaps.map((g) => g.question.id)).toEqual(en.gaps.map((g) => g.question.id));
    expect(h.band?.label).toMatch(/[ऀ-ॿ]/);
  });

  it("every interface string of the lead-magnet pages exists in Hindi with the same placeholders", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    for (const [key, en] of Object.entries(MARKETING_TEXT.en)) {
      const hi = MARKETING_TEXT.hi[key as keyof typeof MARKETING_TEXT.hi];
      expect(hi?.trim(), key).toBeTruthy();
      expect(vars(hi), key).toBe(vars(en));
    }
  });
});

describe("L-RC-08 guardrails (plan §3.2–3.3)", () => {
  it("the checker and page texts never claim compliance, certification or guarantees, and never call EpiFive a Consent Manager", () => {
    const texts = [JSON.stringify(QUESTION_BANK), ...Object.values(MARKETING_TEXT.en)].join("\n");
    expect(texts).not.toMatch(/DPDP[- ]compliant|\bwe are compliant|certified|guarantee[ds]?\b/i);
    for (const m of Object.values(MARKETING_TEXT.en).join("\n").matchAll(/[^.]*Consent Manager[^.]*/g)) expect(m[0]).toMatch(/\bnot\b/i);
    expect(MARKETING_TEXT.en["common.disclaimer"]).toMatch(/not legal advice/);
    expect(QUESTION_BANK.disclaimer.en).toMatch(/not legal advice/);
  });
});
