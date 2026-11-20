import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  breachChecklistAction,
  breachEmailAction,
  breachEvidenceAction,
  breachExtensionAction,
  breachManualAction,
  breachRecipientsAction,
  breachStatusAction,
  markBreachStepAction,
} from "@/app/actions/dashboard/breaches";
import { ActionForm } from "@/components/dashboard/action-form";
import { ActionButton } from "@/components/dashboard/actions";
import { BreachClock } from "@/components/dashboard/clock";
import { CopyButton } from "@/components/dashboard/copy";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { CHECKLIST_KEYS, istDateTime, utcToIstLocal, type Timer } from "@/core/breach/model";
import { idParam } from "@/lib/db/tenant";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { listOrgMembers, requireOrg } from "@/lib/org-context";
import { breachTemplates, getBreach, listBreachEvents, listRecipients, recipientStats, viewBreach } from "@/lib/privacy/breaches";
import { BreachForm } from "../breach-form";
import { TIMER_TONE } from "../tones";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.breaches") };
}

const BASIS: Record<Timer["key"], MessageKey> = {
  certin: "dash.breaches.basis.certin",
  board_initial: "dash.breaches.basis.board_initial",
  board_detail: "dash.breaches.basis.board_detail",
  dp_intimation: "dash.breaches.basis.dp_intimation",
};

