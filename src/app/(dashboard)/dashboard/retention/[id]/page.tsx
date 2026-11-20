import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteRetentionAction } from "@/app/actions/dashboard/privacy";
import { ActionButton } from "@/components/dashboard/actions";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { idParam } from "@/lib/db/tenant";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { getRetentionRule } from "@/lib/privacy/registers";
import { RetentionForm } from "../retention-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.retention") };
}

export default async function EditRetentionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ t: tenant, canWrite }, t, { id }] = await Promise.all([requireOrg(), getT(), params]);
  const ruleId = idParam(id);
  const rule = ruleId ? await getRetentionRule(tenant, ruleId) : undefined;
  if (!rule) notFound();
  return (
    <>
      <DashHeader
        title={rule.category}
        description={t("dash.retention.floorNote")}
        actions={
          canWrite ? (
            <ActionButton action={deleteRetentionAction} fields={{ id: rule.id }} variant="danger" confirmText={t("dash.confirmDelete")}>
              {t("dash.delete")}
            </ActionButton>
          ) : null
        }
      />
      <Panel className="max-w-3xl">
        <RetentionForm t={t} rule={rule} canWrite={canWrite} />
      </Panel>
    </>
  );
}
