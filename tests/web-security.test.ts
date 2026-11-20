import { describe, expect, it } from "vitest";
import { bearerAuthorized } from "@/lib/cron-auth";
import { rateLimit, rateLimitPeek } from "@/lib/rate-limit";
import { BASELINE_CSP, csrfCheck, isCsrfExempt, isStrictPath, newNonce, strictCsp } from "@/lib/web-security";

/** P7 request protections (plan §7.6): SEC-CSRF-01..03, SEC-CSP-01..02, SEC-RATE-01..02. */

const SELF = "https://privacy.example.com";
const post = (pathname: string, origin: string | null, secFetchSite: string | null = null, extra: Partial<Parameters<typeof csrfCheck>[0]> = {}) =>
  csrfCheck({ method: "POST", pathname, selfOrigin: SELF, origin, secFetchSite, ...extra });

describe("SEC-CSRF cross-site request checks", () => {
  it("SEC-CSRF-01 server actions and forms: same origin passes, other sites are refused", () => {
    expect(post("/dashboard/sites", SELF)).toEqual({ ok: true });
    expect(post("/admin/settings/general", "https://evil.example")).toEqual({ ok: false, reason: "cross-origin" });
    expect(post("/account", "http://privacy.example.com")).toEqual({ ok: false, reason: "cross-origin" });
    expect(post("/login", "https://privacy.example.com.evil.example")).toEqual({ ok: false, reason: "cross-origin" });
    expect(post("/p/clinic/rights", "https://evil.example")).toEqual({ ok: false, reason: "cross-origin" });
    // SITE_URL / WPK_ALLOWED_ORIGINS (e.g. the app answering on an internal host behind a proxy).
    expect(post("/dashboard", SELF, null, { selfOrigin: "http://127.0.0.1:3000", trustedOrigins: [SELF] })).toEqual({ ok: true });
    // Safe methods are never blocked.
    expect(csrfCheck({ method: "GET", pathname: "/admin", selfOrigin: SELF, origin: "https://evil.example", secFetchSite: "cross-site" })).toEqual({ ok: true });
  });

  it("SEC-CSRF-02 without Origin, Fetch Metadata decides; an opaque 'null' origin is refused", () => {
    expect(post("/dashboard", null, "same-origin")).toEqual({ ok: true });
    expect(post("/dashboard", null, "none")).toEqual({ ok: true });
    expect(post("/dashboard", null, "cross-site")).toEqual({ ok: false, reason: "cross-origin" });
    expect(post("/dashboard", null, "same-site")).toEqual({ ok: false, reason: "cross-origin" });
    expect(post("/dashboard", "null", null)).toEqual({ ok: false, reason: "no-origin" });
    // Non-browser clients send neither header and carry no browser cookies.
    expect(post("/p/clinic/rights", null, null)).toEqual({ ok: true });
  });

  it("SEC-CSRF-03 only cross-site APIs are exempt (widget, signed webhooks, bearer jobs)", () => {
    for (const p of ["/api/v1/consent", "/api/v1/sites/pk_abc/config", "/api/v1/cron/run", "/api/v1/maintenance/consent-purge"]) {
      expect(isCsrfExempt(p), p).toBe(true);
      expect(post(p, "https://customer-site.example").ok, p).toBe(true);
    }
    for (const p of ["/api/v1/consentx", "/api/v1/mail/ses-events", "/dashboard", "/api/v1/sites"]) expect(isCsrfExempt(p), p).toBe(false);
  });
});

describe("SEC-CSP content security policy", () => {
  it("SEC-CSP-01 signed-in and sign-in pages get a strict nonce policy; public pages a baseline", () => {
    for (const p of ["/dashboard", "/dashboard/sites/3", "/admin", "/account/security", "/login", "/login/2fa", "/print/breach/4", "/reset-password"]) expect(isStrictPath(p), p).toBe(true);
    for (const p of ["/", "/pricing", "/guides/dpdp-consent-banner", "/p/clinic", "/readiness", "/accounting", "/administrator"]) expect(isStrictPath(p), p).toBe(false);
    const nonce = newNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(newNonce()).not.toBe(nonce);
    const csp = strictCsp(nonce, { https: true });
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(strictCsp(nonce, { dev: true })).toContain("'unsafe-eval'");
  });

  it("SEC-CSP-02 the baseline keeps plugins, <base> and foreign framing out", () => {
    expect(BASELINE_CSP).toContain("object-src 'none'");
    expect(BASELINE_CSP).toContain("base-uri 'self'");
    expect(BASELINE_CSP).toContain("frame-ancestors 'self'");
  });
});

describe("SEC-RATE rate limits", () => {
  it("SEC-RATE-01 fixed-window limiter counts per key", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, 60_000)).toBe(true);
    expect(rateLimit(key, 5, 60_000)).toBe(false);
    expect(rateLimitPeek(key)).toBe(6);
    expect(rateLimit(`${key}:other`, 5, 60_000)).toBe(true);
  });

  it("SEC-RATE-02 job secrets: 20 wrong guesses per address lock that address out, even with the right secret", () => {
    process.env.CRON_SECRET = "cron-secret-for-unit-tests";
    const req = (secret: string, ip: string) => new Request("https://privacy.example.com/api/v1/cron/run", { method: "POST", headers: { authorization: `Bearer ${secret}`, "x-forwarded-for": ip } });
    expect(bearerAuthorized(req("cron-secret-for-unit-tests", "198.51.100.1"), "CRON_SECRET")).toBe(true);
    for (let i = 0; i < 20; i++) expect(bearerAuthorized(req(`wrong-${i}-xxxxxxxxxxxxxxxx`, "198.51.100.2"), "CRON_SECRET")).toBe(false);
    expect(bearerAuthorized(req("cron-secret-for-unit-tests", "198.51.100.2"), "CRON_SECRET")).toBe(false);
    expect(bearerAuthorized(req("cron-secret-for-unit-tests", "198.51.100.3"), "CRON_SECRET")).toBe(true);
    delete process.env.CRON_SECRET;
  });
});
