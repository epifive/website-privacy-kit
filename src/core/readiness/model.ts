/**
 * DPDP readiness checker: data shapes and scoring (plan §11 lead magnet, P6).
 *
 * Pure functions, safe to run in the browser: the checker scores answers on the
 * visitor's device and nothing is sent to the server unless they submit the
 * setup lead form. The question bank (content/readiness/questions.json) is a
 * draft pending lawyer review; it is not legal advice.
 *
 * Scoring rules come from the bank's own `scoring` block:
 * - each answered, applicable question adds weight × multiplier to the total and
 *   its weight to the maximum; multiplier null ("not applicable") and questions
 *   whose `applies_if` is false are left out of both;
 * - score = round half up (100 × total / maximum), clamped to 0–100;
 * - a gap is any answered, applicable question with multiplier < 1, sorted by
 *   weight × (1 − multiplier) descending, ties in question order;
 * - "Not sure" carries multiplier 0 in the bank, so it counts as a gap.
 */

export type ReadinessLang = "en" | "hi";
export type L<T = string> = Record<ReadinessLang, T>;

export interface Condition {
  profile: string;
  in: string[];
}
export type FlagCondition = Condition | { all: Condition[] };

export interface BankOption {
  id: string;
  label: L;
  multiplier: number | null;
  recommendation: L | null;
  rule_refs: string[];
}

export interface BankQuestion {
  id: string;
  section: string;
  requirement_ids: string[];
  legal_refs: string[];
  weight: number;
  applies_if?: Condition;
  text: L;
  help?: L;
  gap_label: L;
  options: BankOption[];
}

export interface BankProfileQuestion {
  id: string;
  text: L;
  help?: L;
  options: Array<{ id: string; label: L }>;
}

export interface BankBand {
  id: string;
  min: number;
  max: number;
  label: L;
  summary: L;
  cta: L;
}

export interface BankFlag {
  id: string;
  when: FlagCondition;
  rule_refs: string[];
  message: L;
}

export interface QuestionBank {
  id: string;
  version: string;
  last_reviewed: string;
  disclaimer: L;
  key_dates: L;
  sources: Array<{ title: string; url: string }>;
  scoring: { minimum_answered: number };
  result_bands: BankBand[];
  profile_questions: BankProfileQuestion[];
  flags: BankFlag[];
  questions: BankQuestion[];
}

/* ---------- One-language view sent to the browser (about half the size) ---------- */

export interface ROption {
  id: string;
  label: string;
  multiplier: number | null;
  recommendation: string | null;
  ruleRefs: string[];
}
export interface RQuestion {
  id: string;
  section: string;
  weight: number;
  appliesIf?: Condition;
  text: string;
  help?: string;
  gapLabel: string;
  legalRefs: string[];
  options: ROption[];
}
export interface RProfileQuestion {
  id: string;
  text: string;
  help?: string;
  options: Array<{ id: string; label: string }>;
}
export interface RBand {
  id: string;
  min: number;
  max: number;
  label: string;
  summary: string;
  cta: string;
}
export interface RFlag {
  id: string;
  when: FlagCondition;
  ruleRefs: string[];
  message: string;
}
export interface ReadinessData {
  lang: ReadinessLang;
  version: string;
  lastReviewed: string;
  disclaimer: string;
  keyDates: string;
  sources: Array<{ title: string; url: string }>;
  minimumAnswered: number;
  bands: RBand[];
  profile: RProfileQuestion[];
  flags: RFlag[];
  questions: RQuestion[];
}

export function localizeBank(bank: QuestionBank, lang: ReadinessLang): ReadinessData {
  return {
    lang,
    version: bank.version,
    lastReviewed: bank.last_reviewed,
    disclaimer: bank.disclaimer[lang],
    keyDates: bank.key_dates[lang],
    sources: bank.sources,
    minimumAnswered: bank.scoring.minimum_answered,
    bands: bank.result_bands.map((b) => ({ id: b.id, min: b.min, max: b.max, label: b.label[lang], summary: b.summary[lang], cta: b.cta[lang] })),
    profile: bank.profile_questions.map((p) => ({
      id: p.id,
      text: p.text[lang],
      ...(p.help ? { help: p.help[lang] } : {}),
      options: p.options.map((o) => ({ id: o.id, label: o.label[lang] })),
    })),
    flags: bank.flags.map((f) => ({ id: f.id, when: f.when, ruleRefs: f.rule_refs, message: f.message[lang] })),
    questions: bank.questions.map((q) => ({
      id: q.id,
      section: q.section,
      weight: q.weight,
      ...(q.applies_if ? { appliesIf: q.applies_if } : {}),
      text: q.text[lang],
      ...(q.help ? { help: q.help[lang] } : {}),
      gapLabel: q.gap_label[lang],
      legalRefs: q.legal_refs,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label[lang],
        multiplier: o.multiplier,
        recommendation: o.recommendation ? o.recommendation[lang] : null,
        ruleRefs: o.rule_refs,
      })),
    })),
  };
}

