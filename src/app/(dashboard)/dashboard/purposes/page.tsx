import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DashHeader, DTable, DTd, DTh, Empty } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { dataItemLabel, parseDataItems } from "@/core/data-items";
import type { MessageKey } from "@/lib/i18n/messages";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { listPurposes } from "@/lib/privacy/registers";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.purposes") };
}

export default async function PurposesPage({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string }> }) {
  const [{ t: tenant, canWrite }, t, locale, query] = await Promise.all([requireOrg(), getT(), getLocale(), searchParams]);
  const lang = locale.code === "hi" ? "hi" : "en";
  const purposes = await listPurposes(tenant);
  return (
    <>
      <DashHeader
        title={t("dash.nav.purposes")}
        description={t("dash.purposes.subtitle")}
        actions={canWrite ? <ButtonLink href="/dashboard/purposes/new"><Plus className="size-4" aria-hidden />{t("dash.purposes.add")}</ButtonLink> : null}
      />
      {query.saved ? <Alert tone="success" className="mb-4">{t("dash.saved")}</Alert> : null}
      {query.deleted ? <Alert tone="success" className="mb-4">{t("dash.deleted")}</Alert> : null}
      {purposes.length ? (
        <DTable label={t("dash.nav.purposes")} minWidth={720}>
          <thead>
            <tr>
              <DTh>{t("dash.purposes.name")}</DTh>
              <DTh>{t("dash.purposes.items")}</DTh>
              <DTh>{t("dash.purposes.basis")}</DTh>
              <DTh>{t("dash.purposes.status")}</DTh>
            </tr>
          </thead>
          <tbody>
            {purposes.map((p) => (
              <tr key={p.id}>
                <DTd>
                  <Link href={`/dashboard/purposes/${p.id}`} className="font-medium hover:text-primary">
                    {lang === "hi" && p.name_hi ? p.name_hi : p.name_en}
                  </Link>
                  {p.is_tracking ? <Badge tone="warning" className="ms-2">{t("dash.purposes.trackingBadge")}</Badge> : null}
                </DTd>
                <DTd className="text-muted">{parseDataItems(p.data_items).map((i) => dataItemLabel(i, lang)).join(", ")}</DTd>
                <DTd>{t(`dash.basis.${p.basis}` as MessageKey)}</DTd>
                <DTd>{p.active ? <Badge tone="success">{t("dash.active")}</Badge> : <Badge>{t("dash.inactive")}</Badge>}</DTd>
              </tr>
            ))}
          </tbody>
        </DTable>
      ) : (
        <Empty title={t("dash.purposes.emptyTitle")} action={<ButtonLink href="/dashboard/setup?step=3">{t("dash.purposes.fromPreset")}</ButtonLink>}>
          {t("dash.purposes.emptyText")}
        </Empty>
      )}
    </>
  );
}
