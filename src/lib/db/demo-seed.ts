import "server-only";
import type { Kysely } from "kysely";
import { computeDueAt, newReference } from "@/core/rights/model";
import { createBreach, addEvidenceNote, markStep, setBreachStatus, toggleChecklist } from "../privacy/breaches";
import { recordConsent } from "../privacy/consent";
import { publishNotice } from "../privacy/notices";
import { createRequestErasureTasks, ensureRuleTasks } from "../privacy/retention";
import { encryptForOrg, identifierHmac } from "../secrets";
import { createOrg, updateOrgProfile } from "../privacy/orgs";
import { createSite, createVendor, getSite, listPurposes, upsertContact } from "../privacy/registers";
import { applyPreset } from "../privacy/setup";
import type { Database, RightsRequestType, Site } from "./schema";
import { tenantDb, type TenantDb } from "./tenant";

/**
 * Demo data (DEMO_SEED=true): one clinic organisation owned by the administrator, with one website,
 * a published EN + HI notice, rights requests, a breach and 45 days of consent history.
 * Runs only once per database. Fake data only.
 */

const DAY = 86_400_000;

export async function seedDemoData(db: Kysely<Database>): Promise<void> {
  // Sample data is seeded once an administrator exists (ADMIN_EMAIL/ADMIN_PASSWORD or the installer).
  const hasAdmin = await db.selectFrom("users").select("id").where("role", "=", "admin").executeTakeFirst();
  if (!hasAdmin) return;
  // The settings row doubles as a lock: only the instance that inserts it seeds.
  try {
    await db.insertInto("settings").values({ key: "demo_seeded_at", value: new Date().toISOString() }).execute();
  } catch {
    return;
  }
  await seedDemoOrganisation(db);
}

/**
 * A demo clinic owned by the administrator: clinic preset, contacts, a website,
 * a signed vendor contract and a published v1 notice. Fake data only.
 */
async function seedDemoOrganisation(db: Kysely<Database>): Promise<void> {
  const admin = await db.selectFrom("users").select("id").where("role", "=", "admin").orderBy("id").executeTakeFirst();
  if (!admin) return;
  const org = await createOrg(db, admin.id, { name: "Sharma Physio Clinic", sector: "clinic" });
  const t = tenantDb(db, org.id);
  await updateOrgProfile(t, {
    legal_name: "Sharma Physio Clinic LLP",
    website_url: "https://sharmaphysio.example.in",
    goods_services_en: "Physiotherapy, sports injury rehabilitation and home visits in Pune.",
    goods_services_hi: "पुणे में फ़िज़ियोथेरेपी, खेल चोटों का पुनर्वास और घर पर विज़िट।",
  });
  await applyPreset(t, "clinic");
  await upsertContact(t, "grievance", {
    name: "Anita Sharma",
    designation: "Clinic Manager",
    email: "privacy@sharmaphysio.example.in",
    phone: "+91 20 4000 1234",
    address: "12 MG Road, Camp, Pune 411001",
  });
  await createVendor(t, {
    name: "Clinic management software",
    service: "Patient records and billing",
    dataShared: ["name", "mobile", "health_history"],
    location: "india",
    contractStatus: "signed",
    contractDate: "2026-10-01",
    securityClause: true,
    reviewAt: "2027-10-01",
    erasureContact: "support@clinicsoft.example.in",
  });
  const siteId = await createSite(t, { name: "Clinic website", domain: "sharmaphysio.example.in", allowedOrigins: [], childrenMode: true });
  await publishNotice(t, { baseUrl: await demoBaseUrl(db), userId: admin.id });
  await seedDemoRequests(t, admin.id, CLINIC_REQUESTS, "patient");
  await seedDemoBreach(t, admin.id);
  const site = await getSite(t, siteId);
  if (site) await seedConsentHistory(t, site, { days: 45, min: 4, max: 12, seed: 7, formPurpose: "marketing_whatsapp", pages: ["/", "/book-appointment", "/services/sports-injury", "/contact"] });
}

const demoBaseUrl = async (db: Kysely<Database>) => (await db.selectFrom("settings").select("value").where("key", "=", "site_url").executeTakeFirst())?.value || process.env.SITE_URL || "http://localhost:3000";

interface DemoRequest {
  type: RightsRequestType;
  status: "new" | "in_progress" | "waiting" | "closed";
  daysAgo: number;
  details: string;
  outcome: string | null;
}

