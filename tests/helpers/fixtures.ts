import type { Kysely } from "kysely";
import type { NoticeInput } from "@/core/notice/render";
import type { Database } from "@/lib/db/schema";
import { tenantDb, type TenantDb } from "@/lib/db/tenant";
import { createOrg, updateOrgProfile } from "@/lib/privacy/orgs";
import { upsertContact } from "@/lib/privacy/registers";
import { applyPreset } from "@/lib/privacy/setup";

export const BASE_URL = "https://privacy.example.com";

export async function createUser(db: Kysely<Database>, email: string): Promise<number> {
  const ts = new Date().toISOString();
  const r = await db
    .insertInto("users")
    .values({ name: email.split("@")[0], email, password_hash: "x", role: "user", status: "active", created_at: ts, updated_at: ts })
    .executeTakeFirstOrThrow();
  return Number(r.insertId);
}

/** An organisation with a sector preset, contacts and profile: ready to publish. */
export async function createReadyOrg(db: Kysely<Database>, email: string, name: string, sector = "clinic"): Promise<{ userId: number; orgId: number; t: TenantDb }> {
  const userId = await createUser(db, email);
  const org = await createOrg(db, userId, { name, sector });
  const t = tenantDb(db, org.id);
  await updateOrgProfile(t, { legal_name: `${name} Pvt Ltd`, website_url: "https://clinic.example.in" });
  await applyPreset(t, org.sector as "clinic");
  await upsertContact(t, "grievance", { name: "Grievance Officer", designation: "Manager", email: "privacy@clinic.example.in", phone: "+91 98765 43210", address: "12 MG Road, Pune 411001" });
  return { userId, orgId: org.id, t };
}

/** A minimal valid renderer input, for pure renderer tests. */
export function sampleInput(overrides: Partial<NoticeInput> = {}): NoticeInput {
  return {
    org: {
      name: "Sharma Physio <Clinic> *Best*",
      legalName: "Sharma Physio Clinic LLP",
      slug: "sharma-physio",
      goodsServices: { en: "Physiotherapy and rehabilitation.", hi: "फ़िज़ियोथेरेपी और पुनर्वास।" },
      websiteUrl: "https://sharmaphysio.in",
    },
    links: {
      notice: `${BASE_URL}/p/sharma-physio/notice`,
      withdraw: `${BASE_URL}/p/sharma-physio/withdraw`,
      rights: `${BASE_URL}/p/sharma-physio/rights`,
    },
    contacts: {
      grievance: { name: "Anita Sharma", designation: "Owner", email: "anita@sharmaphysio.in", phone: "+91 98765 43210", address: "Pune" },
      dpo: null,
    },
    purposes: [
      {
        key: "appointments",
        name: { en: "Book appointments", hi: "अपॉइंटमेंट बुक करना" },
        description: { en: "Confirm and remind you about appointments.", hi: "अपॉइंटमेंट की पुष्टि और याद दिलाना।" },
        basis: "s7a_voluntary",
        items: [{ key: "name" }, { key: "mobile" }, { key: "appointment" }],
        vendors: [{ name: "SMS gateway", service: "SMS reminders", location: "india" }],
        retentionDays: 365,
        retentionLawRef: "Business choice",
      },
      {
        key: "offers",
        name: { en: "WhatsApp offers", hi: "WhatsApp ऑफ़र" },
        description: { en: "Send offers on WhatsApp.", hi: "WhatsApp पर ऑफ़र भेजना।" },
        basis: "consent",
        items: [{ key: "whatsapp" }, { en: "Preferred clinic branch", hi: "पसंदीदा क्लिनिक शाखा" }],
        vendors: [],
        retentionDays: 0,
      },
    ],
    rights: { responseDays: 30, identifiers: ["mobile", "customer_id"] },
    childrenMode: false,
    version: 1,
    publishedAt: "2026-11-19T10:00:00.000Z",
    ...overrides,
  };
}
