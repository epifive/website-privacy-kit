import "server-only";
import { parseDataItems, type DataItem } from "@/core/data-items";
import { BASES, type Basis } from "@/core/notice/render";
import { DEFAULT_THEME, type BannerTheme } from "@/core/consent/banner";
import { RETENTION_ACTIONS, RETENTION_TRIGGERS, validateRetentionRule, type RetentionIssue } from "@/core/retention";
import type { ContactRow, PurposeRow, RetentionRuleRow, Site, VendorRow } from "../db/schema";
import type { TenantDb } from "../db/tenant";
import { idList, normalizeOrigin, nowIso, randomKey } from "./util";

/**
 * CRUD for the organisation's registers. Every function takes a TenantDb, so
 * an id that belongs to another organisation simply isn't found (reads return
 * undefined, writes change 0 rows). Cross-references (purpose → vendors,
 * retention rule, site) are filtered to the same organisation before saving.
 */

const affected = (r: { numUpdatedRows?: bigint; numDeletedRows?: bigint } | undefined) => Number(r?.numUpdatedRows ?? r?.numDeletedRows ?? 0);

// ── Sites ──

export interface SiteInput {
  name: string;
  domain: string;
  allowedOrigins: string[];
  childrenMode: boolean;
}

export function listSites(t: TenantDb): Promise<Site[]> {
  return t.selectFrom("sites").selectAll().orderBy("id").execute();
}

export function getSite(t: TenantDb, id: number): Promise<Site | undefined> {
  return t.selectFrom("sites").selectAll().where("id", "=", id).executeTakeFirst();
}

function cleanOrigins(origins: string[]): string {
  const list = origins.map(normalizeOrigin).filter((o): o is string => Boolean(o));
  return JSON.stringify([...new Set(list)].slice(0, 20));
}

export async function createSite(t: TenantDb, input: SiteInput): Promise<number> {
  const ts = nowIso();
  return t.insertInto("sites", {
    name: input.name.trim().slice(0, 120),
    domain: input.domain,
    public_key: `pk_live_${randomKey(20)}`,
    allowed_origins: cleanOrigins(input.allowedOrigins),
    children_mode: input.childrenMode ? 1 : 0,
    theme_json: "{}",
    created_at: ts,
    updated_at: ts,
  });
}

export async function updateSite(t: TenantDb, id: number, input: SiteInput): Promise<boolean> {
  const r = await t
    .updateTable("sites")
    .set({ name: input.name.trim().slice(0, 120), domain: input.domain, allowed_origins: cleanOrigins(input.allowedOrigins), children_mode: input.childrenMode ? 1 : 0, updated_at: nowIso() })
    .where("id", "=", id)
    .executeTakeFirst();
  return affected(r) > 0;
}

/** Banner settings (colours, position, language, Consent Mode mapping) in sites.theme_json. */
export async function updateSiteTheme(t: TenantDb, id: number, theme: BannerTheme): Promise<boolean> {
  const value: BannerTheme = { ...DEFAULT_THEME, ...theme };
  const r = await t.updateTable("sites").set({ theme_json: JSON.stringify(value), updated_at: nowIso() }).where("id", "=", id).executeTakeFirst();
  return affected(r) > 0;
}

/** Consent records are proof (s.6(10)): a site that has any can't be deleted. */
export async function siteHasConsentRecords(t: TenantDb, id: number): Promise<boolean> {
  return Boolean(await t.selectFrom("consent_events").select("id").where("site_id", "=", id).limit(1).executeTakeFirst());
}

export async function deleteSite(t: TenantDb, id: number): Promise<boolean> {
  if (await siteHasConsentRecords(t, id)) return false;
  return t.transaction(async (tx) => {
    await tx.updateTable("purposes").set({ site_id: null }).where("site_id", "=", id).execute();
    // Left-overs after a purge: state rows and the chain head (purge checkpoints stay as tombstones).
    await tx.deleteFrom("consent_state").where("site_id", "=", id).execute();
    await tx.deleteFrom("consent_chain_heads").where("site_id", "=", id).execute();
    return affected(await tx.deleteFrom("sites").where("id", "=", id).executeTakeFirst()) > 0;
  });
}

