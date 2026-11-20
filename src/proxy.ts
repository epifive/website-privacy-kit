import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { BASELINE_CSP, BASELINE_HEADERS, csrfCheck, isStrictPath, newNonce, STRICT_HEADERS, strictCsp } from "./lib/web-security";

/**
 * Runs before every request (Node.js runtime, Next.js 16 "proxy"):
 * 1. sends visitors to the web installer until setup is complete, and keeps
 *    the installer closed afterwards;
 * 2. CSRF: refuses cross-site state-changing requests (src/lib/web-security.ts);
 * 3. Content-Security-Policy: a strict nonce-based policy on signed-in and
 *    sign-in pages, a baseline policy elsewhere; plus framing and isolation headers.
 */

let installedCache = false;

function installed(): boolean {
  if (installedCache) return true;
  const storage = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(process.cwd(), "storage");
  installedCache = process.env.APP_INSTALLED === "true" || fs.existsSync(path.join(storage, "installed.lock"));
  return installedCache;
}

function selfOrigin(request: NextRequest): string {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host).split(",")[0].trim();
  const proto = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  return `${proto}://${host}`;
}

const trusted = () => [process.env.SITE_URL ?? "", ...(process.env.WPK_ALLOWED_ORIGINS ?? "").split(",")].map((s) => s.trim()).filter(Boolean);

function withHeaders(response: NextResponse, strict: boolean, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  for (const [k, v] of Object.entries(strict ? STRICT_HEADERS : BASELINE_HEADERS)) response.headers.set(k, v);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isInstaller = pathname === "/install" || pathname.startsWith("/install/");

  if (!installed()) {
    if (isInstaller) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Application is not installed." }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/install", request.url));
  }

  if (isInstaller) return NextResponse.redirect(new URL("/", request.url));

  const csrf = csrfCheck({
    method: request.method,
    pathname,
    selfOrigin: selfOrigin(request),
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    trustedOrigins: trusted(),
  });
  if (!csrf.ok) {
    console.warn(`[csrf] refused ${request.method} ${pathname} from ${request.headers.get("origin") ?? request.headers.get("sec-fetch-site") ?? "?"}`);
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  // The embed runtime, embeddable pages, the widget API and the hosted privacy pages keep their own headers.
  // Hosted privacy pages (/p/{org}/…) send their own stricter policy (default-src 'none'; src/lib/privacy/hosted-pages.ts).
  if (pathname === "/w.js" || pathname === "/w-hi.js" || pathname.startsWith("/api/") || pathname.startsWith("/embed/") || pathname.startsWith("/p/")) return NextResponse.next();

  if (isStrictPath(pathname)) {
    const nonce = newNonce();
    const csp = strictCsp(nonce, { dev: process.env.NODE_ENV === "development", https: selfOrigin(request).startsWith("https:") });
    // Next.js reads the nonce from the request's CSP header and puts it on its own scripts; layouts read x-nonce.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    return withHeaders(NextResponse.next({ request: { headers: requestHeaders } }), true, csp);
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-nonce");
  return withHeaders(NextResponse.next({ request: { headers: requestHeaders } }), false, BASELINE_CSP);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