/* ---------- Scoring ---------- */

export type ProfileAnswers = Record<string, string | undefined>;
export type Answers = Record<string, string | undefined>;

export function conditionMatches(cond: FlagCondition | undefined, profile: ProfileAnswers): boolean {
  if (!cond) return true;
  if ("all" in cond) return cond.all.every((c) => conditionMatches(c, profile));
  const answer = profile[cond.profile];
  return answer !== undefined && cond.in.includes(answer);
}

/** Scored questions that apply to this profile, in bank order. */
export function applicableQuestions<Q extends Pick<RQuestion, "appliesIf">>(questions: Q[], profile: ProfileAnswers): Q[] {
  return questions.filter((q) => conditionMatches(q.appliesIf, profile));
}

export interface Gap<Q, O> {
  question: Q;
  option: O;
  /** weight × (1 − multiplier): how many points this gap costs. */
  impact: number;
}

export interface ReadinessResult<Q, O, B, F> {
  /** 0–100, or null when nothing scorable was answered. */
  score: number | null;
  band: B | null;
  /** Answered, applicable questions that count towards the score. */
  answered: number;
  /** Answered with a "not applicable" option. */
  notApplicable: number;
  /** Applicable questions without an answer (skipped). */
  skipped: number;
  /** In place (multiplier 1). */
  inPlace: number;
  /** True when at least `minimumAnswered` questions count. */
  enough: boolean;
  gaps: Array<Gap<Q, O>>;
  flags: F[];
}

/** Round half up to a whole number; tolerant of binary floating-point noise (62.4999999 → 62.5 → 63). */
export function roundHalfUp(value: number): number {
  return Math.floor(Number(value.toFixed(9)) + 0.5);
}

type ScoredQ = Pick<RQuestion, "id" | "weight" | "appliesIf"> & { options: Array<Pick<ROption, "id" | "multiplier">> };
type Banded = { min: number; max: number };

export function scoreReadiness<Q extends ScoredQ, B extends Banded, F extends { when: FlagCondition }>(
  data: { questions: Q[]; bands: B[]; flags: F[]; minimumAnswered: number },
  profile: ProfileAnswers,
  answers: Answers,
): ReadinessResult<Q, Q["options"][number], B, F> {
  let total = 0;
  let max = 0;
  let answered = 0;
  let notApplicable = 0;
  let skipped = 0;
  let inPlace = 0;
  const gaps: Array<Gap<Q, Q["options"][number]> & { order: number }> = [];

  applicableQuestions(data.questions, profile).forEach((q, order) => {
    const option = q.options.find((o) => o.id === answers[q.id]);
    if (!option) {
      skipped++;
      return;
    }
    if (option.multiplier === null) {
      notApplicable++;
      return;
    }
    const m = Math.min(1, Math.max(0, option.multiplier));
    total += q.weight * m;
    max += q.weight;
    answered++;
    if (m >= 1) inPlace++;
    else gaps.push({ question: q, option, impact: q.weight * (1 - m), order });
  });

  const score = max > 0 ? Math.min(100, Math.max(0, roundHalfUp((100 * total) / max))) : null;
  const band = score === null ? null : (data.bands.find((b) => score >= b.min && score <= b.max) ?? null);
  gaps.sort((a, b) => b.impact - a.impact || a.order - b.order);
  return {
    score,
    band,
    answered,
    notApplicable,
    skipped,
    inPlace,
    enough: answered >= data.minimumAnswered,
    gaps: gaps.map(({ question, option, impact }) => ({ question, option, impact })),
    flags: data.flags.filter((f) => conditionMatches(f.when, profile)),
  };
}

/** Map the checker's sector answer to a notice-generator preset. */
export const SECTOR_TO_PRESET: Record<string, string> = {
  clinic: "clinic",
  coaching: "coaching",
  online_store: "d2c",
  agent: "agent",
  professional: "ca_firm",
  other: "other",
};
