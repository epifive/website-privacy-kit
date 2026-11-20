import "server-only";
import {
  BREACH_STATUSES,
  breachRemindersDue,
  breachTimers,
  CHECKLIST_KEYS,
  istDateTime,
  newBreachReference,
  parseChecklist,
  worstState,
  type BreachReminderKind,
  type BreachStatus,
  type ChecklistKey,
  type Timer,
  type TimerKey,
} from "@/core/breach/model";
import { boardDetailed, boardExtension, boardInitial, certinEmail, dpIntimation, dpShortMessages, parseDetails, type BreachDetails, type BreachTemplateContext } from "@/core/breach/templates";
import type { Lang } from "@/core/notice/templates";
import type { BreachRow } from "../db/schema";
import type { TenantDb } from "../db/tenant";
import { decryptForOrg, encryptForOrg, identifierHmac, normalizeIdentifier } from "../secrets";
import { sendLoggedMail } from "./mailer";
import { orgContact } from "./rights";
import { csvCell, nowIso } from "./util";

/**
 * Personal data breach register (plan M8; B1–B4). The register is available
 * on every plan (B3-01: s.2(u) has no materiality threshold). Every function
 * takes a TenantDb, so another organisation's breach ids are never found.
 * Every change leaves an insert-only breach_events row (timeline).
 */

const affected = (r: { numUpdatedRows?: bigint } | undefined) => Number(r?.numUpdatedRows ?? 0);

export interface BreachInput {
  title: string;
  noticedAt: string;
  awareAt: string;
  affectedCount: number;
  certinApplicable: boolean;
  details: Partial<BreachDetails>;
}

export type BreachError = "title" | "times" | "future" | "not_found" | "status" | "step" | "recipients" | "empty" | "extension";

/** Times may not be in the future (5 minutes of clock skew allowed). */
function timesValid(noticedAt: string, awareAt: string, now: Date): BreachError | null {
  const n = Date.parse(noticedAt);
  const a = Date.parse(awareAt);
  if (!Number.isFinite(n) || !Number.isFinite(a)) return "times";
  if (n > now.getTime() + 300_000 || a > now.getTime() + 300_000) return "future";
  return null;
}

function detailsJson(current: BreachDetails, input: Partial<BreachDetails>): string {
  return JSON.stringify(parseDetails(JSON.stringify({ ...current, ...input })));
}

async function event(t: TenantDb, breachId: number, kind: string, opts: { meta?: string; body?: string | null; userId?: number | null; at?: string } = {}): Promise<void> {
  const ts = nowIso();
  await t.insertInto("breach_events", {
    breach_id: breachId,
    kind: kind.slice(0, 30),
    meta: (opts.meta ?? "").slice(0, 400),
    body_enc: opts.body ? encryptForOrg(t.orgId, opts.body.slice(0, 8000)) : null,
    at: opts.at ?? ts,
    by_user_id: opts.userId ?? null,
    created_at: ts,
  });
}

export async function createBreach(t: TenantDb, input: BreachInput, userId: number | null, now: Date = new Date()): Promise<{ ok: true; id: number; ref: string } | { ok: false; error: BreachError }> {
  const title = input.title.trim().slice(0, 200);
  if (title.length < 3) return { ok: false, error: "title" };
  const bad = timesValid(input.noticedAt, input.awareAt, now);
  if (bad) return { ok: false, error: bad };
  const ts = now.toISOString();
  const ref = newBreachReference();
  const id = await t.insertInto("breaches", {
    ref,
    title,
    status: "open",
    noticed_at: new Date(input.noticedAt).toISOString(),
    aware_at: new Date(input.awareAt).toISOString(),
    affected_count: Math.max(0, Math.min(1e9, Math.round(input.affectedCount) || 0)),
    details: detailsJson(parseDetails("{}"), input.details),
    certin_applicable: input.certinApplicable ? 1 : 0,
    certin_sent_at: null,
    board_initial_sent_at: null,
    board_detail_sent_at: null,
    dp_notice_sent_at: null,
    extension_requested_at: null,
    extension_until: null,
    checklist: "{}",
    reminders: "{}",
    created_by: userId,
    created_at: ts,
    updated_at: ts,
    closed_at: null,
  });
  await event(t, id, "noticed", { at: new Date(input.noticedAt).toISOString(), userId });
  await event(t, id, "aware", { at: new Date(input.awareAt).toISOString(), userId });
  await event(t, id, "created", { userId });
  return { ok: true, id, ref };
}

