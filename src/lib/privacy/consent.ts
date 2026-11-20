import "server-only";
import { EPIFIVE_BRAND, type Brand } from "../branding";
import { EDITION } from "../edition-meta";
import type { Kysely } from "kysely";
import { canonicalJson, eventHash, GENESIS_HASH, verifyChain, type ChainRow, type ChainVerification } from "@/core/consent/chain";
import { parseTheme, resolveGcmMap, type BannerTheme, type GcmMap } from "@/core/consent/banner";
import { dataItemLabel, parseDataItems } from "@/core/data-items";
import { isChildBlockedPurpose } from "@/core/children";
import { formatPeriod, sha256Hex } from "@/core/notice/render";
import { BOARD_URL, TEMPLATES, type Lang } from "@/core/notice/templates";
import type { ConsentAction, ConsentChannel, ConsentEventRow, ConsentStateRow, Database, Org, Site, SubjectKind } from "../db/schema";
import { tenantDb, type TenantDb } from "../db/tenant";
import { encryptForOrg, identifierHmac, normalizeIdentifier, signToken, verifyTokenSignature } from "../secrets";
import { noticeLinks } from "./notices";
import { getContacts, listPurposes, listRetentionRules, listVendors } from "./registers";
import { addUsage, consentQuota, getUsage } from "./usage";
import { csvCell, idList, jsonArray, nowIso } from "./util";

/**
 * Consent records (plan M2–M5; C1–C3, N4-05).
 *
 * Public entry points (the widget API) look a site up by its public key and
 * then work through a TenantDb bound to that site's organisation, so a key can
 * only ever touch its own organisation's records.
 */

export type { BannerTheme, GcmMap };

// ── Site lookup and origin checks ──

export interface PublicSite {
  site: Site;
  org: Org;
  t: TenantDb;
}

/** Site by public key, only for active organisations. The key is the only cross-tenant lookup. */
export async function findSiteByPublicKey(db: Kysely<Database>, publicKey: string): Promise<PublicSite | null> {
  if (!/^pk_(live|test)_[A-Za-z0-9]{8,40}$/.test(publicKey)) return null;
  // Archived sites stop collecting consent (their records stay until retention ends).
  const site = await db.selectFrom("sites").selectAll().where("public_key", "=", publicKey).where("archived_at", "is", null).executeTakeFirst();
  if (!site) return null;
  const org = await db.selectFrom("orgs").selectAll().where("id", "=", site.org_id).where("status", "=", "active").executeTakeFirst();
  if (!org) return null;
  return { site, org, t: tenantDb(db, org.id) };
}

/** True when a page origin may use the site's key: its domain, any subdomain, or an extra allowed origin. */
export function originAllowed(site: Pick<Site, "domain" | "allowed_origins">, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const domain = site.domain.toLowerCase();
  if (host === domain || host.endsWith(`.${domain}`)) return true;
  return jsonArray(site.allowed_origins).some((o) => typeof o === "string" && o.toLowerCase() === url.origin.toLowerCase());
}

// ── Public config (GET /api/v1/sites/{pk}/config) ──

export interface Bi {
  en: string;
  hi: string;
}

export interface ConfigPurpose {
  key: string;
  name: Bi;
  desc: Bi;
  items: { en: string[]; hi: string[] };
  vendors: string[];
  keep: Bi | null;
  tracking: boolean;
}

export interface SiteConfig {
  /** Config version: changes whenever anything below changes (used for ETag and the browser cache). */
  v: string;
  org: string;
  /** Latest published notice; null when nothing is published yet (the widget then stays inactive). */
  notice: { version: number; ids: { en: number | null; hi: number | null } } | null;
  links: { notice: string; rights: string; withdraw: string; board: string };
  contact: { name: string; email: string; phone: string } | null;
  /** Consent-based purposes: one toggle each, off by default (C1-01). */
  purposes: ConfigPurpose[];
  /** "Needed to run the website": shown without a toggle, with the basis (C1-04). */
  necessary: Array<{ key: string; name: Bi; desc: Bi; basis: Bi; items: { en: string[]; hi: string[] } }>;
  /** Purposes based on s.7(a) (voluntarily provided), used by wpk.form() for the short notice. */
  voluntary: Array<{ key: string; name: Bi }>;
  theme: Omit<BannerTheme, "gcm">;
  gcm: GcmMap;
  children: boolean;
  /** Branding link under the banner (Free: EpiFive; Pro: white-label setting, absent when empty). */
  brand?: { t: string; u: string };
}