const CLINIC_REQUESTS: DemoRequest[] = [
  { type: "access", status: "new", daysAgo: 3, details: "Please send me a summary of the personal data you hold about me.", outcome: null },
  { type: "erasure", status: "in_progress", daysAgo: 12, details: "I no longer visit the clinic. Please delete my WhatsApp number and appointment history.", outcome: null },
  { type: "correction", status: "waiting", daysAgo: 26, details: "My mobile number is wrong in your records; the correct one ends in 4410.", outcome: null },
  { type: "grievance", status: "closed", daysAgo: 45, details: "I received offers on WhatsApp after I withdrew consent.", outcome: "resolved" },
];

/** Pseudo-random but repeatable (the demo looks the same after every reset). */
function rng(seed: number) {
  let x = seed;
  return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
}

const UAS = [
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
];

/**
 * Consent history for a demo website: visitors over the past weeks who accept, reject or choose
 * purposes on the banner (a quarter in Hindi), some sign-ups through the form helper and some
 * later withdrawals, recorded through recordConsent, so the hash chain, the consent state and the
 * usage meter are exactly what real traffic produces.
 */
async function seedConsentHistory(t: TenantDb, site: Site, opts: { days: number; min: number; max: number; seed: number; formPurpose: string; pages: string[] }): Promise<void> {
  const rand = rng(opts.seed);
  const keys = (await listPurposes(t)).filter((p) => p.active === 1 && p.basis === "consent" && (p.site_id === null || p.site_id === site.id)).map((p) => p.purpose_key);
  if (!keys.length) return;
  const now = Date.now();
  const visits: number[] = [];
  for (let d = opts.days; d >= 1; d--) {
    const n = opts.min + Math.floor(rand() * (opts.max - opts.min + 1));
    for (let i = 0; i < n; i++) visits.push(now - d * DAY + Math.floor(rand() * (DAY - 120_000)));
  }
  visits.sort((a, b) => a - b);
  const granted: string[] = [];
  let formCount = 0;
  for (const at of visits) {
    const r = rand();
    const lang = rand() < 0.25 ? ("hi" as const) : ("en" as const);
    const common = { lang, noticeVersion: 1, at: new Date(at), ip: `203.0.113.${1 + Math.floor(rand() * 250)}`, userAgent: UAS[Math.floor(rand() * UAS.length)], widgetVersion: "1.0.0" };
    if (granted.length > 5 && r < 0.05) {
      // A returning visitor withdraws everything from the floating "Privacy choices" button.
      const subjectRef = granted.splice(Math.floor(rand() * granted.length), 1)[0];
      await recordConsent(t, site, { ...common, subjectRef, choices: Object.fromEntries(keys.map((k) => [k, false])), channel: "banner", pageUrl: `https://${site.domain}/` });
      continue;
    }
    if (r < 0.12 && keys.includes(opts.formPurpose)) {
      formCount += 1;
      await recordConsent(t, site, { ...common, subject: { kind: "email", value: `demo.subscriber${formCount}@example.in` }, choices: { [opts.formPurpose]: true }, channel: "form", pageUrl: `https://${site.domain}/contact` });
      continue;
    }
    const subjectRef = Array.from({ length: 22 }, () => "abcdefghijkmnopqrstuvwxyz23456789"[Math.floor(rand() * 33)]).join("");
    const kind = rand();
    const choices = Object.fromEntries(keys.map((k) => [k, kind < 0.56 ? true : kind < 0.86 ? false : rand() < 0.5]));
    const page = opts.pages[Math.floor(rand() * opts.pages.length)];
    const result = await recordConsent(t, site, { ...common, subjectRef, choices, channel: "banner", pageUrl: `https://${site.domain}${page}` });
    if (result.ok && Object.values(choices).some(Boolean)) granted.push(subjectRef);
  }
}

/**
 * Sample rights requests (one per stage), so the demo inbox and retention tasks are not empty.
 * Fake people only ("Sample patient 1", sample.patient1@example.in); stored encrypted like real
 * requests. No email is sent.
 */