export function getBreach(t: TenantDb, id: number): Promise<BreachRow | undefined> {
  return t.selectFrom("breaches").selectAll().where("id", "=", id).executeTakeFirst();
}

export interface BreachView {
  row: BreachRow;
  details: BreachDetails;
  checklist: Partial<Record<ChecklistKey, string>>;
  timers: Timer[];
  worst: ReturnType<typeof worstState>;
}

export function viewBreach(row: BreachRow, now: Date = new Date()): BreachView {
  const timers = breachTimers(row, now);
  return { row, details: parseDetails(row.details), checklist: parseChecklist(row.checklist), timers, worst: row.status === "closed" ? "done" : worstState(timers) };
}

export async function listBreaches(t: TenantDb, opts: { status?: "open" | "closed" | "all" } = {}): Promise<BreachRow[]> {
  let q = t.selectFrom("breaches").selectAll();
  if (opts.status === "open") q = q.where("status", "!=", "closed");
  else if (opts.status === "closed") q = q.where("status", "=", "closed");
  return q.orderBy("aware_at", "desc").orderBy("id", "desc").limit(500).execute();
}

export async function updateBreach(t: TenantDb, id: number, input: BreachInput, userId: number | null, now: Date = new Date()): Promise<{ ok: true } | { ok: false; error: BreachError }> {
  const row = await getBreach(t, id);
  if (!row) return { ok: false, error: "not_found" };
  const title = input.title.trim().slice(0, 200);
  if (title.length < 3) return { ok: false, error: "title" };
  const bad = timesValid(input.noticedAt, input.awareAt, now);
  if (bad) return { ok: false, error: bad };
  const noticed = new Date(input.noticedAt).toISOString();
  const aware = new Date(input.awareAt).toISOString();
  const changed: string[] = [];
  if (noticed !== row.noticed_at) changed.push("noticed_at");
  if (aware !== row.aware_at) changed.push("aware_at");
  if (title !== row.title) changed.push("title");
  const details = detailsJson(parseDetails(row.details), input.details);
  if (details !== row.details) changed.push("details");
  await t
    .updateTable("breaches")
    .set({ title, noticed_at: noticed, aware_at: aware, affected_count: Math.max(0, Math.min(1e9, Math.round(input.affectedCount) || 0)), certin_applicable: input.certinApplicable ? 1 : 0, details, updated_at: now.toISOString() })
    .where("id", "=", id)
    .execute();
  // Moving a clock's start is recorded with the old value, so the timeline shows it.
  await event(t, id, "updated", { meta: changed.join(",") || "no_change", body: changed.includes("aware_at") || changed.includes("noticed_at") ? `noticed ${row.noticed_at} → ${noticed}; aware ${row.aware_at} → ${aware}` : null, userId });
  return { ok: true };
}

const STEP_COLUMN = {
  certin: "certin_sent_at",
  board_initial: "board_initial_sent_at",
  board_detail: "board_detail_sent_at",
  dp_intimation: "dp_notice_sent_at",
} as const satisfies Record<TimerKey, keyof BreachRow>;

/** Record that a step was done (sent) at a given time; clearing (null) is also recorded. */
export async function markStep(t: TenantDb, id: number, step: TimerKey, at: string | null, userId: number | null, note = ""): Promise<{ ok: true } | { ok: false; error: BreachError }> {
  if (!(step in STEP_COLUMN)) return { ok: false, error: "step" };
  if (at && !Number.isFinite(Date.parse(at))) return { ok: false, error: "times" };
  const value = at ? new Date(at).toISOString() : null;
  const r = await t.updateTable("breaches").set({ [STEP_COLUMN[step]]: value, updated_at: nowIso() }).where("id", "=", id).executeTakeFirst();
  if (!affected(r)) return { ok: false, error: "not_found" };
  await event(t, id, value ? `sent.${step}` : `unsent.${step}`, { at: value ?? nowIso(), body: note.trim() || null, userId });
  return { ok: true };
}