export async function buildSiteConfig(t: TenantDb, site: Site, baseUrl: string, brand: Brand | null = EDITION === "free" ? EPIFIVE_BRAND : null): Promise<SiteConfig> {
  if (site.org_id !== t.orgId) throw new Error("Site does not belong to this organisation.");
  const org = await t.org();
  if (!org) throw new Error("Organisation not found.");
  const [purposes, vendors, rules, contacts, noticeRows] = await Promise.all([
    listPurposes(t),
    listVendors(t),
    listRetentionRules(t),
    getContacts(t),
    t.selectFrom("notice_versions").select(["id", "version", "lang"]).orderBy("version", "desc").limit(2).execute(),
  ]);
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const active = purposes.filter((p) => p.active === 1 && (p.site_id === null || p.site_id === site.id));
  const items = (json: string) => {
    const list = parseDataItems(json);
    return { en: list.map((i) => dataItemLabel(i, "en")), hi: list.map((i) => dataItemLabel(i, "hi")) };
  };
  const hiOr = (hi: string, en: string) => (hi.trim() ? hi : en);

  const latest = noticeRows[0]?.version;
  const notice = latest
    ? { version: latest, ids: { en: noticeRows.find((r) => r.version === latest && r.lang === "en")?.id ?? null, hi: noticeRows.find((r) => r.version === latest && r.lang === "hi")?.id ?? null } }
    : null;
  const contact = contacts.dpo ?? contacts.grievance;
  const theme = parseTheme(site.theme_json);
  const consentPurposes: ConfigPurpose[] = active
    .filter((p) => p.basis === "consent")
    .map((p) => {
      const rule = p.retention_rule_id ? ruleById.get(p.retention_rule_id) : undefined;
      return {
        key: p.purpose_key,
        name: { en: p.name_en, hi: hiOr(p.name_hi, p.name_en) },
        desc: { en: p.desc_en, hi: hiOr(p.desc_hi, p.desc_en) },
        items: items(p.data_items),
        vendors: idList(p.vendor_ids)
          .map((id) => vendorName.get(id))
          .filter((n): n is string => Boolean(n)),
        keep: rule ? { en: formatPeriod(rule.period_days, TEMPLATES.en) ?? "", hi: formatPeriod(rule.period_days, TEMPLATES.hi) ?? "" } : null,
        // K1-01: never offered to an under-18 visitor, even with a parent's consent (s.9(3)).
        tracking: isChildBlockedPurpose(p),
      };
    });

  const body: Omit<SiteConfig, "v"> = {
    org: org.name,
    notice,
    links: { ...noticeLinks(baseUrl, org.slug), board: BOARD_URL },
    contact: contact ? { name: contact.designation ? `${contact.name}, ${contact.designation}` : contact.name, email: contact.email, phone: contact.phone } : null,
    purposes: consentPurposes,
    necessary: active
      .filter((p) => p.basis === "necessary")
      .map((p) => ({
        key: p.purpose_key,
        name: { en: p.name_en, hi: hiOr(p.name_hi, p.name_en) },
        desc: { en: p.desc_en, hi: hiOr(p.desc_hi, p.desc_en) },
        basis: { en: TEMPLATES.en.basis.necessary, hi: TEMPLATES.hi.basis.necessary },
        items: items(p.data_items),
      })),
    voluntary: active.filter((p) => p.basis === "s7a_voluntary").map((p) => ({ key: p.purpose_key, name: { en: p.name_en, hi: hiOr(p.name_hi, p.name_en) } })),
    theme: { primary: theme.primary, background: theme.background, text: theme.text, position: theme.position, lang: theme.lang, floating: theme.floating },
    gcm: resolveGcmMap(theme, consentPurposes.map((p) => p.key)),
    children: site.children_mode === 1 || org.children_mode === 1,
    ...(brand ? { brand: { t: brand.text, u: brand.url } } : {}),
  };
  return { v: sha256Hex(canonicalJson(body)).slice(0, 16), ...body };
}

