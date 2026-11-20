import "server-only";
import type { Kysely } from "kysely";
import { maskEmail } from "@/core/rights/model";
import { getDb } from "./db";
import type { Database } from "./db/schema";
import { identifierHmac, normalizeIdentifier } from "./secrets";
import { getSettings, type Settings } from "./settings";

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. A simple HTML version is generated from it. */
  text: string;
  replyTo?: string;
}

export function mailConfigured(settings: Settings): boolean {
  if (!settings.mail_enabled || !settings.mail_from_address) return false;
  return Boolean(settings.smtp_host);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function toHtml(text: string, settings: Settings): string {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:' + settings.primary_color + '">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f6f7f5;font-family:Arial,Helvetica,sans-serif;color:#18201d">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-size:20px;font-weight:bold;margin:0 0 24px">${escapeHtml(settings.site_name)}</p>
<div style="background:#ffffff;border:1px solid #dde3df;border-radius:12px;padding:24px;font-size:15px;line-height:1.6">${body}</div>
</div></body></html>`;
}

/**
 * Mailer abstraction. Every email goes through deliverMail()/sendMail():
 * - provider "smtp": any SMTP server from Admin → Settings → Email (Amazon SES,
 *   Zoho, Gmail, your host); STARTTLS on 587 or SSL on 465;
 * - tests install their own transport; development (or WPK_MAIL_CONSOLE=1)
 *   prints to the console when nothing is configured.
 *
 * Bounce-safe: addresses on the suppression list (Admin → Email) are never
 * emailed again; sending has
 * short timeouts so a slow server can't hold up a request; failures throw and
 * callers log them (src/lib/privacy/mailer.ts) instead of failing the action.
 */
export type MailTransport = (message: MailMessage) => Promise<void>;

const transportStore = globalThis as unknown as { __wpkMailTransport?: MailTransport | null };

/** Replace the transport (tests). Pass null to restore SMTP. */
export function setMailTransport(transport: MailTransport | null): void {
  transportStore.__wpkMailTransport = transport;
}

export type MailProvider = "test" | "smtp" | "console";

export class MailSuppressedError extends Error {
  constructor() {
    super("suppressed: the address bounced or complained earlier");
  }
}

/** Platform-wide lookup key for an address on the suppression list (org 0 = platform). */
export function suppressionKey(email: string): string | null {
  const normalized = normalizeIdentifier("email", email);
  return normalized ? identifierHmac(0, "email", normalized) : null;
}

export async function isSuppressed(db: Kysely<Database>, email: string): Promise<boolean> {
  const key = suppressionKey(email);
  if (!key) return false;
  return Boolean(await db.selectFrom("mail_suppressions").select("email_hmac").where("email_hmac", "=", key).executeTakeFirst());
}

export async function suppressAddress(db: Kysely<Database>, email: string, reason: "bounce" | "complaint" | "manual", detail = ""): Promise<boolean> {
  const key = suppressionKey(email);
  const normalized = normalizeIdentifier("email", email);
  if (!key || !normalized) return false;
  if (await db.selectFrom("mail_suppressions").select("email_hmac").where("email_hmac", "=", key).executeTakeFirst()) return true;
  try {
    await db.insertInto("mail_suppressions").values({ email_hmac: key, email_masked: maskEmail(normalized).slice(0, 200), reason, detail: detail.slice(0, 255), created_at: new Date().toISOString() }).execute();
  } catch {
    // Added at the same moment by another notification.
  }
  return true;
}

export async function unsuppress(db: Kysely<Database>, emailHmac: string): Promise<void> {
  await db.deleteFrom("mail_suppressions").where("email_hmac", "=", emailHmac).execute();
}

/** SMTP transport options (any SMTP server; for Amazon SES use its SMTP host and credentials). */
export function smtpOptions(settings: Settings) {
  const timeouts = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };
  const port = Number(settings.smtp_port) || 587;
  return {
    host: settings.smtp_host,
    port,
    secure: settings.smtp_secure,
    requireTLS: !settings.smtp_secure && port === 587,
    auth: settings.smtp_user ? { user: settings.smtp_user, pass: settings.smtp_pass } : undefined,
    tls: { minVersion: "TLSv1.2" as const },
    ...timeouts,
  };
}

/**
 * Send and report which transport was used. Suppressed addresses throw
 * MailSuppressedError. Without settings, development builds (or
 * WPK_MAIL_CONSOLE=1, used by the end-to-end tests) print the message to the
 * server console instead; production throws.
 */
export async function deliverMail(message: MailMessage, opts: { db?: Kysely<Database> } = {}): Promise<MailProvider> {
  const override = transportStore.__wpkMailTransport;
  const db = opts.db ?? (override ? null : await getDb());
  if (db && (await isSuppressed(db, message.to))) throw new MailSuppressedError();
  if (override) {
    await override(message);
    return "test";
  }
  const settings = await getSettings();
  if (!mailConfigured(settings) && (process.env.WPK_MAIL_CONSOLE === "1" || process.env.NODE_ENV === "development")) {
    console.info(`[mail:console] to=${message.to} subject=${JSON.stringify(message.subject)}
${message.text}`);
    return "console";
  }
  await sendMail(message);
  return "smtp";
}

/** Send an email with the settings from Admin → Email. Throws when sending fails. */
export async function sendMail(message: MailMessage): Promise<void> {
  const override = transportStore.__wpkMailTransport;
  if (override) return override(message);
  const settings = await getSettings();
  if (!mailConfigured(settings)) throw new Error("Email is not configured. Set it up in Admin → Settings → Email.");
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(smtpOptions(settings));
  await transport.sendMail({
    from: { name: settings.mail_from_name || settings.site_name, address: settings.mail_from_address },
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: toHtml(message.text, settings),
  });
}
