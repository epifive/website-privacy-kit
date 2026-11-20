import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deletePurposeAction } from "@/app/actions/dashboard/privacy";
import { ActionButton } from "@/components/dashboard/actions";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { idParam } from "@/lib/db/tenant";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { getPurpose, listRetentionRules, listSites, listVendors } from "@/lib/privacy/registers";
import { PurposeForm } from "../purpose-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.purposes") };
}

export default async function EditPurposePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ t: tenant, canWrite }, t, locale, { id }] = await Promise.all([requireOrg(), getT(), getLocale(), params]);
  const purposeId = idParam(id);
  const purpose = purposeId ? await getPurpose(tenant, purposeId) : undefined;
  if (!purpose) notFound();
  const [vendors, rules, sites] = await Promise.all([listVendors(tenant), listRetentionRules(tenant), listSites(tenant)]);
  const lang = locale.code === "hi" ? "hi" : "en";
  return (
    <>
      <DashHeader
        title={lang === "hi" && purpose.name_hi ? purpose.name_hi : purpose.name_en}
        description={t("dash.purposes.subtitle")}
        actions={
          canWrite ? (
            <ActionButton action={deletePurposeAction} fields={{ id: purpose.id }} variant="danger" confirmText={t("dash.confirmDelete")}>
              {t("dash.delete")}
            </ActionButton>
          ) : null
        }
      />
      <Panel className="max-w-4xl">
        <PurposeForm t={t} lang={lang} purpose={purpose} vendors={vendors} rules={rules} sites={sites} canWrite={canWrite} />
      </Panel>
    </>
  );
}