/** Archive: the site stops collecting consent (config and consent API refuse it); withdrawals still work. */
export async function setSiteArchived(t: TenantDb, id: number, archived: boolean): Promise<boolean> {
  const ts = nowIso();
  return affected(await t.updateTable("sites").set({ archived_at: archived ? ts : null, updated_at: ts }).where("id", "=", id).executeTakeFirst()) > 0;
}

// ── Contacts (Rule 9: grievance and DPO / authorised person) ──

export type ContactKind = ContactRow["kind"];
export const CONTACT_KINDS: readonly ContactKind[] = ["grievance", "dpo_or_authorised"];

export interface ContactInput {
  name: string;
  designation: string;
  email: string;
  phone: string;
  address: string;
}

export async function getContacts(t: TenantDb): Promise<{ grievance: ContactRow | null; dpo: ContactRow | null }> {
  const rows = await t.selectFrom("contacts").selectAll().execute();
  return { grievance: rows.find((r) => r.kind === "grievance") ?? null, dpo: rows.find((r) => r.kind === "dpo_or_authorised") ?? null };
}

export async function upsertContact(t: TenantDb, kind: ContactKind, input: ContactInput): Promise<void> {
  const ts = nowIso();
  const values = {
    name: input.name.trim().slice(0, 120),
    designation: input.designation.trim().slice(0, 120),
    email: input.email.trim().toLowerCase().slice(0, 190),
    phone: input.phone.trim().slice(0, 40),
    address: input.address.trim().slice(0, 400),
    updated_at: ts,
  };
  const r = await t.updateTable("contacts").set(values).where("kind", "=", kind).executeTakeFirst();
  if (affected(r) === 0) {
    const exists = await t.selectFrom("contacts").select("id").where("kind", "=", kind).executeTakeFirst();
    if (!exists) await t.insertInto("contacts", { ...values, kind, created_at: ts });
  }
}

export async function deleteContact(t: TenantDb, kind: ContactKind): Promise<boolean> {
  return affected(await t.deleteFrom("contacts").where("kind", "=", kind).executeTakeFirst()) > 0;
}

// ── Vendors / processors (s.8(2), Rule 6(1)(f)) ──

export interface VendorInput {
  name: string;
  service: string;
  dataShared: string[];
  location: "india" | "abroad";
  contractStatus: "none" | "pending" | "signed";
  contractDate: string | null;
  securityClause: boolean;
  reviewAt: string | null;
  erasureContact: string;
}

const dateOrNull = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function vendorValues(input: VendorInput) {
  return {
    name: input.name.trim().slice(0, 120),
    service: input.service.trim().slice(0, 160),
    data_shared: JSON.stringify(input.dataShared.map((s) => s.trim().slice(0, 120)).filter(Boolean).slice(0, 40)),
    location: input.location === "abroad" ? ("abroad" as const) : ("india" as const),
    contract_status: (["none", "pending", "signed"] as const).includes(input.contractStatus) ? input.contractStatus : ("none" as const),
    contract_date: dateOrNull(input.contractDate),
    security_clause: input.securityClause ? 1 : 0,
    review_at: dateOrNull(input.reviewAt),
    erasure_contact: input.erasureContact.trim().slice(0, 190),
  };
}

export function listVendors(t: TenantDb): Promise<VendorRow[]> {
  return t.selectFrom("vendors").selectAll().orderBy("name").execute();
}

