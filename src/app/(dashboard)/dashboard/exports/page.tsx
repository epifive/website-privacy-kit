import type { Metadata } from "next";
import { Download } from "lucide-react";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { buttonClass } from "@/components/ui/button";
import type { MessageKey } from "@/lib/i18n/messages";
import { PRO_URL } from "@/lib/edition";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { listSites } from "@/lib/privacy/registers";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.exports") };
}

const CSVS: Array<[string, MessageKey]> = [
  ["requests", "dash.exports.requests"],
  ["breaches", "dash.exports.breaches"],
  ["vendors", "dash.exports.vendors"],
  ["purposes", "dash.exports.purposes"],
  ["retention", "dash.exports.retention"],
  ["erasure-tasks", "dash.exports.tasks"],
];

/** Exports for audits (plan M13): CSV registers and the JSON proof export. Every export is audited. Data export is never locked. */
export default async function ExportsPage() {
  const [{ t: tenant }, t] = await Promise.all([requireOrg(), getT()]);
  const sites = await listSites(tenant);
  const row = "flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm last:border-0";
  return (
    <>
      <DashHeader title={t("dash.nav.exports")} description={t("dash.exports.subtitle")} />
      <Panel title={t("dash.exports.proof")} description={t("dash.exports.proofHint")} className="max-w-3xl">
        {/* A file download from a route handler, not a page: a plain link is right here. */}
        <a href="/dashboard/exports/proof.json" download className={buttonClass("primary", "md")}>
          <Download aria-hidden className="size-4" />
          {t("dash.exports.downloadProof")}
        </a>
      </Panel>
      <div className="mt-6 grid max-w-5xl gap-6 lg:grid-cols-2">
        <Panel title={t("dash.exports.csv")} padded={false}>
          <ul>
            {CSVS.map(([kind, label]) => (
              <li key={kind} className={row}>
                <span>{t(label)}</span>
                <a href={`/dashboard/exports/${kind}`} className="inline-flex items-center gap-1 font-medium text-primary">
                  <Download aria-hidden className="size-4" /> CSV
                </a>
              </li>
            ))}
            {sites.map((s) => (
              <li key={`site-${s.id}`} className={row}>
                <span>{t("dash.exports.consentLog", { site: s.domain })}</span>
                <a href={`/dashboard/sites/${s.id}/consents/export`} className="inline-flex items-center gap-1 font-medium text-primary">
                  <Download aria-hidden className="size-4" /> CSV
                </a>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t("dash.exports.packPro")} description={t("dash.exports.packProHint")}>
          <a href={PRO_URL} target="_blank" rel="noopener" className="text-sm font-semibold text-primary hover:underline">
            {t("dash.nav.getPro")}
          </a>
        </Panel>
      </div>
      <p className="mt-6 max-w-3xl text-xs text-muted">{t("legal.disclaimerShort")}</p>
    </>
  );
}