/** One incident: timers, steps, facts, affected people, Rule 7 texts, checklist and timeline (plan M8; B1–B4). */
export default async function BreachPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string; created?: string }> }) {
  const [{ t: tenant, canWrite }, t, { id }, query] = await Promise.all([requireOrg(), getT(), params, searchParams]);
  const breachId = idParam(id);
  const row = breachId ? await getBreach(tenant, breachId) : undefined;
  if (!row) notFound();
  const now = new Date();
  const lang = query.lang === "hi" ? "hi" : "en";
  const [events, recipients, stats, tpl, members] = await Promise.all([
    listBreachEvents(tenant, row.id),
    listRecipients(tenant, row.id),
    recipientStats(tenant, row.id),
    breachTemplates(tenant, row.id, lang, now),
    listOrgMembers(tenant),
  ]);
  const v = viewBreach(row, now);
  const memberName = new Map(members.map((m) => [m.userId, m.name]));
  const nowLocal = utcToIstLocal(now.toISOString());
  const block = (key: string, title: ReactNode, text: string, extra?: ReactNode) => (
    <div key={key} className="border-b border-line py-4 last:border-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="flex gap-2">
          {extra}
          <CopyButton text={text} />
        </span>
      </div>
      <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-paper p-3 text-xs whitespace-pre-wrap" lang={lang}>
        {text}
      </pre>
    </div>
  );

  return (
    <>
      <DashHeader
        title={`${row.ref} · ${row.title}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={row.status === "closed" ? "neutral" : "primary"}>{t(`dash.breaches.status.${row.status}` as MessageKey)}</Badge>
            {row.status !== "closed" ? <Badge tone={TIMER_TONE[v.worst]}>{t(`dash.breaches.state.${v.worst}` as MessageKey)}</Badge> : null}
          </span>
        }
        actions={
          <>
            <Link href={`/print/breach/${row.id}?lang=${lang}`} className={buttonClass("outline", "sm")} target="_blank">
              {t("dash.exports.print")}
            </Link>
            {canWrite
              ? (row.status === "closed" ? (["open"] as const) : row.status === "open" ? (["contained", "closed"] as const) : (["open", "closed"] as const)).map((s) => (
                  <ActionButton key={s} action={breachStatusAction} fields={{ id: row.id, status: s }} variant={s === "closed" ? "secondary" : "outline"} confirmText={s === "closed" ? t("dash.breaches.confirmClose") : undefined}>
                    {t(`dash.breaches.to.${s}` as MessageKey)}
                  </ActionButton>
                ))
              : null}
          </>
        }
      />
      <p className="mb-4 text-sm">
        <Link href="/dashboard/breaches" className="text-muted hover:text-primary">
          ← {t("dash.breaches.back")}
        </Link>
      </p>
      {query.created ? (
        <Alert tone="success" className="mb-4">
          {t("dash.breaches.created")}
        </Alert>
      ) : null}

      <Panel title={t("dash.breaches.timers")} description={t("dash.breaches.timersHint")} padded={false}>
        <ul className="divide-y divide-line">
          {v.timers.map((timer) => (
            <li key={timer.key} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {t(`dash.breaches.timer.${timer.key}` as MessageKey)}
                  <Badge tone={TIMER_TONE[timer.state]}>{t(`dash.breaches.state.${timer.state}` as MessageKey)}</Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted">{t(BASIS[timer.key])}</p>
                {timer.state !== "not_applicable" ? (
                  <p className="mt-1 text-sm">
                    {timer.dueAt ? `${t("dash.breaches.dueAt")}: ${istDateTime(timer.dueAt)} · ` : `${t("dash.breaches.since")}: ${istDateTime(timer.startAt)} · `}
                    <BreachClock since={timer.startAt} due={timer.dueAt} doneAt={timer.doneAt} serverNow={now.getTime()} />
                    {timer.doneAt ? ` · ${t("dash.breaches.doneAt")}: ${istDateTime(timer.doneAt)}` : null}
                  </p>
                ) : null}
              </div>
              {canWrite && timer.state !== "not_applicable" ? (
                timer.doneAt ? (
                  <ActionButton action={markBreachStepAction} fields={{ id: row.id, step: timer.key, clear: "1" }} variant="ghost" confirmText={t("dash.breaches.confirmClear")}>
                    {t("dash.breaches.clearStep")}
                  </ActionButton>
                ) : (
                  <ActionForm action={markBreachStepAction} hidden={{ id: row.id, step: timer.key }} submit={t("dash.breaches.markDone")} pending={t("dash.saving")} className="space-y-2">
                    <Input name="at" type="datetime-local" defaultValue={nowLocal} aria-label={t("dash.breaches.doneAt")} required />
                    <Input name="note" placeholder={t("dash.breaches.stepNote")} maxLength={400} aria-label={t("dash.breaches.stepNote")} />
                  </ActionForm>
                )
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title={t("dash.breaches.facts")} description={t("dash.breaches.factsHint")}>
            <BreachForm t={t} row={row} details={v.details} canWrite={canWrite} />
          </Panel>

          <Panel title={t("dash.breaches.people")} description={t("dash.breaches.peopleHint")}>
            <p className="text-sm">
              {t("dash.breaches.peopleStats", { total: stats.total, notified: stats.notified })}
              {stats.firstSentAt ? ` · ${t("dash.breaches.firstSent")}: ${istDateTime(stats.firstSentAt)}` : null}
            </p>
            {recipients.length ? (
              <p className="mt-2 text-sm">
                <a className="text-primary underline underline-offset-2" href={`/dashboard/breaches/${row.id}/recipients?lang=${lang}`}>
                  {t("dash.breaches.downloadCsv")}
                </a>
              </p>
            ) : null}
            {canWrite ? (
              <div className="mt-4 space-y-6">
                <ActionForm action={breachRecipientsAction} hidden={{ id: row.id }} submit={t("dash.breaches.addPeople")} pending={t("dash.saving")}>
                  <Field label={t("dash.breaches.recipients")} htmlFor="recipients" hint={t("dash.breaches.recipientsHint")}>
                    <Textarea id="recipients" name="recipients" rows={4} dir="ltr" />
                  </Field>
                </ActionForm>
                {recipients.some((r) => r.kind === "email" && r.status !== "sent") && tpl ? (
                  <ActionForm action={breachEmailAction} hidden={{ id: row.id }} submit={t("dash.breaches.sendEmail")} pending={t("dash.breaches.sending")}>
                    <Field label={t("dash.requests.reply.subject")} htmlFor="subject">
                      <Input id="subject" name="subject" defaultValue={tpl.dp.subject} required maxLength={255} lang={lang} />
                    </Field>
                    <Field label={t("dash.requests.reply.body")} htmlFor="text" hint={t("dash.breaches.sendHint")}>
                      <Textarea id="text" name="text" defaultValue={tpl.dp.text} rows={14} required lang={lang} />
                    </Field>
                  </ActionForm>
                ) : null}
                {recipients.some((r) => r.status === "pending" || r.status === "failed") ? (
                  <ActionForm action={breachManualAction} hidden={{ id: row.id }} submit={t("dash.breaches.markManual")} pending={t("dash.saving")}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t("dash.breaches.channel")} htmlFor="channel">
                        <Select id="channel" name="channel" defaultValue="sms">
                          {(["sms", "whatsapp", "phone_call", "in_app", "post"] as const).map((c) => (
                            <option key={c} value={c}>
                              {t(`dash.breaches.channel.${c}` as MessageKey)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t("dash.breaches.doneAt")} htmlFor="manual_at">
                        <Input id="manual_at" name="at" type="datetime-local" defaultValue={nowLocal} required />
                      </Field>
                    </div>
                  </ActionForm>
                ) : null}
              </div>
            ) : null}
          </Panel>

          {tpl ? (
            <Panel
              title={t("dash.breaches.texts")}
              description={t("dash.breaches.textsHint")}
              actions={
                <span className="flex gap-2 text-sm">
                  <Link href={`?lang=en`} aria-current={lang === "en" ? "true" : undefined} className={lang === "en" ? "font-semibold text-primary" : "text-muted"}>
                    English
                  </Link>
                  <Link href={`?lang=hi`} lang="hi" aria-current={lang === "hi" ? "true" : undefined} className={lang === "hi" ? "font-semibold text-primary" : "text-muted"}>
                    हिन्दी
                  </Link>
                </span>
              }
            >
              <Badge tone="warning">{t("legal.draftTemplates")}</Badge>
              {block("dp", t("dash.breaches.tpl.dp"), `${tpl.dp.subject}\n\n${tpl.dp.text}`)}
              {block("sms", t("dash.breaches.tpl.sms"), tpl.short.sms)}
              {block("wa", t("dash.breaches.tpl.whatsapp"), tpl.short.whatsapp)}
              {block("initial", t("dash.breaches.tpl.boardInitial"), `${tpl.boardInitial.subject}\n\n${tpl.boardInitial.text}`)}
              {block("detail", t("dash.breaches.tpl.boardDetailed"), `${tpl.boardDetailed.subject}\n\n${tpl.boardDetailed.text}`)}
              {block("ext", t("dash.breaches.tpl.extension"), `${tpl.extension.subject}\n\n${tpl.extension.text}`)}
              {block("certin", t("dash.breaches.tpl.certin"), `${tpl.certin.subject}\n\n${tpl.certin.text}`)}
            </Panel>
          ) : null}
        </div>

        <div className="space-y-6">
          <Panel title={t("dash.breaches.checklist")}>
            <ActionForm action={breachChecklistAction} hidden={{ id: row.id, ...Object.fromEntries(CHECKLIST_KEYS.map((k) => [`was_${k}`, v.checklist[k] ? "1" : "0"])) }} submit={t("dash.save")} pending={t("dash.saving")} disabled={!canWrite}>
              <div className="space-y-2">
                {CHECKLIST_KEYS.map((k) => (
                  <Checkbox key={k} name={`check_${k}`} defaultChecked={Boolean(v.checklist[k])} label={t(`dash.breaches.check.${k}` as MessageKey)} className="items-start" />
                ))}
              </div>
            </ActionForm>
          </Panel>

          <Panel title={t("dash.breaches.extension")} description={t("dash.breaches.extensionHint")}>
            <ActionForm action={breachExtensionAction} hidden={{ id: row.id }} submit={t("dash.save")} pending={t("dash.saving")} disabled={!canWrite}>
              <Field label={t("dash.breaches.extRequested")} htmlFor="requested_at">
                <Input id="requested_at" name="requested_at" type="datetime-local" defaultValue={utcToIstLocal(row.extension_requested_at)} />
              </Field>
              <Field label={t("dash.breaches.extUntil")} htmlFor="until" hint={t("dash.breaches.extUntilHint")}>
                <Input id="until" name="until" type="datetime-local" defaultValue={utcToIstLocal(row.extension_until)} />
              </Field>
              <Field label={t("dash.breaches.extReason")} htmlFor="reason">
                <Textarea id="reason" name="reason" rows={2} defaultValue={v.details.extensionReason} maxLength={600} />
              </Field>
            </ActionForm>
          </Panel>

          <Panel title={t("dash.breaches.timeline")}>
            {canWrite ? (
              <ActionForm action={breachEvidenceAction} hidden={{ id: row.id }} submit={t("dash.breaches.addNote")} pending={t("dash.saving")} className="mb-4">
                <Field label={t("dash.breaches.evidence")} htmlFor="note" hint={t("dash.breaches.evidenceHint")}>
                  <Textarea id="note" name="note" rows={3} maxLength={8000} />
                </Field>
              </ActionForm>
            ) : null}
            <ol className="space-y-3 text-sm">
              {[...events].reverse().map((e) => (
                <li key={e.id} className="border-s-2 border-line ps-3">
                  <p className="text-xs text-muted tabular-nums">
                    {istDateTime(e.at)}
                    {e.byUserId ? ` · ${memberName.get(e.byUserId) ?? `#${e.byUserId}`}` : ""}
                  </p>
                  <p className="font-medium">
                    {t(`dash.breaches.ev.${e.kind.split(".")[0]}` as MessageKey)}
                    {e.meta ? <span className="ms-1 font-normal text-muted">({e.meta})</span> : null}
                    {e.kind.includes(".") ? <span className="ms-1 font-normal text-muted">{e.kind.split(".").slice(1).join(".")}</span> : null}
                  </p>
                  {e.body ? <p className="mt-1 whitespace-pre-wrap">{e.body}</p> : null}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
      <p className="mt-6 max-w-3xl text-xs text-muted">{t("dash.breaches.legalNote")}</p>
    </>
  );
}
