import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { preNoticeSentAction, reopenTaskAction, signOffTaskAction } from "@/app/actions/dashboard/retention";
import { ActionForm } from "@/components/dashboard/action-form";
import { ActionButton } from "@/components/dashboard/actions";
import { CopyButton } from "@/components/dashboard/copy";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { istDateTime, utcToIstLocal } from "@/core/breach/model";
import { signOffBlock } from "@/core/retention";
import { idParam } from "@/lib/db/tenant";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { listOrgMembers, requireOrg } from "@/lib/org-context";
import { getTask, taskTexts } from "@/lib/privacy/retention";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.tasks.title") };
}

/** One erasure task: what to erase, the optional pre-erasure notice, the processor instruction and the sign-off (plan M9; E1–E3). */
export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ t: tenant, canWrite }, t, { id }, query] = await Promise.all([requireOrg(), getT(), params, searchParams]);
  const taskId = idParam(id);
  const task = taskId ? await getTask(tenant, taskId) : undefined;
  if (!task) notFound();
  const lang = query.lang === "hi" ? "hi" : "en";
  const [texts, members] = await Promise.all([taskTexts(tenant, task, lang), listOrgMembers(tenant)]);
  const block = signOffBlock(task, new Date());
  const who = task.signed_off_by ? (members.find((m) => m.userId === task.signed_off_by)?.name ?? `#${task.signed_off_by}`) : "—";
  const fact = (label: string, value: ReactNode) => (
    <div className="flex flex-wrap justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
  const text = (title: string, body: { subject: string; text: string }) => (
    <div className="py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <CopyButton text={`${body.subject}\n\n${body.text}`} />
      </div>
      <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-paper p-3 text-xs whitespace-pre-wrap">{`${body.subject}\n\n${body.text}`}</pre>
    </div>
  );
  return (
    <>
      <DashHeader
        title={task.title}
        description={<Badge tone={task.status === "open" ? "primary" : "neutral"}>{t(`dash.tasks.status.${task.status}` as MessageKey)}</Badge>}
        actions={
          canWrite && task.status !== "open" ? (
            <ActionButton action={reopenTaskAction} fields={{ id: task.id }}>
              {t("dash.tasks.reopen")}
            </ActionButton>
          ) : null
        }
      />
      <p className="mb-4 text-sm">
        <Link href={task.request_id ? `/dashboard/requests/${task.request_id}` : "/dashboard/retention"} className="text-muted hover:text-primary">
          ← {t(task.request_id ? "dash.tasks.backRequest" : "dash.tasks.backRetention")}
        </Link>
      </p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title={t("dash.tasks.what")}>
            <dl>
              {fact(t("dash.tasks.due"), istDateTime(task.due_at))}
              {task.cutoff_at ? fact(t("dash.tasks.cutoff"), istDateTime(task.cutoff_at)) : null}
              {task.is_logs ? fact(t("dash.retention.isLogs"), t("dash.tasks.logsYes")) : null}
              {task.pre_notice_at ? fact(t("dash.tasks.preNoticeAt"), istDateTime(task.pre_notice_at)) : null}
              {task.pre_notice_at ? fact(t("dash.tasks.preNoticeSent"), istDateTime(task.pre_notice_sent_at)) : null}
              {task.status !== "open" ? fact(t("dash.tasks.signedBy"), `${who} · ${istDateTime(task.signed_off_at)}`) : null}
              {task.sign_off_note ? fact(t("dash.tasks.note"), task.sign_off_note) : null}
            </dl>
            <p className="mt-3 text-xs text-muted">{t(task.request_id ? "dash.tasks.requestHint" : "dash.tasks.ruleHint")}</p>
          </Panel>
          {texts?.preNotice || texts?.processor ? (
            <Panel
              title={t("dash.tasks.texts")}
              actions={
                <span className="flex gap-2 text-sm">
                  <Link href="?lang=en" className={lang === "en" ? "font-semibold text-primary" : "text-muted"}>
                    English
                  </Link>
                  <Link href="?lang=hi" lang="hi" className={lang === "hi" ? "font-semibold text-primary" : "text-muted"}>
                    हिन्दी
                  </Link>
                </span>
              }
            >
              <Badge tone="warning">{t("legal.draftTemplates")}</Badge>
              {texts.preNotice ? text(t("dash.tasks.preNoticeText"), texts.preNotice) : null}
              {texts.processor ? text(t("dash.tasks.processorText", { vendor: texts.vendor?.name ?? "" }), texts.processor) : null}
              {texts.vendor?.erasure_contact ? <p className="text-sm">{t("dash.tasks.erasureContact", { contact: texts.vendor.erasure_contact })}</p> : null}
            </Panel>
          ) : null}
        </div>
        <div className="space-y-6">
          {task.status === "open" && canWrite ? (
            <>
              {task.pre_notice_at && !task.pre_notice_sent_at ? (
                <Panel title={t("dash.tasks.preNoticeSent")}>
                  <ActionForm action={preNoticeSentAction} hidden={{ id: task.id }} submit={t("dash.breaches.markDone")} pending={t("dash.saving")}>
                    <Input name="at" type="datetime-local" defaultValue={utcToIstLocal(new Date().toISOString())} aria-label={t("dash.breaches.doneAt")} required />
                  </ActionForm>
                </Panel>
              ) : null}
              <Panel title={t("dash.tasks.signOff")}>
                {block ? (
                  <Alert tone="warning" className="mb-4">
                    {t(`dash.tasks.block.${block}` as MessageKey)}
                  </Alert>
                ) : null}
                <ActionForm action={signOffTaskAction} hidden={{ id: task.id }} submit={t("dash.tasks.signOff")} pending={t("dash.saving")}>
                  <Field label={t("dash.tasks.outcome")} htmlFor="status">
                    <Select id="status" name="status" defaultValue={block ? "skipped" : "done"}>
                      <option value="done">{t("dash.tasks.status.done")}</option>
                      <option value="skipped">{t("dash.tasks.status.skipped")}</option>
                    </Select>
                  </Field>
                  <Field label={t("dash.tasks.note")} htmlFor="note" hint={t("dash.tasks.noteHint")}>
                    <Textarea id="note" name="note" rows={3} maxLength={600} />
                  </Field>
                </ActionForm>
              </Panel>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
