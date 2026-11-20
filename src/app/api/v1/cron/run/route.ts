import { cleanupExpiredSessions } from "@/lib/auth/session";
import { runBreachReminders } from "@/lib/breach-jobs";
import { runChainDigest } from "@/lib/chain-digest";
import { bearerAuthorized, notFoundJson } from "@/lib/cron-auth";
import { getDb } from "@/lib/db";
import { baseUrl } from "@/lib/request";
import { runRetentionReminders } from "@/lib/retention-jobs";
import { runRightsReminders } from "@/lib/rights-jobs";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/cron/run — every scheduled job in one call, for one VPS crontab
 * line (scripts/cron.md). Every 15 minutes, because the CERT-In breach window
 * is 6 hours; each job sends every reminder only once, so running them often
 * is safe. A failing job does not stop the others; the response lists each.
 *   *\/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://privacy.example.com/api/v1/cron/run
 * Data-deleting jobs (consent purge, log purge) are NOT here: they use
 * WPK_MAINTENANCE_SECRET and /api/v1/maintenance/*.
 */
export async function POST(request: Request) {
  if (!bearerAuthorized(request, "CRON_SECRET")) return notFoundJson();
  const [db, base, settings] = await Promise.all([getDb(), baseUrl(), getSettings()]);
  const jobs: Record<string, () => Promise<unknown>> = {
    breachTimers: () => runBreachReminders(db, { baseUrl: base }),
    rightsReminders: () => runRightsReminders(db, { baseUrl: base }),
    retentionReminders: () => runRetentionReminders(db, { baseUrl: base }),
    chainDigest: () => runChainDigest(db, { baseUrl: base, settings }),
    expiredSessions: async () => ({ deleted: await cleanupExpiredSessions() }),
  };
  const results: Record<string, unknown> = {};
  let failed = 0;
  for (const [name, job] of Object.entries(jobs)) {
    const started = Date.now();
    try {
      results[name] = { ok: true, ms: Date.now() - started, ...(await job()) as object };
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron] ${name} failed:`, message);
      results[name] = { ok: false, error: message.slice(0, 200) };
    }
  }
  return Response.json({ ok: failed === 0, at: new Date().toISOString(), results }, { status: failed ? 500 : 200, headers: { "Cache-Control": "no-store" } });
}
