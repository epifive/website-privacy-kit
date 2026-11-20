import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { BreachClock } from "@/components/dashboard/clock";
import { DashHeader, DTable, DTd, DTh, Empty, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { istDateTime } from "@/core/breach/model";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { breachAlerts, listBreaches, viewBreach } from "@/lib/privacy/breaches";
import { BreachForm } from "./breach-form";
import { TIMER_TONE } from "./tones";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.breaches") };
}

/** Breach register (plan M8; B1–B4). Every incident, on every plan: s.2(u) has no threshold (B3-01). */
export default async function BreachesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [{ t: tenant, canWrite }, t, query] = await Promise.all([requireOrg(), getT(), searchParams]);
  const status = query.status === "closed" ? "closed" : query.status === "all" ? "all" : "open";
  const now = new Date();
  const [rows, alerts] = await Promise.all([listBreaches(tenant, { status }), breachAlerts(tenant, now)]);
  const tab = (value: string, label: MessageKey) => (
    <Link
      href={value === "open" ? "/dashboard/breaches" : `/dashboard/breaches?status=${value}`}
      aria-current={status === value ? "page" : undefined}
      className={status === value ? "rounded-lg bg-primary-soft px-3 py-1.5 font-medium text-primary" : "rounded-lg px-3 py-1.5 text-muted hover:text-ink"}
    >
      {t(label)}
    </Link>
  );
  return (
    <>
      <DashHeader title={t("dash.nav.breaches")} description={t("dash.breaches.subtitle")} />
      {alerts.some((a) => a.worst === "overdue" || a.worst === "due_soon") ? (
        <Alert tone="error" className="mb-4">
          {t("dash.breaches.alertCount", { count: alerts.filter((a) => a.worst === "overdue" || a.worst === "due_soon").length })}
        </Alert>
      ) : null}
      <Alert tone="info" className="mb-6">
        {t("dash.breaches.everyIncident")}
      </Alert>
      <nav className="mb-3 flex gap-1 text-sm" aria-label={t("dash.breaches.filter")}>
        {tab("open", "dash.breaches.tab.open")}
        {tab("closed", "dash.breaches.tab.closed")}
        {tab("all", "dash.breaches.tab.all")}
      </nav>
      <Panel padded={false}>
        {rows.length ? (
          <DTable label={t("dash.nav.breaches")} minWidth={760}>
            <thead>
              <tr>
                <DTh>{t("dash.breaches.col.ref")}</DTh>
                <DTh>{t("dash.breaches.f.title")}</DTh>
                <DTh>{t("dash.breaches.f.awareAt")}</DTh>
                <DTh>{t("dash.breaches.col.next")}</DTh>
                <DTh>{t("dash.breaches.col.status")}</DTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const v = viewBreach(row, now);
                const next = v.timers.filter((x) => x.state !== "done" && x.state !== "not_applicable").sort((a, b) => (a.remainingMs ?? Infinity) - (b.remainingMs ?? Infinity))[0];
                return (
                  <tr key={row.id}>
                    <DTd className="font-mono text-xs">
                      <Link href={`/dashboard/breaches/${row.id}`} className="hover:text-primary">
                        {row.ref}
                      </Link>
                    </DTd>
                    <DTd>
                      <Link href={`/dashboard/breaches/${row.id}`} className="font-medium hover:text-primary">
                        {row.title}
                      </Link>
                    </DTd>
                    <DTd className="text-muted tabular-nums">{istDateTime(row.aware_at)}</DTd>
                    <DTd>
                      {row.status !== "closed" && next ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <Badge tone={TIMER_TONE[next.state]}>{t(`dash.breaches.timer.${next.key}` as MessageKey)}</Badge>
                          <span className="text-xs">
                            <BreachClock since={next.startAt} due={next.dueAt} serverNow={now.getTime()} />
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </DTd>
                    <DTd>
                      <Badge tone={row.status === "closed" ? "neutral" : "primary"}>{t(`dash.breaches.status.${row.status}` as MessageKey)}</Badge>
                    </DTd>
                  </tr>
                );
              })}
            </tbody>
          </DTable>
        ) : (
          <Empty icon={<ShieldAlert />} title={t("dash.breaches.empty")}>
            {t("dash.breaches.emptyHint")}
          </Empty>
        )}
      </Panel>
      {canWrite ? (
        <Panel title={t("dash.breaches.new")} description={t("dash.breaches.newHint")} className="mt-6 max-w-3xl">
          <BreachForm t={t} row={null} details={null} canWrite={canWrite} />
        </Panel>
      ) : null}
      <p className="mt-6 max-w-3xl text-xs text-muted">{t("dash.breaches.legalNote")}</p>
    </>
  );
}