// ── Recording consent ──

export interface ConsentInput {
  subjectRef?: string;
  subject?: { kind: "email" | "phone"; value: string };
  /** purpose key → true (granted) / false (not granted). Unknown keys are ignored. */
  choices: Record<string, boolean>;
  lang: Lang;
  channel: ConsentChannel;
  noticeVersion: number;
  pageUrl?: string;
  ip?: string;
  userAgent?: string;
  widgetVersion?: string;
  /** Children mode: the visitor said they are under 18 (no processing before a parent's consent, s.9(1)). */
  under18?: boolean;
  /**
   * Optional monthly limit on consent events (0/undefined = unlimited, as in the self-hosted editions). Above the limit
   * plus grace, grants are refused ("plan_limit"); refusals and withdrawals are always recorded.
   */
  monthlyLimit?: number;
  /** Server-side callers only (demo data): the event time, in order. The public API never sets it. */
  at?: Date;
}

export type RecordResult =
  | { ok: true; subjectRef: string; recorded: number; events: ConsentEventRow[]; head: { seq: number; hash: string } }
  | { ok: false; error: "subject" | "notice" | "purposes" | "children" | "plan_limit" };

export interface WithdrawnEvent {
  orgId: number;
  siteId: number;
  subjectRef: string;
  subjectKind: SubjectKind;
  purposes: string[];
  channel: ConsentChannel;
}

/** Listeners for withdrawals (C2-02): email to the owner now, webhooks with S4. */
export type WithdrawListener = (event: WithdrawnEvent) => void | Promise<void>;
// Shared across module instances (dev hot reload, route bundles).
const listenerStore = globalThis as unknown as { __wpkWithdrawListeners?: Map<string, WithdrawListener> };
export const withdrawListeners: Map<string, WithdrawListener> = (listenerStore.__wpkWithdrawListeners ??= new Map());

async function emitWithdrawn(event: WithdrawnEvent): Promise<void> {
  for (const listener of withdrawListeners.values()) {
    try {
      await listener(event);
    } catch (error) {
      console.error("[consent] withdraw listener failed:", error instanceof Error ? error.message : error);
    }
  }
}

const SUBJECT_REF = /^[A-Za-z0-9_-]{16,64}$/;

/** /24 for IPv4, /48 for IPv6 (plan §7.4 minimisation). */
export function truncateIp(ip: string | undefined | null): string {
  const value = (ip ?? "").trim();
  const v4 = value.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/i);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (value.includes(":")) {
    const [head] = value.split("::");
    const parts = value.includes("::") ? head.split(":").filter(Boolean) : value.split(":");
    const first = [...parts, "0", "0", "0"].slice(0, 3).map((p) => p.toLowerCase().replace(/^0+(?=.)/, ""));
    if (first.every((p) => /^[0-9a-f]{1,4}$/.test(p))) return `${first.join(":")}::/48`;
  }
  return "";
}

/** Browser family only (no version, no device model). */
export function uaFamily(ua: string | undefined | null): string {
  const s = ua ?? "";
  const mobile = /Mobi|Android|iPhone|iPad/i.test(s) ? " mobile" : "";
  const family = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /Firefox\//.test(s)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : s
                ? "Other"
                : "";
  return family ? family + mobile : "";
}

/** Page address without query string or fragment (they can carry personal data). */
export function cleanPageUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return `${u.origin}${u.pathname}`.slice(0, 500);
  } catch {
    return "";
  }
}

const statusFor = (granted: boolean, previous: ConsentStateRow["status"] | undefined): { status: ConsentStateRow["status"]; action: ConsentAction } =>
  granted ? { status: "granted", action: "grant" } : previous === "granted" || previous === "withdrawn" ? { status: "withdrawn", action: "withdraw" } : { status: "denied", action: "deny" };

