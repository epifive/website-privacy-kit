import { idParam } from "@/lib/db/tenant";
import { orgForRoute } from "@/lib/org-context";
import { consentLogCsv } from "@/lib/privacy/consent";
import { audit, getSite } from "@/lib/privacy/registers";

/** CSV export of one site's consent log with the verified chain head (plan M4/M13; C3-04). Any member may export. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await orgForRoute();
  if (!ctx) return new Response("Sign in first.", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const siteId = idParam((await params).id);
  const site = siteId ? await getSite(ctx.t, siteId) : undefined;
  if (!site) return new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const csv = await consentLogCsv(ctx.t, site.id);
  await audit(ctx.t, ctx.user.id, "consents.export", String(site.id));
  const name = `consent-log-${site.domain.replace(/[^a-z0-9.-]/gi, "")}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