/** Rule 7(2)(b): written request for more time, and the period the Board allowed (if any). */
export async function recordExtension(t: TenantDb, id: number, input: { requestedAt: string | null; until: string | null; reason: string }, userId: number | null): Promise<{ ok: true } | { ok: false; error: BreachError }> {
  const row = await getBreach(t, id);
  if (!row) return { ok: false, error: "not_found" };
  if ((input.requestedAt && !Number.isFinite(Date.parse(input.requestedAt))) || (input.until && !Number.isFinite(Date.parse(input.until)))) return { ok: false, error: "times" };
  if (input.until && Date.parse(input.until) <= Date.parse(row.aware_at)) return { ok: false, error: "extension" };
  await t
    .updateTable("breaches")
    .set({
      extension_requested_at: input.requestedAt ? new Date(input.requestedAt).toISOString() : null,
      extension_until: input.until ? new Date(input.until).toISOString() : null,
      details: detailsJson(parseDetails(row.details), { extensionReason: input.reason.trim().slice(0, 600) }),
      updated_at: nowIso(),
    })
    .where("id", "=", id)
    .execute();
  await event(t, id, "extension", { meta: `requested=${input.requestedAt ?? ""};until=${input.until ?? ""}`.slice(0, 400), userId });
  return { ok: true };
}

