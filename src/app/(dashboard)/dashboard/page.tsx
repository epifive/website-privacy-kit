import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import { DashHeader, Panel, Stat } from "@/components/dashboard/ui";
import { UsagePanel } from "@/components/dashboard/usage";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { deriveFlags } from "@/core/questionnaire";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { getUsageMeter, requireOrg } from "@/lib/org-context";
import { listNoticeVersions } from "@/lib/privacy/notices";
import { breachAlerts } from "@/lib/privacy/breaches";
import { rightsStats } from "@/lib/privacy/rights";
import { getContacts, listPurposes, listRetentionRules, listSites, listVendors, vendorsWithoutContract } from "@/lib/privacy/registers";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.overview.title") };
}

export default async function DashboardHome() {
  const [{ user, org, t: tenant }, t] = await Promise.all([requireOrg(), getT()]);
  const [contacts, purposes, vendors, rules, sites, versions, requests, breaches, meter] = await Promise.all([
    getContacts(tenant),
    listPurposes(tenant),
    listVendors(tenant),
    listRetentionRules(tenant),
    listSites(tenant),
    listNoticeVersions(tenant),
    rightsStats(tenant),
    breachAlerts(tenant),
    getUsageMeter(org.id),
  ]);
  const noContract = vendorsWithoutContract(vendors);
  const flags = deriveFlags({ third_schedule: org.third_schedule as "none", is_sdf: false });
  const steps: Array<{ done: boolean; label: MessageKey; href: string }> = [
    { done: Boolean(org.legal_name && org.goods_services_en && org.goods_services_hi), label: "dash.check.business", href: "/dashboard/setup?step=1" },
    { done: Boolean(contacts.grievance), label: "dash.check.contact", href: "/dashboard/contacts" },
    { done: purposes.some((p) => p.active === 1), label: "dash.check.purposes", href: "/dashboard/purposes" },
    { done: vendors.length > 0 && noContract.length === 0, label: "dash.check.vendors", href: "/dashboard/vendors" },
    { done: rules.length > 0, label: "dash.check.retention", href: "/dashboard/retention" },
    { done: versions.length > 0, label: "dash.check.notice", href: "/dashboard/notices" },
    { done: sites.length > 0, label: "dash.check.site", href: "/dashboard/sites" },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <>
      <DashHeader
        title={t("dash.overview.hello", { name: user.name })}
        description={t("dash.overview.orgLine", { org: org.name })}
        actions={<ButtonLink href="/dashboard/setup?step=1">{t("dash.overview.openWizard")}</ButtonLink>}
      />
      {flags.thirdSchedule ? (
        <Alert tone="warning" className="mb-6">
          {t("dash.overview.thirdSchedule")}
        </Alert>
      ) : null}
      {requests.overdue ? (
        <Alert tone="error" className="mb-6">
          <Link href="/dashboard/requests?overdue=1" className="font-medium underline underline-offset-2">
            {t("dash.overview.overdueRequests", { count: requests.overdue })}
          </Link>
        </Alert>
      ) : null}
      {breaches.length ? (
        <Alert tone={breaches.some((b) => b.worst === "overdue") ? "error" : "warning"} className="mb-6">
          <Link href={breaches.length === 1 ? `/dashboard/breaches/${breaches[0].id}` : "/dashboard/breaches"} className="font-medium underline underline-offset-2">
            {t("dash.overview.openBreaches", { count: breaches.length })}
          </Link>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label={t("dash.nav.purposes")} value={purposes.filter((p) => p.active === 1).length} />
        <Stat label={t("dash.nav.vendors")} value={vendors.length} hint={noContract.length ? t("dash.vendors.noContractCount", { count: noContract.length }) : undefined} />
        <Stat label={t("dash.nav.retention")} value={rules.length} />
        <Stat label={t("dash.overview.noticeVersion")} value={versions[0] ? `v${versions[0].version}` : "—"} />
        <Stat label={t("dash.overview.openRequests")} value={<Link href="/dashboard/requests" className="hover:text-primary">{requests.open}</Link>} />
      </div>
      <Panel title={t("dash.overview.checklist", { done, total: steps.length })} className="mt-6" padded={false}>
        <ul className="divide-y divide-line">
          {steps.map((s) => (
            <li key={s.label}>
              <Link href={s.href} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-paper">
                {s.done ? <CircleCheck className="size-5 shrink-0 text-primary" aria-label={t("dash.done")} /> : <CircleDashed className="size-5 shrink-0 text-muted" aria-label={t("dash.todo")} />}
                <span className={s.done ? "text-muted" : "font-medium"}>{t(s.label)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
      <UsagePanel meter={meter} t={t} className="mt-6" />
      <p className="mt-6 flex max-w-3xl gap-2 text-xs leading-relaxed text-muted">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {t("legal.disclaimer")}
      </p>
    </>
  );
}
