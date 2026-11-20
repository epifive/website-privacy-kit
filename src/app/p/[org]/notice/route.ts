import { renderStandaloneHtml } from "@/core/notice/render";
import type { Lang } from "@/core/notice/templates";
import { getDb } from "@/lib/db";
import { idParam, tenantDb } from "@/lib/db/tenant";
import { getNoticeVersion } from "@/lib/privacy/notices";
import { getOrgBySlug } from "@/lib/privacy/orgs";

/**
 * Public, standalone notice page (Rule 3(a), 3(c)): /p/{org}/notice?lang=hi&v=2.
 * Serves the stored, immutable Markdown of the latest (or requested) version
 * as a self-contained HTML page with no scripts or external resources.
 * The hub (/p/{org}) links here, to the rights form and to the withdraw page.
 */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const url = new URL(request.url);
  const lang: Lang = url.searchParams.get("lang") === "hi" ? "hi" : "en";
  const version = idParam(url.searchParams.get("v")) ?? undefined;
  const db = await getDb();
  const org = await getOrgBySlug(db, slug);
  const row = org ? await getNoticeVersion(tenantDb(db, org.id), lang, version) : undefined;
  if (!org || !row) return new Response("Notice not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const other: Lang = lang === "en" ? "hi" : "en";
  const html = renderStandaloneHtml(
    { lang, title: row.title, bodyMd: row.body_md, sha256: row.sha256 },
    { lang: other, href: `?lang=${other}${version ? `&v=${version}` : ""}` },
  );
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      "X-Notice-Version": String(row.version),
      "X-Notice-Sha256": row.sha256,
      ETag: `"${row.sha256}"`,
    },
  });
}
