import "server-only";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema";
import { tenantDb, type TenantDb } from "./db/tenant";
import { getUsage, usagePeriod } from "./privacy/usage";

export { addUsage, getUsage, usagePeriod } from "./privacy/usage";

/**
 * Edition limits. The Free edition (this repository, MIT) runs one organisation
 * with one website and one user, with unlimited consent events. Nothing is
 * metered and nothing is ever deleted when a limit is reached: you just cannot
 * add more. The Pro edition (https://www.epifive.com/products/website-privacy-kit-pro)
 * lifts these limits and adds multi-organisation, white-label, the full children
 * flow, the evidence pack, API and webhooks and sector template packs.
 */

import type { Edition } from "./edition-meta";

export { EDITION, PRO_URL, SOURCE_URL, type Edition } from "./edition-meta";

export interface Entitlements {
  edition: Edition;
  /** Limits; 0 means unlimited. */
  maxSites: number;
  maxOrgs: number;
  maxUsers: number;
  maxMonthlyEvents: number;
  /** White-label: hide or replace the small EpiFive link on banners and privacy pages (Pro). */
  removeBranding: boolean;
}

export const FREE_LIMITS: Entitlements = { edition: "free", maxSites: 1, maxOrgs: 1, maxUsers: 1, maxMonthlyEvents: 0, removeBranding: false };

/** The limits of this installation (the same for everyone in it). */
export function editionLimits(): Entitlements {
  return FREE_LIMITS;
}

/** True when `used` has reached a limit (0 = unlimited). */
export function atLimit(used: number, limit: number): boolean {
  return limit > 0 && used >= limit;
}

export async function activeSiteCount(t: TenantDb): Promise<number> {
  const row = await t.selectFrom("sites").select((eb) => eb.fn.countAll<number>().as("n")).where("archived_at", "is", null).executeTakeFirst();
  return Number(row?.n ?? 0);
}

export async function memberCount(t: TenantDb): Promise<number> {
  const row = await t.selectFrom("memberships").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst();
  return Number(row?.n ?? 0);
}

/** Active organisations owned by a user (the Free edition allows one). */
export async function ownedOrgCount(db: Kysely<Database>, userId: number): Promise<number> {
  const row = await db.selectFrom("orgs").select((eb) => eb.fn.countAll<number>().as("n")).where("owner_user_id", "=", userId).where("status", "=", "active").executeTakeFirst();
  return Number(row?.n ?? 0);
}

/** Users in this installation (the Free edition allows one). */
export async function userCount(db: Kysely<Database>): Promise<number> {
  const row = await db.selectFrom("users").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst();
  return Number(row?.n ?? 0);
}

export interface UsageMeter {
  entitlements: Entitlements;
  period: string;
  sites: { used: number; limit: number };
  members: { used: number; limit: number };
  events: { used: number };
  rightsRequests: number;
  orgs: { used: number; limit: number };
}

export async function usageMeter(db: Kysely<Database>, orgId: number): Promise<UsageMeter> {
  const t = tenantDb(db, orgId);
  const entitlements = editionLimits();
  const org = await t.org();
  const [usage, sites, members, orgs] = await Promise.all([getUsage(t), activeSiteCount(t), memberCount(t), org ? ownedOrgCount(db, org.owner_user_id) : 0]);
  return {
    entitlements,
    period: usagePeriod(),
    sites: { used: sites, limit: entitlements.maxSites },
    members: { used: members, limit: entitlements.maxUsers },
    events: { used: usage.consentEvents },
    rightsRequests: usage.rightsRequests,
    orgs: { used: orgs, limit: entitlements.maxOrgs },
  };
}
