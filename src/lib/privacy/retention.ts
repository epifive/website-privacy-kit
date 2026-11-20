import "server-only";
import { istDateTime } from "@/core/breach/model";
import type { Lang } from "@/core/notice/templates";
import { clampConsentRetention, CONSENT_RETENTION_DEFAULT_DAYS, consentPurgeCutoff, logFloorCutoff, planErasureTask, signOffBlock, taskReminderDue, type SignOffBlock } from "@/core/retention";
import { preErasureNotice, processorErase } from "@/core/retention-texts";
import type { ErasureTaskRow, Site } from "../db/schema";
import type { TenantDb } from "../db/tenant";
import { latestCheckpoint, verifySiteChain } from "./consent";
import { sendLoggedMail } from "./mailer";
import { orgContact } from "./rights";
import { audit, deleteSite, getSite, listPurposes, listRetentionRules, listVendors } from "./registers";
import { csvCell, idList, nowIso } from "./util";

/**
 * Retention schedule, erasure tasks and the consent-record purge (plan M9; E1–E3).
 *
 * - Every retention rule with a fixed period gets a periodic erasure task
 *   (every 30 days) that a member signs off as done or skipped, with a note.
 * - An erasure request creates one task for the business's own systems and one
 *   per processor (s.8(7)(b): "cause its Data Processor to erase").
 * - The optional pre-erasure notice is OFF by default: Rule 8(2) makes a
 *   48-hour notice mandatory only for Third Schedule classes; for others it is
 *   good practice. When on, tasks cannot be signed off before the notice was
 *   sent and its hours have passed.
 * - Logs and consent records are never erased before one year (Rule 8(3)).
 */

const affected = (r: { numUpdatedRows?: bigint } | undefined) => Number(r?.numUpdatedRows ?? 0);

// ── Settings ──

export async function updateRetentionSettings(t: TenantDb, input: { consentRetentionDays: number; preErasureNotice: boolean }): Promise<void> {
  await t.updateOrg({ consent_retention_days: clampConsentRetention(input.consentRetentionDays), pre_erasure_notice: input.preErasureNotice ? 1 : 0, updated_at: nowIso() });
}

// ── Tasks ──

export function listTasks(t: TenantDb, opts: { status?: "open" | "closed" | "all"; requestId?: number } = {}): Promise<ErasureTaskRow[]> {
  let q = t.selectFrom("erasure_tasks").selectAll();
  if (opts.status === "open") q = q.where("status", "=", "open");
  else if (opts.status === "closed") q = q.where("status", "!=", "open");
  if (opts.requestId) q = q.where("request_id", "=", opts.requestId);
  return q.orderBy("due_at").orderBy("id").limit(500).execute();
}

export function getTask(t: TenantDb, id: number): Promise<ErasureTaskRow | undefined> {
  return t.selectFrom("erasure_tasks").selectAll().where("id", "=", id).executeTakeFirst();
}

/** Create the next periodic task for every rule that has none open (E1-01). Returns how many were created. */
export async function ensureRuleTasks(t: TenantDb, now: Date = new Date()): Promise<number> {
  const org = await t.org();
  if (!org) return 0;
  const [rules, tasks, purposes] = await Promise.all([listRetentionRules(t), t.selectFrom("erasure_tasks").select(["rule_id", "status", "signed_off_at", "due_at"]).where("source", "=", "rule").execute(), listPurposes(t)]);
  let created = 0;
  for (const rule of rules) {
    if (rule.action === "review" && rule.period_days <= 0) continue;
    const mine = tasks.filter((x) => x.rule_id === rule.id);
    if (mine.some((x) => x.status === "open")) continue;
    const last = mine.map((x) => x.signed_off_at ?? x.due_at).sort().pop() ?? null;
    const plan = planErasureTask({ periodDays: rule.period_days, action: rule.action, trigger: rule.trigger, preNoticeHours: rule.pre_notice_hours, createdAt: rule.created_at, lastRunAt: last, preNoticeEnabled: org.pre_erasure_notice === 1 });
    if (!plan) continue;
    const linked = purposes.filter((p) => p.retention_rule_id === rule.id).map((p) => p.name_en);
    const ts = now.toISOString();
    await t.insertInto("erasure_tasks", {
      source: "rule",
      rule_id: rule.id,
      request_id: null,
      vendor_id: null,
      title: `${rule.action === "anonymise" ? "Anonymise" : rule.action === "review" ? "Review" : "Erase"}: ${rule.category}${linked.length ? ` (${linked.join(", ")})` : ""}`.slice(0, 255),
      is_logs: rule.is_logs,
      cutoff_at: plan.cutoffAt,
      due_at: plan.dueAt,
      pre_notice_at: plan.preNoticeAt,
      pre_notice_hours: plan.preNoticeAt ? (rule.pre_notice_hours ?? 48) : null,
      pre_notice_sent_at: null,
      status: "open",
      signed_off_by: null,
      signed_off_at: null,
      sign_off_note: "",
      reminded_pre_notice_at: null,
      reminded_soon_at: null,
      reminded_overdue_at: null,
      created_at: ts,
      updated_at: ts,
    });
    created++;
  }
  return created;
}

