import "server-only";
import { addUsage } from "./usage";
import { dataItemLabel, parseDataItems } from "@/core/data-items";
import type { Lang } from "@/core/notice/templates";
import { IDENTIFIER_KEYS } from "@/core/notice/templates";
import {
  ackEmail,
  boardParagraph,
  contactBlock,
  ensureContactBlock,
  otpEmail,
  replyDraft,
  reminderEmail,
  withdrawEmail,
  type AccessSummary,
  type ContactInfo,
  type Email,
  type EmailContext,
  type ReplyTemplate,
} from "@/core/rights/emails";
import {
  canMove,
  checkAttachments,
  computeDueAt,
  computeTargetAt,
  daysLeft,
  detailsRequired,
  generateOtp,
  istDate,
  maskName,
  newReference,
  normalizeOtp,
  OPEN_STATUSES,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  outcomesFor,
  REFERENCE_PATTERN,
  reminderDue,
  REQUEST_TYPES,
  SUBMIT_LIMITS,
  type AttachmentIssue,
  type Outcome,
  type RequestStatus,
  type RequestType,
} from "@/core/rights/model";
import type { NominationRow, RightsRequestRow } from "../db/schema";
import type { TenantDb } from "../db/tenant";
import { rateLimit } from "../rate-limit";
import { decryptForOrg, encryptForOrg, identifierHmac, normalizeIdentifier, signToken, verifyTokenSignature } from "../secrets";
import { saveAttachment, type IncomingFile } from "./attachments";
import { truncateIp, withdrawAll } from "./consent";
import { sendLoggedMail } from "./mailer";
import { noticeLinks } from "./notices";
import { orgIdentifiers } from "./orgs";
import { audit, getContacts, getSite, listPurposes, listVendors } from "./registers";
import { jsonArray, nowIso } from "./util";

/**
 * Data Principal rights requests (plan M6–M7; R1–R5).
 *
 * Public side: submitRequest() → email OTP → verifyRequest() → acknowledgement
 * with reference number and due date. Dashboard side: inbox queries, status
 * workflow, assignment, notes, replies with the Rule 9 contact block,
 * nominations and closure. Every function takes a TenantDb, so another
 * organisation's request ids are never found; every change is audited.
 */

const affected = (r: { numUpdatedRows?: bigint } | undefined) => Number(r?.numUpdatedRows ?? 0);

export interface RequestPayload {
  details: string;
  identifiers: Record<string, string>;
  nominee?: { name: string; relation: string; contact: string };
}

export interface DecryptedRequest {
  row: RightsRequestRow;
  name: string;
  email: string;
  payload: RequestPayload;
}

export function decryptRequest(t: TenantDb, row: RightsRequestRow): DecryptedRequest {
  const dec = (v: string) => decryptForOrg(t.orgId, v) ?? "";
  let payload: RequestPayload = { details: "", identifiers: {} };
  try {
    const parsed = JSON.parse(dec(row.payload_enc) || "{}");
    payload = { details: String(parsed.details ?? ""), identifiers: typeof parsed.identifiers === "object" && parsed.identifiers ? parsed.identifiers : {}, nominee: parsed.nominee };
  } catch {
    // Unreadable payload (wrong key): show empty fields.
  }
  return { row, name: dec(row.requester_name_enc), email: dec(row.email_enc), payload };
}

// ── Signed request token for the verification page ──

export function createRequestToken(requestId: number): string {
  const payload = Buffer.from(String(requestId)).toString("base64url");
  return `${payload}.${signToken("rights-request", payload)}`;
}

