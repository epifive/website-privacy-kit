import { randomBytes } from "node:crypto";

/**
 * Personal data breach register (plan M8; requirements B1–B4). Pure rules:
 * the four timers, statuses, checklist and reminder schedule. No I/O.
 *
 * Not legal advice. Sources (verified wording in DPDP-KIT-PLAN.md §2.2):
 * - Rule 7(1): tell each affected Data Principal "without delay" — no fixed hours.
 * - Rule 7(2)(a): tell the Board "without delay" — no fixed hours (elapsed clock).
 * - Rule 7(2)(b): detailed report to the Board "within seventy-two hours of
 *   becoming aware", or a longer period the Board allows on a written request.
 * - CERT-In Directions (ii): report Annexure I incidents "within 6 hours of
 *   noticing". CERT-In counts from noticing; the Board from becoming aware.
 * - s.2(u): any unauthorised processing is a breach; there is no threshold.
 *
 * Times are stored as UTC ISO strings and shown in IST (UTC+05:30).
 */

export const HOUR_MS = 3_600_000;
export const IST_OFFSET_MS = 330 * 60_000;

/** CERT-In Directions (ii): 6 hours from noticing. */
export const CERTIN_HOURS = 6;
/** Rule 7(2)(b): 72 hours from becoming aware (unless the Board allows longer). */
export const BOARD_DETAIL_HOURS = 72;
/**
 * "Without delay" has no number in the Rules. The product nudges (amber, then
 * red) after these many hours; this is a reminder setting, not a legal limit.
 */
export const WITHOUT_DELAY_NUDGE_HOURS = 1;
export const WITHOUT_DELAY_LATE_HOURS = 24;

export const BREACH_STATUSES = ["open", "contained", "closed"] as const;
export type BreachStatus = (typeof BREACH_STATUSES)[number];

export const TIMER_KEYS = ["certin", "board_initial", "board_detail", "dp_intimation"] as const;
export type TimerKey = (typeof TIMER_KEYS)[number];

export type TimerState = "done" | "overdue" | "due_soon" | "running" | "not_applicable";

export interface Timer {
  key: TimerKey;
  /** "deadline" timers have a due time; "elapsed" timers ("without delay") only count up. */
  kind: "deadline" | "elapsed";
  startAt: string;
  dueAt: string | null;
  doneAt: string | null;
  state: TimerState;
  /** Milliseconds from start to done (or to now). */
  elapsedMs: number;
  /** Milliseconds left until due (negative when overdue); null for elapsed timers. */
  remainingMs: number | null;
}

export interface BreachTimes {
  noticed_at: string;
  aware_at: string;
  certin_applicable: number | boolean;
  certin_sent_at: string | null;
  board_initial_sent_at: string | null;
  board_detail_sent_at: string | null;
  dp_notice_sent_at: string | null;
  /** Longer period the Board allowed on a written request (Rule 7(2)(b)); null = 72 h. */
  extension_until: string | null;
}

const addHours = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * HOUR_MS).toISOString();

/** B4-01: CERT-In report due = noticed_at + 6 h. */
export function certinDueAt(noticedAt: string): string {
  return addHours(noticedAt, CERTIN_HOURS);
}

/** B2-01: detailed Board report due = aware_at + 72 h, or the extension the Board allowed (never earlier than 72 h). */
export function boardDetailDueAt(awareAt: string, extensionUntil?: string | null): string {
  const base = addHours(awareAt, BOARD_DETAIL_HOURS);
  return extensionUntil && Date.parse(extensionUntil) > Date.parse(base) ? new Date(Date.parse(extensionUntil)).toISOString() : base;
}

function deadline(key: TimerKey, startAt: string, dueAt: string, doneAt: string | null, now: Date, soonMs: number): Timer {
  const end = doneAt ? Date.parse(doneAt) : now.getTime();
  const remaining = Date.parse(dueAt) - now.getTime();
  const state: TimerState = doneAt ? "done" : remaining < 0 ? "overdue" : remaining <= soonMs ? "due_soon" : "running";
  return { key, kind: "deadline", startAt, dueAt, doneAt, state, elapsedMs: Math.max(0, end - Date.parse(startAt)), remainingMs: doneAt ? null : remaining };
}

function elapsed(key: TimerKey, startAt: string, doneAt: string | null, now: Date): Timer {
  const end = doneAt ? Date.parse(doneAt) : now.getTime();
  const ms = Math.max(0, end - Date.parse(startAt));
  const state: TimerState = doneAt ? "done" : ms >= WITHOUT_DELAY_LATE_HOURS * HOUR_MS ? "overdue" : ms >= WITHOUT_DELAY_NUDGE_HOURS * HOUR_MS ? "due_soon" : "running";
  return { key, kind: "elapsed", startAt, dueAt: null, doneAt, state, elapsedMs: ms, remainingMs: null };
}