export async function setBreachStatus(t: TenantDb, id: number, status: BreachStatus, userId: number | null): Promise<{ ok: true } | { ok: false; error: BreachError }> {
  if (!(BREACH_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "status" };
  const row = await getBreach(t, id);
  if (!row) return { ok: false, error: "not_found" };
  if (row.status === status) return { ok: true };
  const ts = nowIso();
  await t.updateTable("breaches").set({ status, closed_at: status === "closed" ? ts : null, updated_at: ts }).where("id", "=", id).execute();
  await event(t, id, "status", { meta: `${row.status}→${status}`, userId });
  return { ok: true };
}

export async function toggleChecklist(t: TenantDb, id: number, key: ChecklistKey, done: boolean, userId: number | null): Promise<{ ok: true } | { ok: false; error: BreachError }> {
  if (!(CHECKLIST_KEYS as readonly string[]).includes(key)) return { ok: false, error: "step" };
  const row = await getBreach(t, id);
  if (!row) return { ok: false, error: "not_found" };
  const list = parseChecklist(row.checklist);
  if (done) list[key] = list[key] ?? nowIso();
  else delete list[key];
  await t.updateTable("breaches").set({ checklist: JSON.stringify(list), updated_at: nowIso() }).where("id", "=", id).execute();
  await event(t, id, done ? "check" : "uncheck", { meta: key, userId });
  return { ok: true };
}

/** Evidence note (encrypted), e.g. "Firewall logs exported to …; police complaint no. …". */
export async function addEvidenceNote(t: TenantDb, id: number, text: string, userId: number | null): Promise<{ ok: true } | { ok: false; error: BreachError }> {
  if (!text.trim()) return { ok: false, error: "empty" };
  if (!(await getBreach(t, id))) return { ok: false, error: "not_found" };
  await event(t, id, "evidence", { body: text.trim(), userId });
  return { ok: true };
}

export interface BreachTimelineEntry {
  id: number;
  kind: string;
  meta: string;
  body: string | null;
  at: string;
  byUserId: number | null;
  createdAt: string;
}

export async function listBreachEvents(t: TenantDb, breachId: number): Promise<BreachTimelineEntry[]> {
  const rows = await t.selectFrom("breach_events").selectAll().where("breach_id", "=", breachId).orderBy("at").orderBy("id").execute();
  return rows.map((r) => ({ id: r.id, kind: r.kind, meta: r.meta, body: r.body_enc ? decryptForOrg(t.orgId, r.body_enc) : null, at: r.at, byUserId: r.by_user_id, createdAt: r.created_at }));
}

// ── Affected people (Rule 7(1)) ──

export interface RecipientView {
  id: number;
  kind: "email" | "phone";
  contact: string;
  status: "pending" | "sent" | "failed" | "manual";
  channel: string;
  sentAt: string | null;
}

/** Add recipients from pasted lines (email or mobile); duplicates and invalid lines are skipped. */
export async function addRecipients(t: TenantDb, breachId: number, raw: string): Promise<{ ok: true; added: number; invalid: number } | { ok: false; error: BreachError }> {
  if (!(await getBreach(t, breachId))) return { ok: false, error: "not_found" };
  const lines = raw.split(/[\r\n,;]+/).map((l) => l.trim()).filter(Boolean).slice(0, 5000);
  if (!lines.length) return { ok: false, error: "recipients" };
  const existing = new Set((await t.selectFrom("breach_recipients").select("contact_hmac").where("breach_id", "=", breachId).execute()).map((r) => r.contact_hmac));
  let added = 0;
  let invalid = 0;
  const ts = nowIso();
  const rows = [];
  for (const line of lines) {
    const email = normalizeIdentifier("email", line);
    const phone = email ? null : normalizeIdentifier("phone", line);
    const kind: "email" | "phone" | null = email ? "email" : phone ? "phone" : null;
    const value = email ?? phone;
    if (!kind || !value) {
      invalid++;
      continue;
    }
    const hmac = identifierHmac(t.orgId, kind, value);
    if (existing.has(hmac)) continue;
    existing.add(hmac);
    rows.push({ breach_id: breachId, kind, contact_enc: encryptForOrg(t.orgId, value), contact_hmac: hmac, status: "pending" as const, channel: "", sent_at: null, created_at: ts });
    added++;
  }
  for (let i = 0; i < rows.length; i += 200) await t.insertInto("breach_recipients", rows.slice(i, i + 200));
  if (added) await event(t, breachId, "recipients", { meta: `added=${added};invalid=${invalid}` });
  return { ok: true, added, invalid };
}

export async function listRecipients(t: TenantDb, breachId: number): Promise<RecipientView[]> {
  const rows = await t.selectFrom("breach_recipients").selectAll().where("breach_id", "=", breachId).orderBy("id").execute();
  return rows.map((r) => ({ id: r.id, kind: r.kind, contact: decryptForOrg(t.orgId, r.contact_enc) ?? "", status: r.status, channel: r.channel, sentAt: r.sent_at }));
}

export async function recipientStats(t: TenantDb, breachId: number): Promise<{ total: number; notified: number; firstSentAt: string | null; lastSentAt: string | null; channels: string[] }> {
  const rows = await t.selectFrom("breach_recipients").select(["status", "sent_at", "channel"]).where("breach_id", "=", breachId).execute();
  const sent = rows.filter((r) => (r.status === "sent" || r.status === "manual") && r.sent_at).map((r) => r.sent_at!).sort();
  return {
    total: rows.length,
    notified: sent.length,
    firstSentAt: sent[0] ?? null,
    lastSentAt: sent[sent.length - 1] ?? null,
    channels: [...new Set(rows.filter((r) => r.channel).map((r) => r.channel))],
  };
}

async function afterIntimation(t: TenantDb, breachId: number, at: string): Promise<void> {
  // dp_notice_sent_at = the first intimation (stops the "without delay" clock).
  await t.updateTable("breaches").set({ dp_notice_sent_at: at, updated_at: at }).where("id", "=", breachId).where("dp_notice_sent_at", "is", null).execute();
}

/** Email the Rule 7(1) intimation to every pending email recipient (logged in mail_log). */
export async function emailIntimation(t: TenantDb, breachId: number, mail: { subject: string; text: string }, userId: number | null): Promise<{ ok: true; sent: number; failed: number } | { ok: false; error: BreachError }> {
  if (!(await getBreach(t, breachId))) return { ok: false, error: "not_found" };
  if (!mail.subject.trim() || mail.text.trim().length < 20) return { ok: false, error: "empty" };
  const pending = await t.selectFrom("breach_recipients").selectAll().where("breach_id", "=", breachId).where("kind", "=", "email").where("status", "in", ["pending", "failed"]).execute();
  let sent = 0;
  let failed = 0;
  for (const r of pending) {
    const to = decryptForOrg(t.orgId, r.contact_enc);
    if (!to) continue;
    const result = await sendLoggedMail(t, { kind: "breach.dp_intimation", to, subject: mail.subject.slice(0, 255), text: mail.text });
    const ts = nowIso();
    await t.updateTable("breach_recipients").set(result.ok ? { status: "sent", channel: "email", sent_at: ts } : { status: "failed", channel: "email" }).where("id", "=", r.id).execute();
    if (result.ok) sent++;
    else failed++;
  }
  if (sent) await afterIntimation(t, breachId, nowIso());
  await event(t, breachId, "dp.email", { meta: `sent=${sent};failed=${failed}`, userId });
  return { ok: true, sent, failed };
}

/** Mark pending phone recipients (or every pending recipient) as told through another channel (SMS, WhatsApp, call, in-app). */
export async function markRecipientsManual(t: TenantDb, breachId: number, channel: string, at: string, userId: number | null): Promise<{ ok: true; marked: number } | { ok: false; error: BreachError }> {
  if (!(await getBreach(t, breachId))) return { ok: false, error: "not_found" };
  if (!Number.isFinite(Date.parse(at))) return { ok: false, error: "times" };
  const ch = channel.replace(/[^a-z_]/g, "").slice(0, 20) || "other";
  const iso = new Date(at).toISOString();
  const r = await t.updateTable("breach_recipients").set({ status: "manual", channel: ch, sent_at: iso }).where("breach_id", "=", breachId).where("status", "in", ["pending", "failed"]).executeTakeFirst();
  const marked = affected(r);
  if (marked) await afterIntimation(t, breachId, iso);
  await event(t, breachId, "dp.manual", { meta: `channel=${ch};marked=${marked}`, at: iso, userId });
  return { ok: true, marked };
}

/** B1-02: recipients CSV for mail-merge / SMS tools, with the message to send. */
export async function recipientsCsv(t: TenantDb, breachId: number, message: { subject: string; text: string; sms: string }): Promise<string | null> {
  const row = await getBreach(t, breachId);
  if (!row) return null;
  const lines = [["breach_ref", "kind", "contact", "status", "channel", "sent_at", "subject", "message", "sms"].join(",")];
  for (const r of await listRecipients(t, breachId)) {
    lines.push([row.ref, r.kind, r.contact, r.status, r.channel, r.sentAt ?? "", message.subject, message.text, message.sms].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

// ── Templates ──

/** Timeline entries as they appear in report item (ii). */
const TIMELINE_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    noticed: "Incident noticed",
    aware: "Became aware that personal data was affected",
    created: "Recorded in the breach register",
    "sent.certin": "Reported to CERT-In",
    "sent.board_initial": "Initial intimation sent to the Board",
    "sent.board_detail": "Detailed report sent to the Board",
    "sent.dp_intimation": "Affected people told",
    "unsent.certin": "CERT-In report time withdrawn",
    "unsent.board_initial": "Board intimation time withdrawn",
    "unsent.board_detail": "Board report time withdrawn",
    "unsent.dp_intimation": "Intimation time withdrawn",
    status: "Status changed",
    extension: "Extension requested / allowed",
    recipients: "Affected people listed",
    "dp.email": "Intimation emailed",
    "dp.manual": "Intimation sent by another channel",
  },
  hi: {
    noticed: "घटना देखी गई",
    aware: "पता चला कि व्यक्तिगत डेटा प्रभावित हुआ",
    created: "ब्रीच रजिस्टर में दर्ज",
    "sent.certin": "CERT-In को रिपोर्ट भेजी",
    "sent.board_initial": "बोर्ड को पहली सूचना भेजी",
    "sent.board_detail": "बोर्ड को विस्तृत रिपोर्ट भेजी",
    "sent.dp_intimation": "प्रभावित लोगों को बताया",
    "unsent.certin": "CERT-In रिपोर्ट का समय वापस लिया",
    "unsent.board_initial": "बोर्ड सूचना का समय वापस लिया",
    "unsent.board_detail": "बोर्ड रिपोर्ट का समय वापस लिया",
    "unsent.dp_intimation": "सूचना का समय वापस लिया",
    status: "स्थिति बदली",
    extension: "समय बढ़ाने का अनुरोध / अनुमति",
    recipients: "प्रभावित लोगों की सूची बनी",
    "dp.email": "सूचना ईमेल की गई",
    "dp.manual": "सूचना दूसरे माध्यम से भेजी गई",
  },
};

export async function breachContext(t: TenantDb, row: BreachRow, lang: Lang, now: Date = new Date()): Promise<BreachTemplateContext> {
  const org = await t.org();
  if (!org) throw new Error("Organisation not found.");
  const contact = await orgContact(t);
  const stats = await recipientStats(t, row.id);
  const events = await listBreachEvents(t, row.id);
  const label = TIMELINE_LABELS[lang];
  const timeline = events
    .filter((e) => !["updated", "check", "uncheck", "reminder"].includes(e.kind))
    .map((e) => ({ at: e.at, event: e.kind === "evidence" ? (e.body ?? "").split("\n")[0].slice(0, 200) : `${label[e.kind] ?? e.kind}${e.meta ? ` (${e.meta})` : ""}` }));
  return {
    lang,
    business: org.legal_name || org.name,
    address: contact?.address ?? "",
    contact: contact ? { nameOrTitle: contact.designation ? `${contact.name}, ${contact.designation}` : contact.name, email: contact.email, phone: contact.phone } : null,
    ref: row.ref,
    noticedAt: row.noticed_at,
    awareAt: row.aware_at,
    affectedCount: row.affected_count,
    details: parseDetails(row.details),
    boardInitialSentAt: row.board_initial_sent_at,
    certinSent: Boolean(row.certin_sent_at),
    timeline,
    dp: { notified: stats.total ? stats.notified : null, firstSentAt: stats.firstSentAt ?? row.dp_notice_sent_at, lastSentAt: stats.lastSentAt },
    requestedUntil: row.extension_until,
    now,
  };
}

export async function breachTemplates(t: TenantDb, id: number, lang: Lang, now: Date = new Date()) {
  const row = await getBreach(t, id);
  if (!row) return null;
  const ctx = await breachContext(t, row, lang, now);
  return { dp: dpIntimation(ctx), short: dpShortMessages(ctx), boardInitial: boardInitial(ctx), boardDetailed: boardDetailed(ctx), extension: boardExtension(ctx), certin: certinEmail({ ...ctx, lang: "en" }) };
}

// ── Alerts and reminders ──

export interface BreachAlert {
  id: number;
  ref: string;
  title: string;
  worst: Timer["state"];
  /** The most urgent unfinished timer. */
  timer: Timer | null;
}

/** Open incidents with timers that need attention (dashboard banner and overview). */
export async function breachAlerts(t: TenantDb, now: Date = new Date()): Promise<BreachAlert[]> {
  const rows = await t.selectFrom("breaches").selectAll().where("status", "!=", "closed").orderBy("aware_at").limit(50).execute();
  const rank = { overdue: 0, due_soon: 1, running: 2, done: 3, not_applicable: 4 } as const;
  return rows
    .map((row) => {
      const timers = breachTimers(row, now).filter((x) => x.state !== "done" && x.state !== "not_applicable");
      timers.sort((a, b) => rank[a.state] - rank[b.state] || (a.remainingMs ?? Infinity) - (b.remainingMs ?? Infinity));
      return { id: row.id, ref: row.ref, title: row.title, worst: timers[0]?.state ?? "done", timer: timers[0] ?? null };
    })
    .filter((a) => a.timer);
}

export interface BreachReminderOptions {
  baseUrl: string;
  now?: Date;
  recipients: () => Promise<string[]>;
}

const REMINDER_TEXT: Record<BreachReminderKind, string> = {
  certin_soon: "The CERT-In report (6 hours from noticing) is due at {due}. If this is an Annexure I incident, email incident@cert-in.org.in now.",
  certin_overdue: "The CERT-In 6-hour window ended at {due}. If this is an Annexure I incident, report it now and record the time.",
  board_initial: "The Board has not been told yet. Rule 7(2)(a) asks for an intimation without delay; {elapsed} have passed since you became aware.",
  board_detail_soon: "The detailed report to the Board (Rule 7(2)(b), 72 hours) is due at {due}. Send it, or send a written request for more time before then.",
  board_detail_overdue: "The 72-hour window for the detailed Board report ended at {due}. Send the report and record the time.",
  dp_pending: "Affected people have not been told yet. Rule 7(1) asks for an intimation to each of them without delay; {elapsed} have passed.",
};

/** Internal reminder emails for open incidents, each kind once (cron, every 15–30 minutes). */
export async function sendBreachReminders(t: TenantDb, opts: BreachReminderOptions): Promise<number> {
  const now = opts.now ?? new Date();
  const rows = await t.selectFrom("breaches").selectAll().where("status", "!=", "closed").execute();
  if (!rows.length) return 0;
  const org = await t.org();
  if (!org) return 0;
  let sent = 0;
  for (const row of rows) {
    let marks: Record<string, string> = {};
    try {
      marks = JSON.parse(row.reminders || "{}") ?? {};
    } catch {
      marks = {};
    }
    const due = breachRemindersDue(row, marks, now);
    if (!due.length) continue;
    const timers = breachTimers(row, now);
    const hours = Math.floor((now.getTime() - Date.parse(row.aware_at)) / 3_600_000);
    for (const kind of due) {
      const timer = kind.startsWith("certin") ? timers[0] : timers[2];
      const text = REMINDER_TEXT[kind].replace("{due}", istDateTime(timer.dueAt)).replace("{elapsed}", `${hours} h`);
      const body = `${text}\n\nIncident ${row.ref}: ${row.title}\nOpen: ${opts.baseUrl.replace(/\/+$/, "")}/dashboard/breaches/${row.id}\n\n${org.name}\nNot legal advice.`;
      for (const to of new Set(await opts.recipients())) {
        const r = await sendLoggedMail(t, { kind: `breach.reminder.${kind}`.slice(0, 30), to, subject: `[${row.ref}] ${kind.startsWith("certin") ? "CERT-In 6 h" : kind.startsWith("board_detail") ? "Board 72 h" : kind === "board_initial" ? "Board intimation" : "Affected people"} — ${row.title}`.slice(0, 255), text: body });
        if (r.ok) sent++;
      }
      marks[kind] = now.toISOString();
      await event(t, row.id, "reminder", { meta: kind });
    }
    await t.updateTable("breaches").set({ reminders: JSON.stringify(marks) }).where("id", "=", row.id).execute();
  }
  return sent;
}

// ── Register export (evidence pack) ──

export async function breachRegisterCsv(t: TenantDb): Promise<string> {
  const cols = ["ref", "title", "status", "noticed_at", "aware_at", "affected_count", "certin_applicable", "certin_due_at", "certin_sent_at", "board_initial_sent_at", "board_detail_due_at", "board_detail_sent_at", "dp_notice_sent_at", "extension_requested_at", "extension_until", "nature", "location", "categories", "closed_at"];
  const lines = [cols.join(",")];
  for (const row of await listBreaches(t, { status: "all" })) {
    const d = parseDetails(row.details);
    const timers = breachTimers(row);
    lines.push(
      [row.ref, row.title, row.status, row.noticed_at, row.aware_at, row.affected_count, row.certin_applicable, timers[0].dueAt ?? "", row.certin_sent_at ?? "", row.board_initial_sent_at ?? "", timers[2].dueAt ?? "", row.board_detail_sent_at ?? "", row.dp_notice_sent_at ?? "", row.extension_requested_at ?? "", row.extension_until ?? "", d.nature, d.location, d.categories.join("; "), row.closed_at ?? ""]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