/** Lock the site's chain head (UPDATE takes the row lock on MySQL; SQLite serialises transactions). */
async function lockHead(t: TenantDb, siteId: number): Promise<{ seq: number; hash: string }> {
  const ts = nowIso();
  const updated = await t.updateTable("consent_chain_heads").set({ updated_at: ts }).where("site_id", "=", siteId).executeTakeFirst();
  if (Number(updated.numUpdatedRows ?? 0) === 0) {
    await t.insertInto("consent_chain_heads", { site_id: siteId, seq: 0, hash: GENESIS_HASH, updated_at: ts });
  }
  const head = await t.selectFrom("consent_chain_heads").select(["seq", "hash"]).where("site_id", "=", siteId).executeTakeFirstOrThrow();
  return { seq: Number(head.seq), hash: head.hash };
}

interface ResolvedSubject {
  subjectRef: string;
  subjectKind: SubjectKind;
  lookup: string | null;
  enc: string | null;
}

/**
 * Record a decision: one insert-only, hash-chained event per purpose whose
 * status changes (and for every purpose on a new notice version), then update
 * consent_state and the chain head, all in one transaction.
 */
export async function recordConsent(t: TenantDb, site: Site, input: ConsentInput): Promise<RecordResult> {
  if (site.archived_at) return { ok: false, error: "purposes" };
  // s.9(1): an under-18 visitor's choices are not recorded; only a verified parent can consent (parental flow).
  if (input.under18) return { ok: false, error: "children" };
  if (input.subject) {
    const normalized = normalizeIdentifier(input.subject.kind, input.subject.value);
    if (!normalized) return { ok: false, error: "subject" };
    const lookup = identifierHmac(t.orgId, input.subject.kind, normalized);
    return recordForSubject(t, site, { subjectRef: `${input.subject.kind === "email" ? "e" : "p"}_${lookup.slice(0, 40)}`, subjectKind: input.subject.kind, lookup, enc: encryptForOrg(t.orgId, normalized) }, input);
  }
  if (!input.subjectRef || !SUBJECT_REF.test(input.subjectRef)) return { ok: false, error: "subject" };
  return recordForSubject(t, site, { subjectRef: input.subjectRef, subjectKind: "browser", lookup: null, enc: null }, input);
}

