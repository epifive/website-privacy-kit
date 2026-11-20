import "server-only";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema";
import { tenantDb, type TenantDb } from "./db/tenant";
import { sendBreachReminders } from "./privacy/breaches";

/** Owner and admins of one organisation (active users only): the people who handle incidents and erasure. */
export async function orgManagerEmails(db: Kysely<Database>, t: TenantDb): Promise<string[]> {
  const org = await t.org();
  if (!org) return [];
  const members = await t.selectFrom("memberships").select(["user_id", "role"]).where("role", "in", ["owner", "admin"]).execute();
  const ids = [...new Set([org.owner_user_id, ...members.map((m) => m.user_id)])];
  const users = await db.selectFrom("users").select("email").where("id", "in", ids).where("status", "=", "active").execute();
  return users.map((u) => u.email);
}

/**
 * Breach timer reminders (plan M8; B2, B4): runs per organisation through its
 * own TenantDb; only that organisation's owner and admins are emailed.
 */
export async function runBreachReminders(db: Kysely<Database>, opts: { baseUrl: string; now?: Date }): Promise<{ orgs: number; sent: number }> {
  const orgIds = await db
    .selectFrom("breaches")
    .innerJoin("orgs", "orgs.id", "breaches.org_id")
    .select("breaches.org_id")
    .where("orgs.status", "=", "active")
    .where("breaches.status", "!=", "closed")
    .groupBy("breaches.org_id")
    .execute();
  let sent = 0;
  for (const { org_id } of orgIds) {
    const t = tenantDb(db, org_id);
    sent += await sendBreachReminders(t, { baseUrl: opts.baseUrl, now: opts.now, recipients: () => orgManagerEmails(db, t) });
  }
  return { orgs: orgIds.length, sent };
}
