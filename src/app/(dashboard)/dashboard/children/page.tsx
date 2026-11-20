import type { Metadata } from "next";
import Link from "next/link";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { isChildBlockedPurpose } from "@/core/children";
import { PRO_URL } from "@/lib/edition";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { childPurposes } from "@/lib/privacy/children";
import { listPurposes, listSites } from "@/lib/privacy/registers";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.children") };
}

/**
 * Children mode in the Free edition (plan M10, "age gate only"): the banner asks "18 or older?"
 * first, an under-18 visitor's choices are not recorded and optional purposes stay off. The
 * verifiable parental-consent flow (Rule 10) is part of the Pro edition.
 */
export default async function ChildrenPage() {
  const [{ org, t: tenant }, t] = await Promise.all([requireOrg(), getT()]);
  const [sites, purposes] = await Promise.all([listSites(tenant), listPurposes(tenant)]);
  const on = org.children_mode === 1 || sites.some((s) => s.children_mode === 1);
  const blocked = purposes.filter((p) => p.active === 1 && p.basis === "consent" && isChildBlockedPurpose(p));
  const firstSite = sites.find((s) => !s.archived_at);
  const allowed = firstSite ? await childPurposes(tenant, firstSite.id) : [];
  return (
    <>
      <DashHeader title={t("dash.nav.children")} description={t("dash.children.subtitleFree")} />
      <Alert tone={on ? "info" : "warning"} className="mb-6">
        {on ? t("dash.children.on") : t("dash.children.off")}{" "}
        <Link href="/dashboard/org" className="font-medium underline underline-offset-2">
          {t("dash.nav.org")}
        </Link>
      </Alert>
      {blocked.length ? <p className="mb-6 max-w-3xl text-sm text-muted">{t("dash.children.blocked", { list: blocked.map((p) => p.name_en).join(", ") })}</p> : null}
      <Panel title={t("dash.children.ageGate")}>
        <ul className="list-disc space-y-1.5 ps-5 text-sm">
          <li>{t("dash.children.free1")}</li>
          <li>{t("dash.children.free2")}</li>
          <li>{t("dash.children.free3", { list: allowed.map((p) => p.name_en).join(", ") || "—" })}</li>
        </ul>
      </Panel>
      <Panel title={t("dash.children.proTitle")} className="mt-6">
        <p className="max-w-3xl text-sm text-muted">{t("dash.children.proText")}</p>
        <a href={PRO_URL} target="_blank" rel="noopener" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
          {t("dash.nav.getPro")}
        </a>
      </Panel>
    </>
  );
}
