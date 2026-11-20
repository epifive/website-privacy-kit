import "server-only";

/**
 * CORS helpers for the public widget API (/api/v1/*, phase P3).
 *
 * The requesting page is identified by the Origin header, or the Referer when a
 * browser omits Origin. Only a site's allowed origins may use its public key.
 */

export type CorsHeaders = Record<string, string>;

/** Hostname of the page that sent the request, or null when unknown. */
export function requestHost(request: Request): { host: string; origin: string } | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    try {
      const url = new URL(origin);
      if (url.protocol === "http:" || url.protocol === "https:") return { host: url.hostname, origin: url.origin };
    } catch {
      return null;
    }
    return null;
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.protocol === "http:" || url.protocol === "https:") return { host: url.hostname, origin: url.origin };
    } catch {
      return null;
    }
  }
  return null;
}

export function corsHeadersFor(origin: string): CorsHeaders {
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** JSON response with optional CORS headers. API responses are never cached by shared caches. */
export function jsonResponse(data: unknown, status = 200, headers: CorsHeaders = {}, extra: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers, ...extra } });
}

export function emptyResponse(headers: CorsHeaders = {}): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...headers } });
}
