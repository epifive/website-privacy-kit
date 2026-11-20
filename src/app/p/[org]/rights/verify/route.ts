import type { Lang } from "@/core/notice/templates";
import { istDate, maskEmail, SUBMIT_LIMITS } from "@/core/rights/model";
import { HOSTED_TEXTS } from "@/core/rights/texts";
import "@/lib/consent-notify";
import { hostedContext, langParam, notFoundResponse, type HostedContext } from "@/lib/hosted-context";
import { htmlResponse, renderDone, renderMessage, renderVerify } from "@/lib/privacy/hosted-pages";
import { getDecrypted, readRequestToken, resendCode, verifyRequest } from "@/lib/privacy/rights";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Email code page (plan §7.5 POST /requests/{id}/verify):
 *
 *   GET  /p/{org}/rights/verify?r=…            enter the 6-digit code
 *   POST /p/{org}/rights/verify  action=verify  check the code → acknowledgement
 *   POST /p/{org}/rights/verify  action=resend  new code (cooldown + maximum)
 *
 * r is a signed token carrying only the request id; it resolves inside this
 * organisation only. Codes are rate-limited per IP and locked after 5 misses.
 */

type Ctx = { params: Promise<{ org: string }> };

async function verifyPage(ctx: HostedContext, lang: Lang, token: string, opts: { error?: string | null; notice?: string | null; status?: number } = {}) {
  const id = readRequestToken(token);
  const req = id ? await getDecrypted(ctx.t, id) : null;
  const tx = HOSTED_TEXTS[lang];
  if (!req) return htmlResponse(renderMessage(lang, ctx.org.name, ctx.links, tx.verifyTitle, tx.errInvalid), { status: 404 });
  if (req.row.status !== "unverified") {
    const days = Math.round((Date.parse(req.row.due_at) - Date.parse(req.row.received_at)) / 86_400_000);
    return htmlResponse(renderDone({ lang, orgName: ctx.org.name, links: ctx.links, ref: req.row.ref, dueDate: istDate(req.row.due_at), responseDays: days, withdrawn: null, already: true, mailSent: true }));
  }
  return htmlResponse(renderVerify({ lang, orgName: ctx.org.name, links: ctx.links, token, maskedEmail: maskEmail(req.email), error: opts.error, notice: opts.notice }), { status: opts.status });
}

export async function GET(request: Request, { params }: Ctx) {
  const { org: slug } = await params;
  const url = new URL(request.url);
  const ctx = await hostedContext(slug);
  if (!ctx) return notFoundResponse();
  const lang = langParam(url.searchParams.get("lang"));
  return verifyPage(ctx, lang, url.searchParams.get("r") ?? "", { error: url.searchParams.get("m") === "0" ? HOSTED_TEXTS[lang].mailFailed : null });
}

export async function POST(request: Request, { params }: Ctx) {
  const { org: slug } = await params;
  const ctx = await hostedContext(slug);
  if (!ctx) return notFoundResponse();
  const ip = await clientIp();
  const fd = await request.formData().catch(() => null);
  const field = (key: string) => {
    const v = fd?.get(key);
    return typeof v === "string" ? v : "";
  };
  const lang = langParam(field("lang"));
  const tx = HOSTED_TEXTS[lang];
  const token = field("r");
  if (!rateLimit(`rights:verify:${ip}`, SUBMIT_LIMITS.verifyPerIpPerMinute, 60_000)) return verifyPage(ctx, lang, token, { error: tx.err.rate, status: 429 });
  const id = readRequestToken(token);
  if (!id) return verifyPage(ctx, lang, token);

  if (field("action") === "resend") {
    const r = await resendCode(ctx.t, id, { baseUrl: ctx.base });
    if (r.ok) return verifyPage(ctx, lang, token, r.mailSent ? { notice: tx.resent } : { error: tx.mailFailed });
    const error = r.error === "wait" ? tx.errResendWait : r.error === "max" ? tx.errResendMax : r.error === "done" ? null : tx.errInvalid;
    return verifyPage(ctx, lang, token, { error, status: r.error === "wait" ? 429 : 400 });
  }

  const r = await verifyRequest(ctx.t, id, field("code"), { baseUrl: ctx.base, ip, userAgent: request.headers.get("user-agent") ?? undefined });
  if (!r.ok) {
    const error = r.error === "code" ? tx.errCode.replace("{left}", String(r.left ?? 0)) : r.error === "expired" ? tx.errExpired : r.error === "locked" ? tx.errLocked : tx.errInvalid;
    return verifyPage(ctx, lang, token, { error, status: 400 });
  }
  return htmlResponse(renderDone({ lang, orgName: ctx.org.name, links: ctx.links, ref: r.ref, dueDate: istDate(r.dueAt), responseDays: r.responseDays, withdrawn: r.withdrawn, already: r.already, mailSent: r.mailSent }));
}
