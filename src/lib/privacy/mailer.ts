import "server-only";
import { maskEmail } from "@/core/rights/model";
import type { MailLogRow } from "../db/schema";
import type { TenantDb } from "../db/tenant";
import { deliverMail, MailSuppressedError } from "../mail";
import { identifierHmac, normalizeIdentifier } from "../secrets";
import { nowIso } from "./util";

/**
 * Logged sending for an organisation: every attempt goes through the mailer
 * abstraction (src/lib/mail.ts) and leaves one mail_log row (sent, failed or
 * skipped) with the recipient masked and HMAC'd. Bodies are never stored.
 */

export interface LoggedMail {
  kind: string;
  to: string;
  subject: string;
  text: string;
  requestId?: number | null;
  replyTo?: string;
}

export type LoggedResult = { ok: true; logId: number } | { ok: false; logId: number; error: string };

export async function sendLoggedMail(t: TenantDb, mail: LoggedMail): Promise<LoggedResult> {
  const normalized = normalizeIdentifier("email", mail.to);
  const base = {
    request_id: mail.requestId ?? null,
    kind: mail.kind.slice(0, 30),
    to_masked: normalized ? maskEmail(normalized).slice(0, 200) : "invalid",
    to_hmac: normalized ? identifierHmac(t.orgId, "email", normalized) : "",
    subject: mail.subject.slice(0, 255),
  };
  if (!normalized) {
    const logId = await t.insertInto("mail_log", { ...base, status: "skipped", provider: "none", error: "invalid recipient", created_at: nowIso() });
    return { ok: false, logId, error: "invalid recipient" };
  }
  try {
    const provider = await deliverMail({ to: normalized, subject: mail.subject, text: mail.text, replyTo: mail.replyTo });
    const logId = await t.insertInto("mail_log", { ...base, status: "sent", provider, error: "", created_at: nowIso() });
    return { ok: true, logId };
  } catch (error) {
    if (error instanceof MailSuppressedError) {
      // Bounce-safe: the address hard-bounced or complained before; never retried.
      const logId = await t.insertInto("mail_log", { ...base, status: "skipped", provider: "none", error: "suppressed", created_at: nowIso() });
      return { ok: false, logId, error: "suppressed" };
    }
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 255);
    console.error("[mail] send failed:", message);
    const logId = await t.insertInto("mail_log", { ...base, status: "failed", provider: "smtp", error: message, created_at: nowIso() });
    return { ok: false, logId, error: message };
  }
}

export function listMailLog(t: TenantDb, opts: { requestId?: number; limit?: number } = {}): Promise<MailLogRow[]> {
  let q = t.selectFrom("mail_log").selectAll();
  if (opts.requestId) q = q.where("request_id", "=", opts.requestId);
  return q.orderBy("id", "desc").limit(Math.min(500, opts.limit ?? 100)).execute();
}
