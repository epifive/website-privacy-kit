import "server-only";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema";
import { tenantDb } from "./db/tenant";
import { sendLoggedMail } from "./privacy/mailer";
import { getSettings, type Settings } from "./settings";

/**
 * Daily chain-head digest (plan §7.4 "Integrity"): once per IST day, after 07:00, the owner of each
 * organisation with new consent records gets an email listing every website's chain head (last
 * sequence number and its SHA-256). The email sits outside our database, so a later change to any
 * record — even by someone with database access — no longer matches a head the owner already holds.
 * Runs from /api/v1/cron/run (every 15 minutes; it sends at most once a day per organisation).
 */

const IST_MS = 330 * 60_000;
const istDate = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const istHour = (d: Date) => new Date(d.getTime() + IST_MS).getUTCHours();
export const DIGEST_HOUR_IST = 7;

export interface DigestRun {
  sent: number;
  skipped: number;
}

export async function runChainDigest(db: Kysely<Database>, opts: { baseUrl: string; now?: Date; settings?: Settings; force?: boolean }): Promise<DigestRun> {
  const settings = opts.settings ?? (await getSettings());
  const now = opts.now ?? new Date();
  const run: DigestRun = { sent: 0, skipped: 0 };
  if (!settings.chain_digest_enabled) return run;
  if (!opts.force && istHour(now) < DIGEST_HOUR_IST) return run;
  const today = istDate(now);
  const orgs = await db.selectFrom("orgs").innerJoin("users", "users.id", "orgs.owner_user_id").select(["orgs.id", "orgs.name", "orgs.chain_digest_at", "users.email"]).where("orgs.status", "=", "active").execute();
  for (const org of orgs) {
    if (org.chain_digest_at && istDate(new Date(org.chain_digest_at)) === today) continue;
    const t = tenantDb(db, org.id);
    const since = org.chain_digest_at ?? "";
    const heads = await t
      .selectFrom("consent_chain_heads")
      .innerJoin("sites", "sites.id", "consent_chain_heads.site_id")
      .select(["sites.id as site_id", "sites.name", "sites.domain", "consent_chain_heads.seq", "consent_chain_heads.hash", "consent_chain_heads.updated_at"])
      .orderBy("sites.id")
      .execute();
    // Only when something changed since the last digest (or never sent and there are records).
    const changed = heads.filter((h) => h.updated_at > since);
    await t.updateOrg({ chain_digest_at: now.toISOString() });
    if (!changed.length) {
      run.skipped += 1;
      continue;
    }
    const lines = heads.map((h) => `• ${h.name} (${h.domain}): record #${h.seq}, SHA-256 ${h.hash}${h.updated_at > since ? "" : " (no new records)"}`);
    const result = await sendLoggedMail(t, {
      kind: "chain.digest",
      to: org.email,
      subject: `Consent records digest — ${org.name} — ${today}`,
      text: [
        `Chain heads of your consent records on ${today} (IST):`,
        lines.join("\n"),
        "Keep this email. Every consent record is chained to the one before it; if any record were changed or removed later, the chain in your dashboard would no longer end at these values. Check it any time in Dashboard → Websites → Consent log → Verify, and in the evidence pack.",
        `${opts.baseUrl}/dashboard/sites`,
        "You get this email once a day when new records were added. Not legal advice.",
      ].join("\n\n"),
    });
    if (result.ok) run.sent += 1;
    else run.skipped += 1;
  }
  return run;
}
