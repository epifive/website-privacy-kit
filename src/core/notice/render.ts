import { createHash } from "node:crypto";
import { dataItemLabel, type DataItem } from "../data-items";
import { md, mdLink, renderMarkdown } from "./markdown";
import { BOARD_URL, IDENTIFIER_KEYS, NOTICE_LANGS, TEMPLATE_STATUS, TEMPLATE_VERSION, TEMPLATES, type Lang, type NoticeTemplate } from "./templates";

/**
 * Notice renderer (plan M1; requirements N1–N5, R2–R4, K1).
 *
 * Pure functions only: input is a snapshot of the organisation's registers,
 * output is Markdown (stored immutably) and a standalone HTML page. No I/O.
 */

export type Basis = "consent" | "s7a_voluntary" | "s7_other" | "necessary";
export const BASES: readonly Basis[] = ["consent", "s7a_voluntary", "s7_other", "necessary"];

export interface Bilingual {
  en: string;
  hi: string;
}

export interface NoticeContact {
  name: string;
  designation?: string;
  email: string;
  phone: string;
  address: string;
}

export interface NoticePurpose {
  key: string;
  name: Bilingual;
  description: Bilingual;
  basis: Basis;
  items: DataItem[];
  vendors: Array<{ name: string; service: string; location: "india" | "abroad" }>;
  /** Retention period in days; 0 = until consent is withdrawn. Null = not set. */
  retentionDays: number | null;
  retentionLawRef?: string;
}

export interface NoticeInput {
  org: { name: string; legalName: string; slug: string; goodsServices: Bilingual; websiteUrl: string };
  /** Absolute URLs of the hosted pages (Rule 3(c) "particular communication link"). */
  links: { notice: string; withdraw: string; rights: string; board?: string };
  contacts: { grievance: NoticeContact | null; dpo: NoticeContact | null };
  purposes: NoticePurpose[];
  rights: { responseDays: number; identifiers: string[] };
  childrenMode: boolean;
  version: number;
  /** ISO timestamp. */
  publishedAt: string;
}

export interface NoticeIssue {
  code:
    | "org_name"
    | "goods_services"
    | "no_purposes"
    | "purpose_no_items"
    | "purpose_translation"
    | "item_translation"
    | "no_contact"
    | "contact_channel"
    | "response_days"
    | "links"
    | "identifiers";
  /** Purpose key or language the issue is about. */
  ref?: string;
}

export const MAX_RESPONSE_DAYS = 90;
export const DEFAULT_RESPONSE_DAYS = 30;

/** Response period: default 30, never more than 90 days (Rule 14(3); PIB). */
export function clampResponseDays(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_RESPONSE_DAYS;
  return Math.min(MAX_RESPONSE_DAYS, n);
}

const hasDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);

