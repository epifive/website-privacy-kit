import { corsHeadersFor, jsonResponse } from "@/lib/cors";
import { brandFrom } from "@/lib/branding";
import { getSettings } from "@/lib/settings";
import { getDb } from "@/lib/db";
import { buildSiteConfig, findSiteByPublicKey, originAllowed } from "@/lib/privacy/consent";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { baseUrl } from "@/lib/request";

/**
 * Public banner configuration (plan §7.3, §7.5): purposes, notice version,
 * texts (EN + HI), theme and Consent Mode mapping for one site.
 *
 * Cacheable for 5 minutes (browser and CDN) with an ETag derived from the
 * content, so a publish or settings change is picked up within that window.
 * Only the site's own origins get CORS access (Vary: Origin).
 */

type Ctx = { params: Promise<{ pk: string }> };

async function load(request: Request, { params }: Ctx) {
  const { pk } = await params;
  const found = await findSiteByPublicKey(await getDb(), pk);
  if (!found) return { error: jsonResponse({ error: "not_found" }, 404, { Vary: "Origin" }) } as const;
  const origin = request.headers.get("origin");
  if (origin && !originAllowed(found.site, origin)) return { error: jsonResponse({ error: "origin_not_allowed" }, 403, { Vary: "Origin" }) } as const;
  return { found, cors: origin ? corsHeadersFor(origin) : { Vary: "Origin" } } as const;
}

export async function OPTIONS(request: Request, ctx: Ctx) {
  const r = await load(request, ctx);
  if ("error" in r) return r.error;
  return new Response(null, { status: 204, headers: r.cors });
}

export async function GET(request: Request, ctx: Ctx) {
  if (!rateLimit(`cfg:${await clientIp()}`, 300, 60_000)) return jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  const r = await load(request, ctx);
  if ("error" in r) return r.error;
  const config = await buildSiteConfig(r.found.t, r.found.site, await baseUrl(), brandFrom(await getSettings()));
  const etag = `"${config.v}"`;
  const headers = { ...r.cors, ETag: etag, "Cache-Control": "public, max-age=300, stale-while-revalidate=60", "X-Content-Type-Options": "nosniff" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return Response.json(config, { headers });
}