export function getVendor(t: TenantDb, id: number): Promise<VendorRow | undefined> {
  return t.selectFrom("vendors").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function createVendor(t: TenantDb, input: VendorInput): Promise<number> {
  const ts = nowIso();
  return t.insertInto("vendors", { ...vendorValues(input), created_at: ts, updated_at: ts });
}

export async function updateVendor(t: TenantDb, id: number, input: VendorInput): Promise<boolean> {
  return affected(await t.updateTable("vendors").set({ ...vendorValues(input), updated_at: nowIso() }).where("id", "=", id).executeTakeFirst()) > 0;
}

export async function deleteVendor(t: TenantDb, id: number): Promise<boolean> {
  return t.transaction(async (tx) => {
    const deleted = affected(await tx.deleteFrom("vendors").where("id", "=", id).executeTakeFirst()) > 0;
    if (deleted) {
      for (const p of await tx.selectFrom("purposes").select(["id", "vendor_ids"]).execute()) {
        const ids = idList(p.vendor_ids);
        if (ids.includes(id)) await tx.updateTable("purposes").set({ vendor_ids: JSON.stringify(ids.filter((v) => v !== id)) }).where("id", "=", p.id).execute();
      }
    }
    return deleted;
  });
}

/** P1-02: vendors that process data without a signed contract. */
export function vendorsWithoutContract(vendors: VendorRow[]): VendorRow[] {
  return vendors.filter((v) => v.contract_status !== "signed" || !v.security_clause);
}

// ── Retention rules (s.8(7), Rule 8) ──

export interface RetentionInput {
  category: string;
  categoryHi: string;
  lawRef: string;
  periodDays: number;
  trigger: string;
  action: string;
  preNoticeHours: number | null;
  isLogs: boolean;
}

export function checkRetention(input: RetentionInput): RetentionIssue[] {
  const trigger = (RETENTION_TRIGGERS as readonly string[]).includes(input.trigger) ? (input.trigger as (typeof RETENTION_TRIGGERS)[number]) : "collection";
  const action = (RETENTION_ACTIONS as readonly string[]).includes(input.action) ? (input.action as (typeof RETENTION_ACTIONS)[number]) : "erase";
  return validateRetentionRule({ category: input.category, periodDays: input.periodDays, trigger, action, isLogs: input.isLogs, preNoticeHours: input.preNoticeHours });
}

function retentionValues(input: RetentionInput) {
  return {
    category: input.category.trim().slice(0, 160),
    category_hi: input.categoryHi.trim().slice(0, 160),
    law_ref: input.lawRef.trim().slice(0, 255),
    period_days: input.periodDays,
    trigger: (RETENTION_TRIGGERS as readonly string[]).includes(input.trigger) ? input.trigger : "collection",
    action: (RETENTION_ACTIONS as readonly string[]).includes(input.action) ? input.action : "erase",
    pre_notice_hours: input.preNoticeHours,
    is_logs: input.isLogs ? 1 : 0,
  };
}

export function listRetentionRules(t: TenantDb): Promise<RetentionRuleRow[]> {
  return t.selectFrom("retention_rules").selectAll().orderBy("id").execute();
}

export function getRetentionRule(t: TenantDb, id: number): Promise<RetentionRuleRow | undefined> {
  return t.selectFrom("retention_rules").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function createRetentionRule(t: TenantDb, input: RetentionInput): Promise<{ id: number } | { issues: RetentionIssue[] }> {
  const issues = checkRetention(input);
  if (issues.length) return { issues };
  const ts = nowIso();
  return { id: await t.insertInto("retention_rules", { ...retentionValues(input), created_at: ts, updated_at: ts }) };
}

export async function updateRetentionRule(t: TenantDb, id: number, input: RetentionInput): Promise<{ ok: boolean } | { issues: RetentionIssue[] }> {
  const issues = checkRetention(input);
  if (issues.length) return { issues };
  return { ok: affected(await t.updateTable("retention_rules").set({ ...retentionValues(input), updated_at: nowIso() }).where("id", "=", id).executeTakeFirst()) > 0 };
}

export async function deleteRetentionRule(t: TenantDb, id: number): Promise<boolean> {
  return t.transaction(async (tx) => {
    await tx.updateTable("purposes").set({ retention_rule_id: null }).where("retention_rule_id", "=", id).execute();
    return affected(await tx.deleteFrom("retention_rules").where("id", "=", id).executeTakeFirst()) > 0;
  });
}

// ── Purposes ──

export interface PurposeInput {
  key: string;
  nameEn: string;
  nameHi: string;
  descEn: string;
  descHi: string;
  basis: Basis;
  items: DataItem[];
  vendorIds: number[];
  retentionRuleId: number | null;
  siteId: number | null;
  isTracking: boolean;
  active: boolean;
  sortOrder?: number;
}

export function purposeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Keep only references that belong to this organisation. */
async function ownedRefs(t: TenantDb, input: PurposeInput) {
  const vendorIds = input.vendorIds.length
    ? (await t.selectFrom("vendors").select("id").where("id", "in", input.vendorIds).execute()).map((v) => v.id)
    : [];
  const retention = input.retentionRuleId ? await t.selectFrom("retention_rules").select("id").where("id", "=", input.retentionRuleId).executeTakeFirst() : undefined;
  const site = input.siteId ? await t.selectFrom("sites").select("id").where("id", "=", input.siteId).executeTakeFirst() : undefined;
  return { vendorIds, retentionRuleId: retention?.id ?? null, siteId: site?.id ?? null };
}

async function purposeValues(t: TenantDb, input: PurposeInput) {
  const refs = await ownedRefs(t, input);
  return {
    purpose_key: purposeKey(input.key || input.nameEn),
    name_en: input.nameEn.trim().slice(0, 160),
    name_hi: input.nameHi.trim().slice(0, 160),
    desc_en: input.descEn.trim().slice(0, 600),
    desc_hi: input.descHi.trim().slice(0, 600),
    basis: (BASES as readonly string[]).includes(input.basis) ? input.basis : ("consent" as Basis),
    data_items: JSON.stringify(parseDataItems(JSON.stringify(input.items))),
    vendor_ids: JSON.stringify(refs.vendorIds),
    retention_rule_id: refs.retentionRuleId,
    site_id: refs.siteId,
    is_tracking: input.isTracking ? 1 : 0,
    active: input.active ? 1 : 0,
    sort_order: input.sortOrder ?? 0,
  };
}

export function listPurposes(t: TenantDb): Promise<PurposeRow[]> {
  return t.selectFrom("purposes").selectAll().orderBy("sort_order").orderBy("id").execute();
}

export function getPurpose(t: TenantDb, id: number): Promise<PurposeRow | undefined> {
  return t.selectFrom("purposes").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function purposeKeyTaken(t: TenantDb, key: string, exceptId?: number): Promise<boolean> {
  const row = await t
    .selectFrom("purposes")
    .select("id")
    .where("purpose_key", "=", purposeKey(key))
    .$if(Boolean(exceptId), (qb) => qb.where("id", "!=", exceptId!))
    .executeTakeFirst();
  return Boolean(row);
}

export async function createPurpose(t: TenantDb, input: PurposeInput): Promise<number> {
  const ts = nowIso();
  return t.insertInto("purposes", { ...(await purposeValues(t, input)), created_at: ts, updated_at: ts });
}

export async function updatePurpose(t: TenantDb, id: number, input: PurposeInput): Promise<boolean> {
  const values = await purposeValues(t, input);
  return affected(await t.updateTable("purposes").set({ ...values, updated_at: nowIso() }).where("id", "=", id).executeTakeFirst()) > 0;
}

export async function deletePurpose(t: TenantDb, id: number): Promise<boolean> {
  return affected(await t.deleteFrom("purposes").where("id", "=", id).executeTakeFirst()) > 0;
}

// ── Audit log (insert-only) ──

export async function audit(t: TenantDb, userId: number | null, action: string, target = ""): Promise<void> {
  await t.insertInto("audit_log", { user_id: userId, action: action.slice(0, 60), target: target.slice(0, 190), created_at: nowIso() });
}
