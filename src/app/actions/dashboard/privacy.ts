"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BANNER_LANGS, BANNER_POSITIONS, GCM_TYPES, parseTheme, themeIssues, type BannerTheme } from "@/core/consent/banner";
import { DATA_ITEMS, type DataItem } from "@/core/data-items";
import { BASES, type Basis } from "@/core/notice/render";
import { SECTORS, type Sector } from "@/core/presets";
import { businessStep, contactStep, deriveFlags, rightsStep } from "@/core/questionnaire";
import type { RetentionIssue } from "@/core/retention";
import { getCurrentUser } from "@/lib/auth/session";
import { idParam } from "@/lib/db/tenant";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { createOrgForUser, guardOrgAction, switchOrg } from "@/lib/org-context";
import { activeSiteCount, atLimit } from "@/lib/edition";
import { publishNotice } from "@/lib/privacy/notices";
import { updateOrgProfile } from "@/lib/privacy/orgs";
import {
  audit,
  createPurpose,
  createRetentionRule,
  createSite,
  createVendor,
  deleteContact,
  deletePurpose,
  deleteRetentionRule,
  deleteVendor,
  getSite,
  setSiteArchived,
  purposeKey,
  purposeKeyTaken,
  updatePurpose,
  updateRetentionRule,
  updateSite,
  updateSiteTheme,
  updateVendor,
  upsertContact,
  type ContactInput,
  type PurposeInput,
  type RetentionInput,
  type VendorInput,
} from "@/lib/privacy/registers";
import { deleteSiteAfterRetention } from "@/lib/privacy/retention";
import { applyPreset, saveAnswers } from "@/lib/privacy/setup";
import { normalizeDomain } from "@/lib/privacy/util";
import type { FormState } from "../types";

/**
 * Organisation dashboard actions. Every action re-checks the session and the
 * membership through guardOrgAction() and only touches data through the
 * returned TenantDb, so ids posted from another organisation are never found.
 */

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
const bool = (fd: FormData, key: string) => fd.get(key) === "on" || fd.get(key) === "1";
const list = (fd: FormData, key: string) => fd.getAll(key).filter((v): v is string => typeof v === "string");
const lines = (value: string) => value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const retentionIssueKey: Record<RetentionIssue, MessageKey> = {
  category: "dash.retention.err.category",
  period: "dash.retention.err.period",
  log_floor: "dash.retention.err.logFloor",
  pre_notice: "dash.retention.err.preNotice",
};

// ── Organisations ──

export async function createOrgAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  if (!user) return { error: t("dash.err.session") };
  const name = str(fd, "name").trim();
  if (name.length < 2 || name.length > 120) return { error: t("dash.org.err.name") };
  const sector = str(fd, "sector");
  const result = await createOrgForUser(user, { name, sector: (SECTORS as readonly string[]).includes(sector) ? sector : "other" });
  if ("error" in result) return { error: t(result.error, { limit: result.limit ?? 0 }) };
  await switchOrg(user.id, result.id);
  redirect("/dashboard/setup?step=1&new=1");
}

// ── Questionnaire wizard ──

export async function saveWizardStepAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const step = str(fd, "step");

  if (step === "1") {
    const parsed = businessStep.safeParse({
      name: str(fd, "name"),
      legal_name: str(fd, "legal_name"),
      sector: str(fd, "sector"),
      goods_services_en: str(fd, "goods_services_en"),
      goods_services_hi: str(fd, "goods_services_hi"),
      website_url: str(fd, "website_url"),
      third_schedule: str(fd, "third_schedule") || "none",
      is_sdf: bool(fd, "is_sdf"),
    });
    if (!parsed.success) return { error: tr("dash.wizard.err.business") };
    const d = parsed.data;
    await updateOrgProfile(g.t, { ...d });
    await saveAnswers(g.t, { business: d, flags: deriveFlags(d) });
    await audit(g.t, g.user.id, "wizard.business");
    revalidatePath("/dashboard", "layout");
    redirect("/dashboard/setup?step=2");
  }

  if (step === "2") {
    const contact = (prefix: string): ContactInput => ({
      name: str(fd, `${prefix}_name`),
      designation: str(fd, `${prefix}_designation`),
      email: str(fd, `${prefix}_email`),
      phone: str(fd, `${prefix}_phone`),
      address: str(fd, `${prefix}_address`),
    });
    const parsed = contactStep.safeParse({ grievance: contact("g"), dpo_same: bool(fd, "dpo_same"), dpo: contact("d") });
    if (!parsed.success) return { error: tr("dash.contacts.err.required") };
    await upsertContact(g.t, "grievance", parsed.data.grievance);
    if (parsed.data.dpo_same || !parsed.data.dpo.name.trim()) await deleteContact(g.t, "dpo_or_authorised");
    else await upsertContact(g.t, "dpo_or_authorised", parsed.data.dpo);
    await saveAnswers(g.t, { contacts_done: true });
    redirect("/dashboard/setup?step=3");
  }

  if (step === "3") {
    const org = await g.t.org();
    const sector = (org?.sector ?? "other") as Sector;
    const keys = list(fd, "purpose");
    if (keys.length) await applyPreset(g.t, sector, keys);
    await saveAnswers(g.t, { purposes_done: true });
    revalidatePath("/dashboard/purposes");
    redirect("/dashboard/setup?step=4");
  }

  if (step === "4") {
    const parsed = rightsStep.safeParse({ response_days: str(fd, "response_days"), identifiers: list(fd, "identifiers"), children_mode: bool(fd, "children_mode") });
    if (!parsed.success) return { error: tr("dash.wizard.err.identifiers") };
    await updateOrgProfile(g.t, parsed.data);
    await saveAnswers(g.t, { rights: parsed.data }, true);
    redirect("/dashboard/notices?from=wizard");
  }
  return { error: tr("dash.err.generic") };
}