/**
 * E1-02: tasks for an erasure request — the business's own systems plus each
 * processor that receives data (vendors linked to active purposes; all vendors
 * when none are linked). Due on the request's due date. Idempotent.
 */
export async function createRequestErasureTasks(t: TenantDb, requestId: number, userId: number | null): Promise<{ ok: true; created: number } | { ok: false; error: "not_found" | "type" }> {
  const req = await t.selectFrom("rights_requests").select(["id", "ref", "type", "due_at", "status"]).where("id", "=", requestId).executeTakeFirst();
  if (!req) return { ok: false, error: "not_found" };
  if (req.type !== "erasure") return { ok: false, error: "type" };
  const existing = await t.selectFrom("erasure_tasks").select(["vendor_id"]).where("request_id", "=", requestId).execute();
  const [vendors, purposes] = await Promise.all([listVendors(t), listPurposes(t)]);
  const linked = new Set(purposes.filter((p) => p.active === 1).flatMap((p) => idList(p.vendor_ids)));
  const targets = linked.size ? vendors.filter((v) => linked.has(v.id)) : vendors;
  const ts = nowIso();
  const base = { source: "request" as const, rule_id: null, request_id: requestId, is_logs: 0, cutoff_at: null, due_at: req.due_at, pre_notice_at: null, pre_notice_hours: null, pre_notice_sent_at: null, status: "open" as const, signed_off_by: null, signed_off_at: null, sign_off_note: "", reminded_pre_notice_at: null, reminded_soon_at: null, reminded_overdue_at: null, created_at: ts, updated_at: ts };
  const rows = [];
  if (!existing.some((e) => e.vendor_id === null)) rows.push({ ...base, vendor_id: null, title: `Erase in our own systems — request ${req.ref}` });
  for (const v of targets) if (!existing.some((e) => e.vendor_id === v.id)) rows.push({ ...base, vendor_id: v.id, title: `Ask ${v.name} to erase — request ${req.ref}`.slice(0, 255) });
  if (rows.length) await t.insertInto("erasure_tasks", rows);
  if (rows.length) await audit(t, userId, "erasure.tasks", `${req.ref}:${rows.length}`);
  return { ok: true, created: rows.length };
}

export async function markPreNoticeSent(t: TenantDb, id: number, at: string, userId: number | null): Promise<{ ok: true } | { ok: false; error: "not_found" | "no_notice" | "times" }> {
  const task = await getTask(t, id);
  if (!task) return { ok: false, error: "not_found" };
  if (!task.pre_notice_at) return { ok: false, error: "no_notice" };
  if (!Number.isFinite(Date.parse(at))) return { ok: false, error: "times" };
  await t.updateTable("erasure_tasks").set({ pre_notice_sent_at: new Date(at).toISOString(), updated_at: nowIso() }).where("id", "=", id).execute();
  await audit(t, userId, "erasure.pre_notice", String(id));
  return { ok: true };
}

export type SignOffResult = { ok: true } | { ok: false; error: "not_found" | "closed" | "note" | SignOffBlock };