export function readRequestToken(token: string | null | undefined): number | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !verifyTokenSignature("rights-request", payload, sig)) return null;
  const id = Number(Buffer.from(payload, "base64url").toString("utf8"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

const otpHash = (orgId: number, requestId: number, code: string) => signToken("rights-otp", `${orgId}:${requestId}:${code}`);

// ── Email context (dates in IST, Rule 9 contact) ──

export async function orgContact(t: TenantDb): Promise<ContactInfo | null> {
  const { dpo, grievance } = await getContacts(t);
  const c = dpo ?? grievance;
  return c ? { role: dpo ? "dpo" : "grievance", name: c.name, designation: c.designation, email: c.email, phone: c.phone, address: c.address } : null;
}

export async function emailContext(t: TenantDb, req: DecryptedRequest, baseUrl: string, lang: Lang = req.row.lang): Promise<EmailContext> {
  const org = await t.org();
  if (!org) throw new Error("Organisation not found.");
  const days = Math.round((Date.parse(req.row.due_at) - Date.parse(req.row.received_at)) / 86_400_000);
  return {
    lang,
    business: org.legal_name || org.name,
    ref: req.row.ref,
    requesterName: req.name,
    type: req.row.type,
    receivedDate: istDate(req.row.received_at),
    dueDate: istDate(req.row.due_at),
    responseDays: days,
    contact: await orgContact(t),
    rightsUrl: noticeLinks(baseUrl, org.slug).rights,
  };
}

async function event(t: TenantDb, requestId: number, kind: string, opts: { meta?: string; body?: string | null; userId?: number | null } = {}): Promise<void> {
  await t.insertInto("request_events", {
    request_id: requestId,
    kind,
    meta: (opts.meta ?? "").slice(0, 400),
    body_enc: opts.body ? encryptForOrg(t.orgId, opts.body) : null,
    by_user_id: opts.userId ?? null,
    created_at: nowIso(),
  });
}

// ── Public: submit ──

export interface SubmitInput {
  type: string;
  name: string;
  email: string;
  details: string;
  identifiers: Record<string, string>;
  nominee?: { name: string; relation: string; contact: string };
  lang: Lang;
  files?: IncomingFile[];
  ip?: string;
}

export type SubmitError = "type" | "name" | "email" | "details" | "nominee" | "rate" | "count" | "size" | "total" | "type_file" | "empty";

export type SubmitResult = { ok: true; requestId: number; ref: string; token: string; email: string; mailSent: boolean } | { ok: false; error: SubmitError };

const attachmentError: Record<AttachmentIssue, SubmitError> = { count: "count", size: "size", total: "total", type: "type_file", empty: "empty" };

const clean = (v: string | undefined, max: number) => (v ?? "").replace(/\u0000/g, "").trim().slice(0, max);

/** Validate and store a request (status "unverified") and email a one-time code to the given address. */
export async function submitRequest(t: TenantDb, input: SubmitInput, opts: { baseUrl: string; now?: Date }): Promise<SubmitResult> {
  const org = await t.org();
  if (!org) throw new Error("Organisation not found.");
  const type = input.type as RequestType;
  if (!(REQUEST_TYPES as readonly string[]).includes(type)) return { ok: false, error: "type" };
  const name = clean(input.name, 120);
  if (name.length < 2) return { ok: false, error: "name" };
  const email = normalizeIdentifier("email", input.email ?? "");
  if (!email) return { ok: false, error: "email" };
  const details = clean(input.details, 4000);
  // A correction needs to say what is wrong; a grievance needs to say what happened. Access and erasure
  // need a description only when the organisation asks for one (Settings → details_required).
  if (detailsRequired(type, org.details_required) && details.length < 5) return { ok: false, error: "details" };
  let nominee: RequestPayload["nominee"];
  if (type === "nomination") {
    nominee = { name: clean(input.nominee?.name, 120), relation: clean(input.nominee?.relation, 60), contact: clean(input.nominee?.contact, 190) };
    if (nominee.name.length < 2 || !nominee.relation || !(normalizeIdentifier("email", nominee.contact) || normalizeIdentifier("phone", nominee.contact))) return { ok: false, error: "nominee" };
  }
  // Only the identifiers this organisation publishes (Rule 14(5)); name and email have their own fields.
  const allowed = orgIdentifiers(org).filter((k) => IDENTIFIER_KEYS.includes(k) && k !== "email" && k !== "name");
  const identifiers: Record<string, string> = {};
  for (const key of allowed) {
    const v = clean(input.identifiers?.[key], 120);
    if (v) identifiers[key] = v;
  }
  const files = type === "withdraw" ? [] : (input.files ?? []).filter((f) => f.size > 0);
  const fileIssue = checkAttachments(files);
  if (fileIssue) return { ok: false, error: attachmentError[fileIssue] };

  const emailHmac = identifierHmac(t.orgId, "email", email);
  const ip = input.ip ?? "unknown";
  if (!rateLimit(`rights:ip:${t.orgId}:${ip}`, SUBMIT_LIMITS.ipPerWindow, SUBMIT_LIMITS.windowMs)) return { ok: false, error: "rate" };
  if (!rateLimit(`rights:email:${t.orgId}:${emailHmac}`, SUBMIT_LIMITS.emailPerWindow, SUBMIT_LIMITS.windowMs)) return { ok: false, error: "rate" };

  const now = opts.now ?? new Date();
  const receivedAt = now.toISOString();
  const code = generateOtp();
  const payload: RequestPayload = { details, identifiers, ...(nominee ? { nominee } : {}) };
  let ref = newReference();
  for (let i = 0; i < 5 && (await t.selectFrom("rights_requests").select("id").where("ref", "=", ref).executeTakeFirst()); i++) ref = newReference();

  const requestId = await t.insertInto("rights_requests", {
    ref,
    type,
    status: "unverified",
    outcome: null,
    lang: input.lang === "hi" ? "hi" : "en",
    requester_name_enc: encryptForOrg(t.orgId, name),
    email_enc: encryptForOrg(t.orgId, email),
    email_hmac: emailHmac,
    payload_enc: encryptForOrg(t.orgId, JSON.stringify(payload)),
    otp_hash: null,
    otp_expires_at: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    otp_attempts: 0,
    otp_sends: 1,
    otp_last_sent_at: receivedAt,
    verified_at: null,
    received_at: receivedAt,
    due_at: computeDueAt(receivedAt, org.response_days),
    target_at: computeTargetAt(receivedAt, org.internal_target_days, org.response_days),
    closed_at: null,
    assignee_user_id: null,
    legal_hold_reason: "",
    reminded_t7_at: null,
    reminded_t1_at: null,
    reminded_overdue_at: null,
    ip_trunc: truncateIp(input.ip),
    created_at: receivedAt,
    updated_at: receivedAt,
  });
  await t.updateTable("rights_requests").set({ otp_hash: otpHash(t.orgId, requestId, code) }).where("id", "=", requestId).execute();
  for (const file of files) await saveAttachment(t, requestId, file);
  await event(t, requestId, "submitted", { meta: `${type}${files.length ? `; ${files.length} attachment(s)` : ""}` });
  // Counted for the usage meter only: rights requests are never limited by plan (s.11–14).
  await addUsage(t, { rights_requests: 1 });
  await audit(t, null, "request.submit", ref);

  const req = await getDecrypted(t, requestId);
  const mail = otpEmail(await emailContext(t, req!, opts.baseUrl), code);
  const sent = await sendLoggedMail(t, { kind: "rights.otp", to: email, subject: mail.subject, text: mail.text, requestId });
  await event(t, requestId, "otp_sent", { meta: sent.ok ? "sent" : "failed" });
  return { ok: true, requestId, ref, token: createRequestToken(requestId), email, mailSent: sent.ok };
}

// ── Public: verify with the one-time code ──

export type VerifyResult =
  | { ok: true; already: boolean; ref: string; dueAt: string; responseDays: number; type: RequestType; withdrawn: string[] | null; mailSent: boolean }
  | { ok: false; error: "invalid" | "code" | "expired" | "locked"; left?: number };

export async function verifyRequest(t: TenantDb, requestId: number, codeInput: string, opts: { baseUrl: string; now?: Date; ip?: string; userAgent?: string }): Promise<VerifyResult> {
  const row = await t.selectFrom("rights_requests").selectAll().where("id", "=", requestId).executeTakeFirst();
  if (!row) return { ok: false, error: "invalid" };
  const responseDays = Math.round((Date.parse(row.due_at) - Date.parse(row.received_at)) / 86_400_000);
  if (row.status !== "unverified" || row.verified_at) return { ok: true, already: true, ref: row.ref, dueAt: row.due_at, responseDays, type: row.type, withdrawn: null, mailSent: false };
  const now = opts.now ?? new Date();
  if (row.otp_attempts >= OTP_MAX_ATTEMPTS || !row.otp_hash) return { ok: false, error: "locked" };
  if (!row.otp_expires_at || Date.parse(row.otp_expires_at) < now.getTime()) return { ok: false, error: "expired" };
  const code = normalizeOtp(codeInput);
  if (!code || !verifyTokenSignature("rights-otp", `${t.orgId}:${requestId}:${code}`, row.otp_hash)) {
    const attempts = row.otp_attempts + 1;
    await t.updateTable("rights_requests").set({ otp_attempts: attempts, updated_at: now.toISOString() }).where("id", "=", requestId).execute();
    await event(t, requestId, "otp_failed", { meta: `attempt ${attempts}` });
    return attempts >= OTP_MAX_ATTEMPTS ? { ok: false, error: "locked" } : { ok: false, error: "code", left: OTP_MAX_ATTEMPTS - attempts };
  }

  const ts = now.toISOString();
  const r = await t
    .updateTable("rights_requests")
    .set({ status: "new", verified_at: ts, otp_hash: null, otp_expires_at: null, updated_at: ts })
    .where("id", "=", requestId)
    .where("status", "=", "unverified")
    .executeTakeFirst();
  if (affected(r) === 0) return { ok: true, already: true, ref: row.ref, dueAt: row.due_at, responseDays, type: row.type, withdrawn: null, mailSent: false };
  await event(t, requestId, "verified", { meta: "email code" });
  await audit(t, null, "request.verify", row.ref);
  const req = (await getDecrypted(t, requestId))!;
  const ctx = await emailContext(t, req, opts.baseUrl);

  if (row.type === "withdraw") {
    const withdrawn = await withdrawByEmail(t, req, { ip: opts.ip, userAgent: opts.userAgent });
    const mail = withdrawEmail(ctx, withdrawn);
    const sent = await sendLoggedMail(t, { kind: "rights.withdraw", to: req.email, subject: mail.subject, text: mail.text, requestId });
    await t
      .updateTable("rights_requests")
      .set({ status: "closed", outcome: withdrawn.length ? "completed" : "nothing_found", closed_at: nowIso(), updated_at: nowIso() })
      .where("id", "=", requestId)
      .execute();
    await event(t, requestId, "closed", { meta: withdrawn.length ? "completed (automatic)" : "nothing_found (automatic)", body: mail.text });
    await audit(t, null, "request.withdraw", row.ref);
    return { ok: true, already: false, ref: row.ref, dueAt: row.due_at, responseDays, type: row.type, withdrawn, mailSent: sent.ok };
  }

  const mail = ackEmail(ctx);
  const sent = await sendLoggedMail(t, { kind: "rights.ack", to: req.email, subject: mail.subject, text: mail.text, requestId });
  await event(t, requestId, "ack", { meta: sent.ok ? "sent" : "failed", body: mail.text });
  return { ok: true, already: false, ref: row.ref, dueAt: row.due_at, responseDays, type: row.type, withdrawn: null, mailSent: sent.ok };
}

/** Withdraw every granted consent recorded against this email address (form / link subjects), on every site of the organisation. */
async function withdrawByEmail(t: TenantDb, req: DecryptedRequest, opts: { ip?: string; userAgent?: string }): Promise<string[]> {
  const subjects = await t
    .selectFrom("consent_events")
    .select(["site_id", "subject_ref"])
    .where("subject_lookup_hmac", "=", req.row.email_hmac)
    .groupBy(["site_id", "subject_ref"])
    .execute();
  const names = new Map((await listPurposes(t)).map((p) => [p.purpose_key, req.row.lang === "hi" && p.name_hi.trim() ? p.name_hi : p.name_en]));
  const withdrawn = new Set<string>();
  for (const s of subjects) {
    const site = await getSite(t, s.site_id);
    if (!site) continue;
    const result = await withdrawAll(t, site, s.subject_ref, { channel: "hosted_page", lang: req.row.lang, ip: opts.ip, userAgent: opts.userAgent });
    if (result.ok) for (const e of result.events) withdrawn.add(names.get(e.purpose_key) ?? e.purpose_key);
  }
  return [...withdrawn];
}

export type ResendResult = { ok: true; mailSent: boolean } | { ok: false; error: "invalid" | "wait" | "max" | "done" };

/** A new code (and a fresh set of attempts), at most OTP_MAX_SENDS in total and one per minute. */
export async function resendCode(t: TenantDb, requestId: number, opts: { baseUrl: string; now?: Date }): Promise<ResendResult> {
  const row = await t.selectFrom("rights_requests").selectAll().where("id", "=", requestId).executeTakeFirst();
  if (!row) return { ok: false, error: "invalid" };
  if (row.status !== "unverified") return { ok: false, error: "done" };
  const now = opts.now ?? new Date();
  if (row.otp_sends >= OTP_MAX_SENDS) return { ok: false, error: "max" };
  if (row.otp_last_sent_at && now.getTime() - Date.parse(row.otp_last_sent_at) < OTP_RESEND_COOLDOWN_MS) return { ok: false, error: "wait" };
  const code = generateOtp();
  const ts = now.toISOString();
  await t
    .updateTable("rights_requests")
    .set({ otp_hash: otpHash(t.orgId, requestId, code), otp_expires_at: new Date(now.getTime() + OTP_TTL_MS).toISOString(), otp_attempts: 0, otp_sends: row.otp_sends + 1, otp_last_sent_at: ts, updated_at: ts })
    .where("id", "=", requestId)
    .execute();
  const req = (await getDecrypted(t, requestId))!;
  const mail = otpEmail(await emailContext(t, req, opts.baseUrl), code);
  const sent = await sendLoggedMail(t, { kind: "rights.otp", to: req.email, subject: mail.subject, text: mail.text, requestId });
  await event(t, requestId, "otp_sent", { meta: `resend ${row.otp_sends + 1}; ${sent.ok ? "sent" : "failed"}` });
  return { ok: true, mailSent: sent.ok };
}

// ── Dashboard: inbox ──

export interface InboxFilter {
  /** "open" (default) = new, in progress, waiting. */
  status?: "open" | "all" | RequestStatus;
  type?: RequestType;
  overdue?: boolean;
  /** A user id, or "none" for unassigned. */
  assignee?: number | "none";
  ref?: string;
  limit?: number;
  offset?: number;
}

export async function listRequests(t: TenantDb, filter: InboxFilter = {}, now: Date = new Date()): Promise<{ rows: RightsRequestRow[]; total: number }> {
  let q = t.selectFrom("rights_requests");
  const status = filter.status ?? "open";
  if (status === "open") q = q.where("status", "in", [...OPEN_STATUSES]);
  else if (status !== "all") q = q.where("status", "=", status);
  if (filter.type) q = q.where("type", "=", filter.type);
  if (filter.overdue) q = q.where("status", "!=", "closed").where("due_at", "<", now.toISOString());
  if (filter.assignee === "none") q = q.where("assignee_user_id", "is", null);
  else if (typeof filter.assignee === "number") q = q.where("assignee_user_id", "=", filter.assignee);
  if (filter.ref) {
    const ref = filter.ref.trim().toUpperCase();
    q = REFERENCE_PATTERN.test(ref) ? q.where("ref", "=", ref) : q.where("ref", "=", "");
  }
  const [rows, count] = await Promise.all([
    q.selectAll().orderBy("due_at").orderBy("id").limit(Math.min(200, filter.limit ?? 50)).offset(filter.offset ?? 0).execute(),
    q.select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst(),
  ]);
  return { rows, total: Number(count?.n ?? 0) };
}

export interface RightsStats {
  open: number;
  overdue: number;
  dueSoon: number;
  unverified: number;
}

export async function rightsStats(t: TenantDb, now: Date = new Date()): Promise<RightsStats> {
  const rows = await t.selectFrom("rights_requests").select(["status", "due_at"]).where("status", "!=", "closed").execute();
  const soon = now.getTime() + 7 * 86_400_000;
  let open = 0;
  let overdue = 0;
  let dueSoon = 0;
  let unverified = 0;
  for (const r of rows) {
    const due = Date.parse(r.due_at);
    if (r.status === "unverified") unverified++;
    else open++;
    if (due < now.getTime()) overdue++;
    else if (r.status !== "unverified" && due <= soon) dueSoon++;
  }
  return { open, overdue, dueSoon, unverified };
}

export function getRequest(t: TenantDb, id: number): Promise<RightsRequestRow | undefined> {
  return t.selectFrom("rights_requests").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function getDecrypted(t: TenantDb, id: number): Promise<DecryptedRequest | null> {
  const row = await getRequest(t, id);
  return row ? decryptRequest(t, row) : null;
}

export interface TimelineEntry {
  id: number;
  kind: string;
  meta: string;
  body: string | null;
  byUserId: number | null;
  createdAt: string;
}

export async function listRequestEvents(t: TenantDb, requestId: number): Promise<TimelineEntry[]> {
  const rows = await t.selectFrom("request_events").selectAll().where("request_id", "=", requestId).orderBy("id").execute();
  return rows.map((r) => ({ id: r.id, kind: r.kind, meta: r.meta, body: r.body_enc ? decryptForOrg(t.orgId, r.body_enc) : null, byUserId: r.by_user_id, createdAt: r.created_at }));
}

/** Members of the organisation (for assignment). */
export async function listMembers(t: TenantDb): Promise<Array<{ userId: number; role: string }>> {
  const rows = await t.selectFrom("memberships").select(["user_id", "role"]).orderBy("user_id").execute();
  return rows.map((r) => ({ userId: r.user_id, role: r.role }));
}

export type ActionResult = { ok: true } | { ok: false; error: "not_found" | "status" | "outcome" | "letter" | "assignee" | "empty" | "mail" | "nominee" };

/** Status workflow (STATUS_FLOW). Closing needs an outcome: use closeRequest(). */
export async function changeStatus(t: TenantDb, id: number, to: RequestStatus, userId: number | null): Promise<ActionResult> {
  const row = await getRequest(t, id);
  if (!row) return { ok: false, error: "not_found" };
  if (to === "closed" || !canMove(row.status, to)) return { ok: false, error: "status" };
  const ts = nowIso();
  const reopen = row.status === "closed";
  await t
    .updateTable("rights_requests")
    .set({ status: to, updated_at: ts, ...(reopen ? { closed_at: null, outcome: null } : {}) })
    .where("id", "=", id)
    .execute();
  await event(t, id, "status", { meta: `${row.status}→${to}${row.status === "unverified" ? " (accepted without email code)" : ""}`, userId });
  await audit(t, userId, "request.status", `${row.ref} ${row.status}→${to}`);
  return { ok: true };
}

export async function assignRequest(t: TenantDb, id: number, assigneeUserId: number | null, userId: number | null): Promise<ActionResult> {
  const row = await getRequest(t, id);
  if (!row) return { ok: false, error: "not_found" };
  if (assigneeUserId !== null && !(await t.selectFrom("memberships").select("user_id").where("user_id", "=", assigneeUserId).executeTakeFirst())) return { ok: false, error: "assignee" };
  await t.updateTable("rights_requests").set({ assignee_user_id: assigneeUserId, updated_at: nowIso() }).where("id", "=", id).execute();
  await event(t, id, "assign", { meta: assigneeUserId ? `user ${assigneeUserId}` : "unassigned", userId });
  await audit(t, userId, "request.assign", `${row.ref} → ${assigneeUserId ?? "none"}`);
  return { ok: true };
}

/** Internal note, identity-check note or legal-hold reason (encrypted; never sent to the requester). */
export async function addNote(t: TenantDb, id: number, kind: "note" | "identity" | "legal_hold", text: string, userId: number | null): Promise<ActionResult> {
  const row = await getRequest(t, id);
  if (!row) return { ok: false, error: "not_found" };
  const body = text.trim().slice(0, 4000);
  if (!body) return { ok: false, error: "empty" };
  if (kind === "legal_hold") await t.updateTable("rights_requests").set({ legal_hold_reason: body.slice(0, 400), updated_at: nowIso() }).where("id", "=", id).execute();
  await event(t, id, kind, { body, userId });
  await audit(t, userId, `request.${kind}`, row.ref);
  return { ok: true };
}

// ── Replies (templates with the Rule 9 contact block) ──

/** s.11(1)(a) data and processing from the purposes register, s.11(1)(b) processors from the vendor register (R1-02). */
export async function accessSummary(t: TenantDb, lang: Lang): Promise<AccessSummary> {
  const [purposes, vendors] = await Promise.all([listPurposes(t), listVendors(t)]);
  const hiOr = (hi: string, en: string) => (lang === "hi" && hi.trim() ? hi : en);
  return {
    purposes: purposes
      .filter((p) => p.active === 1)
      .map((p) => ({ name: hiOr(p.name_hi, p.name_en), items: parseDataItems(p.data_items).map((i) => dataItemLabel(i, lang)), use: hiOr(p.desc_hi, p.desc_en) })),
    vendors: vendors.map((v) => ({ name: v.name, service: v.service, dataShared: jsonArray(v.data_shared).filter((d): d is string => typeof d === "string"), location: v.location })),
  };
}

export async function buildReply(t: TenantDb, id: number, template: ReplyTemplate, baseUrl: string, outcome?: Outcome): Promise<Email | null> {
  const req = await getDecrypted(t, id);
  if (!req) return null;
  const ctx = await emailContext(t, req, baseUrl);
  const nomination = await t.selectFrom("nominations").selectAll().where("request_id", "=", id).where("status", "=", "active").orderBy("id", "desc").limit(1).executeTakeFirst();
  const nominee = nomination
    ? { name: decryptForOrg(t.orgId, nomination.nominee_name_enc) ?? "", relation: nomination.nominee_relation, recordedDate: istDate(nomination.recorded_at) }
    : req.payload.nominee
      ? { name: req.payload.nominee.name, relation: req.payload.nominee.relation, recordedDate: istDate(nowIso()) }
      : undefined;
  const vendors = await listVendors(t);
  return replyDraft(template, ctx, {
    access: template === "access" ? await accessSummary(t, req.row.lang) : undefined,
    processors: vendors.map((v) => v.name),
    nominee,
    summary: req.payload.details.slice(0, 300),
    outcome,
  });
}

/** The Rule 9 block for this organisation, as inserted into every reply. */
export async function contactBlockFor(t: TenantDb, lang: Lang): Promise<string> {
  const org = await t.org();
  return contactBlock(lang, org?.legal_name || org?.name || "", await orgContact(t));
}

/** Email a reply to the requester. The contact block is re-added if it was edited out (R4-02). */
export async function sendReply(t: TenantDb, id: number, reply: { subject: string; text: string }, userId: number | null): Promise<ActionResult> {
  const req = await getDecrypted(t, id);
  if (!req) return { ok: false, error: "not_found" };
  const subject = reply.subject.trim().slice(0, 200);
  const raw = reply.text.trim().slice(0, 20_000);
  if (!subject || !raw) return { ok: false, error: "empty" };
  const text = ensureContactBlock(raw, await contactBlockFor(t, req.row.lang));
  const sent = await sendLoggedMail(t, { kind: "rights.reply", to: req.email, subject, text, requestId: id });
  await event(t, id, "reply", { meta: `${subject.slice(0, 300)}${sent.ok ? "" : " (failed)"}`, body: text, userId });
  await audit(t, userId, "request.reply", req.row.ref);
  if (!sent.ok) return { ok: false, error: "mail" };
  if (req.row.status === "new") await t.updateTable("rights_requests").set({ status: "in_progress", updated_at: nowIso() }).where("id", "=", id).execute();
  return { ok: true };
}

/**
 * Close with an outcome. Grievances need a closure letter (R5-01: the
 * Data Principal must exhaust this route before the Board, s.13(3)); the
 * letter always carries the contact block and the Board paragraph.
 */
export async function closeRequest(t: TenantDb, id: number, input: { outcome: string; letter?: { subject: string; text: string } | null }, userId: number | null): Promise<ActionResult> {
  const req = await getDecrypted(t, id);
  if (!req) return { ok: false, error: "not_found" };
  if (req.row.status === "closed") return { ok: false, error: "status" };
  const outcome = input.outcome as Outcome;
  if (!outcomesFor(req.row.type).includes(outcome)) return { ok: false, error: "outcome" };
  const letter = input.letter && input.letter.text.trim() ? input.letter : null;
  if (req.row.type === "grievance" && !letter) return { ok: false, error: "letter" };
  let body: string | null = null;
  if (letter) {
    let text = letter.text.trim();
    if (req.row.type === "grievance" && !text.includes(boardParagraph(req.row.lang, req.row.ref))) text = `${text}\n\n${boardParagraph(req.row.lang, req.row.ref)}`;
    text = ensureContactBlock(text, await contactBlockFor(t, req.row.lang));
    const subject = letter.subject.trim().slice(0, 200) || req.row.ref;
    const sent = await sendLoggedMail(t, { kind: req.row.type === "grievance" ? "rights.closure.grievance" : "rights.closure", to: req.email, subject, text, requestId: id });
    if (!sent.ok) {
      await event(t, id, "reply", { meta: `${subject} (failed)`, body: text, userId });
      return { ok: false, error: "mail" };
    }
    body = text;
  }
  const ts = nowIso();
  await t.updateTable("rights_requests").set({ status: "closed", outcome, closed_at: ts, updated_at: ts }).where("id", "=", id).execute();
  await event(t, id, "closed", { meta: outcome, body, userId });
  await audit(t, userId, "request.close", `${req.row.ref} ${outcome}`);
  return { ok: true };
}

// ── Nominations (s.14; Rule 14(4)) ──

export interface NominationView {
  id: number;
  requestId: number | null;
  principalName: string;
  nomineeName: string;
  relation: string;
  contact: string;
  status: NominationRow["status"];
  recordedAt: string;
  revokedAt: string | null;
}

const viewNomination = (t: TenantDb, n: NominationRow): NominationView => ({
  id: n.id,
  requestId: n.request_id,
  principalName: decryptForOrg(t.orgId, n.principal_name_enc) ?? "",
  nomineeName: decryptForOrg(t.orgId, n.nominee_name_enc) ?? "",
  relation: n.nominee_relation,
  contact: decryptForOrg(t.orgId, n.nominee_contact_enc) ?? "",
  status: n.status,
  recordedAt: n.recorded_at,
  revokedAt: n.revoked_at,
});

/** Record the nominee from a nomination request; an earlier active nomination of the same person is revoked. */
export async function recordNomination(t: TenantDb, requestId: number, userId: number | null): Promise<ActionResult> {
  const req = await getDecrypted(t, requestId);
  if (!req) return { ok: false, error: "not_found" };
  const nominee = req.payload.nominee;
  if (req.row.type !== "nomination" || !nominee?.name) return { ok: false, error: "nominee" };
  const ts = nowIso();
  await t.transaction(async (tx) => {
    await tx.updateTable("nominations").set({ status: "revoked", revoked_at: ts }).where("principal_email_hmac", "=", req.row.email_hmac).where("status", "=", "active").execute();
    await tx.insertInto("nominations", {
      request_id: requestId,
      principal_email_hmac: req.row.email_hmac,
      principal_name_enc: encryptForOrg(t.orgId, req.name),
      nominee_name_enc: encryptForOrg(t.orgId, nominee.name),
      nominee_relation: nominee.relation.slice(0, 60),
      nominee_contact_enc: encryptForOrg(t.orgId, nominee.contact),
      status: "active",
      recorded_at: ts,
      recorded_by: userId,
      revoked_at: null,
    });
  });
  await event(t, requestId, "nomination", { meta: "recorded", userId });
  await audit(t, userId, "nomination.record", req.row.ref);
  return { ok: true };
}

export async function revokeNomination(t: TenantDb, nominationId: number, userId: number | null): Promise<ActionResult> {
  const r = await t.updateTable("nominations").set({ status: "revoked", revoked_at: nowIso() }).where("id", "=", nominationId).where("status", "=", "active").executeTakeFirst();
  if (affected(r) === 0) return { ok: false, error: "not_found" };
  await audit(t, userId, "nomination.revoke", String(nominationId));
  return { ok: true };
}

export async function listNominations(t: TenantDb, opts: { requestId?: number; emailHmac?: string } = {}): Promise<NominationView[]> {
  let q = t.selectFrom("nominations").selectAll();
  if (opts.requestId) q = q.where("request_id", "=", opts.requestId);
  if (opts.emailHmac) q = q.where("principal_email_hmac", "=", opts.emailHmac);
  return (await q.orderBy("id", "desc").limit(200).execute()).map((n) => viewNomination(t, n));
}

// ── Internal reminders (R3-03: T−7, T−1 and overdue) ──

export interface ReminderOptions {
  baseUrl: string;
  now?: Date;
  /** Email addresses to remind for a request (the owner and the assignee). */
  recipients: (assigneeUserId: number | null) => Promise<string[]>;
}

export async function sendDueReminders(t: TenantDb, opts: ReminderOptions): Promise<number> {
  const now = opts.now ?? new Date();
  const horizon = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const rows = await t.selectFrom("rights_requests").selectAll().where("status", "in", [...OPEN_STATUSES]).where("due_at", "<=", horizon).execute();
  const org = await t.org();
  if (!org) return 0;
  let sent = 0;
  for (const row of rows) {
    const kind = reminderDue(row, now);
    if (!kind) continue;
    const name = decryptForOrg(t.orgId, row.requester_name_enc) ?? "";
    const mail = reminderEmail("en", kind, {
      ref: row.ref,
      type: row.type,
      requester: maskName(name),
      due: istDate(row.due_at),
      left: Math.max(0, daysLeft(row.due_at, now)),
      url: `${opts.baseUrl.replace(/\/+$/, "")}/dashboard/requests/${row.id}`,
    });
    for (const to of new Set(await opts.recipients(row.assignee_user_id))) {
      const r = await sendLoggedMail(t, { kind: `rights.reminder.${kind}`, to, subject: mail.subject, text: `${mail.text}\n\n${org.name}`, requestId: row.id });
      if (r.ok) sent++;
    }
    const ts = now.toISOString();
    const mark = kind === "overdue" ? { reminded_overdue_at: ts } : kind === "t1" ? { reminded_t1_at: ts, reminded_t7_at: row.reminded_t7_at ?? ts } : { reminded_t7_at: ts };
    await t.updateTable("rights_requests").set(mark).where("id", "=", row.id).execute();
    await event(t, row.id, "reminder", { meta: kind });
  }
  return sent;
}
