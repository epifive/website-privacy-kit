import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addRequestNoteAction, assignRequestAction, changeRequestStatusAction, closeRequestAction, recordNominationAction, revokeNominationAction, sendRequestReplyAction } from "@/app/actions/dashboard/rights";
import { ActionForm } from "@/components/dashboard/action-form";
import { ActionButton } from "@/components/dashboard/actions";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { TEMPLATES } from "@/core/notice/templates";
import { defaultTemplate, REPLY_TEMPLATES, type ReplyTemplate } from "@/core/rights/emails";
import { daysLeft, istDate, outcomesFor, STATUS_FLOW, slaState, type Outcome } from "@/core/rights/model";
import { formatDateTime } from "@/lib/dashboard-format";
import { idParam } from "@/lib/db/tenant";
import type { MessageKey } from "@/lib/i18n/messages";
import { getLocale, getT } from "@/lib/i18n/server";
import { listOrgMembers, requireOrg } from "@/lib/org-context";
import { listAttachments } from "@/lib/privacy/attachments";
import { listMailLog } from "@/lib/privacy/mailer";
import { buildReply, getDecrypted, listNominations, listRequestEvents } from "@/lib/privacy/rights";
import { listTasks } from "@/lib/privacy/retention";
import { requestErasureTasksAction } from "@/app/actions/dashboard/retention";
import { istDateTime } from "@/core/breach/model";
import { baseUrl } from "@/lib/request";
import { SLA_TONE } from "../sla";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.requests.title") };
}

