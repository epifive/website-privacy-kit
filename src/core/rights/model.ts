import { randomBytes, randomInt } from "node:crypto";
import { clampResponseDays } from "../notice/render";

/**
 * Data Principal rights requests (plan M7; requirements R1–R5).
 *
 * Pure rules shared by the hosted request form, the dashboard inbox and the
 * reminder job: request types, the status workflow, due dates and SLA states,
 * OTP and attachment policies. No I/O and no framework code.
 *
 * Not legal advice. Interpretation (lawyer to confirm): the response period
 * runs from receipt of the request, not from identity verification.
 */

/** s.11 access, s.12 correction/completion/updating and erasure, s.13 grievance, s.14 nomination, plus a consent-withdrawal shortcut (s.6(4)). */
export const REQUEST_TYPES = ["access", "correction", "erasure", "nomination", "grievance", "withdraw"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ["unverified", "new", "in_progress", "waiting", "closed"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Statuses that count as "open" in the inbox and for reminders. */
export const OPEN_STATUSES: readonly RequestStatus[] = ["new", "in_progress", "waiting"];

/** Allowed status changes made by the business (verification moves unverified → new). */
export const STATUS_FLOW: Record<RequestStatus, readonly RequestStatus[]> = {
  unverified: ["new", "closed"],
  new: ["in_progress", "waiting", "closed"],
  in_progress: ["waiting", "closed"],
  waiting: ["in_progress", "closed"],
  closed: ["in_progress"],
};

export function canMove(from: RequestStatus, to: RequestStatus): boolean {
  return STATUS_FLOW[from]?.includes(to) ?? false;
}

export const OUTCOMES = ["completed", "partly_completed", "refused", "not_verified", "nothing_found", "withdrawn_by_requester", "resolved", "partly_resolved", "not_upheld"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Outcomes offered when closing a request of each type (R5-01: grievances close with a finding). */
export function outcomesFor(type: RequestType): readonly Outcome[] {
  if (type === "grievance") return ["resolved", "partly_resolved", "not_upheld", "withdrawn_by_requester"];
  if (type === "withdraw") return ["completed", "nothing_found", "not_verified"];
  return ["completed", "partly_completed", "refused", "not_verified", "withdrawn_by_requester"];
}

/** Request types whose description an organisation may make mandatory (corrections and grievances always need one). */
export const DETAILS_CONFIGURABLE = ["access", "erasure"] as const;

/** True when a request of this type must include a description (details_required = the organisation's JSON list). */
export function detailsRequired(type: RequestType, detailsRequiredJson: string | null | undefined): boolean {
  if (type === "correction" || type === "grievance") return true;
  let list: unknown = [];
  try {
    list = JSON.parse(detailsRequiredJson || "[]");
  } catch {
    list = [];
  }
  return Array.isArray(list) && (DETAILS_CONFIGURABLE as readonly string[]).includes(type) && list.includes(type);
}

// ── Due dates and SLA (Rule 14(3); PIB 17 Nov 2025: 90 days for every request type) ──

export const DAY_MS = 86_400_000;
/** Reminder windows (test plan §10.1: T−7 and T−1). */
export const DUE_SOON_DAYS = 7;

/** Legal due date: received + the published response period, never more than 90 days (R3-01, R3-02). */
export function computeDueAt(receivedAt: string, responseDays: number): string {
  return new Date(Date.parse(receivedAt) + clampResponseDays(responseDays) * DAY_MS).toISOString();
}

/** Optional shorter internal target; null when unset. Never later than the legal due date. */
export function computeTargetAt(receivedAt: string, internalDays: number | null | undefined, responseDays: number): string | null {
  const n = Math.round(Number(internalDays));
  if (!Number.isFinite(n) || n < 1) return null;
  return new Date(Date.parse(receivedAt) + Math.min(n, clampResponseDays(responseDays)) * DAY_MS).toISOString();
}

/** Internal target setting: 0 (off) or 1 … response period − 1. */
export function clampInternalTarget(value: unknown, responseDays: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(n, Math.max(0, clampResponseDays(responseDays) - 1));
}

export type SlaState = "closed" | "unverified" | "overdue" | "due_soon" | "target_missed" | "on_track";

export interface SlaInput {
  status: RequestStatus;
  due_at: string;
  target_at?: string | null;
}

export function slaState(r: SlaInput, now: Date = new Date()): SlaState {
  if (r.status === "closed") return "closed";
  const t = now.getTime();
  const due = Date.parse(r.due_at);
  // Unverified requests still carry the legal clock, so overdue wins over "unverified".
  if (t > due) return "overdue";
  if (r.status === "unverified") return "unverified";
  if (due - t <= DUE_SOON_DAYS * DAY_MS) return "due_soon";
  if (r.target_at && t > Date.parse(r.target_at)) return "target_missed";
  return "on_track";
}

/** Whole days left until the due date (negative when overdue). */
export function daysLeft(dueAt: string, now: Date = new Date()): number {
  const diff = Date.parse(dueAt) - now.getTime();
  return diff >= 0 ? Math.ceil(diff / DAY_MS) : -Math.ceil(-diff / DAY_MS);
}

export type ReminderKind = "t7" | "t1" | "overdue";

export interface ReminderState extends SlaInput {
  reminded_t7_at: string | null;
  reminded_t1_at: string | null;
  reminded_overdue_at: string | null;
}

/** Which internal reminder (if any) is due now for an open request (R3-03). */
export function reminderDue(r: ReminderState, now: Date = new Date()): ReminderKind | null {
  if (!OPEN_STATUSES.includes(r.status)) return null;
  const left = Date.parse(r.due_at) - now.getTime();
  if (left < 0) return r.reminded_overdue_at ? null : "overdue";
  if (left <= DAY_MS) return r.reminded_t1_at ? null : "t1";
  if (left <= DUE_SOON_DAYS * DAY_MS) return r.reminded_t7_at || r.reminded_t1_at ? null : "t7";
  return null;
}

/** Calendar date in India (IST), e.g. "2026-12-19", for emails and the inbox. */
export function istDate(iso: string): string {
  return new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
}

// ── Reference numbers ──

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Human-friendly reference such as "R-7KQ2-M9XP" (no 0/O or 1/I). */
export function newReference(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `R-${s.slice(0, 4)}-${s.slice(4)}`;
}

export const REFERENCE_PATTERN = /^R-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

// ── Email OTP (verification of the contact address) ──

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 15 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
/** First code plus three resends. */
export const OTP_MAX_SENDS = 4;

export function generateOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

export function normalizeOtp(input: string): string | null {
  const digits = input.replace(/\s|-/g, "");
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(digits) ? digits : null;
}

// ── Submission limits ──

/** Per IP address and per email address (per organisation). */
export const SUBMIT_LIMITS = {
  ipPerWindow: 5,
  emailPerWindow: 3,
  windowMs: 60 * 60_000,
  verifyPerIpPerMinute: 20,
} as const;

// ── Attachments (optional; Rule 14(2) "furnishing the particulars") ──

export const ATTACHMENT_LIMITS = {
  maxFiles: 3,
  maxBytes: 2 * 1024 * 1024,
  maxTotalBytes: 5 * 1024 * 1024,
} as const;

export type AttachmentMime = "application/pdf" | "image/png" | "image/jpeg";

/** File type from its first bytes (the browser's declared type is not trusted). */
export function sniffAttachment(bytes: Uint8Array): AttachmentMime | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export const MIME_EXT: Record<AttachmentMime, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

export type AttachmentIssue = "count" | "size" | "total" | "type" | "empty";

export function checkAttachments(files: Array<{ size: number; bytes: Uint8Array }>): AttachmentIssue | null {
  const real = files.filter((f) => f.size > 0);
  if (real.length > ATTACHMENT_LIMITS.maxFiles) return "count";
  let total = 0;
  for (const f of real) {
    if (f.size > ATTACHMENT_LIMITS.maxBytes) return "size";
    if (!sniffAttachment(f.bytes)) return "type";
    total += f.size;
  }
  if (total > ATTACHMENT_LIMITS.maxTotalBytes) return "total";
  return null;
}

/** A display file name without paths or control characters, keeping a sensible extension. */
export function safeFilename(name: string, mime: AttachmentMime): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .trim()
    .slice(0, 80);
  return `${base || "attachment"}.${MIME_EXT[mime]}`;
}

/** "asha.k@example.com" → "a***@example.com" (for logs and internal reminders). */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => (p ? `${[...p][0]}.` : ""))
    .join(" ");
}
