import { orgForRoute } from "@/lib/org-context";
import { breachRegisterCsv } from "@/lib/privacy/breaches";
import { buildProofJson, exportFilename, purposesCsv, requestsRegisterCsv, vendorsCsv } from "@/lib/privacy/exports";
import { audit } from "@/lib/privacy/registers";
import { erasureTasksCsv, retentionScheduleCsv } from "@/lib/privacy/retention";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Exports for audits (plan M13): each register as CSV and the proof export
 * (notice hashes and consent-chain verification) as JSON. Any member of the current organisation may export (viewers included);
 * every export is written to the audit log. Consent logs per site are at
 * /dashboard/sites/{id}/consents/export.
 */

const CSV: Record<string, (t: TenantDb) => Promise<string>> = {
  requests: requestsRegisterCsv,
  breaches: breachRegisterCsv,
  vendors: vendorsCsv,
  purposes: purposesCsv,
  retention: retentionScheduleCsv,
  "erasure-tasks": erasureTasksCsv,
};

const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await orgForRoute();
  if (!ctx) return text("Sign in first.", 401);
  const { kind } = await params;
  const org = await ctx.t.org();
  if (!org) return text("Not found.", 404);
  if (kind === "proof.json") {
    const body = await buildProofJson(ctx.t);
    await audit(ctx.t, ctx.user.id, "register.export", kind);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(org.slug, "proof", "json")}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const make = CSV[kind];
  if (!make) return text("Not found.", 404);
  const body = await make(ctx.t);
  await audit(ctx.t, ctx.user.id, "register.export", kind);
  return new Response(String.fromCharCode(0xfeff) + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(org.slug, kind, "csv")}"`,
      "Cache-Control": "no-store",
    },
  });
}
