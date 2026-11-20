import { bearerAuthorized, notFoundJson } from "@/lib/cron-auth";
import { getDb } from "@/lib/db";
import { baseUrl } from "@/lib/request";
import { runRetentionReminders } from "@/lib/retention-jobs";

/**
 * POST /api/v1/cron/retention-reminders — periodic erasure tasks and their
 * reminders (due soon, overdue, optional pre-erasure notice). Once a day:
 *   30 8 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://privacy.example.com/api/v1/cron/retention-reminders
 */
export async function POST(request: Request) {
  if (!bearerAuthorized(request, "CRON_SECRET")) return notFoundJson();
  const result = await runRetentionReminders(await getDb(), { baseUrl: await baseUrl() });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
