import "server-only";
import type { Kysely } from "kysely";
import { orgManagerEmails } from "./breach-jobs";
import type { Database } from "./db/schema";
import { tenantDb } from "./db/tenant";
import { purgeSiteConsent, sendRetentionReminders, type SitePurgeResult } from "./privacy/retention";

/**
 * Daily retention job (plan M9; E1–E3): creates the next periodic erasure
 * task of every rule and emails the owner and admins about tasks that are due
 * soon, overdue, or need the optional pre-erasure notice. Per organisation,
 * through its own TenantDb.
 */
export async function runRetentionReminders(db: Kysely<Database>, opts: { baseUrl: string; now?: Date }): Promise<{ orgs: number; sent: number }> {
  const orgs = await db.selectFrom("orgs").select("id").where("status", "=", "active").execute();
  let sent = 0;
  for (const { id } of orgs) {
    const t = tenantDb(db, id);
    sent += await sendRetentionReminders(t, { baseUrl: opts.baseUrl, now: opts.now, recipients: () => orgManagerEmails(db, t) });
  }
  return { orgs: orgs.length, sent };
}

/**
 * Maintenance: purge consent records past their retention (never before one
 * year, Rule 8(3)) for every site of every organisation. Each purge writes an
 * insert-only checkpoint (tombstone) and an audit_log row in the organisation;
 * dry runs change nothing. Suspended organisations are included: retention
 * applies to them too.
 */
export async function runConsentPurge(db: Kysely<Database>, opts: { now?: Date; dryRun: boolean }): Promise<{ dryRun: boolean; sites: Array<SitePurgeResult & { orgId: number }>; purged: number }> {
  const sites = await db.selectFrom("sites").select(["id", "org_id"]).orderBy("org_id").orderBy("id").execute();
  const results: Array<SitePurgeResult & { orgId: number }> = [];
  for (const s of sites) {
    const t = tenantDb(db, s.org_id);
    const site = await t.selectFrom("sites").selectAll().where("id", "=", s.id).executeTakeFirst();
    if (!site) continue;
    const r = await purgeSiteConsent(t, site, { now: opts.now, dryRun: opts.dryRun, reason: "retention" });
    if (r.status !== "nothing") results.push({ ...r, orgId: s.org_id });
  }
  return { dryRun: opts.dryRun, sites: results, purged: results.filter((r) => r.status === "purged").reduce((n, r) => n + r.count, 0) };
}
