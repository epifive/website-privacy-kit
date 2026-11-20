import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteVendorAction } from "@/app/actions/dashboard/privacy";
import { ActionButton } from "@/components/dashboard/actions";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { idParam } from "@/lib/db/tenant";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { getVendor } from "@/lib/privacy/registers";
import { VendorForm } from "../vendor-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.vendors") };
}

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ t: tenant, canWrite }, t, { id }] = await Promise.all([requireOrg(), getT(), params]);
  const vendorId = idParam(id);
  const vendor = vendorId ? await getVendor(tenant, vendorId) : undefined;
  if (!vendor) notFound();
  return (
    <>
      <DashHeader
        title={vendor.name}
        description={t("dash.vendors.subtitle")}
        actions={canWrite ? <ActionButton action={deleteVendorAction} fields={{ id: vendor.id }} variant="danger" confirmText={t("dash.confirmDelete")}>{t("dash.delete")}</ActionButton> : null}
      />
      <Panel className="max-w-3xl">
        <VendorForm t={t} vendor={vendor} canWrite={canWrite} />
      </Panel>
    </>
  );
}