export async function saveOrgSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const business = businessStep.safeParse({
    name: str(fd, "name"),
    legal_name: str(fd, "legal_name"),
    sector: str(fd, "sector"),
    goods_services_en: str(fd, "goods_services_en"),
    goods_services_hi: str(fd, "goods_services_hi"),
    website_url: str(fd, "website_url"),
    third_schedule: str(fd, "third_schedule") || "none",
    is_sdf: false,
  });
  if (!business.success) return { error: tr("dash.wizard.err.business") };
  const rights = rightsStep.safeParse({ response_days: str(fd, "response_days"), identifiers: list(fd, "identifiers"), children_mode: bool(fd, "children_mode") });
  if (!rights.success) return { error: tr("dash.wizard.err.identifiers") };
  await updateOrgProfile(g.t, { ...business.data, ...rights.data, internal_target_days: Number(str(fd, "internal_target_days")) || 0, details_required: list(fd, "details_required") });
  await audit(g.t, g.user.id, "org.update");
  revalidatePath("/dashboard", "layout");
  return { success: tr("dash.saved") };
}

// ── Contacts ──

export async function saveContactAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const kind = str(fd, "kind") === "dpo_or_authorised" ? "dpo_or_authorised" : "grievance";
  const input: ContactInput = { name: str(fd, "name"), designation: str(fd, "designation"), email: str(fd, "email"), phone: str(fd, "phone"), address: str(fd, "address") };
  if (!input.name.trim() || (!input.email.trim() && !input.phone.trim())) return { error: tr("dash.contacts.err.required") };
  if (input.email.trim() && !z.string().email().safeParse(input.email.trim()).success) return { error: tr("dash.contacts.err.email") };
  await upsertContact(g.t, kind, input);
  await audit(g.t, g.user.id, "contact.save", kind);
  revalidatePath("/dashboard/contacts");
  return { success: tr("dash.saved") };
}

export async function deleteContactAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  await deleteContact(g.t, str(fd, "kind") === "dpo_or_authorised" ? "dpo_or_authorised" : "grievance");
  revalidatePath("/dashboard/contacts");
  return { success: (await getT())("dash.deleted") };
}

// ── Purposes ──

function purposeFromForm(fd: FormData): PurposeInput {
  const catalogue = new Set(DATA_ITEMS.map((i) => i.key));
  const items: DataItem[] = list(fd, "items").filter((k) => catalogue.has(k)).map((key) => ({ key }));
  for (const line of lines(str(fd, "custom_items"))) {
    const [en, hi = ""] = line.split("|").map((s) => s.trim());
    if (en) items.push({ en, hi });
  }
  const basis = str(fd, "basis");
  return {
    key: str(fd, "key") || str(fd, "name_en"),
    nameEn: str(fd, "name_en"),
    nameHi: str(fd, "name_hi"),
    descEn: str(fd, "desc_en"),
    descHi: str(fd, "desc_hi"),
    basis: (BASES as readonly string[]).includes(basis) ? (basis as Basis) : "consent",
    items,
    vendorIds: list(fd, "vendor_ids").map(idParam).filter((v): v is number => v !== null),
    retentionRuleId: idParam(str(fd, "retention_rule_id")),
    siteId: idParam(str(fd, "site_id")),
    isTracking: bool(fd, "is_tracking"),
    active: bool(fd, "active"),
    sortOrder: Number(str(fd, "sort_order")) || 0,
  };
}

