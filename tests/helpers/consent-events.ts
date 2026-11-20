import type { Kysely } from "kysely";
import { eventHash, GENESIS_HASH } from "@/core/consent/chain";
import type { Database, Site } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Insert `n` hash-chained consent events with an old created_at directly
 * (the app always stamps "now"), continuing the site's chain and head.
 */
export async function insertOldEvents(db: Kysely<Database>, t: TenantDb, site: Site, n: number, createdAt: string, opts: { subject?: string; grantedState?: boolean } = {}): Promise<number[]> {
  const head = (await t.selectFrom("consent_chain_heads").select(["seq", "hash"]).where("site_id", "=", site.id).executeTakeFirst()) ?? { seq: 0, hash: GENESIS_HASH };
  let prev = head.hash;
  let seq = Number(head.seq);
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    seq++;
    const base = {
      org_id: t.orgId,
      site_id: site.id,
      seq,
      subject_ref: opts.subject ?? `old-visitor-${String(seq).padStart(8, "0")}`,
      subject_kind: "browser" as const,
      subject_lookup_hmac: null,
      subject_enc: null,
      purpose_key: "marketing_whatsapp",
      action: "grant" as const,
      notice_version: 1,
      notice_version_id: null,
      lang: "en" as const,
      channel: "banner" as const,
      page_url: "",
      ip_trunc: "",
      ua_family: "",
      widget_ver: "",
      created_at: createdAt,
      prev_hash: prev,
    };
    const hash = eventHash(prev, base);
    const r = await db.insertInto("consent_events").values({ ...base, hash }).executeTakeFirstOrThrow();
    ids.push(Number(r.insertId));
    prev = hash;
  }
  const exists = await t.selectFrom("consent_chain_heads").select("site_id").where("site_id", "=", site.id).executeTakeFirst();
  if (exists) await t.updateTable("consent_chain_heads").set({ seq, hash: prev, updated_at: createdAt }).where("site_id", "=", site.id).execute();
  else await t.insertInto("consent_chain_heads", { site_id: site.id, seq, hash: prev, updated_at: createdAt });
  if (opts.grantedState && opts.subject) {
    await t.insertInto("consent_state", { site_id: site.id, subject_ref: opts.subject, purpose_key: "marketing_whatsapp", status: "granted", notice_version: 1, last_event_id: ids[ids.length - 1], updated_at: createdAt });
  }
  return ids;
}
