import { createHash } from "node:crypto";

/**
 * Hash chain for consent records (plan §7.4 "Integrity"; requirement C3).
 *
 *   hash = sha256(prev_hash || canonical_json(event))
 *
 * computed per site over the fields below, in sequence order. The first event
 * of a site chains from GENESIS_HASH. Changing, inserting or removing any row
 * breaks every hash after it; removing the newest rows is caught by comparing
 * the last hash with the stored chain head.
 */

export const GENESIS_HASH = "0".repeat(64);

/** Fields covered by the hash (everything except id, prev_hash and hash). */
export const CHAINED_FIELDS = [
  "org_id",
  "site_id",
  "seq",
  "subject_ref",
  "subject_kind",
  "subject_lookup_hmac",
  "subject_enc",
  "purpose_key",
  "action",
  "notice_version",
  "notice_version_id",
  "lang",
  "channel",
  "page_url",
  "ip_trunc",
  "ua_family",
  "widget_ver",
  "created_at",
] as const;

export type ChainedField = (typeof CHAINED_FIELDS)[number];
export type ChainedEvent = Record<ChainedField, string | number | null>;

/** Deterministic JSON: keys sorted, no whitespace, numbers and strings as JSON encodes them. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

/** The chained subset of a row, with numbers normalised (MySQL may return numeric strings). */
export function chainedPart(row: Record<string, unknown>): ChainedEvent {
  const out = {} as ChainedEvent;
  for (const f of CHAINED_FIELDS) {
    const v = row[f];
    if (f === "org_id" || f === "site_id" || f === "seq" || f === "notice_version") out[f] = Number(v);
    else if (f === "notice_version_id") out[f] = v === null || v === undefined ? null : Number(v);
    else out[f] = v === null || v === undefined ? null : String(v);
  }
  return out;
}

export function eventHash(prevHash: string, event: Record<string, unknown>): string {
  return createHash("sha256").update(prevHash, "utf8").update(canonicalJson(chainedPart(event)), "utf8").digest("hex");
}

export interface ChainRow extends Record<string, unknown> {
  id: number;
  seq: number;
  prev_hash: string;
  hash: string;
}

export interface ChainVerification {
  ok: boolean;
  count: number;
  /** Hash of the last verified row (the chain head), or GENESIS_HASH when empty. */
  head: string;
  lastSeq: number;
  /** First problem found, if any. */
  error?: { seq: number; id: number | null; reason: "prev_hash" | "hash" | "sequence" | "head_mismatch" };
}

/**
 * Verify rows of one site in seq order. Pass the stored chain head to also
 * detect rows removed from the end. Works incrementally: `start` lets a caller
 * continue from a previously verified (seq, hash).
 */
export function verifyChain(rows: Iterable<ChainRow>, opts: { head?: { seq: number; hash: string } | null; start?: { seq: number; hash: string } } = {}): ChainVerification {
  let prev = opts.start?.hash ?? GENESIS_HASH;
  let expectedSeq = (opts.start?.seq ?? 0) + 1;
  let count = 0;
  for (const row of rows) {
    const seq = Number(row.seq);
    if (seq !== expectedSeq) return { ok: false, count, head: prev, lastSeq: expectedSeq - 1, error: { seq, id: Number(row.id), reason: "sequence" } };
    if (row.prev_hash !== prev) return { ok: false, count, head: prev, lastSeq: seq - 1, error: { seq, id: Number(row.id), reason: "prev_hash" } };
    if (eventHash(prev, row) !== row.hash) return { ok: false, count, head: prev, lastSeq: seq - 1, error: { seq, id: Number(row.id), reason: "hash" } };
    prev = row.hash;
    expectedSeq += 1;
    count += 1;
  }
  const lastSeq = expectedSeq - 1;
  if (opts.head && (Number(opts.head.seq) !== lastSeq || opts.head.hash !== prev)) {
    return { ok: false, count, head: prev, lastSeq, error: { seq: Number(opts.head.seq), id: null, reason: "head_mismatch" } };
  }
  return { ok: true, count, head: prev, lastSeq };
}