async function seedDemoRequests(t: TenantDb, adminId: number, samples: DemoRequest[], who: "patient"): Promise<void> {
  const org = await t.org();
  if (!org) return;
  const now = Date.now();
  let erasureId = 0;
  for (const [i, r] of samples.entries()) {
    const received = new Date(now - r.daysAgo * DAY).toISOString();
    const email = `sample.${who}${i + 1}@example.in`;
    const name = `Sample ${who} ${i + 1}`;
    const id = await t.insertInto("rights_requests", {
      ref: newReference(),
      type: r.type,
      status: r.status,
      outcome: r.outcome,
      lang: i % 2 ? "hi" : "en",
      requester_name_enc: encryptForOrg(t.orgId, name),
      email_enc: encryptForOrg(t.orgId, email),
      email_hmac: identifierHmac(t.orgId, "email", email),
      payload_enc: encryptForOrg(t.orgId, JSON.stringify({ details: r.details, identifiers: { mobile: `98765 0000${i}` } })),
      otp_hash: null,
      otp_expires_at: null,
      otp_attempts: 0,
      otp_sends: 1,
      otp_last_sent_at: received,
      verified_at: new Date(Date.parse(received) + 600_000).toISOString(),
      received_at: received,
      due_at: computeDueAt(received, org.response_days),
      target_at: null,
      closed_at: r.status === "closed" ? new Date(Date.parse(received) + 9 * DAY).toISOString() : null,
      assignee_user_id: r.status === "new" ? null : adminId,
      legal_hold_reason: "",
      reminded_t7_at: null,
      reminded_t1_at: null,
      reminded_overdue_at: null,
      ip_trunc: "203.0.113.0/24",
      created_at: received,
      updated_at: received,
    });
    await t.insertInto("request_events", { request_id: id, kind: "submitted", meta: r.type, body_enc: null, by_user_id: null, created_at: received });
    await t.insertInto("request_events", { request_id: id, kind: "verified", meta: "", body_enc: null, by_user_id: null, created_at: new Date(Date.parse(received) + 600_000).toISOString() });
    if (r.type === "erasure") erasureId = id;
  }
  if (erasureId) await createRequestErasureTasks(t, erasureId, adminId);
  await ensureRuleTasks(t);
}

/** One breach incident (clinic): contained, Board and patients told, detailed report due soon. */
async function seedDemoBreach(t: TenantDb, adminId: number): Promise<void> {
  const now = Date.now();

  // One breach: contained, Board and patients told, detailed Board report due within a day.
  const aware = new Date(now - 50 * 3_600_000).toISOString();
  const b = await createBreach(
    t,
    {
      title: "Appointment reminders sent to the wrong patient list",
      noticedAt: new Date(Date.parse(aware) - 30 * 60_000).toISOString(),
      awareAt: aware,
      affectedCount: 38,
      certinApplicable: false,
      details: {
        nature: "An SMS reminder batch used last month's export, so 38 patients received another patient's appointment time and first name",
        extent: "38 patients; names and appointment times only",
        occurredWindow: "on the morning of the incident, between 08:00 and 08:20",
        location: "SMS gateway account (India)",
        categories: ["First name", "Appointment date and time"],
        affectedSystems: "Clinic software export, SMS gateway",
        likelyImpact: "Low: no health details or contact numbers were shared",
        consequences: ["Someone else may know the time of your appointment"],
        measuresTaken: ["Stopped the reminder batch", "Asked the SMS gateway to purge the batch"],
        measuresPlanned: ["Two-person check before each batch"],
        safetySteps: ["No action is needed; contact us if you receive a message that is not yours"],
        rootCause: "A stale export file was selected",
        findingsPerson: "Staff error; no malicious intent found",
        remediation: ["Automatic export date check — front-desk lead — this week"],
        signatoryTitle: "Clinic Manager",
        dpChannels: "SMS and phone call",
      },
    },
    adminId,
    new Date(now),
  );
  if (b.ok) {
    await markStep(t, b.id, "board_initial", new Date(Date.parse(aware) + 3 * 3_600_000).toISOString(), adminId, "Emailed to the Board's published address");
    await markStep(t, b.id, "dp_intimation", new Date(Date.parse(aware) + 5 * 3_600_000).toISOString(), adminId, "SMS + calls by the front desk");
    for (const key of ["contain", "preserve_logs", "assess", "certin_check", "recipients"] as const) await toggleChecklist(t, b.id, key, true, adminId);
    await addEvidenceNote(t, b.id, "SMS gateway delivery report exported and saved to the incident folder.", adminId);
    await setBreachStatus(t, b.id, "contained", adminId);
  }
}
