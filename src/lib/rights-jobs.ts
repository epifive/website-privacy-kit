import "server-only";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema";
import { tenantDb } from "./db/tenant";
import { sendDueReminders } from "./privacy/rights";

/**
 * Daily job: internal reminders for rights requests at T−7, T−1 and when
 * overdue (R3-03; Rule 14(3) "measures to meet the period"). Runs per
 * organisation through its own TenantDb; recipients are the organisation's
 * owner and the request's assignee. Trigger it once or twice a day with
 * POST /api/v1/cron/rights-reminders (Authorization: Bearer $CRON_SECRET).
 */
export async function runRightsReminders(db: Kysely<Database>, opts: { baseUrl: string; now?: Date }): Promise<{ orgs: number; sent: number }> {
  const now = opts.now ?? new Date();
  const horizon = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const orgIds = await db
    .selectFrom("rights_requests")
    .innerJoin("orgs", "orgs.id", "rights_requests.org_id")
    .select("rights_requests.org_id")
    .where("orgs.status", "=", "active")
    .where("rights_requests.status", "in", ["new", "in_progress", "waiting"])
    .where("rights_requests.due_at", "<=", horizon)
    .groupBy("rights_requests.org_id")
    .execute();
  let sent = 0;
  for (const { org_id } of orgIds) {
    const t = tenantDb(db, org_id);
    const org = await t.org();
    if (!org) continue;
    const emailOf = async (userId: number) => (await db.selectFrom("users").select("email").where("id", "=", userId).where("status", "=", "active").executeTakeFirst())?.email;
    const owner = await emailOf(org.owner_user_id);
    sent += await sendDueReminders(t, {
      baseUrl: opts.baseUrl,
      now,
      recipients: async (assignee) => {
        const list = [owner];
        // Only current members of this organisation can be reminded.
        if (assignee && (await t.selectFrom("memberships").select("user_id").where("user_id", "=", assignee).executeTakeFirst())) list.push(await emailOf(assignee));
        return list.filter((e): e is string => Boolean(e));
      },
    });
  }
  return { orgs: orgIds.length, sent };
}