async function recordForSubject(t: TenantDb, site: Site, subject: ResolvedSubject, input: ConsentInput): Promise<RecordResult> {
  if (site.org_id !== t.orgId) throw new Error("Site does not belong to this organisation.");
  const { subjectRef } = subject;
  const purposes = await listPurposes(t);
  const allowed = new Set(purposes.filter((p) => p.active === 1 && p.basis === "consent" && (p.site_id === null || p.site_id === site.id)).map((p) => p.purpose_key));
  const choices = Object.entries(input.choices).filter(([k, v]) => allowed.has(k) && typeof v === "boolean");
  if (!choices.length) return { ok: false, error: "purposes" };
  // K1-01 (s.9(3)): a known child (any parental consent record) can never get tracking, analytics or ads purposes.
  const blocked = new Set(purposes.filter((p) => isChildBlockedPurpose(p)).map((p) => p.purpose_key));
  if (choices.some(([k, v]) => v && blocked.has(k)) && (await isKnownChild(t, site.id, subjectRef))) return { ok: false, error: "children" };

  const notice = await t.selectFrom("notice_versions").select(["id", "version"]).where("version", "=", input.noticeVersion).where("lang", "=", input.lang).executeTakeFirst();
  if (!notice) return { ok: false, error: "notice" };

  // Optional monthly limit: over the limit plus grace, new grants are refused; refusals and withdrawals never are (s.6(4)).
  if (input.monthlyLimit && input.monthlyLimit > 0 && choices.some(([, v]) => v)) {
    const usage = await getUsage(t);
    if (consentQuota(usage.consentEvents, input.monthlyLimit) === "blocked") {
      await addUsage(t, { refused_events: 1 });
      return { ok: false, error: "plan_limit" };
    }
  }

  const result = await t.transaction(async (tx) => {
    let head = await lockHead(tx, site.id);
    const current = new Map(
      (await tx.selectFrom("consent_state").selectAll().where("site_id", "=", site.id).where("subject_ref", "=", subjectRef).execute()).map((s) => [s.purpose_key, s]),
    );
    const ts = input.at ? input.at.toISOString() : nowIso();
    const events: ConsentEventRow[] = [];
    const withdrawn: string[] = [];
    for (const [key, granted] of choices.sort(([a], [b]) => a.localeCompare(b))) {
      const prev = current.get(key);
      const { status, action } = statusFor(granted, prev?.status);
      if (prev && prev.status === status && Number(prev.notice_version) === notice.version) continue;
      const base = {
        org_id: t.orgId,
        site_id: site.id,
        seq: head.seq + 1,
        subject_ref: subjectRef,
        subject_kind: subject.subjectKind,
        subject_lookup_hmac: subject.lookup,
        subject_enc: subject.enc,
        purpose_key: key,
        action,
        notice_version: notice.version,
        notice_version_id: notice.id,
        lang: input.lang,
        channel: input.channel,
        page_url: cleanPageUrl(input.pageUrl),
        ip_trunc: truncateIp(input.ip),
        ua_family: uaFamily(input.userAgent),
        widget_ver: (input.widgetVersion ?? "").replace(/[^0-9A-Za-z.+-]/g, "").slice(0, 20),
        created_at: ts,
        prev_hash: head.hash,
      };
      const hash = eventHash(head.hash, base);
      const { org_id: _org, ...insertable } = base;
      void _org;
      const id = await tx.insertInto("consent_events", { ...insertable, hash });
      events.push({ id, ...base, hash });
      if (action === "withdraw" && prev?.status === "granted") withdrawn.push(key);
      head = { seq: base.seq, hash };
      if (prev) {
        await tx
          .updateTable("consent_state")
          .set({ status, notice_version: notice.version, last_event_id: id, updated_at: ts })
          .where("site_id", "=", site.id)
          .where("subject_ref", "=", subjectRef)
          .where("purpose_key", "=", key)
          .execute();
      } else {
        await tx.insertInto("consent_state", { site_id: site.id, subject_ref: subjectRef, purpose_key: key, status, notice_version: notice.version, last_event_id: id, updated_at: ts });
      }
    }
    if (events.length) await tx.updateTable("consent_chain_heads").set({ seq: head.seq, hash: head.hash, updated_at: ts }).where("site_id", "=", site.id).execute();
    return { events, head, withdrawn };
  });

  if (result.events.length) await addUsage(t, { consent_events: result.events.length });
  if (result.withdrawn.length) {
    await emitWithdrawn({ orgId: t.orgId, siteId: site.id, subjectRef, subjectKind: subject.subjectKind, purposes: result.withdrawn, channel: input.channel });
  }
  return { ok: true, subjectRef, recorded: result.events.length, events: result.events, head: result.head };
}

/** True when a parental consent record exists for this browser id (the visitor is a child). */
export async function isKnownChild(t: TenantDb, siteId: number, subjectRef: string): Promise<boolean> {
  const row = await t.selectFrom("parental_consents").select("id").where("site_id", "=", siteId).where("child_subject_ref", "=", subjectRef).where("status", "!=", "declined").limit(1).executeTakeFirst();
  return Boolean(row);
}

/**
 * Record what a verified parent agreed to for a child's browser id (plan M10).
 * Tracking, analytics and ads purposes are dropped (s.9(3)); channel "hosted_page".
 */
export async function recordParentalConsent(t: TenantDb, site: Site, childRef: string, purposeKeys: string[], opts: { lang: Lang; noticeVersion: number }): Promise<RecordResult> {
  if (site.org_id !== t.orgId) throw new Error("Site does not belong to this organisation.");
  if (!SUBJECT_REF.test(childRef)) return { ok: false, error: "subject" };
  const purposes = (await listPurposes(t)).filter((p) => p.active === 1 && p.basis === "consent" && (p.site_id === null || p.site_id === site.id) && !isChildBlockedPurpose(p));
  const choices = Object.fromEntries(purposes.map((p) => [p.purpose_key, purposeKeys.includes(p.purpose_key)]));
  return recordForSubject(t, site, { subjectRef: childRef, subjectKind: "browser", lookup: null, enc: null }, { choices, lang: opts.lang, channel: "hosted_page", noticeVersion: opts.noticeVersion });
}

