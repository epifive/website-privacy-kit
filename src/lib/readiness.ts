import "server-only";
import { MARKETING_TEXT, type MarketingKey } from "@/core/marketing/text";
import { localizeBank, type QuestionBank, type ReadinessData, type ReadinessLang } from "@/core/readiness/model";
import bank from "../../content/readiness/questions.json";

/** The question bank (draft, pending lawyer review), as imported at build time. */
export const QUESTION_BANK = bank as unknown as QuestionBank;

const cache = new Map<ReadinessLang, ReadinessData>();

/** One language of the bank, the shape the browser checker receives. */
export function readinessData(lang: ReadinessLang): ReadinessData {
  let data = cache.get(lang);
  if (!data) cache.set(lang, (data = localizeBank(QUESTION_BANK, lang)));
  return data;
}

/** The interface strings whose keys start with one of the prefixes, in one language (for client components). */
export function pickTexts(lang: ReadinessLang, prefixes: string[]): Record<string, string> {
  const dict = MARKETING_TEXT[lang];
  const out: Record<string, string> = {};
  for (const key of Object.keys(dict) as MarketingKey[]) if (prefixes.some((p) => key.startsWith(p))) out[key] = dict[key];
  return out;
}

/** The sector options of the checker's first question, used by the lead form too. */
export function sectorOptions(lang: ReadinessLang): Array<{ id: string; label: string }> {
  return readinessData(lang).profile.find((p) => p.id === "p_sector")?.options ?? [];
}