/** Sign off a task as done (erased) or skipped (with a reason). Done is blocked by signOffBlock() (E3-02, E2-02). */
export async function signOffTask(t: TenantDb, id: number, input: { status: "done" | "skipped"; note: string }, userId: number | null, now: Date = new Date()): Promise<SignOffResult> {
  const task = await getTask(t, id);
  if (!task) return { ok: false, error: "not_found" };
  if (task.status !== "open") return { ok: false, error: "closed" };
  const note = input.note.trim().slice(0, 600);
  if (input.status === "skipped" && note.length < 3) return { ok: false, error: "note" };
  if (input.status === "done") {
    const block = signOffBlock(task, now);
    if (block) return { ok: false, error: block };
  }
  const ts = now.toISOString();
  const r = await t.updateTable("erasure_tasks").set({ status: input.status, signed_off_by: userId, signed_off_at: ts, sign_off_note: note, updated_at: ts }).where("id", "=", id).where("status", "=", "open").executeTakeFirst();
  if (!affected(r)) return { ok: false, error: "closed" };
  await audit(t, userId, `erasure.${input.status}`, `${id}`);
  return { ok: true };
}

export async function reopenTask(t: TenantDb, id: number, userId: number | null): Promise<boolean> {
  const r = await t.updateTable("erasure_tasks").set({ status: "open", signed_off_by: null, signed_off_at: null, updated_at: nowIso() }).where("id", "=", id).where("status", "!=", "open").executeTakeFirst();
  if (affected(r)) await audit(t, userId, "erasure.reopen", String(id));
  return affected(r) > 0;
}

/** Texts for a task: the optional pre-erasure notice (EN/HI) and, for processor tasks, the erasure instruction. */
export async function taskTexts(t: TenantDb, task: ErasureTaskRow, lang: Lang) {
  const org = await t.org();
  if (!org) return null;
  const contact = await orgContact(t);
  const business = org.legal_name || org.name;
  const rule = task.rule_id ? (await listRetentionRules(t)).find((r) => r.id === task.rule_id) : undefined;
  const vendor = task.vendor_id ? (await listVendors(t)).find((v) => v.id === task.vendor_id) : undefined;
  const items = rule ? (lang === "hi" && rule.category_hi ? rule.category_hi : rule.category) : "[data]";
  const date = istDateTime(task.due_at).replace(/,.*$/, "");
  return {
    preNotice: task.pre_notice_at ? preErasureNotice(lang, { business, service: org.name, items, date, contact: contact ? `${contact.designation ? `${contact.name}, ${contact.designation}` : contact.name}, ${contact.email}` : "[contact]" }) : null,
    processor: vendor
      ? processorErase({ business, vendor: vendor.name, contractDate: vendor.contract_date ?? "", by: date, data: vendor.data_shared ? JSON.parse(vendor.data_shared).join(", ") || "[data]" : "[data]", selector: task.request_id ? "the person named in our request, matched by email" : `records before ${istDateTime(task.cutoff_at)}`, taskRef: `E-${task.id}` })
      : null,
    vendor: vendor ?? null,
  };
}

// ── Reminders (daily cron) ──

export async function sendRetentionReminders(t: TenantDb, opts: { baseUrl: string; now?: Date; recipients: () => Promise<string[]> }): Promise<number> {
  const now = opts.now ?? new Date();
  await ensureRuleTasks(t, now);
  const org = await t.org();
  if (!org) return 0;
  const tasks = await t.selectFrom("erasure_tasks").selectAll().where("status", "=", "open").execute();
  let sent = 0;
  for (const task of tasks) {
    const kind = taskReminderDue(task, now);
    if (!kind) continue;
    const floorUntil = task.is_logs && task.cutoff_at && Date.parse(task.cutoff_at) > logFloorCutoff(now).getTime() ? `\nBlocked: the Rule 8(3) one-year minimum ends for these records on ${istDateTime(new Date(Date.parse(task.cutoff_at) + 366 * 86_400_000).toISOString())}.` : "";
    const lead =
      kind === "pre_notice"
        ? `Optional pre-erasure notice: tell the people concerned by ${istDateTime(task.pre_notice_at)} (${task.pre_notice_hours ?? 48} hours before erasure). The draft text is on the task page.`
        : kind === "overdue"
          ? `Erasure was due on ${istDateTime(task.due_at)}.`
          : `Erasure due: ${istDateTime(task.due_at)}.`;
    const text = `${lead}\n\n${task.title}${task.cutoff_at ? `\nRecords before ${istDateTime(task.cutoff_at)}.` : ""}${floorUntil}\nOpen: ${opts.baseUrl.replace(/\/+$/, "")}/dashboard/retention/tasks/${task.id}\n\n${org.name}\nNot legal advice.`;
    for (const to of new Set(await opts.recipients())) {
      const r = await sendLoggedMail(t, { kind: `erasure.reminder.${kind}`, to, subject: `[Erasure] ${kind === "overdue" ? "Overdue" : kind === "pre_notice" ? "Pre-erasure notice due" : "Due soon"} — ${task.title}`.slice(0, 255), text });
      if (r.ok) sent++;
    }
    const ts = now.toISOString();
    await t.updateTable("erasure_tasks").set(kind === "pre_notice" ? { reminded_pre_notice_at: ts } : kind === "overdue" ? { reminded_overdue_at: ts } : { reminded_soon_at: ts }).where("id", "=", task.id).execute();
  }
  return sent;
}