/** Current status per purpose for one subject. */
export async function getConsentState(t: TenantDb, siteId: number, subjectRef: string): Promise<ConsentStateRow[]> {
  return t.selectFrom("consent_state").selectAll().where("site_id", "=", siteId).where("subject_ref", "=", subjectRef).orderBy("purpose_key").execute();
}

/** Withdraw every granted purpose of a subject (signed withdraw link; C2-04). */
export async function withdrawAll(t: TenantDb, site: Site, subjectRef: string, opts: { channel: ConsentChannel; lang: Lang; ip?: string; userAgent?: string }): Promise<RecordResult> {
  if (site.org_id !== t.orgId) throw new Error("Site does not belong to this organisation.");
  if (!SUBJECT_REF.test(subjectRef)) return { ok: false, error: "subject" };
  const granted = (await getConsentState(t, site.id, subjectRef)).filter((s) => s.status === "granted");
  const head = await t.selectFrom("consent_chain_heads").select(["seq", "hash"]).where("site_id", "=", site.id).executeTakeFirst();
  if (!granted.length) return { ok: true, subjectRef, recorded: 0, events: [], head: { seq: Number(head?.seq ?? 0), hash: head?.hash ?? GENESIS_HASH } };
  const latest = await t.selectFrom("notice_versions").select("version").where("lang", "=", opts.lang).orderBy("version", "desc").limit(1).executeTakeFirst();
  if (!latest) return { ok: false, error: "notice" };
  // Keep the stored subject fields so the new events link to the same person.
  const first = await t.selectFrom("consent_events").select(["subject_kind", "subject_lookup_hmac", "subject_enc"]).where("site_id", "=", site.id).where("subject_ref", "=", subjectRef).orderBy("seq").limit(1).executeTakeFirst();
  const subject: ResolvedSubject = { subjectRef, subjectKind: first?.subject_kind ?? "browser", lookup: first?.subject_lookup_hmac ?? null, enc: first?.subject_enc ?? null };
  return recordForSubject(t, site, subject, {
    choices: Object.fromEntries(granted.map((s) => [s.purpose_key, false])),
    lang: opts.lang,
    channel: opts.channel,
    noticeVersion: latest.version,
    ip: opts.ip,
    userAgent: opts.userAgent,
  });
}

// ── Signed withdraw links (plan M5; C2-04) ──

/** Token for /p/{org}/withdraw?t=… — carries only the site id and the pseudonymous subject ref. */
export function createWithdrawToken(siteId: number, subjectRef: string): string {
  const payload = Buffer.from(`${siteId}.${subjectRef}`).toString("base64url");
  return `${payload}.${signToken("withdraw", payload)}`;
}

export function readWithdrawToken(token: string): { siteId: number; subjectRef: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !verifyTokenSignature("withdraw", payload, sig)) return null;
  const [site, ...rest] = Buffer.from(payload, "base64url").toString("utf8").split(".");
  const siteId = Number(site);
  const subjectRef = rest.join(".");
  if (!Number.isInteger(siteId) || siteId < 1 || !SUBJECT_REF.test(subjectRef)) return null;
  return { siteId, subjectRef };
}

export function withdrawUrl(baseUrl: string, orgSlug: string, siteId: number, subjectRef: string): string {
  return `${noticeLinks(baseUrl, orgSlug).withdraw}?t=${createWithdrawToken(siteId, subjectRef)}`;
}

// ── Consent log (dashboard) ──

export async function listConsentEvents(t: TenantDb, siteId: number, opts: { limit?: number; offset?: number; subjectRef?: string } = {}): Promise<{ rows: ConsentEventRow[]; total: number }> {
  let q = t.selectFrom("consent_events").where("site_id", "=", siteId);
  if (opts.subjectRef) q = q.where("subject_ref", "=", opts.subjectRef);
  const [rows, count] = await Promise.all([
    q.selectAll().orderBy("seq", "desc").limit(Math.min(500, opts.limit ?? 50)).offset(opts.offset ?? 0).execute(),
    q.select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst(),
  ]);
  return { rows, total: Number(count?.n ?? 0) };
}

