import type { Metadata } from "next";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { listRetentionRules, listSites, listVendors } from "@/lib/privacy/registers";
import { PurposeForm } from "../purpose-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.purposes.add") };
}

export default async function NewPurposePage() {
  const [{ t: tenant, canWrite }, t, locale] = await Promise.all([requireOrg(), getT(), getLocale()]);
  const [vendors, rules, sites] = await Promise.all([listVendors(tenant), listRetentionRules(tenant), listSites(tenant)]);
  return (
    <>
      <DashHeader title={t("dash.purposes.add")} description={t("dash.purposes.subtitle")} />
      <Panel className="max-w-4xl">
        <PurposeForm t={t} lang={locale.code === "hi" ? "hi" : "en"} purpose={null} vendors={vendors} rules={rules} sites={sites} canWrite={canWrite} />
      </Panel>
    </>
  );
}
