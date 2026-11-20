import { bearerAuthorized, notFoundJson } from "@/lib/cron-auth";
import { getMaintenanceDb } from "@/lib/db";
import { purgeOldLogs } from "@/lib/log-retention";

/**
 * POST /api/v1/maintenance/log-purge — delete platform logs older than
 * WPK_LOG_RETENTION_DAYS (default 400, never under 365; Rule 6(1)(e), 8(3)).
 * WPK_MAINTENANCE_SECRET; dry run unless ?apply=1. Weekly is enough:
 *   30 3 * * 0 curl -fsS -X POST -H "Authorization: Bearer $WPK_MAINTENANCE_SECRET" "https://privacy.example.com/api/v1/maintenance/log-purge?apply=1"
 */
export async function POST(request: Request) {
  if (!bearerAuthorized(request, "WPK_MAINTENANCE_SECRET")) return notFoundJson();
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  const result = await purgeOldLogs(await getMaintenanceDb(), { dryRun: !apply });
  console.info(`[maintenance] log purge ${apply ? "applied" : "dry run"} before ${result.cutoff}: ${result.securityEvents} security events, ${result.mailLog} mail log rows`);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