export interface ChainReport extends ChainVerification {
  siteId: number;
  storedHead: { seq: number; hash: string } | null;
  /** Latest retention checkpoint: rows up to through_seq were purged and verification starts from its hash. */
  checkpoint: { throughSeq: number; throughHash: string; cutoffAt: string; purgedTotal: number; at: string } | null;
  verifiedAt: string;
}

/** Latest purge checkpoint of a site and the total number of purged rows. */
export async function latestCheckpoint(t: TenantDb, siteId: number): Promise<ChainReport["checkpoint"]> {
  const rows = await t.selectFrom("consent_purge_checkpoints").selectAll().where("site_id", "=", siteId).orderBy("through_seq", "desc").execute();
  if (!rows.length) return null;
  return { throughSeq: Number(rows[0].through_seq), throughHash: rows[0].through_hash, cutoffAt: rows[0].cutoff_at, purgedTotal: rows.reduce((n, r) => n + Number(r.purged_count), 0), at: rows[0].created_at };
}

/** Verify the chain of one site in pages of 1,000 rows, starting after the latest purge checkpoint (if any). */
export async function verifySiteChain(t: TenantDb, siteId: number): Promise<ChainReport> {
  const storedRow = await t.selectFrom("consent_chain_heads").select(["seq", "hash"]).where("site_id", "=", siteId).executeTakeFirst();
  const storedHead = storedRow ? { seq: Number(storedRow.seq), hash: storedRow.hash } : null;
  const checkpoint = await latestCheckpoint(t, siteId);
  let start = checkpoint ? { seq: checkpoint.throughSeq, hash: checkpoint.throughHash } : { seq: 0, hash: GENESIS_HASH };
  let total = 0;
  for (;;) {
    const page = (await t.selectFrom("consent_events").selectAll().where("site_id", "=", siteId).where("seq", ">", start.seq).orderBy("seq").limit(1000).execute()) as unknown as ChainRow[];
    const last = page.length < 1000;
    const r = verifyChain(page, { start, head: last ? (storedHead ?? { seq: 0, hash: GENESIS_HASH }) : undefined });
    total += r.count;
    if (!r.ok || last) return { ...r, count: total, siteId, storedHead, checkpoint, verifiedAt: nowIso() };
    start = { seq: r.lastSeq, hash: r.head };
  }
}

const CSV_COLUMNS = ["seq", "created_at", "subject_ref", "subject_kind", "purpose_key", "action", "notice_version", "notice_version_id", "lang", "channel", "page_url", "ip_trunc", "ua_family", "widget_ver", "prev_hash", "hash"] as const;

/** CSV of a site's log in sequence order, with the verified chain head in the trailer (C3-04). */
export async function consentLogCsv(t: TenantDb, siteId: number): Promise<string> {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  let after = 0;
  for (;;) {
    const page = await t.selectFrom("consent_events").selectAll().where("site_id", "=", siteId).where("seq", ">", after).orderBy("seq").limit(1000).execute();
    for (const row of page) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
    if (page.length < 1000) break;
    after = Number(page[page.length - 1].seq);
  }
  const report = await verifySiteChain(t, siteId);
  lines.push("");
  lines.push(`# chain_ok,${report.ok}`);
  lines.push(`# chain_head_seq,${report.lastSeq}`);
  lines.push(`# chain_head_hash,${report.head}`);
  lines.push(`# verified_at,${report.verifiedAt}`);
  if (report.checkpoint) {
    lines.push(`# purged_through_seq,${report.checkpoint.throughSeq}`);
    lines.push(`# purged_through_hash,${report.checkpoint.throughHash}`);
    lines.push(`# purged_records,${report.checkpoint.purgedTotal}`);
    lines.push(`# purge_cutoff,${report.checkpoint.cutoffAt}`);
  }
  lines.push("# hash = sha256(prev_hash || canonical_json(event)); not legal advice");
  return lines.join("\r\n") + "\r\n";
}
