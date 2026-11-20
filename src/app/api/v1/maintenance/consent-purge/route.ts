import { bearerAuthorized, notFoundJson } from "@/lib/cron-auth";
import { getMaintenanceDb } from "@/lib/db";
import { runConsentPurge } from "@/lib/retention-jobs";

/**
 * POST /api/v1/maintenance/consent-purge — consent-record retention purge.
 *
 * Separate from the reminder jobs and protected by its own secret
 * (WPK_MAINTENANCE_SECRET, never the CRON_SECRET). Dry run by default; pass
 * ?apply=1 to delete. Only records older than the organisation's consent
 * retention and at least one year (Rule 8(3)) are purged; every purge leaves
 * an insert-only checkpoint (tombstone) and an audit_log row, and the hash
 * chain still verifies from the checkpoint. The database itself refuses any
 * other delete (see migration 000007).
 *   15 3 * * 0 curl -s -X POST -H "Authorization: Bearer $WPK_MAINTENANCE_SECRET" "https://privacy.example.com/api/v1/maintenance/consent-purge?apply=1"
 */
export async function POST(request: Request) {
  if (!bearerAuthorized(request, "WPK_MAINTENANCE_SECRET")) return notFoundJson();
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  const result = await runConsentPurge(await getMaintenanceDb(), { dryRun: !apply });
  console.info(`[maintenance] consent purge ${apply ? "applied" : "dry run"}: ${result.purged} record(s) across ${result.sites.length} site(s)`);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
