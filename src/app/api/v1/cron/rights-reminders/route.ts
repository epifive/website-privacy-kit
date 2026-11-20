import { bearerAuthorized, notFoundJson } from "@/lib/cron-auth";
import { getDb } from "@/lib/db";
import { baseUrl } from "@/lib/request";
import { runRightsReminders } from "@/lib/rights-jobs";

/**
 * POST /api/v1/cron/rights-reminders — internal T−7 / T−1 / overdue reminders.
 * Needs CRON_SECRET in the environment and `Authorization: Bearer <secret>`.
 * Example crontab (twice a day):
 *   0 9,15 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://privacy.example.com/api/v1/cron/rights-reminders
 */
export async function POST(request: Request) {
  if (!bearerAuthorized(request, "CRON_SECRET")) return notFoundJson();
  const result = await runRightsReminders(await getDb(), { baseUrl: await baseUrl() });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
