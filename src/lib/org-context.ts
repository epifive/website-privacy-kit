import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DEMO_MESSAGE } from "./admin";
import { getCurrentUser, type SessionUser } from "./auth/session";
import { isDemoMode } from "./config";
import { requireDashboardUser } from "./dashboard";
import { getDb } from "./db";
import type { Org, OrgRole } from "./db/schema";
import { idParam, tenantDb, type TenantDb } from "./db/tenant";
import type { MessageKey } from "./i18n/messages";
import { getT } from "./i18n/server";
import { atLimit, editionLimits, ownedOrgCount, usageMeter, type Entitlements, type UsageMeter } from "./edition";
import { createOrg, getMembershipRole, listUserOrgs, type OrgSummary } from "./privacy/orgs";
import { baseUrl } from "./request";

/** Cookie remembering the organisation the user last worked on (validated on every request). */
export const ORG_COOKIE = "wpk_org";

export async function getTenant(orgId: number): Promise<TenantDb> {
  return tenantDb(await getDb(), orgId);
}

export interface OrgContext {
  user: SessionUser;
  orgs: OrgSummary[];
  current: OrgSummary | null;
}

/** The signed-in user's organisations and the one they are working on. Deduplicated per request. */
export const loadOrgContext = cache(async (): Promise<OrgContext> => {
  const user = await requireDashboardUser();
  const db = await getDb();
  const [orgs, jar] = await Promise.all([listUserOrgs(db, user.id), cookies()]);
  const wanted = idParam(jar.get(ORG_COOKIE)?.value);
  const current = orgs.find((o) => o.id === wanted) ?? orgs[0] ?? null;
  return { user, orgs, current };
});

export interface OrgPage {
  user: SessionUser;
  org: Org;
  role: OrgRole;
  canWrite: boolean;
  t: TenantDb;
  orgs: OrgSummary[];
}

/** For organisation pages: redirects to onboarding when the user has no organisation yet. */
export async function requireOrg(): Promise<OrgPage> {
  const ctx = await loadOrgContext();
  if (!ctx.current) redirect("/dashboard/orgs/new");
  const t = await getTenant(ctx.current.id);
  const org = await t.org();
  if (!org) notFound();
  return { user: ctx.user, org, role: ctx.current.role, canWrite: ctx.current.role !== "viewer" && !isDemoMode(), t, orgs: ctx.orgs };
}

export type OrgGuard =
  | { ok: true; user: SessionUser; t: TenantDb; role: OrgRole; entitlements: Entitlements; baseUrl: string }
  | { ok: false; error: string };

/**
 * Guard for organisation Server Actions: signed in, active, member of the
 * organisation in the cookie, and allowed to write (owner/admin). Demo mode
 * blocks every change.
 */
export async function guardOrgAction(): Promise<OrgGuard> {
  const [user, tr] = await Promise.all([getCurrentUser(), getT()]);
  const fail = (key: MessageKey) => ({ ok: false as const, error: tr(key) });
  if (!user || user.status !== "active") return fail("dash.err.session");
  if (isDemoMode()) return { ok: false, error: DEMO_MESSAGE };
  const db = await getDb();
  const orgId = idParam((await cookies()).get(ORG_COOKIE)?.value) ?? (await listUserOrgs(db, user.id))[0]?.id ?? null;
  if (!orgId) return fail("dash.err.noOrg");
  const role = await getMembershipRole(db, orgId, user.id);
  if (!role) return fail("dash.err.notMember");
  if (role === "viewer") return fail("dash.err.viewer");
  return { ok: true, user, t: tenantDb(db, orgId), role, entitlements: editionLimits(), baseUrl: await baseUrl() };
}

/**
 * For organisation route handlers (exports): signed-in member of the current
 * organisation, any role (viewers may read). Null when not allowed.
 */
export async function orgForRoute(): Promise<{ user: SessionUser; t: TenantDb; role: OrgRole } | null> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return null;
  const db = await getDb();
  const orgId = idParam((await cookies()).get(ORG_COOKIE)?.value) ?? (await listUserOrgs(db, user.id))[0]?.id ?? null;
  if (!orgId) return null;
  const role = await getMembershipRole(db, orgId, user.id);
  return role ? { user, t: tenantDb(db, orgId), role } : null;
}

/** Create an organisation owned by the signed-in user (edition limit: one organisation in the Free edition). */
export async function createOrgForUser(user: SessionUser, input: { name: string; sector: string }): Promise<{ id: number } | { error: MessageKey; limit?: number }> {
  const db = await getDb();
  const entitlements = editionLimits();
  if (atLimit(await ownedOrgCount(db, user.id), entitlements.maxOrgs)) return { error: "dash.err.orgLimit", limit: entitlements.maxOrgs };
  const org = await createOrg(db, user.id, input);
  return { id: org.id };
}

/** Edition limits and this month's usage of an organisation the caller already resolved (dashboard pages). */
export async function getUsageMeter(orgId: number): Promise<UsageMeter> {
  return usageMeter(await getDb(), orgId);
}

/** Switch the current organisation after checking membership. */
export async function switchOrg(userId: number, orgId: number): Promise<boolean> {
  if (!(await getMembershipRole(await getDb(), orgId, userId))) return false;
  (await cookies()).set(ORG_COOKIE, String(orgId), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31_536_000 });
  return true;
}

/** Members of an organisation with their names (for assigning rights requests). Scoped by the TenantDb's org. */
export async function listOrgMembers(t: TenantDb): Promise<Array<{ userId: number; name: string; email: string; role: OrgRole }>> {
  const memberships = await t.selectFrom("memberships").select(["user_id", "role"]).execute();
  if (!memberships.length) return [];
  const users = await (await getDb())
    .selectFrom("users")
    .select(["id", "name", "email"])
    .where("id", "in", memberships.map((m) => m.user_id))
    .execute();
  const byId = new Map(users.map((u) => [u.id, u]));
  return memberships
    .map((m) => ({ userId: m.user_id, name: byId.get(m.user_id)?.name ?? `#${m.user_id}`, email: byId.get(m.user_id)?.email ?? "", role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
