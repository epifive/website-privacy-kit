import { saveRetentionAction } from "@/app/actions/dashboard/privacy";
import { ActionForm } from "@/components/dashboard/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { RETENTION_ACTIONS, RETENTION_TRIGGERS } from "@/core/retention";
import type { RetentionRuleRow } from "@/lib/db/schema";
import type { MessageKey, Translator } from "@/lib/i18n/messages";

function splitPeriod(days: number | undefined): { amount: number; unit: "days" | "months" | "years" | "withdrawal" } {
  if (days === undefined) return { amount: 1, unit: "years" };
  if (days === 0) return { amount: 0, unit: "withdrawal" };
  if (days % 365 === 0) return { amount: days / 365, unit: "years" };
  if (days % 30 === 0) return { amount: days / 30, unit: "months" };
  return { amount: days, unit: "days" };
}

/** Retention rule (s.8(7); Rule 8(3) one-year floor for logs; optional pre-erasure notice). */
export function RetentionForm({ t, rule, canWrite }: { t: Translator; rule: RetentionRuleRow | null; canWrite: boolean }) {
  const period = splitPeriod(rule?.period_days);
  return (
    <ActionForm action={saveRetentionAction} hidden={rule ? { id: rule.id } : undefined} submit={rule ? t("dash.save") : t("dash.retention.add")} pending={t("dash.saving")} disabled={!canWrite}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("dash.retention.category")} htmlFor="category">
          <Input id="category" name="category" defaultValue={rule?.category ?? ""} required maxLength={160} />
        </Field>
        <Field label={t("dash.retention.categoryHi")} htmlFor="category_hi">
          <Input id="category_hi" name="category_hi" lang="hi" defaultValue={rule?.category_hi ?? ""} maxLength={160} />
        </Field>
        <Field label={t("dash.retention.period")} htmlFor="period_amount">
          <div className="flex gap-2">
            <Input id="period_amount" name="period_amount" type="number" min={0} max={36500} defaultValue={period.amount} className="max-w-28" />
            <Select name="period_unit" defaultValue={period.unit} aria-label={t("dash.retention.unit")}>
              <option value="days">{t("dash.retention.unit.days")}</option>
              <option value="months">{t("dash.retention.unit.months")}</option>
              <option value="years">{t("dash.retention.unit.years")}</option>
              <option value="withdrawal">{t("dash.retention.unit.withdrawal")}</option>
            </Select>
          </div>
        </Field>
        <Field label={t("dash.retention.trigger")} htmlFor="trigger">
          <Select id="trigger" name="trigger" defaultValue={rule?.trigger ?? "collection"}>
            {RETENTION_TRIGGERS.map((v) => (
              <option key={v} value={v}>
                {t(`dash.retention.trigger.${v}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("dash.retention.action")} htmlFor="action">
          <Select id="action" name="action" defaultValue={rule?.action ?? "erase"}>
            {RETENTION_ACTIONS.map((v) => (
              <option key={v} value={v}>
                {t(`dash.retention.action.${v}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("dash.retention.preNotice")} htmlFor="pre_notice_hours" hint={t("dash.retention.preNoticeHint")}>
          <Input id="pre_notice_hours" name="pre_notice_hours" type="number" min={1} max={720} defaultValue={rule?.pre_notice_hours ?? ""} className="max-w-28" />
        </Field>
        <Field label={t("dash.retention.lawRef")} htmlFor="law_ref" hint={t("dash.retention.lawRefHint")} className="sm:col-span-2">
          <Input id="law_ref" name="law_ref" defaultValue={rule?.law_ref ?? ""} maxLength={255} />
        </Field>
      </div>
      <Checkbox name="is_logs" label={t("dash.retention.isLogs")} defaultChecked={rule?.is_logs === 1} />
    </ActionForm>
  );
}