// ── Exports ──

export async function retentionScheduleCsv(t: TenantDb): Promise<string> {
  const [rules, purposes] = await Promise.all([listRetentionRules(t), listPurposes(t)]);
  const lines = [["category", "category_hi", "purposes", "period_days", "trigger", "action", "law_ref", "is_logs", "pre_notice_hours"].join(",")];
  for (const r of rules) {
    lines.push([r.category, r.category_hi, purposes.filter((p) => p.retention_rule_id === r.id).map((p) => p.purpose_key).join("; "), r.period_days, r.trigger, r.action, r.law_ref, r.is_logs, r.pre_notice_hours ?? ""].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export async function erasureTasksCsv(t: TenantDb): Promise<string> {
  const lines = [["id", "source", "title", "cutoff_at", "due_at", "pre_notice_at", "pre_notice_sent_at", "status", "signed_off_at", "signed_off_by", "note"].join(",")];
  for (const x of await listTasks(t, { status: "all" })) {
    lines.push([x.id, x.source, x.title, x.cutoff_at ?? "", x.due_at, x.pre_notice_at ?? "", x.pre_notice_sent_at ?? "", x.status, x.signed_off_at ?? "", x.signed_off_by ?? "", x.sign_off_note].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

// ── Consent-record purge (maintenance; see migration 000007 for the design) ──

export interface SitePurgeResult {
  siteId: number;
  status: "purged" | "nothing" | "dry_run" | "chain_broken";
  fromSeq?: number;
  throughSeq?: number;
  count: number;
  /** Events kept because they are the current proof of a consent still in force. */
  keptLive?: number;
  cutoff: string;
}

/**
 * Purge the expired prefix of one site's consent log: events created before the
 * cut-off (the earlier of now − consent_retention_days and one year back), in
 * sequence order, stopping at the first event that is still the proof of a
 * granted consent (unless the site is archived, i.e. no longer relied on).
 * Writes an insert-only checkpoint, then deletes; the database refuses any
 * delete not covered by a checkpoint at least one year old.
 */
export async function purgeSiteConsent(t: TenantDb, site: Site, opts: { now?: Date; dryRun?: boolean; reason?: "retention" | "site_delete"; userId?: number | null; all?: boolean } = {}): Promise<SitePurgeResult> {
  if (site.org_id !== t.orgId) throw new Error("Site does not belong to this organisation.");
  const now = opts.now ?? new Date();
  const org = await t.org();
  const cutoff = consentPurgeCutoff(now, org?.consent_retention_days ?? CONSENT_RETENTION_DEFAULT_DAYS).toISOString();
  const report = await verifySiteChain(t, site.id);
  // A broken chain is evidence of tampering: never delete around it.
  if (!report.ok) return { siteId: site.id, status: "chain_broken", count: 0, cutoff };
  const from = (report.checkpoint?.throughSeq ?? 0) + 1;
  const live = site.archived_at
    ? new Set<number>()
    : new Set((await t.selectFrom("consent_state").select("last_event_id").where("site_id", "=", site.id).where("status", "=", "granted").execute()).map((s) => Number(s.last_event_id)));
  let through: { seq: number; hash: string } | null = null;
  let count = 0;
  let after = from - 1;
  scan: for (;;) {
    const page = await t.selectFrom("consent_events").select(["id", "seq", "hash", "created_at"]).where("site_id", "=", site.id).where("seq", ">", after).orderBy("seq").limit(1000).execute();
    for (const e of page) {
      if (e.created_at >= cutoff || live.has(Number(e.id))) break scan;
      through = { seq: Number(e.seq), hash: e.hash };
      count++;
    }
    if (page.length < 1000) break;
    after = Number(page[page.length - 1].seq);
  }
  const keptLive = live.size;
  if (!through) return { siteId: site.id, status: "nothing", count: 0, keptLive, cutoff };
  if (opts.dryRun) return { siteId: site.id, status: "dry_run", fromSeq: from, throughSeq: through.seq, count, keptLive, cutoff };
  const end = through;
  await t.transaction(async (tx) => {
    await tx.insertInto("consent_purge_checkpoints", { site_id: site.id, from_seq: from, through_seq: end.seq, through_hash: end.hash, cutoff_at: cutoff, purged_count: count, reason: opts.reason ?? "retention", by_user_id: opts.userId ?? null, created_at: now.toISOString() });
    // State rows that point at purged events (withdrawn/denied, or any on an archived site) go too.
    const purgedIds = tx.selectFrom("consent_events").select("id").where("site_id", "=", site.id).where("seq", "<=", end.seq);
    await tx.deleteFrom("consent_state").where("site_id", "=", site.id).where("last_event_id", "in", purgedIds).execute();
    await tx.deleteFrom("consent_events").where("site_id", "=", site.id).where("seq", ">=", from).where("seq", "<=", end.seq).execute();
    await audit(tx, opts.userId ?? null, "consent.purge", `site:${site.id} seq ${from}-${end.seq} (${count}) before ${cutoff.slice(0, 10)}`);
  });
  return { siteId: site.id, status: "purged", fromSeq: from, throughSeq: end.seq, count, keptLive, cutoff };
}

export interface SiteRetentionStatus {
  events: number;
  newest: string | null;
  /** When the newest record's retention ends (records may be purged and the site deleted after this). */
  expiresAt: string | null;
  purged: number;
  canDelete: boolean;
}

export async function siteRetentionStatus(t: TenantDb, siteId: number, now: Date = new Date()): Promise<SiteRetentionStatus | null> {
  const site = await getSite(t, siteId);
  if (!site) return null;
  const org = await t.org();
  const agg = await t.selectFrom("consent_events").select((eb) => [eb.fn.countAll<number>().as("n"), eb.fn.max("created_at").as("newest")]).where("site_id", "=", siteId).executeTakeFirst();
  const events = Number(agg?.n ?? 0);
  const newest = (agg?.newest as string | null) ?? null;
  const cutoff = consentPurgeCutoff(now, org?.consent_retention_days ?? CONSENT_RETENTION_DEFAULT_DAYS);
  const retentionMs = now.getTime() - cutoff.getTime();
  const cp = await latestCheckpoint(t, siteId);
  return {
    events,
    newest,
    expiresAt: newest ? new Date(Date.parse(newest) + retentionMs).toISOString() : null,
    purged: cp?.purgedTotal ?? 0,
    canDelete: events === 0 || (Boolean(site.archived_at) && newest !== null && newest < cutoff.toISOString()),
  };
}

export type DeleteSiteResult = { ok: true; purged: number } | { ok: false; error: "not_found" | "not_archived" | "not_expired" | "chain_broken" };

/**
 * Delete a site whose consent records are past retention: the site must be
 * archived first (no new records), every record must be older than the
 * cut-off; the records are purged under a "site_delete" checkpoint (kept as a
 * tombstone) and then the site is removed. Audited.
 */
export async function deleteSiteAfterRetention(t: TenantDb, id: number, userId: number | null, now: Date = new Date()): Promise<DeleteSiteResult> {
  const site = await getSite(t, id);
  if (!site) return { ok: false, error: "not_found" };
  const status = await siteRetentionStatus(t, id, now);
  if (!status) return { ok: false, error: "not_found" };
  let purged = 0;
  if (status.events > 0) {
    if (!site.archived_at) return { ok: false, error: "not_archived" };
    if (!status.canDelete) return { ok: false, error: "not_expired" };
    const r = await purgeSiteConsent(t, site, { now, reason: "site_delete", userId });
    if (r.status === "chain_broken") return { ok: false, error: "chain_broken" };
    purged = r.count;
    if ((await siteRetentionStatus(t, id, now))?.events) return { ok: false, error: "not_expired" };
  }
  if (!(await deleteSite(t, id))) return { ok: false, error: "not_found" };
  await audit(t, userId, "site.delete", `${id}${purged ? ` (purged ${purged})` : ""}`);
  return { ok: true, purged };
}
