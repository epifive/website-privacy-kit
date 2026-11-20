import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { safeFilename, sniffAttachment } from "@/core/rights/model";
import { storagePath } from "../config";
import type { RequestAttachmentRow } from "../db/schema";
import type { TenantDb } from "../db/tenant";
import { decryptBytesForOrg, encryptBytesForOrg } from "../secrets";
import { nowIso } from "./util";

/**
 * Optional request attachments (plan M7). Files are size- and type-checked by
 * the caller (checkAttachments), encrypted with the organisation's file key
 * and stored outside the web root in storage/rights/{org_id}/. Only signed-in
 * members of the same organisation can download them.
 */

export interface IncomingFile {
  name: string;
  size: number;
  bytes: Uint8Array;
}

const dirFor = (orgId: number) => storagePath("rights", String(orgId));

export async function saveAttachment(t: TenantDb, requestId: number, file: IncomingFile): Promise<number | null> {
  const mime = sniffAttachment(file.bytes);
  if (!mime || file.size <= 0) return null;
  const key = `${crypto.randomBytes(16).toString("hex")}.bin`;
  const dir = dirFor(t.orgId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, key), encryptBytesForOrg(t.orgId, file.bytes), { mode: 0o600 });
  return t.insertInto("request_attachments", {
    request_id: requestId,
    filename: safeFilename(file.name, mime),
    mime,
    size: file.bytes.length,
    sha256: crypto.createHash("sha256").update(file.bytes).digest("hex"),
    storage_key: key,
    created_at: nowIso(),
  });
}

export function listAttachments(t: TenantDb, requestId: number): Promise<RequestAttachmentRow[]> {
  return t.selectFrom("request_attachments").selectAll().where("request_id", "=", requestId).orderBy("id").execute();
}

/** Decrypted file of the caller's organisation, or null (other organisation, missing or tampered file). */
export async function readAttachment(t: TenantDb, attachmentId: number): Promise<{ row: RequestAttachmentRow; bytes: Buffer } | null> {
  const row = await t.selectFrom("request_attachments").selectAll().where("id", "=", attachmentId).executeTakeFirst();
  if (!row || !/^[0-9a-f]{32}\.bin$/.test(row.storage_key)) return null;
  const raw = await fs.readFile(path.join(dirFor(t.orgId), row.storage_key)).catch(() => null);
  const bytes = raw ? decryptBytesForOrg(t.orgId, raw) : null;
  if (!bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== row.sha256) return null;
  return { row, bytes };
}

/** Path of the stored (encrypted) file, for tests and maintenance. */
export function attachmentPath(orgId: number, row: Pick<RequestAttachmentRow, "storage_key">): string {
  return path.join(dirFor(orgId), row.storage_key);
}
