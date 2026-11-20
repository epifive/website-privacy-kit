import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { istDateTime } from "@/core/breach/model";
import { idParam } from "@/lib/db/tenant";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { breachTemplates, getBreach, listBreachEvents, viewBreach } from "@/lib/privacy/breaches";
import { audit } from "@/lib/privacy/registers";
import { PrintButton } from "../../print-button";

export const metadata: Metadata = { title: "Breach report" };

/** One incident as a printable report: timers, the Rule 7(2)(b) report, the Data Principal message (Annex 1) and the timeline (Annex 2). */
export default async function PrintBreach({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ org, t: tenant, user }, t, { id }, query] = await Promise.all([requireOrg(), getT(), params, searchParams]);
  const breachId = idParam(id);
  const row = breachId ? await getBreach(tenant, breachId) : undefined;
  if (!row) notFound();
  const lang = query.lang === "hi" ? "hi" : "en";
  const now = new Date();
  const [tpl, events] = await Promise.all([breachTemplates(tenant, row.id, lang, now), listBreachEvents(tenant, row.id)]);
  if (!tpl) notFound();
  const v = viewBreach(row, now);
  await audit(tenant, user.id, "breach.print", row.ref);
  return (
    <main lang={lang}>
      <div className="print-bar no-print">
        <PrintButton label={t("dash.exports.print")} />
      </div>
      <h1>
        {row.ref} · {row.title}
      </h1>
      <p className="muted">
        {org.legal_name || org.name} · {t(`dash.breaches.status.${row.status}` as MessageKey)} · {istDateTime(now.toISOString())}
      </p>
      <h2>{t("dash.breaches.timers")}</h2>
      <table>
        <tbody>
          {v.timers.map((x) => (
            <tr key={x.key}>
              <th>{t(`dash.breaches.timer.${x.key}` as MessageKey)}</th>
              <td>{t(`dash.breaches.state.${x.state}` as MessageKey)}</td>
              <td>{x.dueAt ? `${t("dash.breaches.dueAt")}: ${istDateTime(x.dueAt)}` : `${t("dash.breaches.since")}: ${istDateTime(x.startAt)}`}</td>
              <td>{x.doneAt ? `${t("dash.breaches.doneAt")}: ${istDateTime(x.doneAt)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>{t("dash.breaches.tpl.boardDetailed")}</h2>
      <pre>{`${tpl.boardDetailed.subject}\n\n${tpl.boardDetailed.text}`}</pre>
      <h2>Annex 1 — {t("dash.breaches.tpl.dp")}</h2>
      <pre>{`${tpl.dp.subject}\n\n${tpl.dp.text}`}</pre>
      <h2>Annex 2 — {t("dash.breaches.timeline")}</h2>
      <table>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{istDateTime(e.at)}</td>
              <td>
                {e.kind}
                {e.meta ? ` (${e.meta})` : ""}
              </td>
              <td>{e.body ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{t("dash.breaches.legalNote")}</p>
    </main>
  );
}
