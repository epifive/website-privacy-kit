import { dataItemLabel } from "./data-items";
import type { Lang } from "./notice/templates";
import { IDENTIFIER_KEYS, TEMPLATES } from "./notice/templates";
import { clampResponseDays, DEFAULT_RESPONSE_DAYS, type NoticeInput } from "./notice/render";
import { getPreset, SECTOR_PRESETS, SECTORS, type Sector } from "./presets";

/**
 * Public free notice generator (P6, plan §11 lead magnet).
 *
 * A short questionnaire → a NoticeInput for the shared notice renderer. No
 * account and no storage: the answers exist only for the request that renders
 * the preview. Without hosted pages, withdrawal and rights requests point to the
 * business's own email address (mailto: links); an account replaces them with
 * hosted pages. The output keeps the renderer's "draft — pending lawyer review,
 * not legal advice" banner.
 */

export interface FreeNoticeAnswers {
  sector: string;
  orgName: string;
  legalName: string;
  goodsEn: string;
  goodsHi: string;
  website: string;
  noticeUrl: string;
  purposes: string[];
  childrenMode: boolean;
  contactName: string;
  contactDesignation: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  responseDays: number;
  identifiers: string[];
}

export type FreeNoticeError = "orgName" | "goods" | "website" | "noticeUrl" | "purposes" | "contactName" | "contactEmail" | "identifiers";

const one = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function httpUrl(value: string): string | null {
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || withScheme.length > 255) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Read the generator form (FormData-like object) into answers. */
export function readFreeNoticeForm(get: (name: string) => unknown, getAll: (name: string) => unknown[]): FreeNoticeAnswers {
  const sector = one(get("sector"), 20);
  return {
    sector: (SECTORS as readonly string[]).includes(sector) ? sector : "other",
    orgName: one(get("org_name"), 120),
    legalName: one(get("legal_name"), 160),
    goodsEn: one(get("goods_en"), 300),
    goodsHi: one(get("goods_hi"), 300),
    website: one(get("website"), 255),
    noticeUrl: one(get("notice_url"), 255),
    purposes: getAll("purposes").map((p) => one(p, 40)).filter(Boolean),
    childrenMode: get("children") === "on",
    contactName: one(get("contact_name"), 120),
    contactDesignation: one(get("contact_designation"), 120),
    contactEmail: one(get("contact_email"), 190),
    contactPhone: one(get("contact_phone"), 30),
    contactAddress: one(get("contact_address"), 300),
    responseDays: clampResponseDays(get("response_days") ?? DEFAULT_RESPONSE_DAYS),
    identifiers: getAll("identifiers").map((p) => one(p, 30)).filter((k) => IDENTIFIER_KEYS.includes(k)),
  };
}

export type FreeNoticeBuild = { ok: true; input: NoticeInput; warnings: Array<"goodsHiMissing"> } | { ok: false; error: FreeNoticeError };

export function buildFreeNoticeInput(a: FreeNoticeAnswers, now: Date = new Date()): FreeNoticeBuild {
  const preset = getPreset(a.sector);
  if (a.orgName.length < 2) return { ok: false, error: "orgName" };
  const website = httpUrl(a.website);
  if (!website) return { ok: false, error: "website" };
  const noticeUrl = a.noticeUrl ? httpUrl(a.noticeUrl) : website;
  if (!noticeUrl) return { ok: false, error: "noticeUrl" };
  const purposes = preset.purposes.filter((p) => a.purposes.includes(p.key));
  if (!purposes.length) return { ok: false, error: "purposes" };
  if (a.contactName.length < 2) return { ok: false, error: "contactName" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.contactEmail)) return { ok: false, error: "contactEmail" };
  if (!a.identifiers.length) return { ok: false, error: "identifiers" };

  const goodsEn = a.goodsEn || preset.goodsServices.en;
  const warnings: Array<"goodsHiMissing"> = [];
  let goodsHi = a.goodsHi;
  if (!goodsHi) {
    if (a.goodsEn) warnings.push("goodsHiMissing");
    goodsHi = a.goodsEn ? a.goodsEn : preset.goodsServices.hi;
  }
  if (goodsEn.length < 3) return { ok: false, error: "goods" };

  const mail = `mailto:${a.contactEmail}`;
  const input: NoticeInput = {
    org: { name: a.orgName, legalName: a.legalName || a.orgName, slug: "draft", goodsServices: { en: goodsEn, hi: goodsHi }, websiteUrl: website },
    links: { notice: noticeUrl, withdraw: mail, rights: mail },
    contacts: {
      grievance: { name: a.contactName, designation: a.contactDesignation || undefined, email: a.contactEmail, phone: a.contactPhone, address: a.contactAddress },
      dpo: null,
    },
    purposes: purposes.map((p) => {
      const rule = preset.retention.find((r) => r.category === p.retention);
      return {
        key: p.key,
        name: p.name,
        description: p.description,
        basis: p.basis,
        items: p.items.map((key) => ({ key })),
        vendors: preset.vendors.filter((v) => p.vendors?.includes(v.name)).map((v) => ({ name: v.name, service: v.service, location: v.location })),
        retentionDays: rule ? rule.periodDays : null,
        retentionLawRef: rule?.lawRef,
      };
    }),
    rights: { responseDays: a.responseDays, identifiers: a.identifiers },
    childrenMode: a.childrenMode,
    version: 1,
    publishedAt: now.toISOString(),
  };
  return { ok: true, input, warnings };
}

/** What the generator form shows per sector, in the interface language. */
export interface GeneratorSector {
  id: Sector;
  label: string;
  goods: string;
  childrenMode: boolean;
  identifiers: string[];
  purposes: Array<{ key: string; name: string; items: string; optional: boolean }>;
}

export function generatorSectors(lang: Lang): GeneratorSector[] {
  return SECTORS.map((id) => {
    const p = SECTOR_PRESETS[id];
    return {
      id,
      label: p.label[lang],
      goods: p.goodsServices[lang],
      childrenMode: p.childrenMode,
      identifiers: p.identifiers,
      purposes: p.purposes.map((x) => ({
        key: x.key,
        name: x.name[lang],
        items: x.items.map((k) => dataItemLabel({ key: k }, lang)).join(", "),
        optional: x.basis === "consent",
      })),
    };
  });
}

export function identifierOptions(lang: Lang): Array<{ key: string; label: string }> {
  return IDENTIFIER_KEYS.map((key) => ({ key, label: TEMPLATES[lang].identifiers[key] }));
}
