import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { DashHeader, DTable, DTd, DTh, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { listSites } from "@/lib/privacy/registers";
import { SiteForm } from "./site-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.sites") };
}

export default async function SitesPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const [{ t: tenant, canWrite }, t, query] = await Promise.all([requireOrg(), getT(), searchParams]);
  const sites = await listSites(tenant);
  return (
    <>
      <DashHeader title={t("dash.nav.sites")} description={t("dash.sites.subtitle")} />
      {query.deleted ? <Alert tone="success" className="mb-4">{t("dash.deleted")}</Alert> : null}
      {sites.length ? (
        <DTable label={t("dash.nav.sites")} minWidth={560}>
          <thead>
            <tr>
              <DTh>{t("dash.sites.name")}</DTh>
              <DTh>{t("dash.sites.domain")}</DTh>
              <DTh>{t("dash.sites.publicKey")}</DTh>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id}>
                <DTd>
                  <Link href={`/dashboard/sites/${s.id}`} className="font-medium hover:text-primary">
                    {s.name}
                  </Link>
                  {s.archived_at ? (
                    <Badge tone="neutral" className="ms-2">
                      {t("dash.sites.archivedBadge")}
                    </Badge>
                  ) : null}
                </DTd>
                <DTd>
                  <span dir="ltr">{s.domain}</span>
                </DTd>
                <DTd>
                  <code className="text-xs" dir="ltr">
                    {s.public_key}
                  </code>
                </DTd>
              </tr>
            ))}
          </tbody>
        </DTable>
      ) : null}
      {canWrite ? (
        <Panel title={t("dash.sites.add")} description={t("dash.sites.bannerLater")} className="mt-6 max-w-3xl">
          <SiteForm t={t} site={null} canWrite={canWrite} />
        </Panel>
      ) : null}
    </>
  );
}
