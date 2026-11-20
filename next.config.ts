import type { NextConfig } from "next";

// Plan §7.6. Framing and Content-Security-Policy are set per page by src/proxy.ts (strict with nonces on
// signed-in pages); HSTS only matters over HTTPS, where browsers honour it.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native / server-only packages that must not be bundled.
  serverExternalPackages: ["mysql2", "nodemailer"],
  // SEO guides are Markdown files read at request time (src/lib/guides.ts).
  outputFileTracingIncludes: { "/**": ["./content/guides/**/*.md"] },
  experimental: {
    serverActions: {
      // Logo / favicon uploads from the admin panel.
      bodySizeLimit: "5mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // Everything except /embed/* may only be framed by this site.
      { source: "/:path((?!embed/).*)", headers: securityHeaders },
      // The embed runtime and its Hindi chunk: short cache so updates reach every site quickly.
      ...["/w.js", "/w-hi.js"].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      })),
      // Embeddable pages (reserved for the hosted privacy page) are meant to be shown in iframes on customer sites.
      {
        source: "/embed/:path*",
        headers: [...securityHeaders, { key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
