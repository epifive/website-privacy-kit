import "server-only";
import type { TenantDb } from "../db/tenant";

/**
 * Monthly usage counters per organisation (P7): consent events recorded,
 * grants refused over the limit, and rights requests received. Periods are
 * calendar months in India Standard Time.
 */

/** Consent grants are still accepted up to 120% of the monthly limit (grace), then refused; withdrawals and refusals never are. */
export const EVENT_GRACE = 1.2;

const IST_MS = 330 * 60_000;

/** "YYYY-MM" of a moment in India Standard Time. */
export function usagePeriod(at: Date | string = new Date()): string {
  return new Date(new Date(at).getTime() + IST_MS).toISOString().slice(0, 7);
}

export interface UsageCounts {
  consentEvents: number;
  refusedEvents: number;
  rightsRequests: number;
  alertLevel: number;
}

export async function getUsage(t: TenantDb, period = usagePeriod()): Promise<UsageCounts> {
  const row = await t.selectFrom("usage_counters").selectAll().where("period", "=", period).executeTakeFirst();
  return { consentEvents: row?.consent_events ?? 0, refusedEvents: row?.refused_events ?? 0, rightsRequests: row?.rights_requests ?? 0, alertLevel: row?.alert_level ?? 0 };
}

type Counter = "consent_events" | "refused_events" | "rights_requests";

/** Add to this month's counters (insert the row on first use; safe under concurrency). */
export async function addUsage(t: TenantDb, counts: Partial<Record<Counter, number>>, period = usagePeriod()): Promise<void> {
  const entries = Object.entries(counts).filter(([, n]) => (n ?? 0) > 0) as Array<[Counter, number]>;
  if (!entries.length) return;
  const bump = async () => {
    let q = t.updateTable("usage_counters").where("period", "=", period);
    for (const [col, n] of entries) q = q.set((eb) => ({ [col]: eb(eb.ref(col), "+", n) }) as never);
    return Number((await q.executeTakeFirst()).numUpdatedRows);
  };
  if (await bump()) return;
  try {
    await t.insertInto("usage_counters", { period, consent_events: 0, refused_events: 0, rights_requests: 0, alert_level: 0, ...Object.fromEntries(entries) });
  } catch {
    // Another request created the row first.
    await bump();
  }
}

export type QuotaState = "ok" | "grace" | "blocked";

/** Consent-event quota: "grace" above the limit, "blocked" (grants refused) above limit × EVENT_GRACE. */
export function consentQuota(used: number, limit: number): QuotaState {
  if (limit <= 0 || used < limit) return "ok";
  return used < Math.ceil(limit * EVENT_GRACE) ? "grace" : "blocked";
}

