import { createBreachAction, updateBreachAction } from "@/app/actions/dashboard/breaches";
import { ActionForm } from "@/components/dashboard/action-form";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { utcToIstLocal } from "@/core/breach/model";
import type { BreachDetails } from "@/core/breach/templates";
import type { BreachRow } from "@/lib/db/schema";
import type { Translator } from "@/lib/i18n/messages";

/**
 * Incident facts (plan M8). The create form asks only for what starts the
 * clocks; the edit form adds every fact the Rule 7 templates use.
 * Times are entered in IST and stored as UTC.
 */
export function BreachForm({ t, row, details, canWrite }: { t: Translator; row: BreachRow | null; details: BreachDetails | null; canWrite: boolean }) {
  const d = details;
  const now = utcToIstLocal(new Date().toISOString());
  const text = (name: string, label: string, value: string, hint?: string, wide = false) => (
    <Field label={label} htmlFor={name} hint={hint} className={wide ? "sm:col-span-2" : undefined}>
      <Input id={name} name={name} defaultValue={value} maxLength={400} />
    </Field>
  );
  const area = (name: string, label: string, value: string, hint?: string) => (
    <Field label={label} htmlFor={name} hint={hint} className="sm:col-span-2">
      <Textarea id={name} name={name} defaultValue={value} rows={3} maxLength={4000} />
    </Field>
  );
  const linesHint = t("dash.breaches.f.linesHint");
  return (
    <ActionForm
      action={row ? updateBreachAction : createBreachAction}
      hidden={row ? { id: row.id } : undefined}
      submit={row ? t("dash.save") : t("dash.breaches.create")}
      pending={t("dash.saving")}
      disabled={!canWrite}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("dash.breaches.f.title")} htmlFor="title" className="sm:col-span-2" hint={t("dash.breaches.f.titleHint")}>
          <Input id="title" name="title" defaultValue={row?.title ?? ""} required minLength={3} maxLength={200} />
        </Field>
        <Field label={t("dash.breaches.f.noticedAt")} htmlFor="noticed_at" hint={t("dash.breaches.f.noticedHint")}>
          <Input id="noticed_at" name="noticed_at" type="datetime-local" defaultValue={row ? utcToIstLocal(row.noticed_at) : now} required />
        </Field>
        <Field label={t("dash.breaches.f.awareAt")} htmlFor="aware_at" hint={t("dash.breaches.f.awareHint")}>
          <Input id="aware_at" name="aware_at" type="datetime-local" defaultValue={row ? utcToIstLocal(row.aware_at) : now} required />
        </Field>
        <Field label={t("dash.breaches.f.affectedCount")} htmlFor="affected_count">
          <Input id="affected_count" name="affected_count" type="number" min={0} defaultValue={row?.affected_count ?? 0} className="max-w-40" />
        </Field>
        <div className="flex flex-col justify-end gap-1">
          <Checkbox name="certin_applicable" label={t("dash.breaches.f.certinApplicable")} defaultChecked={row ? row.certin_applicable === 1 : true} />
          <p className="text-xs text-muted">{t("dash.breaches.f.certinHint")}</p>
        </div>
        {area("nature", t("dash.breaches.f.nature"), d?.nature ?? "", t("dash.breaches.f.natureHint"))}
        {row && d ? (
          <>
            {text("certin_incident_type", t("dash.breaches.f.certinType"), d.certinIncidentType, t("dash.breaches.f.certinTypeHint"))}
            {text("log_from", t("dash.breaches.f.logFrom"), d.logFrom)}
            {text("occurred_window", t("dash.breaches.f.occurred"), d.occurredWindow, t("dash.breaches.f.occurredHint"))}
            {text("location", t("dash.breaches.f.location"), d.location, t("dash.breaches.f.locationHint"))}
            {area("extent", t("dash.breaches.f.extent"), d.extent)}
            {area("categories", t("dash.breaches.f.categories"), d.categories.join("\n"), linesHint)}
            {text("affected_systems", t("dash.breaches.f.systems"), d.affectedSystems, undefined, true)}
            {area("likely_impact", t("dash.breaches.f.impact"), d.likelyImpact)}
            {area("consequences", t("dash.breaches.f.consequences"), d.consequences.join("\n"), linesHint)}
            {area("measures_taken", t("dash.breaches.f.measuresTaken"), d.measuresTaken.join("\n"), linesHint)}
            {area("measures_planned", t("dash.breaches.f.measuresPlanned"), d.measuresPlanned.join("\n"), linesHint)}
            {area("safety_steps", t("dash.breaches.f.safetySteps"), d.safetySteps.join("\n"), linesHint)}
            {area("root_cause", t("dash.breaches.f.rootCause"), d.rootCause)}
            {area("findings_person", t("dash.breaches.f.findings"), d.findingsPerson, t("dash.breaches.f.findingsHint"))}
            {area("remediation", t("dash.breaches.f.remediation"), d.remediation.join("\n"), linesHint)}
            {text("processor_name", t("dash.breaches.f.processor"), d.processorName)}
            {text("processor_ref", t("dash.breaches.f.processorRef"), d.processorRef)}
            {text("dp_channels", t("dash.breaches.f.dpChannels"), d.dpChannels)}
            {text("dp_not_reached", t("dash.breaches.f.dpNotReached"), d.dpNotReached)}
            {text("signatory_title", t("dash.breaches.f.signatory"), d.signatoryTitle, t("dash.breaches.f.signatoryHint"))}
          </>
        ) : null}
      </div>
    </ActionForm>
  );
}
