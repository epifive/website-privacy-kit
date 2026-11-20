import "server-only";
import { getDb } from "./db";
import { tenantDb } from "./db/tenant";
import { mailConfigured } from "./mail";
import { sendLoggedMail } from "./privacy/mailer";
import { getSettings } from "./settings";
import { withdrawListeners, type WithdrawnEvent } from "./privacy/consent";

/**
 * Default `consent.withdrawn` handler (plan M5; C2-02): tells the organisation
 * owner by email when an identified person (form, signed link, hosted page)
 * withdraws, so the business can stop processing and tell its processors
 * (s.6(6)). Anonymous banner withdrawals only take effect in that browser and
 * are visible in the consent log. Webhooks arrive with S4 (Business plan).
 */

async function emailOwner(event: WithdrawnEvent): Promise<void> {
  if (event.subjectKind === "browser") return;
  const settings = await getSettings();
  if (!mailConfigured(settings)) return;
  const db = await getDb();
  const org = await db.selectFrom("orgs").select(["name", "owner_user_id"]).where("id", "=", event.orgId).executeTakeFirst();
  const owner = org ? await db.selectFrom("users").select("email").where("id", "=", org.owner_user_id).executeTakeFirst() : undefined;
  if (!org || !owner) return;
  await sendLoggedMail(tenantDb(db, event.orgId), {
    kind: "consent.withdrawn",
    to: owner.email,
    subject: `Consent withdrawn — ${org.name}`,
    text: [
      `A person withdrew consent for: ${event.purposes.join(", ")}.`,
      `Record: ${event.subjectRef} (${event.subjectKind}, via ${event.channel}). Look it up in Dashboard → Websites → Consent log.`,
      "Stop using their data for these purposes within a reasonable time and ask your service providers to stop too (DPDP Act s.6(6)).",
      "Not legal advice.",
    ].join("\n\n"),
  });
}

withdrawListeners.set("email-owner", emailOwner);

export {};
