import "server-only";
import { maskEmail, maskName } from "@/core/rights/model";
import type { TenantDb } from "../db/tenant";
import { decryptForOrg } from "../secrets";
import { verifySiteChain } from "./consent";
import { verifyNoticeVersion } from "./notices";
import { listPurposes, listSites, listVendors } from "./registers";
import { csvCell, jsonArray, nowIso } from "./util";

/**
 * Register exports (plan M13; C3-04, S1(c)): rights requests, vendors and purposes as CSV
 * (contacts masked), and the JSON proof export. Breach, retention and consent-log CSVs live
 * next to their registers. Data export is never locked.
 */

const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export async function requestsRegisterCsv(t: TenantDb): Promise<string> {
  const rows = await t.selectFrom("rights_requests").selectAll().orderBy("received_at").execute();
  return csv([
    ["ref", "type", "status", "outcome", "lang", "requester", "email", "received_at", "verified_at", "due_at", "target_at", "closed_at", "legal_hold_reason"],
    ...rows.map((r) => {
      const email = decryptForOrg(t.orgId, r.email_enc);
      return [r.ref, r.type, r.status, r.outcome ?? "", r.lang, maskName(decryptForOrg(t.orgId, r.requester_name_enc) ?? ""), email ? maskEmail(email) : "", r.received_at, r.verified_at ?? "", r.due_at, r.target_at ?? "", r.closed_at ?? "", r.legal_hold_reason];
    }),
  ]);
}

export async function vendorsCsv(t: TenantDb): Promise<string> {
  const rows = await listVendors(t);
  return csv([
    ["name", "service", "data_shared", "location", "contract_status", "contract_date", "security_clause", "review_at", "erasure_contact"],
    ...rows.map((v) => [v.name, v.service, jsonArray(v.data_shared).join("; "), v.location, v.contract_status, v.contract_date ?? "", v.security_clause, v.review_at ?? "", v.erasure_contact]),
  ]);
}

export async function purposesCsv(t: TenantDb): Promise<string> {
  const rows = await listPurposes(t);
  return csv([["purpose_key", "name_en", "name_hi", "basis", "data_items", "vendor_ids", "retention_rule_id", "is_tracking", "active", "site_id"], ...rows.map((p) => [p.purpose_key, p.name_en, p.name_hi, p.basis, p.data_items, p.vendor_ids, p.retention_rule_id ?? "", p.is_tracking, p.active, p.site_id ?? ""])]);
}

/**
 * Proof export (JSON): every published notice version with its SHA-256 (re-checked against the
 * stored text) and the hash-chain verification report of each website's consent log. The full
 * evidence pack ZIP with every register, timeline and a signed manifest is in the Pro edition.
 */
export async function buildProofJson(t: TenantDb, now: Date = new Date()): Promise<string> {
  const org = await t.org();
  if (!org) throw new Error("Organisation not found.");
  const notices = await t.selectFrom("notice_versions").selectAll().orderBy("version").orderBy("lang").execute();
  const sites = [];
  for (const site of await listSites(t)) {
    const report = await verifySiteChain(t, site.id);
    sites.push({ site_id: site.id, domain: site.domain, archived_at: site.archived_at, ok: report.ok, events_verified: report.count, head_seq: report.lastSeq, head_hash: report.head, stored_head: report.storedHead, checkpoint: report.checkpoint, error: report.error ?? null, verified_at: report.verifiedAt });
  }
  return JSON.stringify(
    {
      generated_at: now.toISOString(),
      generator: "EpiFive Website Privacy Kit",
      organisation: org.legal_name || org.name,
      note: "Not legal advice. A record of what the software holds; it does not by itself show compliance. Templates are drafts pending lawyer review.",
      notices: notices.map((n) => ({ version: n.version, lang: n.lang, title: n.title, sha256: n.sha256, sha256_matches_body: verifyNoticeVersion(n), template_version: n.template_version, published_at: n.published_at })),
      consent_chains: { algorithm: "hash = sha256(prev_hash || canonical_json(event)); verification starts after the latest purge checkpoint", sites },
    },
    null,
    2,
  );
}

export const exportFilename = (slug: string, kind: string, ext: string) => `${slug}-${kind}-${nowIso().slice(0, 10)}.${ext}`;