/** One request: facts, timeline, replies with templates (Rule 9 contact), nomination and closure (plan M7; R1–R5). */
export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tpl?: string; outcome?: string }> }) {
  const [{ t: tenant, canWrite }, t, locale, { id }, query, base] = await Promise.all([requireOrg(), getT(), getLocale(), params, searchParams, baseUrl()]);
  const requestId = idParam(id);
  const req = requestId ? await getDecrypted(tenant, requestId) : null;
  if (!req) notFound();
  const row = req.row;
  const now = new Date();
  const tpl: ReplyTemplate = (REPLY_TEMPLATES as readonly string[]).includes(query.tpl ?? "") ? (query.tpl as ReplyTemplate) : defaultTemplate(row.type);
  const outcomes = outcomesFor(row.type);
  const closeOutcome: Outcome = outcomes.includes(query.outcome as Outcome) ? (query.outcome as Outcome) : outcomes[0];
  const [events, files, members, nominations, mails, reply, closure, erasureTasks] = await Promise.all([
    listRequestEvents(tenant, row.id),
    listAttachments(tenant, row.id),
    listOrgMembers(tenant),
    listNominations(tenant, { requestId: row.id }),
    listMailLog(tenant, { requestId: row.id }),
    buildReply(tenant, row.id, tpl, base),
    buildReply(tenant, row.id, row.type === "grievance" ? "grievance" : "closure", base, closeOutcome),
    row.type === "erasure" ? listTasks(tenant, { requestId: row.id, status: "all" }) : Promise.resolve([]),
  ]);
  const memberName = new Map(members.map((m) => [m.userId, m.name]));
  const sla = slaState(row, now);
  const left = daysLeft(row.due_at, now);
  const idLabels = TEMPLATES[row.lang].identifiers;
  const fact = (label: string, value: ReactNode) => (
    <div className="flex flex-wrap justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );

  return (
    <>
      <DashHeader
        title={`${row.ref} · ${t(`dash.requests.type.${row.type}` as MessageKey)}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={row.status === "closed" ? "neutral" : "primary"}>{t(`dash.requests.status.${row.status}` as MessageKey)}</Badge>
            <Badge tone={SLA_TONE[sla]}>
              {t(`dash.requests.sla.${sla}` as MessageKey)}
              {sla === "closed" ? null : left >= 0 ? ` · ${t("dash.requests.daysLeft", { count: left })}` : ` · ${t("dash.requests.daysOver", { count: -left })}`}
            </Badge>
            {row.outcome ? <span>{t("dash.requests.close.closedAs", { outcome: t(`dash.requests.outcome.${row.outcome}` as MessageKey) })}</span> : null}
          </span>
        }
      />
      <p className="mb-4 text-sm">
        <Link href="/dashboard/requests" className="text-muted hover:text-primary">
          ← {t("dash.requests.back")}
        </Link>
      </p>
      {row.status === "unverified" ? (
        <Alert tone="warning" className="mb-4">
          {t("dash.requests.unverifiedWarning")}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title={t("dash.requests.detail.facts")}>
            <dl>
              {fact(t("dash.requests.detail.received"), formatDateTime(row.received_at, locale.code))}
              {fact(t("dash.requests.detail.due"), <span className="tabular-nums">{istDate(row.due_at)}</span>)}
              {row.target_at ? fact(t("dash.requests.detail.target"), <span className="tabular-nums">{istDate(row.target_at)}</span>) : null}
              {fact(t("dash.requests.detail.verified"), row.verified_at ? formatDateTime(row.verified_at, locale.code) : t("dash.requests.detail.notVerified"))}
              {fact(t("dash.requests.detail.lang"), row.lang === "hi" ? "हिन्दी" : "English")}
              {fact(t("dash.requests.detail.assignee"), row.assignee_user_id ? (memberName.get(row.assignee_user_id) ?? "—") : "—")}
              {row.legal_hold_reason ? fact(t("dash.requests.detail.legalHold"), row.legal_hold_reason) : null}
            </dl>
          </Panel>

          <Panel title={t("dash.requests.detail.requester")}>
            <dl>
              {fact(t("dash.requests.detail.name"), req.name)}
              {fact(t("dash.requests.detail.email"), <span dir="ltr">{req.email}</span>)}
              {Object.entries(req.payload.identifiers).map(([k, v]) => (
                <div key={k}>{fact(idLabels[k] ?? k, <span dir="ltr">{v}</span>)}</div>
              ))}
              {req.payload.nominee
                ? fact(t("dash.requests.detail.nominee"), `${req.payload.nominee.name} (${req.payload.nominee.relation}) · ${req.payload.nominee.contact}`)
                : null}
            </dl>
            {req.payload.details ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold">{t("dash.requests.detail.details")}</h3>
                <p className="mt-1 text-sm whitespace-pre-wrap">{req.payload.details}</p>
              </div>
            ) : null}
            <div className="mt-4">
              <h3 className="text-sm font-semibold">{t("dash.requests.detail.attachments")}</h3>
              {files.length ? (
                <ul className="mt-1 space-y-1 text-sm">
                  {files.map((f) => (
                    <li key={f.id}>
                      <a href={`/dashboard/requests/${row.id}/files/${f.id}`} className="text-primary hover:underline">
                        {f.filename}
                      </a>{" "}
                      <span className="text-xs text-muted">({Math.ceil(f.size / 1024)} KB)</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted">{t("dash.requests.detail.noAttachments")}</p>
              )}
            </div>
          </Panel>

          {canWrite && row.status !== "closed" && row.status !== "unverified" && reply ? (
            <Panel title={t("dash.requests.reply.title")} description={t("dash.requests.reply.hint")}>
              <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">{t("dash.requests.reply.template")}</span>
                  <Select name="tpl" defaultValue={tpl}>
                    {REPLY_TEMPLATES.map((k) => (
                      <option key={k} value={k}>
                        {t(`dash.requests.tpl.${k}` as MessageKey)}
                      </option>
                    ))}
                  </Select>
                </label>
                <button type="submit" className={buttonClass("outline", "md")}>
                  {t("dash.requests.reply.load")}
                </button>
              </form>
              {tpl === "access" ? <p className="mb-3 text-xs text-muted">{t("dash.requests.access.hint")}</p> : null}
              <ActionForm key={tpl} action={sendRequestReplyAction} hidden={{ id: row.id }} submit={t("dash.requests.reply.send")} pending={t("dash.requests.reply.sending")}>
                <Field label={t("dash.requests.reply.subject")} htmlFor="reply-subject">
                  <Input id="reply-subject" name="subject" defaultValue={reply.subject} required maxLength={200} />
                </Field>
                <Field label={t("dash.requests.reply.body")} htmlFor="reply-text">
                  <Textarea id="reply-text" name="text" defaultValue={reply.text} rows={16} required />
                </Field>
              </ActionForm>
            </Panel>
          ) : null}

          {canWrite && row.status !== "closed" && closure ? (
            <Panel title={t("dash.requests.close.title")} description={t("dash.requests.close.letterHint")}>
              <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
                <input type="hidden" name="tpl" value={tpl} />
                <label className="text-sm">
                  <span className="mb-1 block font-medium">{t("dash.requests.close.outcome")}</span>
                  <Select name="outcome" defaultValue={closeOutcome}>
                    {outcomes.map((o) => (
                      <option key={o} value={o}>
                        {t(`dash.requests.outcome.${o}` as MessageKey)}
                      </option>
                    ))}
                  </Select>
                </label>
                <button type="submit" className={buttonClass("outline", "md")}>
                  {t("dash.requests.reply.load")}
                </button>
              </form>
              <ActionForm key={closeOutcome} action={closeRequestAction} hidden={{ id: row.id, outcome: closeOutcome }} submit={t("dash.requests.close.save")} pending={t("dash.saving")}>
                <Field label={t("dash.requests.close.subject")} htmlFor="close-subject">
                  <Input id="close-subject" name="subject" defaultValue={closure.subject} maxLength={200} />
                </Field>
                <Field label={t("dash.requests.close.letter")} htmlFor="close-text">
                  <Textarea id="close-text" name="text" defaultValue={closure.text} rows={14} />
                </Field>
                <Checkbox name="send" label={t("dash.requests.close.send")} defaultChecked />
              </ActionForm>
            </Panel>
          ) : null}

          {row.type === "erasure" ? (
            <Panel title={t("dash.tasks.requestTitle")} description={t("dash.tasks.requestHint")}>
              {erasureTasks.length ? (
                <ul className="divide-y divide-line text-sm">
                  {erasureTasks.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/dashboard/retention/tasks/${x.id}`} className="font-medium hover:text-primary">
                        {x.title}
                      </Link>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        {istDateTime(x.due_at)}
                        <Badge tone={x.status === "open" ? "primary" : "neutral"}>{t(`dash.tasks.status.${x.status}` as MessageKey)}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {canWrite ? (
                <div className="mt-3">
                  <ActionButton action={requestErasureTasksAction} fields={{ id: row.id }}>
                    {t("dash.tasks.createForRequest")}
                  </ActionButton>
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel title={t("dash.requests.detail.timeline")}>
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="border-s-2 border-line ps-3 text-sm">
                  <p>
                    <span className="font-medium">{t(`dash.requests.event.${e.kind}` as MessageKey)}</span>
                    {e.meta ? <span className="text-muted"> · {e.meta}</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(e.createdAt, locale.code)}
                    {e.byUserId ? ` · ${t("dash.requests.detail.by", { name: memberName.get(e.byUserId) ?? `#${e.byUserId}` })}` : ""}
                  </p>
                  {e.body ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-primary">{t("dash.requests.reply.body")}</summary>
                      <pre className="mt-1 max-h-80 overflow-auto rounded-md bg-paper p-2 text-xs whitespace-pre-wrap">{e.body}</pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-6">
          {canWrite ? (
            <Panel title={t("dash.requests.status.title")} description={t("dash.requests.status.hint")}>
              <ActionForm action={changeRequestStatusAction} hidden={{ id: row.id }} submit={t("dash.requests.status.save")} pending={t("dash.saving")}>
                <Select name="status" aria-label={t("dash.requests.status.title")} defaultValue={STATUS_FLOW[row.status].find((s) => s !== "closed") ?? ""}>
                  {STATUS_FLOW[row.status]
                    .filter((s) => s !== "closed")
                    .map((s) => (
                      <option key={s} value={s}>
                        {t(`dash.requests.status.${s}` as MessageKey)}
                      </option>
                    ))}
                </Select>
              </ActionForm>
              {row.status === "closed" ? <p className="mt-2 text-xs text-muted">{t("dash.requests.close.reopen")}</p> : null}
            </Panel>
          ) : null}

          {canWrite ? (
            <Panel title={t("dash.requests.assign.title")}>
              <ActionForm action={assignRequestAction} hidden={{ id: row.id }} submit={t("dash.requests.assign.save")} pending={t("dash.saving")}>
                <Select name="assignee" aria-label={t("dash.requests.assign.title")} defaultValue={row.assignee_user_id ? String(row.assignee_user_id) : ""}>
                  <option value="">{t("dash.requests.assign.nobody")}</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </ActionForm>
            </Panel>
          ) : null}

          {canWrite ? (
            <Panel title={t("dash.requests.note.title")} description={t("dash.requests.note.hint")}>
              <ActionForm action={addRequestNoteAction} hidden={{ id: row.id }} submit={t("dash.requests.note.save")} pending={t("dash.saving")}>
                <Field label={t("dash.requests.note.kind")} htmlFor="note-kind">
                  <Select id="note-kind" name="kind" defaultValue="note">
                    {(["note", "identity", "legal_hold"] as const).map((k) => (
                      <option key={k} value={k}>
                        {t(`dash.requests.note.kind.${k}` as MessageKey)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("dash.requests.note.text")} htmlFor="note-text">
                  <Textarea id="note-text" name="text" rows={4} required maxLength={4000} />
                </Field>
              </ActionForm>
            </Panel>
          ) : null}

          {row.type === "nomination" ? (
            <Panel title={t("dash.requests.nomination.title")} description={t("dash.requests.nomination.hint")}>
              {nominations.length ? (
                <ul className="mb-3 space-y-2 text-sm">
                  {nominations.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {n.nomineeName} ({n.relation}) · <span className="text-xs text-muted">{t("dash.requests.nomination.recorded", { date: istDate(n.recordedAt) })}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone={n.status === "active" ? "success" : "neutral"}>{t(`dash.requests.nomination.${n.status}` as MessageKey)}</Badge>
                        {canWrite && n.status === "active" ? (
                          <ActionButton action={revokeNominationAction} fields={{ id: row.id, nomination: n.id }} variant="ghost" confirmText={t("dash.confirmDelete")}>
                            {t("dash.requests.nomination.revoke")}
                          </ActionButton>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {canWrite && req.payload.nominee && row.status !== "unverified" ? (
                <ActionButton action={recordNominationAction} fields={{ id: row.id }} variant="primary">
                  {t("dash.requests.nomination.record")}
                </ActionButton>
              ) : null}
            </Panel>
          ) : null}

          <Panel title={t("dash.requests.detail.mail")}>
            {mails.length ? (
              <ul className="space-y-2 text-xs">
                {mails.map((m) => (
                  <li key={m.id}>
                    <Badge tone={m.status === "sent" ? "success" : m.status === "failed" ? "danger" : "neutral"}>{m.status}</Badge> <span className="font-medium">{m.subject}</span>
                    <span className="block text-muted">
                      {formatDateTime(m.created_at, locale.code)} · <span dir="ltr">{m.to_masked}</span> · {m.kind}
                      {m.error ? ` · ${m.error}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">—</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
