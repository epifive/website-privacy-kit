import type { Metadata } from "next";
import Link from "next/link";
import { CopyField } from "@/components/dashboard/copy";
import { DashHeader, DTable, DTd, DTh, Empty, LinkTabs, Pager, Panel, Stat } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/field";
import { daysLeft, istDate, REQUEST_TYPES, slaState, type RequestType } from "@/core/rights/model";
import { idParam } from "@/lib/db/tenant";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { listOrgMembers, requireOrg } from "@/lib/org-context";
import { hostedLinks } from "@/lib/privacy/hosted-pages";
import { decryptRequest, listRequests, rightsStats, type InboxFilter } from "@/lib/privacy/rights";
import { baseUrl } from "@/lib/request";
import { SLA_TONE } from "./sla";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.requests.title") };
}

const PER_PAGE = 50;
const STATUS_TABS = ["open", "unverified", "closed", "all"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

/** Rights request inbox (plan M7): filters, SLA badges (Rule 14(3); 90-day cap), assignment. */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ t: tenant, org, user }, t, query, base] = await Promise.all([requireOrg(), getT(), searchParams, baseUrl()]);
  const tab: StatusTab = (STATUS_TABS as readonly string[]).includes(query.status ?? "") ? (query.status as StatusTab) : "open";
  const type = (REQUEST_TYPES as readonly string[]).includes(query.type ?? "") ? (query.type as RequestType) : undefined;
  const assignee = query.assignee === "me" ? user.id : query.assignee === "none" ? "none" : undefined;
  const overdue = query.overdue === "1";
  const ref = (query.ref ?? "").trim().slice(0, 16);
  const page = Math.max(1, idParam(query.page) ?? 1);
  const filter: InboxFilter = { status: tab === "all" ? "all" : tab === "open" ? "open" : tab, type, assignee, overdue, ref: ref || undefined, limit: PER_PAGE, offset: (page - 1) * PER_PAGE };
  const now = new Date();
  const [{ rows, total }, stats, members] = await Promise.all([listRequests(tenant, filter, now), rightsStats(tenant, now), listOrgMembers(tenant)]);
  const memberName = new Map(members.map((m) => [m.userId, m.name]));
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (over: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status: tab, type, assignee: query.assignee, overdue: overdue ? "1" : undefined, ref: ref || undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") params.set(k, String(v));
    return `?${params.toString()}`;
  };
  const hub = hostedLinks(base, org.slug).hub;

  return (
    <>
      <DashHeader title={t("dash.requests.title")} description={t("dash.requests.subtitle", { days: org.response_days })} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("dash.requests.stat.open")} value={stats.open} />
        <Stat label={t("dash.requests.stat.overdue")} value={stats.overdue ? <span className="text-red-600 dark:text-red-400">{stats.overdue}</span> : 0} />
        <Stat label={t("dash.requests.stat.dueSoon")} value={stats.dueSoon} />
        <Stat label={t("dash.requests.stat.unverified")} value={stats.unverified} />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <LinkTabs label={t("dash.requests.tabs")} items={STATUS_TABS.map((s) => ({ href: qs({ status: s, page: undefined }), label: t(`dash.requests.tab.${s}` as MessageKey), active: s === tab }))} />
      </div>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="status" value={tab} />
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("dash.requests.filter.type")}</span>
          <Select name="type" defaultValue={type ?? ""}>
            <option value="">{t("dash.requests.filter.anyType")}</option>
            {REQUEST_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`dash.requests.type.${ty}` as MessageKey)}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("dash.requests.filter.assignee")}</span>
          <Select name="assignee" defaultValue={query.assignee ?? ""}>
            <option value="">{t("dash.requests.filter.anyone")}</option>
            <option value="me">{t("dash.requests.filter.me")}</option>
            <option value="none">{t("dash.requests.filter.unassigned")}</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("dash.requests.filter.ref")}</span>
          <Input name="ref" defaultValue={ref} placeholder="R-XXXX-XXXX" dir="ltr" className="w-40" />
        </label>
        <div className="pb-2">
          <Checkbox name="overdue" value="1" label={t("dash.requests.filter.overdue")} defaultChecked={overdue} />
        </div>
        <button type="submit" className={buttonClass("outline", "md")}>
          {t("dash.requests.filter.apply")}
        </button>
        <Link href="?" className={buttonClass("ghost", "md")}>
          {t("dash.requests.filter.clear")}
        </Link>
      </form>
      {rows.length ? (
        <Panel padded={false}>
          <DTable label={t("dash.requests.title")} minWidth={860}>
            <thead>
              <tr>
                <DTh>{t("dash.requests.col.ref")}</DTh>
                <DTh>{t("dash.requests.col.type")}</DTh>
                <DTh>{t("dash.requests.col.requester")}</DTh>
                <DTh>{t("dash.requests.col.received")}</DTh>
                <DTh>{t("dash.requests.col.due")}</DTh>
                <DTh>{t("dash.requests.col.status")}</DTh>
                <DTh>{t("dash.requests.col.assignee")}</DTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const r = decryptRequest(tenant, row);
                const sla = slaState(row, now);
                const left = daysLeft(row.due_at, now);
                return (
                  <tr key={row.id}>
                    <DTd>
                      <Link href={`/dashboard/requests/${row.id}`} className="font-mono text-sm font-medium hover:text-primary" dir="ltr">
                        {row.ref}
                      </Link>
                    </DTd>
                    <DTd>{t(`dash.requests.type.${row.type}` as MessageKey)}</DTd>
                    <DTd>
                      <span className="font-medium">{r.name}</span>
                      <span className="block text-xs text-muted" dir="ltr">
                        {r.email}
                      </span>
                    </DTd>
                    <DTd className="whitespace-nowrap tabular-nums">{istDate(row.received_at)}</DTd>
                    <DTd className="whitespace-nowrap">
                      <span className="tabular-nums">{istDate(row.due_at)}</span>
                      <span className="mt-1 block">
                        <Badge tone={SLA_TONE[sla]}>
                          {t(`dash.requests.sla.${sla}` as MessageKey)}
                          {sla === "closed" ? null : left >= 0 ? ` · ${t("dash.requests.daysLeft", { count: left })}` : ` · ${t("dash.requests.daysOver", { count: -left })}`}
                        </Badge>
                      </span>
                    </DTd>
                    <DTd>{t(`dash.requests.status.${row.status}` as MessageKey)}</DTd>
                    <DTd>{row.assignee_user_id ? (memberName.get(row.assignee_user_id) ?? "—") : "—"}</DTd>
                  </tr>
                );
              })}
            </tbody>
          </DTable>
          <Pager
            page={page}
            pages={pages}
            href={(p) => qs({ page: p })}
            labels={{ summary: t("dash.requests.summary", { page, pages, count: total }), previous: t("dash.requests.prev"), next: t("dash.requests.next"), nav: t("dash.requests.nav") }}
          />
        </Panel>
      ) : (
        <Empty title={t("dash.requests.empty")}>{t("dash.requests.emptyHint", { url: hub })}</Empty>
      )}
      <Panel title={t("dash.requests.publicPage")} description={t("dash.requests.publicPageHint")} className="mt-6 max-w-3xl">
        <CopyField value={hub} label={t("dash.requests.publicPage")} />
      </Panel>
    </>
  );
}
