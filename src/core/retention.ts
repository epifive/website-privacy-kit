/**
 * Retention rules (plan M9; requirements E1–E3). Pure validation helpers.
 */

export const RETENTION_TRIGGERS = ["collection", "last_interaction", "purpose_complete", "withdrawal", "account_closure"] as const;
export const RETENTION_ACTIONS = ["erase", "anonymise", "review"] as const;
export type RetentionTrigger = (typeof RETENTION_TRIGGERS)[number];
export type RetentionAction = (typeof RETENTION_ACTIONS)[number];

/** Rule 8(3): logs and traffic data are kept for at least one year from processing. */
export const LOG_FLOOR_DAYS = 365;
/** Optional pre-erasure notice (Rule 8(2) for Third Schedule classes; good practice for others). */
export const DEFAULT_PRE_NOTICE_HOURS = 48;
export const MAX_RETENTION_DAYS = 36_500;

export interface RetentionRuleInput {
  category: string;
  periodDays: number;
  trigger: RetentionTrigger;
  action: RetentionAction;
  isLogs: boolean;
  preNoticeHours: number | null;
}

export type RetentionIssue = "category" | "period" | "log_floor" | "pre_notice";

export function validateRetentionRule(rule: RetentionRuleInput): RetentionIssue[] {
  const issues: RetentionIssue[] = [];
  if (!rule.category.trim()) issues.push("category");
  if (!Number.isInteger(rule.periodDays) || rule.periodDays < 0 || rule.periodDays > MAX_RETENTION_DAYS) issues.push("period");
  // 0 means "until consent is withdrawn", which is never allowed for logs.
  if (rule.isLogs && (rule.periodDays < LOG_FLOOR_DAYS || rule.trigger === "withdrawal" && rule.periodDays === 0)) issues.push("log_floor");
  if (rule.preNoticeHours !== null && (!Number.isInteger(rule.preNoticeHours) || rule.preNoticeHours < 1 || rule.preNoticeHours > 24 * 30)) issues.push("pre_notice");
  return issues;
}

// ── Erasure tasks (plan M9; E1–E3) ──

const DAY_MS = 86_400_000;

/** Erasure runs per retention rule: one task every 30 days erases what passed its period since the last run. */
export const ERASURE_CYCLE_DAYS = 30;
/** Consent records (proof under s.6(10)) and logs: never purged before one year (Rule 8(3)). */
export const CONSENT_RETENTION_MIN_DAYS = LOG_FLOOR_DAYS;
/** Default: 3 years, the same as the preset "Consent records" rule (proof under s.6(10); lawyer to confirm). */
export const CONSENT_RETENTION_DEFAULT_DAYS = 1095;

/** The Rule 8(3) floor as a date: one calendar year before `now` (366 days across a leap day). */
export function logFloorCutoff(now: Date): Date {
  const d = new Date(now.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d;
}

/** Records created before the returned time may be erased: the earlier of (now − retention) and the one-year floor. */
export function consentPurgeCutoff(now: Date, retentionDays: number): Date {
  const days = Math.max(CONSENT_RETENTION_MIN_DAYS, Math.round(Number(retentionDays)) || CONSENT_RETENTION_DEFAULT_DAYS);
  const byRule = new Date(now.getTime() - days * DAY_MS);
  const floor = logFloorCutoff(now);
  return byRule < floor ? byRule : floor;
}

export function clampConsentRetention(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(MAX_RETENTION_DAYS, Math.max(CONSENT_RETENTION_MIN_DAYS, n)) : CONSENT_RETENTION_DEFAULT_DAYS;
}

export interface TaskPlanInput {
  periodDays: number;
  action: string;
  trigger: string;
  preNoticeHours: number | null;
  createdAt: string;
  /** When the previous run of this rule was signed off (null for the first run). */
  lastRunAt: string | null;
  /** Organisation setting: optional pre-erasure notice (off by default). */
  preNoticeEnabled: boolean;
}

export interface TaskPlan {
  dueAt: string;
  /** Erase records collected (or last used) before this time. */
  cutoffAt: string;
  preNoticeAt: string | null;
}

/** Next periodic erasure run of a rule, or null when the rule has no fixed period (until withdrawal). */
export function planErasureTask(p: TaskPlanInput): TaskPlan | null {
  if (p.periodDays <= 0 || p.trigger === "withdrawal") return null;
  const from = Date.parse(p.lastRunAt ?? p.createdAt);
  const due = new Date(from + ERASURE_CYCLE_DAYS * DAY_MS);
  const cutoff = new Date(due.getTime() - p.periodDays * DAY_MS);
  const hours = p.preNoticeEnabled ? (p.preNoticeHours ?? DEFAULT_PRE_NOTICE_HOURS) : null;
  return { dueAt: due.toISOString(), cutoffAt: cutoff.toISOString(), preNoticeAt: hours ? new Date(due.getTime() - hours * 3_600_000).toISOString() : null };
}

export type SignOffBlock = "log_floor" | "pre_notice_not_sent" | "pre_notice_wait";

/**
 * Why a task cannot be signed off as erased yet (E3-02, E2-02):
 * - logs: the cut-off must be at least one year back (Rule 8(3));
 * - with the optional pre-notice: it must have been sent, and its hours must have passed.
 */
export function signOffBlock(task: { is_logs: number; cutoff_at: string | null; pre_notice_at: string | null; pre_notice_sent_at: string | null; pre_notice_hours: number | null }, now: Date): SignOffBlock | null {
  if (task.is_logs && task.cutoff_at && Date.parse(task.cutoff_at) > logFloorCutoff(now).getTime()) return "log_floor";
  if (task.pre_notice_at) {
    if (!task.pre_notice_sent_at) return "pre_notice_not_sent";
    if (Date.parse(task.pre_notice_sent_at) + (task.pre_notice_hours ?? DEFAULT_PRE_NOTICE_HOURS) * 3_600_000 > now.getTime()) return "pre_notice_wait";
  }
  return null;
}

export type TaskReminderKind = "pre_notice" | "soon" | "overdue";

export function taskReminderDue(
  task: { status: string; due_at: string; pre_notice_at: string | null; pre_notice_sent_at: string | null; reminded_pre_notice_at: string | null; reminded_soon_at: string | null; reminded_overdue_at: string | null },
  now: Date,
): TaskReminderKind | null {
  if (task.status !== "open") return null;
  const t = now.getTime();
  if (task.pre_notice_at && !task.pre_notice_sent_at && !task.reminded_pre_notice_at && Date.parse(task.pre_notice_at) - DAY_MS <= t) return "pre_notice";
  if (Date.parse(task.due_at) < t) return task.reminded_overdue_at ? null : "overdue";
  if (Date.parse(task.due_at) - 7 * DAY_MS <= t) return task.reminded_soon_at || task.reminded_overdue_at ? null : "soon";
  return null;
}
