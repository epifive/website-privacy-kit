/**
 * Request-level protections applied in src/proxy.ts (plan §7.6). Pure
 * functions without Next.js or database imports, so the proxy stays small and
 * the rules are unit-tested (tests/web-security.test.ts).
 *
 * CSRF: every state-changing request (POST, PUT, PATCH, DELETE) must come
 * from this site: the Origin header (or, when a browser sends none,
 * Sec-Fetch-Site) must match the request's own origin, SITE_URL or an origin
 * in WPK_ALLOWED_ORIGINS. Server Actions, account and admin forms and the
 * hosted /p pages are covered. Only endpoints meant to be called from other
 * sites or servers are exempt: the widget API (its own per-site origin
 * allow-list), signed gateway and SNS webhooks, and bearer-secret jobs.
 * Session cookies are also SameSite=Lax.
 *
 * CSP: signed-in and sign-in pages get a strict policy with a per-request
 * nonce ('strict-dynamic'; no inline or third-party scripts without it).
 * Public pages keep a baseline policy (no plugins, no <base>, framing only by
 * this site) so the admin's analytics snippet and Turnstile keep working.
 * The embed runtime (w.js) and the widget API are unchanged.
 */

export const CSRF_EXEMPT_PREFIXES = [
  "/api/v1/consent", // widget: per-site origin allow-list (src/lib/cors.ts)
  "/api/v1/sites/", // widget config
  "/api/v1/cron/", // bearer secret (CRON_SECRET)
  "/api/v1/maintenance/", // bearer secret (WPK_MAINTENANCE_SECRET)
] as const;

export const STRICT_CSP_PREFIXES = ["/dashboard", "/admin", "/account", "/login", "/forgot-password", "/reset-password", "/print"] as const;

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** "/a/" matches everything below /a/; "/a" matches /a and everything below it. */
function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
}

export function isStrictPath(pathname: string): boolean {
  return matches(pathname, STRICT_CSP_PREFIXES);
}

export function isCsrfExempt(pathname: string): boolean {
  return matches(pathname, CSRF_EXEMPT_PREFIXES);
}

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export interface CsrfInput {
  method: string;
  pathname: string;
  /** The request's own origin as the app sees it (proto + host, from X-Forwarded-* when behind a proxy). */
  selfOrigin: string;
  origin: string | null;
  secFetchSite: string | null;
  /** SITE_URL and WPK_ALLOWED_ORIGINS. */
  trustedOrigins?: string[];
}

export type CsrfDecision = { ok: true } | { ok: false; reason: "cross-origin" | "no-origin" };

export function csrfCheck(input: CsrfInput): CsrfDecision {
  if (!UNSAFE.has(input.method.toUpperCase()) || isCsrfExempt(input.pathname)) return { ok: true };
  const allowed = new Set([originOf(input.selfOrigin), ...(input.trustedOrigins ?? []).map(originOf)].filter((o): o is string => Boolean(o)));
  if (input.origin && input.origin !== "null") return allowed.has(originOf(input.origin) ?? "") ? { ok: true } : { ok: false, reason: "cross-origin" };
  // No Origin (or "null", e.g. from a sandboxed frame): rely on Fetch Metadata, which every current browser sends.
  const site = (input.secFetchSite ?? "").toLowerCase();
  if (site === "same-origin" || site === "none") return { ok: true };
  if (site) return { ok: false, reason: "cross-origin" };
  // Neither header: not a browser (curl, server-to-server). Without the browser's cookies this can't be CSRF.
  return input.origin === "null" ? { ok: false, reason: "no-origin" } : { ok: true };
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function strictCsp(nonce: string, opts: { dev?: boolean; https?: boolean } = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by the UI (meters, print layout); scripts stay strict.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${opts.dev ? " ws: wss:" : ""}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(opts.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Headers for public pages (besides BASELINE_CSP). */
export const BASELINE_HEADERS: Record<string, string> = { "X-Frame-Options": "SAMEORIGIN" };

/** Public pages: no script restrictions (admin analytics, Turnstile), but no plugins, no <base> and framing only by this site. */
export const BASELINE_CSP = "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'";

export const STRICT_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};
