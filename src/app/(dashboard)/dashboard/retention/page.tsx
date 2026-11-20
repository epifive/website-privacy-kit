import type { Metadata } from "next";
import Link from "next/link";
import { DashHeader, DTable, DTd, DTh, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { formatPeriod } from "@/core/notice/render";
import { TEMPLATES } from "@/core/notice/templates";
import type { MessageKey } from "@/lib/i18n/messages";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { saveRetentionSettingsAction } from "@/app/actions/dashboard/retention";
import { ActionForm } from "@/components/dashboard/action-form";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Switch } from "@/components/ui/field";
import { istDateTime } from "@/core/breach/model";
import { CONSENT_RETENTION_MIN_DAYS } from "@/core/retention";
import { listRetentionRules } from "@/lib/privacy/registers";
import { ensureRuleTasks, listTasks } from "@/lib/privacy/retention";
import { RetentionForm } from "./retention-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.retention") };
}

export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const [{ org, t: tenant, canWrite }, t, locale, query] = await Promise.all([requireOrg(), getT(), getLocale(), searchParams]);
  const lang = locale.code === "hi" ? "hi" : "en";
  // Plan the next periodic erasure run of each rule (also done by the daily job).
  if (canWrite) await ensureRuleTasks(tenant);
  const [rules, tasks] = await Promise.all([listRetentionRules(tenant), listTasks(tenant, { status: "open" })]);
  const now = new Date().getTime();
  return (
    <>
      <DashHeader title={t("dash.nav.retention")} description={t("dash.retention.subtitle")} />
      {query.deleted ? <Alert tone="success" className="mb-4">{t("dash.deleted")}</Alert> : null}
      {org.third_schedule !== "none" ? <Alert tone="warning" className="mb-4">{t("dash.overview.thirdSchedule")}</Alert> : null}
      {rules.length ? (
        <DTable label={t("dash.nav.retention")} minWidth={640}>
          <thead>
            <tr>
              <DTh>{t("dash.retention.category")}</DTh>
              <DTh>{t("dash.retention.period")}</DTh>
              <DTh>{t("dash.retention.action")}</DTh>
              <DTh>{t("dash.retention.lawRef")}</DTh>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <DTd>
                  <Link href={`/dashboard/retention/${r.id}`} className="font-medium hover:text-primary">
                    {lang === "hi" && r.category_hi ? r.category_hi : r.category}
                  </Link>
                </DTd>
                <DTd>{formatPeriod(r.period_days, TEMPLATES[lang])}</DTd>
                <DTd>{t(`dash.retention.action.${r.action}` as MessageKey)}</DTd>
                <DTd className="text-muted">{r.law_ref}</DTd>
              </tr>
            ))}
          </tbody>
        </DTable>
      ) : null}
      <Panel title={t("dash.tasks.title")} description={t("dash.tasks.subtitle")} className="mt-6" padded={false}>
        {tasks.length ? (
          <DTable label={t("dash.tasks.title")} minWidth={640}>
            <thead>
              <tr>
                <DTh>{t("dash.tasks.task")}</DTh>
                <DTh>{t("dash.tasks.due")}</DTh>
                <DTh>{t("dash.tasks.cutoff")}</DTh>
              </tr>
            </thead>
            <tbody>
              {tasks.map((x) => (
                <tr key={x.id}>
                  <DTd>
                    <Link href={`/dashboard/retention/tasks/${x.id}`} className="font-medium hover:text-primary">
                      {x.title}
                    </Link>
                  </DTd>
                  <DTd className="tabular-nums">
                    {istDateTime(x.due_at)} {Date.parse(x.due_at) < now ? <Badge tone="danger">{t("dash.tasks.overdue")}</Badge> : null}
                  </DTd>
                  <DTd className="text-muted tabular-nums">{x.cutoff_at ? istDateTime(x.cutoff_at) : "—"}</DTd>
                </tr>
              ))}
            </tbody>
          </DTable>
        ) : (
          <p className="p-5 text-sm text-muted">{t("dash.tasks.none")}</p>
        )}
      </Panel>
      <Panel title={t("dash.retention.settings")} className="mt-6 max-w-3xl">
        <ActionForm action={saveRetentionSettingsAction} submit={t("dash.save")} pending={t("dash.saving")} disabled={!canWrite}>
          <Field label={t("dash.retention.consentDays")} htmlFor="consent_retention_days" hint={t("dash.retention.consentDaysHint")}>
            <Input id="consent_retention_days" name="consent_retention_days" type="number" min={CONSENT_RETENTION_MIN_DAYS} max={36500} defaultValue={org.consent_retention_days} className="max-w-32" />
          </Field>
          <Switch name="pre_erasure_notice" defaultChecked={org.pre_erasure_notice === 1} label={t("dash.retention.preErasure")} description={t("dash.retention.preErasureHint")} />
        </ActionForm>
      </Panel>
      {canWrite ? (
        <Panel title={t("dash.retention.add")} description={t("dash.retention.floorNote")} className="mt-6 max-w-3xl">
          <RetentionForm t={t} rule={null} canWrite={canWrite} />
        </Panel>
      ) : null}
    </>
  );
}
