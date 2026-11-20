import "server-only";
import { DETAILS_CONFIGURABLE } from "@/core/rights/model";
import type { Kysely } from "kysely";
import { getPreset, SECTORS, type Sector } from "@/core/presets";
import { clampInternalTarget } from "@/core/rights/model";
import type { Database, Org, OrgRole } from "../db/schema";
import { tenantDb, type TenantDb } from "../db/tenant";
import { jsonArray, nowIso } from "./util";

/**
 * Organisations and memberships. Creating an organisation and listing a user's
 * organisations are the only cross-tenant operations; they are keyed by the
 * signed-in user's id, never by an id taken from a request.
 */

export interface OrgSummary {
  id: number;
  slug: string;
  name: string;
  role: OrgRole;
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base.length >= 3 ? base : `org-${base || "new"}`;
}

async function uniqueSlug(db: Kysely<Database>, wanted: string, exceptOrgId?: number): Promise<string> {
  const base = slugify(wanted);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const row = await db.selectFrom("orgs").select("id").where("slug", "=", slug).executeTakeFirst();
    if (!row || row.id === exceptOrgId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createOrg(db: Kysely<Database>, ownerUserId: number, input: { name: string; sector: string }): Promise<Org> {
  const sector: Sector = (SECTORS as readonly string[]).includes(input.sector) ? (input.sector as Sector) : "other";
  const preset = getPreset(sector);
  const ts = nowIso();
  const name = input.name.trim().slice(0, 120);
  const slug = await uniqueSlug(db, name);
  return db.transaction().execute(async (trx) => {
    const values = {
      slug,
      name,
      legal_name: name,
      sector,
      goods_services_en: preset.goodsServices.en,
      goods_services_hi: preset.goodsServices.hi,
      website_url: "",
      response_days: 30,
      identifiers: JSON.stringify(preset.identifiers),
      internal_target_days: 0,
      consent_retention_days: 1095,
      pre_erasure_notice: 0,
      details_required: "[]",
      children_mode: preset.childrenMode ? 1 : 0,
      third_schedule: "none",
      status: "active" as const,
      region: "IN",
      owner_user_id: ownerUserId,
      created_at: ts,
      updated_at: ts,
    };
    const result = await trx.insertInto("orgs").values(values).executeTakeFirstOrThrow();
    const id = Number(result.insertId);
    await trx.insertInto("memberships").values({ org_id: id, user_id: ownerUserId, role: "owner", created_at: ts }).execute();
    await trx.insertInto("questionnaires").values({ org_id: id, answers: JSON.stringify({ sector }), completed_at: null, updated_at: ts }).execute();
    return { ...values, id, closed_at: null, purge_after: null, chain_digest_at: null };
  });
}

export async function listUserOrgs(db: Kysely<Database>, userId: number): Promise<OrgSummary[]> {
  const rows = await db
    .selectFrom("memberships")
    .innerJoin("orgs", "orgs.id", "memberships.org_id")
    .select(["orgs.id", "orgs.slug", "orgs.name", "memberships.role"])
    .where("memberships.user_id", "=", userId)
    .where("orgs.status", "=", "active")
    .orderBy("orgs.id")
    .execute();
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, role: r.role }));
}

/** The user's role in an organisation, or null when they are not a member. */
export async function getMembershipRole(db: Kysely<Database>, orgId: number, userId: number): Promise<OrgRole | null> {
  if (!Number.isInteger(orgId) || orgId < 1) return null;
  const row = await tenantDb(db, orgId).selectFrom("memberships").select("role").where("user_id", "=", userId).executeTakeFirst();
  return row?.role ?? null;
}

export async function countOwnedOrgs(db: Kysely<Database>, userId: number): Promise<number> {
  const row = await db.selectFrom("orgs").select((eb) => eb.fn.countAll<number>().as("n")).where("owner_user_id", "=", userId).executeTakeFirst();
  return Number(row?.n ?? 0);
}

export async function getOrgBySlug(db: Kysely<Database>, slug: string): Promise<Org | undefined> {
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) return undefined;
  return db.selectFrom("orgs").selectAll().where("slug", "=", slug).where("status", "=", "active").executeTakeFirst();
}

export interface OrgProfileInput {
  name: string;
  legal_name: string;
  sector: string;
  goods_services_en: string;
  goods_services_hi: string;
  website_url: string;
  response_days: number;
  /** Internal target for rights requests in days (0 = off). Kept below response_days. */
  internal_target_days: number;
  identifiers: string[];
  children_mode: boolean;
  third_schedule: string;
  /** Request types (access, erasure) that must include a description. */
  details_required: string[];
}

export async function updateOrgProfile(t: TenantDb, input: Partial<OrgProfileInput>): Promise<void> {
  const values: Parameters<TenantDb["updateOrg"]>[0] = { updated_at: nowIso() };
  if (input.name !== undefined) values.name = input.name.trim().slice(0, 120);
  if (input.legal_name !== undefined) values.legal_name = input.legal_name.trim().slice(0, 160);
  if (input.sector !== undefined) values.sector = (SECTORS as readonly string[]).includes(input.sector) ? input.sector : "other";
  if (input.goods_services_en !== undefined) values.goods_services_en = input.goods_services_en.trim().slice(0, 400);
  if (input.goods_services_hi !== undefined) values.goods_services_hi = input.goods_services_hi.trim().slice(0, 400);
  if (input.website_url !== undefined) values.website_url = input.website_url.trim().slice(0, 300);
  if (input.response_days !== undefined) values.response_days = Math.min(90, Math.max(1, Math.round(input.response_days)));
  if (input.internal_target_days !== undefined || values.response_days !== undefined) {
    const current = await t.org();
    const response = values.response_days ?? current?.response_days ?? 30;
    values.internal_target_days = clampInternalTarget(input.internal_target_days ?? current?.internal_target_days ?? 0, response);
  }
  if (input.identifiers !== undefined) values.identifiers = JSON.stringify(input.identifiers.slice(0, 10));
  if (input.children_mode !== undefined) values.children_mode = input.children_mode ? 1 : 0;
  if (input.third_schedule !== undefined) values.third_schedule = input.third_schedule;
  if (input.details_required !== undefined) values.details_required = JSON.stringify(DETAILS_CONFIGURABLE.filter((k) => input.details_required!.includes(k)));
  await t.updateOrg(values);
}

export function orgIdentifiers(org: Pick<Org, "identifiers">): string[] {
  return jsonArray(org.identifiers).filter((v): v is string => typeof v === "string");
}
