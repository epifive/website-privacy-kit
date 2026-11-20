import { corsHeadersFor, emptyResponse, jsonResponse, requestHost } from "@/lib/cors";
import { getDb } from "@/lib/db";
import { findSiteByPublicKey, originAllowed, recordConsent, withdrawUrl } from "@/lib/privacy/consent";
import "@/lib/consent-notify";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { grantedForSubject } from "@/lib/privacy/children";
import { baseUrl } from "@/lib/request";

/**
 * Consent events from the widget (plan §7.3, §7.5; C1–C3).
 *
 * The widget sends `text/plain` JSON (sendBeacon / fetch without a preflight):
 *   { site, sid, c: { purposeKey: true|false }, l: "en"|"hi", nv: noticeVersion,
 *     ch: "banner"|"form", u: pageUrl, wv: widgetVersion, s?: { k: "email"|"phone", v } }
 * The server stamps the time; nothing from the client is trusted beyond the
 * choices themselves. Only the site's own origins are accepted.
 */

const MAX_BODY = 8 * 1024;

export async function OPTIONS(request: Request) {
  const from = requestHost(request);
  return from ? emptyResponse(corsHeadersFor(from.origin)) : emptyResponse();
}

/**
 * GET /api/v1/consent?site={pk}&sid={browser id} — children mode only: the
 * purposes a verified parent has switched on for this browser id, so the
 * widget can apply them. Never returns tracking purposes (s.9(3)).
 */
export async function GET(request: Request) {
  const ip = await clientIp();
  if (!rateLimit(`consent:get:${ip}`, 60, 60_000)) return jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  const url = new URL(request.url);
  const found = await findSiteByPublicKey(await getDb(), url.searchParams.get("site") ?? "");
  if (!found) return jsonResponse({ error: "not_found" }, 404);
  const from = requestHost(request);
  if (!from || !originAllowed(found.site, from.origin)) return jsonResponse({ error: "origin_not_allowed" }, 403);
  const cors = corsHeadersFor(from.origin);
  const granted = await grantedForSubject(found.t, found.site.id, url.searchParams.get("sid") ?? "");
  return jsonResponse({ c: Object.fromEntries(granted.map((k) => [k, true])) }, 200, cors, { "Cache-Control": "no-store" });
}

export async function POST(request: Request) {
  const ip = await clientIp();
  if (!rateLimit(`consent:ip:${ip}`, 60, 60_000)) return jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "60" });

  const text = await request.text();
  if (text.length > MAX_BODY) return jsonResponse({ error: "too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "bad_request" }, 400);
  }

  const found = typeof body.site === "string" ? await findSiteByPublicKey(await getDb(), body.site) : null;
  if (!found) return jsonResponse({ error: "not_found" }, 404);
  const from = requestHost(request);
  if (!from || !originAllowed(found.site, from.origin)) return jsonResponse({ error: "origin_not_allowed" }, 403);
  const cors = corsHeadersFor(from.origin);
  if (!rateLimit(`consent:site:${found.site.id}`, 1200, 60_000)) return jsonResponse({ error: "rate_limited" }, 429, cors, { "Retry-After": "60" });

  const choices: Record<string, boolean> = {};
  if (body.c && typeof body.c === "object" && !Array.isArray(body.c)) {
    for (const [k, v] of Object.entries(body.c as Record<string, unknown>).slice(0, 50)) if (typeof v === "boolean") choices[k] = v;
  }
  const s = body.s as { k?: unknown; v?: unknown } | undefined;
  const subject = s && (s.k === "email" || s.k === "phone") && typeof s.v === "string" ? { kind: s.k as "email" | "phone", value: s.v.slice(0, 190) } : undefined;
  const channel = body.ch === "form" ? "form" : "banner";

  const result = await recordConsent(found.t, found.site, {
    subjectRef: typeof body.sid === "string" ? body.sid : undefined,
    subject: channel === "form" ? subject : undefined,
    choices,
    lang: body.l === "hi" ? "hi" : "en",
    channel,
    noticeVersion: Number(body.nv) || 0,
    pageUrl: typeof body.u === "string" ? body.u : undefined,
    ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
    widgetVersion: typeof body.wv === "string" ? body.wv : undefined,
    under18: body.ag === "u18",
  });
  if (!result.ok) return jsonResponse({ error: result.error }, result.error === "plan_limit" ? 429 : 422, cors);
  const identified = result.subjectRef.startsWith("e_") || result.subjectRef.startsWith("p_");
  return jsonResponse(
    { ok: true, n: result.recorded, ...(identified ? { withdraw: withdrawUrl(await baseUrl(), found.org.slug, found.site.id, result.subjectRef) } : {}) },
    200,
    cors,
  );
}
