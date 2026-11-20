import type { Metadata } from "next";
import Link from "next/link";
import { DashHeader, DTable, DTd, DTh, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { listVendors, vendorsWithoutContract } from "@/lib/privacy/registers";
import { VendorForm } from "./vendor-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.vendors") };
}

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const [{ t: tenant, canWrite }, t, query] = await Promise.all([requireOrg(), getT(), searchParams]);
  const vendors = await listVendors(tenant);
  const missing = new Set(vendorsWithoutContract(vendors).map((v) => v.id));
  return (
    <>
      <DashHeader title={t("dash.nav.vendors")} description={t("dash.vendors.subtitle")} />
      {query.deleted ? <Alert tone="success" className="mb-4">{t("dash.deleted")}</Alert> : null}
      {missing.size ? <Alert tone="warning" className="mb-4">{t("dash.vendors.noContractWarning", { count: missing.size })}</Alert> : null}
      {vendors.length ? (
        <DTable label={t("dash.nav.vendors")} minWidth={640}>
          <thead>
            <tr>
              <DTh>{t("dash.vendors.name")}</DTh>
              <DTh>{t("dash.vendors.location")}</DTh>
              <DTh>{t("dash.vendors.contract")}</DTh>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id}>
                <DTd>
                  <Link href={`/dashboard/vendors/${v.id}`} className="font-medium hover:text-primary">
                    {v.name}
                  </Link>
                  <p className="text-xs text-muted">{v.service}</p>
                </DTd>
                <DTd>{v.location === "abroad" ? t("dash.vendors.abroad") : t("dash.vendors.india")}</DTd>
                <DTd>
                  <Badge tone={missing.has(v.id) ? "warning" : "success"}>{t(`dash.vendors.contract.${v.contract_status}` as MessageKey)}</Badge>
                  {v.contract_status === "signed" && !v.security_clause ? <span className="ms-2 text-xs text-muted">{t("dash.vendors.noSecurityClause")}</span> : null}
                </DTd>
              </tr>
            ))}
          </tbody>
        </DTable>
      ) : null}
      {canWrite ? (
        <Panel title={t("dash.vendors.add")} className="mt-6 max-w-3xl">
          <VendorForm t={t} vendor={null} canWrite={canWrite} />
        </Panel>
      ) : null}
    </>
  );
}