export async function savePurposeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const id = idParam(str(fd, "id"));
  const input = purposeFromForm(fd);
  if (!input.nameEn.trim() || !purposeKey(input.key)) return { error: tr("dash.purposes.err.name") };
  if (!input.items.length) return { error: tr("dash.purposes.err.items") };
  // K1/C1: tracking can never be presented as "necessary".
  if (input.isTracking && input.basis !== "consent") return { error: tr("dash.purposes.err.tracking") };
  if (await purposeKeyTaken(g.t, input.key, id ?? undefined)) return { error: tr("dash.purposes.err.key") };
  if (id) {
    if (!(await updatePurpose(g.t, id, input))) return { error: tr("dash.err.notFound") };
    await audit(g.t, g.user.id, "purpose.update", String(id));
    revalidatePath("/dashboard/purposes");
    return { success: tr("dash.saved") };
  }
  const newId = await createPurpose(g.t, input);
  await audit(g.t, g.user.id, "purpose.create", String(newId));
  redirect("/dashboard/purposes?saved=1");
}

export async function deletePurposeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id || !(await deletePurpose(g.t, id))) return { error: (await getT())("dash.err.notFound") };
  await audit(g.t, g.user.id, "purpose.delete", String(id));
  redirect("/dashboard/purposes?deleted=1");
}

// ── Vendors ──

function vendorFromForm(fd: FormData): VendorInput {
  const status = str(fd, "contract_status");
  return {
    name: str(fd, "name"),
    service: str(fd, "service"),
    dataShared: lines(str(fd, "data_shared").replace(/,/g, "\n")),
    location: str(fd, "location") === "abroad" ? "abroad" : "india",
    contractStatus: status === "signed" || status === "pending" ? status : "none",
    contractDate: str(fd, "contract_date") || null,
    securityClause: bool(fd, "security_clause"),
    reviewAt: str(fd, "review_at") || null,
    erasureContact: str(fd, "erasure_contact"),
  };
}

export async function saveVendorAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const input = vendorFromForm(fd);
  if (!input.name.trim()) return { error: tr("dash.vendors.err.name") };
  const id = idParam(str(fd, "id"));
  if (id) {
    if (!(await updateVendor(g.t, id, input))) return { error: tr("dash.err.notFound") };
    await audit(g.t, g.user.id, "vendor.update", String(id));
    revalidatePath("/dashboard/vendors");
    return { success: tr("dash.saved") };
  }
  await audit(g.t, g.user.id, "vendor.create", String(await createVendor(g.t, input)));
  revalidatePath("/dashboard/vendors");
  return { success: tr("dash.vendors.added") };
}

export async function deleteVendorAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id || !(await deleteVendor(g.t, id))) return { error: (await getT())("dash.err.notFound") };
  await audit(g.t, g.user.id, "vendor.delete", String(id));
  redirect("/dashboard/vendors?deleted=1");
}

// ── Retention rules ──

function retentionFromForm(fd: FormData): RetentionInput {
  const amount = Math.round(Number(str(fd, "period_amount")));
  const unit = str(fd, "period_unit");
  const factor = unit === "years" ? 365 : unit === "months" ? 30 : 1;
  const preNotice = str(fd, "pre_notice_hours").trim();
  return {
    category: str(fd, "category"),
    categoryHi: str(fd, "category_hi"),
    lawRef: str(fd, "law_ref"),
    periodDays: unit === "withdrawal" ? 0 : Number.isFinite(amount) ? amount * factor : -1,
    trigger: unit === "withdrawal" ? "withdrawal" : str(fd, "trigger"),
    action: str(fd, "action"),
    preNoticeHours: preNotice ? Math.round(Number(preNotice)) : null,
    isLogs: bool(fd, "is_logs"),
  };
}

export async function saveRetentionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const input = retentionFromForm(fd);
  const id = idParam(str(fd, "id"));
  const result = id ? await updateRetentionRule(g.t, id, input) : await createRetentionRule(g.t, input);
  if ("issues" in result) return { error: result.issues.map((i) => tr(retentionIssueKey[i])).join(" ") };
  if ("ok" in result && !result.ok) return { error: tr("dash.err.notFound") };
  await audit(g.t, g.user.id, id ? "retention.update" : "retention.create", String(id ?? ("id" in result ? result.id : "")));
  revalidatePath("/dashboard/retention");
  return { success: tr("dash.saved") };
}

export async function deleteRetentionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id || !(await deleteRetentionRule(g.t, id))) return { error: (await getT())("dash.err.notFound") };
  await audit(g.t, g.user.id, "retention.delete", String(id));
  redirect("/dashboard/retention?deleted=1");
}