/** Everything that must be true before a notice may be published (N1–N4, R3, R4). */
export function validateNoticeInput(input: NoticeInput): NoticeIssue[] {
  const issues: NoticeIssue[] = [];
  if (!input.org.name.trim() || !input.org.legalName.trim()) issues.push({ code: "org_name" });
  for (const lang of NOTICE_LANGS) if (!input.org.goodsServices[lang].trim()) issues.push({ code: "goods_services", ref: lang });
  if (!input.purposes.length) issues.push({ code: "no_purposes" });
  for (const p of input.purposes) {
    if (!p.items.length) issues.push({ code: "purpose_no_items", ref: p.key });
    if (!p.name.en.trim() || !p.description.en.trim() || !hasDevanagari(p.name.hi) || !hasDevanagari(p.description.hi)) {
      issues.push({ code: "purpose_translation", ref: p.key });
    }
    for (const item of p.items) {
      if (!("key" in item) && (!item.en.trim() || !hasDevanagari(item.hi))) issues.push({ code: "item_translation", ref: p.key });
    }
  }
  const contact = input.contacts.grievance ?? input.contacts.dpo;
  if (!contact) issues.push({ code: "no_contact" });
  else if (!contact.name.trim() || (!contact.email.trim() && !contact.phone.trim())) issues.push({ code: "contact_channel" });
  if (!Number.isInteger(input.rights.responseDays) || input.rights.responseDays < 1 || input.rights.responseDays > MAX_RESPONSE_DAYS) {
    issues.push({ code: "response_days" });
  }
  if (!input.rights.identifiers.some((k) => IDENTIFIER_KEYS.includes(k))) issues.push({ code: "identifiers" });
  if (![input.links.notice, input.links.withdraw, input.links.rights].every((u) => /^https?:\/\//.test(u))) issues.push({ code: "links" });
  return issues;
}

const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** "72 months" style period in the notice language. */
export function formatPeriod(days: number | null, t: NoticeTemplate): string | null {
  if (days === null) return null;
  if (days === 0) return t.period.untilWithdrawn;
  const pick = (n: number, one: string, many: string) => fill(n === 1 ? one : many, { n });
  if (days % 365 === 0) return pick(days / 365, t.period.year, t.period.years);
  if (days % 30 === 0) return pick(days / 30, t.period.month, t.period.months);
  return pick(days, t.period.day, t.period.days);
}

function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  // Fixed format (no locale data dependency) so the stored text is reproducible.
  const pad = (n: number) => String(n).padStart(2, "0");
  void lang;
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

function contactLines(c: NoticeContact, t: NoticeTemplate): string[] {
  const lines = [fill(t.contactName, { text: md(c.designation ? `${c.name}, ${c.designation}` : c.name) })];
  if (c.email.trim()) lines.push(fill(t.contactEmail, { text: mdLink(c.email.trim(), `mailto:${c.email.trim()}`) }));
  if (c.phone.trim()) lines.push(fill(t.contactPhone, { text: md(c.phone) }));
  if (c.address.trim()) lines.push(fill(t.contactAddress, { text: md(c.address) }));
  return lines.map((l) => `- ${l}`);
}

/** The full, standalone, itemised notice as Markdown (one language). */
export function buildNoticeMarkdown(input: NoticeInput, lang: Lang): string {
  const t = TEMPLATES[lang];
  const out: string[] = [];
  // Each paragraph is its own block; consecutive "- " lines form one list.
  const push = (...lines: string[]) => {
    lines.forEach((line, i) => {
      out.push(line);
      const next = lines[i + 1];
      if (!(line.startsWith("- ") && next?.startsWith("- "))) out.push("");
    });
  };

  push(`# ${fill(t.title, { org: md(input.org.name) })}`);
  push(`> ${t.draftBanner}`);
  push(fill(t.intro, { legal: md(input.org.legalName) }));
  push(`- ${fill(t.goodsServices, { text: md(input.org.goodsServices[lang]) })}`, `- ${fill(t.website, { url: mdLink(input.org.websiteUrl || input.links.notice, input.org.websiteUrl || input.links.notice) })}`);

  push(`## ${t.dataHeading}`, t.dataIntro);
  for (const p of input.purposes) {
    push(`### ${md(p.name[lang])}`);
    push(fill(t.purposeUse, { text: md(p.description[lang]) }));
    push(t.purposeItems);
    push(...p.items.map((item) => `- ${md(dataItemLabel(item, lang))}`));
    const facts = [`- ${fill(t.purposeBasis, { text: t.basis[p.basis] })}`];
    if (p.vendors.length) {
      const names = p.vendors.map((v) => fill(v.location === "india" ? t.vendorIndia : t.vendorAbroad, { name: md(v.name), service: md(v.service) }));
      facts.push(`- ${fill(t.purposeSharedWith, { text: names.join("; ") })}`);
    }
    const period = formatPeriod(p.retentionDays, t);
    if (period) facts.push(`- ${fill(t.purposeKeptFor, { text: p.retentionLawRef ? `${period} (${md(p.retentionLawRef)})` : period })}`);
    push(...facts);
    if (p.basis === "consent") push(t.purposeOptional);
  }

  push(`## ${t.withdrawHeading}`, t.withdrawText, fill(t.withdrawLink, { url: mdLink(input.links.withdraw, input.links.withdraw) }), t.withdrawEffect);

  const identifiers = input.rights.identifiers.filter((k) => k in t.identifiers).map((k) => t.identifiers[k]);
  push(`## ${t.rightsHeading}`);
  push(...t.rightsList.map((r) => `- ${r}`));
  push(t.rightsHow, `- ${fill(t.rightsLink, { url: mdLink(input.links.rights, input.links.rights) })}`, `- ${fill(t.rightsIdentifiers, { list: identifiers.join(lang === "hi" ? ", " : "; ") })}`, `- ${fill(t.rightsPeriod, { days: input.rights.responseDays })}`);

  push(`## ${t.contactHeading}`);
  if (input.contacts.grievance) push(`**${t.contactGrievance}**`, ...contactLines(input.contacts.grievance, t));
  if (input.contacts.dpo) push(`**${t.contactDpo}**`, ...contactLines(input.contacts.dpo, t));

  const board = input.links.board ?? BOARD_URL;
  push(`## ${t.boardHeading}`, t.boardText, fill(t.boardLink, { url: mdLink(board, board) }));

  if (input.childrenMode) push(`## ${t.childrenHeading}`, t.childrenText);

  push(`## ${t.languagesHeading}`, fill(t.languagesText, { url: mdLink(input.links.notice, input.links.notice) }));
  push("---", fill(t.versionLine, { version: input.version, date: formatDate(input.publishedAt, lang) }), fill(t.footer, { template: `${TEMPLATE_VERSION}, ${TEMPLATE_STATUS}` }));
  return out.join("\n").trim() + "\n";
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface RenderedNotice {
  lang: Lang;
  title: string;
  bodyMd: string;
  sha256: string;
}

/** Both language versions of a notice (N4: English + an Eighth Schedule language). */
export function renderNotice(input: NoticeInput): RenderedNotice[] {
  return NOTICE_LANGS.map((lang) => {
    const bodyMd = buildNoticeMarkdown(input, lang);
    return { lang, title: fill(TEMPLATES[lang].title, { org: input.org.name }), bodyMd, sha256: sha256Hex(bodyMd) };
  });
}

const STYLE = `:root{color-scheme:light dark}body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari","Nirmala UI",sans-serif;color:#1c1917;background:#fff}main{max-width:46rem;margin:0 auto;padding:2rem 1.25rem 4rem}h1{font-size:1.75rem;line-height:1.2}h2{font-size:1.25rem;margin-top:2rem;border-top:1px solid #e7e5e4;padding-top:1.25rem}h3{font-size:1.05rem;margin-bottom:.25rem}blockquote{margin:1rem 0;padding:.75rem 1rem;border-left:4px solid #b45309;background:#fffbeb;color:#78350f}a{color:#0f766e}hr{border:0;border-top:1px solid #e7e5e4;margin:2rem 0 1rem}nav{font-size:.9rem;margin-bottom:1rem}@media (prefers-color-scheme:dark){body{background:#0c0a09;color:#e7e5e4}a{color:#5eead4}blockquote{background:#292524;color:#fde68a}h2,hr{border-color:#44403c}}`;

/**
 * A complete HTML page for a notice version (N2: "understandable independently").
 * No scripts, external styles, fonts, images or frames; only inline CSS.
 */
export function renderStandaloneHtml(notice: { lang: Lang; title: string; bodyMd: string; sha256: string }, alternate?: { lang: Lang; href: string }): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const nav = alternate ? `<nav><a href="${esc(alternate.href)}" hreflang="${alternate.lang}" lang="${alternate.lang}">${esc(TEMPLATES[alternate.lang].langName)}</a></nav>` : "";
  return `<!doctype html>
<html lang="${notice.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="notice-sha256" content="${notice.sha256}">
<title>${esc(notice.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${nav}
${renderMarkdown(notice.bodyMd)}
</main>
</body>
</html>
`;
}

/** Short notice for a banner or form (N1: accompanies the consent request). */
export function buildShortNotice(input: NoticeInput, lang: Lang): string {
  const t = TEMPLATES[lang];
  const purposes = input.purposes.map((p) => p.name[lang]).join(lang === "hi" ? ", " : ", ");
  return `${fill(t.short, { org: input.org.name, purposes })}\n${fill(t.shortLinks, input.links)}`;
}

/** Message for customers who consented before commencement (s.5(2), N5). */
export function buildLegacyMessage(input: NoticeInput, lang: Lang, channel: "email" | "sms" | "whatsapp"): { subject?: string; body: string } {
  const t = TEMPLATES[lang];
  const vars = { org: input.org.name, notice: input.links.notice, withdraw: input.links.withdraw, rights: input.links.rights };
  if (channel === "email") return { subject: fill(t.legacySubject, vars), body: fill(t.legacyBody, vars) };
  if (channel === "whatsapp") return { body: fill(t.legacyBody, vars) };
  return { body: fill(t.legacySms, vars) };
}

/** Grievance-contact block for the website footer or reply templates (Rule 9, R4). */
export function buildContactBlock(input: NoticeInput, lang: Lang): string {
  const t = TEMPLATES[lang];
  const lines: string[] = [];
  if (input.contacts.grievance) lines.push(`**${t.contactGrievance}**`, ...contactLines(input.contacts.grievance, t));
  if (input.contacts.dpo) lines.push(`**${t.contactDpo}**`, ...contactLines(input.contacts.dpo, t));
  return lines.join("\n");
}
