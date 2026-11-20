import "server-only";
import type { Lang } from "@/core/notice/templates";
import type { ContactInfo } from "@/core/rights/emails";
import { getDb } from "./db";
import type { Org } from "./db/schema";
import { tenantDb, type TenantDb } from "./db/tenant";
import { hostedLinks, type PageLinks } from "./privacy/hosted-pages";
import { getOrgBySlug } from "./privacy/orgs";
import { getContacts } from "./privacy/registers";
import { baseUrl } from "./request";

/**
 * Shared lookup for the public /p/{org}/… pages: the organisation by slug
 * (active only), a TenantDb bound to it, the page links and both Rule 9
 * contacts. The slug is the only cross-tenant lookup.
 */

export interface HostedContext {
  org: Org;
  t: TenantDb;
  base: string;
  links: PageLinks;
  contacts: { dpo: ContactInfo | null; grievance: ContactInfo | null };
}

export async function hostedContext(slug: string): Promise<HostedContext | null> {
  const db = await getDb();
  const org = await getOrgBySlug(db, slug);
  if (!org) return null;
  const t = tenantDb(db, org.id);
  const base = await baseUrl();
  const c = await getContacts(t);
  const view = (row: typeof c.dpo, role: ContactInfo["role"]): ContactInfo | null =>
    row ? { role, name: row.name, designation: row.designation, email: row.email, phone: row.phone, address: row.address } : null;
  return { org, t, base, links: hostedLinks(base, org.slug), contacts: { dpo: view(c.dpo, "dpo"), grievance: view(c.grievance, "grievance") } };
}

export const langParam = (value: unknown): Lang => (value === "hi" ? "hi" : "en");

export const notFoundResponse = () => new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