// ── Sites ──

function siteFromForm(fd: FormData) {
  return {
    name: str(fd, "name"),
    domain: normalizeDomain(str(fd, "domain")),
    allowedOrigins: lines(str(fd, "allowed_origins")),
    childrenMode: bool(fd, "children_mode"),
  };
}

export async function saveSiteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const input = siteFromForm(fd);
  if (!input.name.trim()) return { error: tr("dash.sites.err.name") };
  if (!input.domain) return { error: tr("dash.sites.err.domain") };
  const id = idParam(str(fd, "id"));
  if (id) {
    if (!(await updateSite(g.t, id, { ...input, domain: input.domain }))) return { error: tr("dash.err.notFound") };
    revalidatePath("/dashboard/sites");
    return { success: tr("dash.saved") };
  }
  if (atLimit(await activeSiteCount(g.t), g.entitlements.maxSites)) return { error: tr("dash.sites.err.limit", { limit: g.entitlements.maxSites }) };
  await audit(g.t, g.user.id, "site.create", String(await createSite(g.t, { ...input, domain: input.domain })));
  revalidatePath("/dashboard/sites");
  return { success: tr("dash.sites.added") };
}

export async function deleteSiteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const id = idParam(str(fd, "id"));
  if (!id) return { error: tr("dash.err.notFound") };
  // Sites with consent records: archive first, delete only after their retention ended (records purged under a checkpoint).
  const result = await deleteSiteAfterRetention(g.t, id, g.user.id);
  if (!result.ok) {
    const key: Record<typeof result.error, MessageKey> = { not_found: "dash.err.notFound", not_archived: "dash.sites.err.hasRecords", not_expired: "dash.sites.err.notExpired", chain_broken: "dash.sites.err.chainBroken" };
    return { error: tr(key[result.error]) };
  }
  redirect("/dashboard/sites?deleted=1");
}

export async function archiveSiteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const id = idParam(str(fd, "id"));
  const archive = str(fd, "archive") === "1";
  // Archived sites do not count towards the edition limit, so bringing one back must fit in it.
  if (!archive && atLimit(await activeSiteCount(g.t), g.entitlements.maxSites)) return { error: tr("dash.sites.err.limit", { limit: g.entitlements.maxSites }) };
  if (!id || !(await setSiteArchived(g.t, id, archive))) return { error: tr("dash.err.notFound") };
  await audit(g.t, g.user.id, archive ? "site.archive" : "site.unarchive", String(id));
  revalidatePath(`/dashboard/sites/${id}`);
  revalidatePath("/dashboard/sites");
  return { success: tr(archive ? "dash.sites.archived" : "dash.sites.unarchived") };
}

export async function saveBannerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const id = idParam(str(fd, "id"));
  const site = id ? await getSite(g.t, id) : undefined;
  if (!site) return { error: tr("dash.err.notFound") };
  const current = parseTheme(site.theme_json);
  const gcm: BannerTheme["gcm"] = {};
  for (const type of GCM_TYPES) {
    const v = str(fd, `gcm_${type}`);
    if (/^[a-z0-9_]{0,60}$/.test(v)) gcm[type] = v;
  }
  const position = str(fd, "position");
  const lang = str(fd, "lang");
  // parseTheme validates colours (falls back to the current value when invalid).
  const theme = parseTheme(
    JSON.stringify({
      primary: str(fd, "primary") || current.primary,
      background: str(fd, "background") || current.background,
      text: str(fd, "text") || current.text,
      position: (BANNER_POSITIONS as readonly string[]).includes(position) ? position : current.position,
      lang: (BANNER_LANGS as readonly string[]).includes(lang) ? lang : current.lang,
      floating: bool(fd, "floating"),
      gcm,
    }),
  );
  const issues = themeIssues(theme);
  if (issues.includes("text_contrast")) return { error: tr("dash.banner.err.contrast") };
  if (issues.includes("button_contrast")) return { error: tr("dash.banner.err.button") };
  await updateSiteTheme(g.t, site.id, theme);
  await audit(g.t, g.user.id, "site.banner", String(site.id));
  revalidatePath(`/dashboard/sites/${site.id}`);
  return { success: tr("dash.saved") };
}

// ── Notices ──

export async function publishNoticeAction(): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const result = await publishNotice(g.t, { baseUrl: g.baseUrl, userId: g.user.id });
  if (!result.ok) return { error: tr("dash.notices.err.issues", { count: result.issues.length }) };
  revalidatePath("/dashboard/notices");
  redirect(`/dashboard/notices/${result.version}?published=1`);
}
