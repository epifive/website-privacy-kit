import { runBreachReminders } from "@/lib/breach-jobs";
import { bearerAuthorized, notFoundJson } from "@/lib/cron-auth";
import { getDb } from "@/lib/db";
import { baseUrl } from "@/lib/request";

/**
 * POST /api/v1/cron/breach-timers — internal reminders for open breach
 * incidents (CERT-In 6 h, Board "without delay" and 72 h, affected people).
 * The 6-hour window needs a frequent run, e.g. every 15 minutes:
 *   0,15,30,45 * * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://privacy.example.com/api/v1/cron/breach-timers
 */
export async function POST(request: Request) {
  if (!bearerAuthorized(request, "CRON_SECRET")) return notFoundJson();
  const result = await runBreachReminders(await getDb(), { baseUrl: await baseUrl() });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