/**
 * The four timers (B2-01, B2-03, B4-01, B1):
 * - certin: noticed_at + 6 h (only for CERT-In Annexure I incidents)
 * - board_initial: elapsed clock from aware_at ("without delay")
 * - board_detail: aware_at + 72 h (or the extension the Board allowed)
 * - dp_intimation: elapsed clock from aware_at ("without delay")
 */
export function breachTimers(b: BreachTimes, now: Date = new Date()): Timer[] {
  const certin: Timer = Number(b.certin_applicable)
    ? deadline("certin", b.noticed_at, certinDueAt(b.noticed_at), b.certin_sent_at, now, 2 * HOUR_MS)
    : { key: "certin", kind: "deadline", startAt: b.noticed_at, dueAt: null, doneAt: null, state: "not_applicable", elapsedMs: 0, remainingMs: null };
  return [
    certin,
    elapsed("board_initial", b.aware_at, b.board_initial_sent_at, now),
    deadline("board_detail", b.aware_at, boardDetailDueAt(b.aware_at, b.extension_until), b.board_detail_sent_at, now, 24 * HOUR_MS),
    elapsed("dp_intimation", b.aware_at, b.dp_notice_sent_at, now),
  ];
}

/** Worst state across timers, for list badges and alerts. */
export function worstState(timers: Timer[]): TimerState {
  const order: TimerState[] = ["overdue", "due_soon", "running", "done", "not_applicable"];
  for (const s of order) if (timers.some((t) => t.state === s)) return s;
  return "not_applicable";
}

/** "5 h 20 min", "2 d 3 h" (absolute value). */
export function formatDuration(ms: number): { d: number; h: number; m: number } {
  const total = Math.floor(Math.abs(ms) / 60_000);
  return { d: Math.floor(total / 1440), h: Math.floor((total % 1440) / 60), m: total % 60 };
}

// ── Reminders (sent once each, through the cron job) ──

export const REMINDER_KINDS = ["certin_soon", "certin_overdue", "board_initial", "board_detail_soon", "board_detail_overdue", "dp_pending"] as const;
export type BreachReminderKind = (typeof REMINDER_KINDS)[number];

/** Reminders that are due now and not yet sent (open and contained incidents only). */
export function breachRemindersDue(b: BreachTimes & { status: string }, sent: Record<string, string>, now: Date = new Date()): BreachReminderKind[] {
  if (b.status === "closed") return [];
  const out: BreachReminderKind[] = [];
  const [certin, initial, detail, dp] = breachTimers(b, now);
  const want = (kind: BreachReminderKind, cond: boolean) => {
    if (cond && !sent[kind]) out.push(kind);
  };
  want("certin_overdue", certin.state === "overdue");
  want("certin_soon", certin.state === "due_soon" && !sent.certin_overdue);
  want("board_initial", initial.state === "due_soon" || initial.state === "overdue");
  want("board_detail_overdue", detail.state === "overdue");
  want("board_detail_soon", detail.state === "due_soon");
  want("dp_pending", dp.state === "overdue");
  return out;
}

// ── Checklist (internal; sending checklist of templates 07 and 08) ──

export const CHECKLIST_KEYS = ["contain", "preserve_logs", "assess", "certin_check", "recipients", "processors", "root_cause", "review"] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export function parseChecklist(json: string | null | undefined): Partial<Record<ChecklistKey, string>> {
  try {
    const v = JSON.parse(json || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Partial<Record<ChecklistKey, string>> = {};
    for (const k of CHECKLIST_KEYS) if (typeof v[k] === "string") out[k] = v[k];
    return out;
  } catch {
    return {};
  }
}

// ── Dates in IST ──

/** "2026-11-19T16:30" entered in IST (datetime-local) → UTC ISO; null when invalid. */
export function istLocalToUtc(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)) - IST_OFFSET_MS;
  const d = new Date(ms);
  return Number.isNaN(ms) || d.getUTCFullYear() < 2000 ? null : d.toISOString();
}

/** UTC ISO → "2026-11-19T16:30" in IST, for datetime-local inputs. */
export function utcToIstLocal(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** "19 Nov 2026, 16:30 IST" — fixed format, independent of the server's time zone. */
export function istDateTime(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "—";
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} IST`;
}

// ── Reference numbers ──

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** "B-7KQ2-M9XP" (no 0/O or 1/I). */
export function newBreachReference(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `B-${s.slice(0, 4)}-${s.slice(4)}`;
}
