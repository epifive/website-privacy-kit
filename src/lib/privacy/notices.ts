import "server-only";
import { parseDataItems } from "@/core/data-items";
import { renderNotice, sha256Hex, validateNoticeInput, type NoticeContact, type NoticeInput, type NoticeIssue } from "@/core/notice/render";
import { TEMPLATE_STATUS, TEMPLATE_VERSION, type Lang } from "@/core/notice/templates";
import type { ContactRow, NoticeVersionRow } from "../db/schema";
import type { TenantDb } from "../db/tenant";
import { orgIdentifiers } from "./orgs";
import { getContacts, listPurposes, listRetentionRules, listVendors } from "./registers";
import { idList, nowIso } from "./util";

/**
 * Notice generation and immutable versions (plan M1; N1–N5).
 * A publish writes one row per language; rows are never updated (DB trigger)
 * and each carries the SHA-256 of its Markdown body.
 */

export function noticeLinks(baseUrl: string, slug: string) {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    notice: `${base}/p/${slug}/notice`,
    withdraw: `${base}/p/${slug}/withdraw`,
    rights: `${base}/p/${slug}/rights`,
  };
}

const toContact = (c: ContactRow | null): NoticeContact | null =>
  c ? { name: c.name, designation: c.designation, email: c.email, phone: c.phone, address: c.address } : null;

/** Snapshot of the organisation's registers as renderer input. */
export async function buildNoticeInput(t: TenantDb, opts: { baseUrl: string; version: number; publishedAt?: string }): Promise<NoticeInput> {
  const org = await t.org();
  if (!org) throw new Error("Organisation not found.");
  const [contacts, purposes, vendors, rules] = await Promise.all([getContacts(t), listPurposes(t), listVendors(t), listRetentionRules(t)]);
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  return {
    org: {
      name: org.name,
      legalName: org.legal_name || org.name,
      slug: org.slug,
      goodsServices: { en: org.goods_services_en, hi: org.goods_services_hi },
      websiteUrl: org.website_url,
    },
    links: noticeLinks(opts.baseUrl, org.slug),
    contacts: { grievance: toContact(contacts.grievance), dpo: toContact(contacts.dpo) },
    purposes: purposes
      .filter((p) => p.active === 1)
      .map((p) => {
        const rule = p.retention_rule_id ? ruleById.get(p.retention_rule_id) : undefined;
        return {
          key: p.purpose_key,
          name: { en: p.name_en, hi: p.name_hi },
          description: { en: p.desc_en, hi: p.desc_hi },
          basis: p.basis,
          items: parseDataItems(p.data_items),
          vendors: idList(p.vendor_ids)
            .map((id) => vendorById.get(id))
            .filter((v): v is NonNullable<typeof v> => Boolean(v))
            .map((v) => ({ name: v.name, service: v.service, location: v.location })),
          retentionDays: rule ? rule.period_days : null,
          retentionLawRef: rule?.law_ref || undefined,
        };
      }),
    rights: { responseDays: org.response_days, identifiers: orgIdentifiers(org) },
    childrenMode: org.children_mode === 1,
    version: opts.version,
    publishedAt: opts.publishedAt ?? nowIso(),
  };
}

export async function latestVersionNumber(t: TenantDb): Promise<number> {
  const row = await t.selectFrom("notice_versions").select((eb) => eb.fn.max("version").as("v")).executeTakeFirst();
  return Number(row?.v ?? 0);
}

/** Draft preview: what the next version would look like, with blocking issues. */
export async function previewNotice(t: TenantDb, baseUrl: string) {
  const version = (await latestVersionNumber(t)) + 1;
  const input = await buildNoticeInput(t, { baseUrl, version });
  return { input, issues: validateNoticeInput(input), rendered: renderNotice(input) };
}

export type PublishResult = { ok: true; version: number; rows: Array<{ lang: Lang; sha256: string }> } | { ok: false; issues: NoticeIssue[] };

/** Publish a new immutable version (one row per language). Refused while N1–N4 checks fail. */
export async function publishNotice(t: TenantDb, opts: { baseUrl: string; userId: number | null }): Promise<PublishResult> {
  return t.transaction(async (tx) => {
    const version = (await latestVersionNumber(tx)) + 1;
    const publishedAt = nowIso();
    const input = await buildNoticeInput(tx, { baseUrl: opts.baseUrl, version, publishedAt });
    const issues = validateNoticeInput(input);
    if (issues.length) return { ok: false as const, issues };
    const rendered = renderNotice(input);
    await tx.insertInto(
      "notice_versions",
      rendered.map((r) => ({
        site_id: null,
        version,
        lang: r.lang,
        title: r.title.slice(0, 255),
        body_md: r.bodyMd,
        sha256: r.sha256,
        template_version: `${TEMPLATE_VERSION} (${TEMPLATE_STATUS})`,
        published_at: publishedAt,
        published_by: opts.userId,
      })),
    );
    await tx.insertInto("audit_log", { user_id: opts.userId, action: "notice.publish", target: `v${version}`, created_at: publishedAt });
    return { ok: true as const, version, rows: rendered.map((r) => ({ lang: r.lang, sha256: r.sha256 })) };
  });
}

export interface NoticeVersionSummary {
  version: number;
  published_at: string;
  langs: Array<{ lang: Lang; sha256: string }>;
}

export async function listNoticeVersions(t: TenantDb): Promise<NoticeVersionSummary[]> {
  const rows = await t.selectFrom("notice_versions").select(["version", "lang", "sha256", "published_at"]).orderBy("version", "desc").orderBy("lang").execute();
  const map = new Map<number, NoticeVersionSummary>();
  for (const r of rows) {
    const entry = map.get(r.version) ?? { version: r.version, published_at: r.published_at, langs: [] };
    entry.langs.push({ lang: r.lang, sha256: r.sha256 });
    map.set(r.version, entry);
  }
  return [...map.values()];
}

/** A published version in one language; the latest when `version` is omitted. */
export async function getNoticeVersion(t: TenantDb, lang: Lang, version?: number): Promise<NoticeVersionRow | undefined> {
  let q = t.selectFrom("notice_versions").selectAll().where("lang", "=", lang);
  q = version ? q.where("version", "=", version) : q.orderBy("version", "desc");
  return q.limit(1).executeTakeFirst();
}

/** True when the stored body still matches its stored hash (tamper check). */
export function verifyNoticeVersion(row: Pick<NoticeVersionRow, "body_md" | "sha256">): boolean {
  return sha256Hex(row.body_md) === row.sha256;
}
