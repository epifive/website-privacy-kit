import "server-only";
import { sql, type DeleteQueryBuilder, type DeleteResult, type Insertable, type Kysely, type SelectQueryBuilder, type UpdateQueryBuilder, type UpdateResult } from "kysely";
import type { Database, Org } from "./schema";

/**
 * Tenant isolation (plan §7.6): every query on a tenant table goes through a
 * TenantDb, which always adds `org_id = ?` (reads, updates, deletes) or sets
 * org_id (inserts). Services in src/lib/privacy only ever receive a TenantDb,
 * never a raw Kysely instance (enforced by ESLint, see eslint.config.mjs).
 *
 * This is also the "not a Consent Manager" guardrail §3.3 item 2: records of
 * one Data Fiduciary are never readable through another one's TenantDb.
 */

export const TENANT_TABLES = [
  "memberships",
  "sites",
  "contacts",
  "purposes",
  "vendors",
  "retention_rules",
  "notice_versions",
  "questionnaires",
  "audit_log",
  "consent_events",
  "consent_state",
  "consent_chain_heads",
  "rights_requests",
  "request_events",
  "request_attachments",
  "nominations",
  "mail_log",
  "breaches",
  "breach_events",
  "breach_recipients",
  "erasure_tasks",
  "consent_purge_checkpoints",
  "parental_consents",
  "usage_counters",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];
type WithoutOrg<T> = Omit<T, "org_id">;

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type -- the casts below only re-attach the table type Kysely loses with a generic table name */
export interface TenantDb {
  readonly orgId: number;
  selectFrom<T extends TenantTable>(table: T): SelectQueryBuilder<Database, T, {}>;
  updateTable<T extends TenantTable>(table: T): UpdateQueryBuilder<Database, T, T, UpdateResult>;
  deleteFrom<T extends TenantTable>(table: T): DeleteQueryBuilder<Database, T, DeleteResult>;
  /** Insert one or more rows; org_id is set by the helper and cannot be overridden. */
  insertInto<T extends TenantTable>(table: T, values: WithoutOrg<Insertable<Database[T]>> | Array<WithoutOrg<Insertable<Database[T]>>>): Promise<number>;
  /** The organisation row itself. */
  org(): Promise<Org | undefined>;
  updateOrg(values: Partial<Omit<Org, "id" | "owner_user_id" | "created_at">>): Promise<void>;
  /** Run work in a transaction with a TenantDb bound to the same organisation. */
  transaction<R>(work: (t: TenantDb) => Promise<R>): Promise<R>;
}

export function assertOrgId(orgId: unknown): asserts orgId is number {
  if (typeof orgId !== "number" || !Number.isInteger(orgId) || orgId < 1) throw new Error("Invalid organisation id.");
}

export function tenantDb(db: Kysely<Database>, orgId: number): TenantDb {
  assertOrgId(orgId);
  const anyDb = db as Kysely<any>;
  const scoped = (table: string) => sql.ref(`${table}.org_id`);
  const t: TenantDb = {
    orgId,
    selectFrom: (table) => (anyDb.selectFrom(table as string) as any).where(scoped(table), "=", orgId),
    updateTable: (table) => (anyDb.updateTable(table as string) as any).where(scoped(table), "=", orgId),
    deleteFrom: (table) => (anyDb.deleteFrom(table as string) as any).where(scoped(table), "=", orgId),
    async insertInto(table, values) {
      const rows = (Array.isArray(values) ? values : [values]).map((v) => ({ ...(v as object), org_id: orgId }));
      if (!rows.length) return 0;
      const result = await anyDb.insertInto(table as string).values(rows).executeTakeFirst();
      return Number(result.insertId ?? 0);
    },
    org: () => db.selectFrom("orgs").selectAll().where("id", "=", orgId).executeTakeFirst(),
    async updateOrg(values) {
      await db.updateTable("orgs").set(values).where("id", "=", orgId).execute();
    },
    transaction: (work) => db.transaction().execute((trx) => work(tenantDb(trx, orgId))),
  };
  return t;
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */

/** Positive integer id from form input, or null. */
export function idParam(value: unknown): number | null {
  const n = Number(typeof value === "string" ? value.trim() : value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
