import type { Lang } from "./notice/templates";

/**
 * Retention and erasure texts, from wpk-content/legal-templates/{en,hi}/
 * 09-retention-erasure-notices.md. STATUS: DRAFT — PENDING LAWYER REVIEW.
 * Not legal advice.
 *
 * - preErasureNotice(): optional notice before erasure. Mandatory (48 h) only
 *   for Third Schedule classes under Rule 8(2); good practice for others.
 * - processorErase(): instruction to a processor (s.8(7)(b)); English only,
 *   as vendors usually work in English (see hi/09 §5).
 */

export const RETENTION_TEXT_STATUS = "draft-pending-lawyer-review" as const;

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));

const T = {
  en: {
    preSubject: "Your {business} data will be deleted on {date}",
    preBody:
      "Dear customer,\n\nYou have not used {service} or contacted us since [last contact date]. As explained in our privacy notice, we will delete {items} on {date}.\n\nIf you would like to keep using {service}, just log in or reply to this email before {date}. Otherwise you do not need to do anything.\n\nSome records must be kept longer by law: [retained summary].\n\nQuestions: {contact}",
    draft: "Template status: draft — pending lawyer review. Not legal advice.",
  },
  hi: {
    preSubject: "{business} के पास मौजूद आपका डेटा {date} को मिटा दिया जाएगा",
    preBody:
      "प्रिय ग्राहक,\n\nआपने [आखिरी संपर्क की तारीख] के बाद से {service} इस्तेमाल नहीं किया है और न ही हमसे संपर्क किया है। हमारी निजता सूचना के अनुसार, हम {date} को {items} मिटा देंगे।\n\nअगर आप {service} इस्तेमाल करते रहना चाहते हैं, तो {date} से पहले बस लॉग इन करें या इस ईमेल का जवाब दें। वरना आपको कुछ करने की ज़रूरत नहीं है।\n\nकुछ रिकॉर्ड कानूनन ज़्यादा समय तक रखने होते हैं: [रखे जाने वाले रिकॉर्ड]।\n\nसवाल: {contact}",
    draft: "टेम्पलेट की स्थिति: ड्राफ़्ट — वकील की समीक्षा बाकी है। यह कानूनी सलाह नहीं है।",
  },
} as const;

export function preErasureNotice(lang: Lang, v: { business: string; service: string; items: string; date: string; contact: string }): { subject: string; text: string } {
  const t = T[lang];
  return { subject: fill(t.preSubject, { business: v.business, date: v.date }), text: `${fill(t.preBody, v)}\n\n${v.business}\n\n${t.draft}` };
}

export function processorErase(v: { business: string; vendor: string; contractDate: string; by: string; data: string; selector: string; taskRef: string }): { subject: string; text: string } {
  return {
    subject: `Erasure instruction — ${v.business} — ref ${v.taskRef}`,
    text: [
      `${v.vendor} team,`,
      `Under our contract dated ${v.contractDate || "[contract date]"}, please erase the following personal data you process for us by ${v.by}: ${v.data} (${v.selector}).`,
      "Please keep only what you must keep by law, including logs of processing for one year from the date of processing (Rule 8(3), DPDP Rules 2025), tell us what you kept and until when, and confirm in writing when erasure is complete.",
      v.business,
      T.en.draft,
    ].join("\n\n"),
  };
}
