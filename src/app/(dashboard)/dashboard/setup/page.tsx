import type { Metadata } from "next";
import Link from "next/link";
import { saveWizardStepAction } from "@/app/actions/dashboard/privacy";
import { ActionForm } from "@/components/dashboard/action-form";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { dataItemLabel } from "@/core/data-items";
import { IDENTIFIER_KEYS, TEMPLATES } from "@/core/notice/templates";
import { getPreset, SECTOR_PRESETS, SECTORS } from "@/core/presets";
import { THIRD_SCHEDULE } from "@/core/questionnaire";
import type { MessageKey } from "@/lib/i18n/messages";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { orgIdentifiers } from "@/lib/privacy/orgs";
import { getContacts, listPurposes } from "@/lib/privacy/registers";
import { getAnswers } from "@/lib/privacy/setup";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.setup") };
}

const STEPS: MessageKey[] = ["dash.wizard.step1", "dash.wizard.step2", "dash.wizard.step3", "dash.wizard.step4"];

export default async function SetupWizard({ searchParams }: { searchParams: Promise<{ step?: string; new?: string }> }) {
  const [{ org, t: tenant, canWrite }, t, locale, query] = await Promise.all([requireOrg(), getT(), getLocale(), searchParams]);
  const lang = locale.code === "hi" ? "hi" : "en";
  const step = Math.min(4, Math.max(1, Number(query.step) || 1));
  const { answers } = await getAnswers(tenant);
  const business = (answers.business ?? {}) as { is_sdf?: boolean };

  return (
    <>
      <DashHeader title={t("dash.wizard.title")} description={t("dash.wizard.text")} />
      {query.new ? <Alert tone="success" className="mb-4">{t("dash.wizard.welcome", { org: org.name })}</Alert> : null}
      <ol className="mb-6 flex flex-wrap gap-2" aria-label={t("dash.wizard.title")}>
        {STEPS.map((key, i) => (
          <li key={key}>
            <Link
              href={`/dashboard/setup?step=${i + 1}`}
              aria-current={step === i + 1 ? "step" : undefined}
              className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm", step === i + 1 ? "border-primary bg-primary-soft font-semibold text-primary" : "border-line text-muted hover:text-ink")}
            >
              <span className="tabular-nums">{i + 1}</span> {t(key)}
            </Link>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <Panel title={t("dash.wizard.step1")} description={t("dash.wizard.step1Text")} className="max-w-3xl">
          <ActionForm action={saveWizardStepAction} hidden={{ step: 1 }} submit={t("dash.wizard.next")} pending={t("dash.saving")} disabled={!canWrite}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("dash.org.name")} htmlFor="name">
                <Input id="name" name="name" defaultValue={org.name} required maxLength={120} />
              </Field>
              <Field label={t("dash.org.legalName")} htmlFor="legal_name" hint={t("dash.org.legalNameHint")}>
                <Input id="legal_name" name="legal_name" defaultValue={org.legal_name} required maxLength={160} />
              </Field>
              <Field label={t("dash.org.sector")} htmlFor="sector">
                <Select id="sector" name="sector" defaultValue={org.sector}>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {SECTOR_PRESETS[s].label[lang]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("dash.org.website")} htmlFor="website_url" hint={t("dash.org.websiteHint")}>
                <Input id="website_url" name="website_url" type="url" defaultValue={org.website_url} placeholder="https://" maxLength={300} />
              </Field>
              <Field label={t("dash.org.goodsEn")} htmlFor="goods_services_en" hint={t("dash.org.goodsHint")} className="sm:col-span-2">
                <Textarea id="goods_services_en" name="goods_services_en" defaultValue={org.goods_services_en} required maxLength={400} rows={2} />
              </Field>
              <Field label={t("dash.org.goodsHi")} htmlFor="goods_services_hi" className="sm:col-span-2">
                <Textarea id="goods_services_hi" name="goods_services_hi" lang="hi" defaultValue={org.goods_services_hi} required maxLength={400} rows={2} />
              </Field>
              <Field label={t("dash.org.thirdSchedule")} htmlFor="third_schedule" hint={t("dash.org.thirdScheduleHint")} className="sm:col-span-2">
                <Select id="third_schedule" name="third_schedule" defaultValue={org.third_schedule}>
                  {THIRD_SCHEDULE.map((c) => (
                    <option key={c} value={c}>
                      {t(`dash.third.${c}` as MessageKey)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Checkbox name="is_sdf" label={t("dash.org.isSdf")} defaultChecked={Boolean(business.is_sdf)} />
            {business.is_sdf ? <Alert tone="warning">{t("dash.org.sdfNote")}</Alert> : null}
          </ActionForm>
        </Panel>
      ) : null}

      {step === 2 ? <ContactsStep t={t} canWrite={canWrite} contacts={await getContacts(tenant)} /> : null}

      {step === 3 ? (
        <PurposesStep t={t} lang={lang} canWrite={canWrite} sector={org.sector} existing={(await listPurposes(tenant)).map((p) => p.purpose_key)} />
      ) : null}

      {step === 4 ? (
        <Panel title={t("dash.wizard.step4")} description={t("dash.wizard.step4Text")} className="max-w-3xl">
          <ActionForm action={saveWizardStepAction} hidden={{ step: 4 }} submit={t("dash.wizard.finish")} pending={t("dash.saving")} disabled={!canWrite}>
            <Field label={t("dash.org.responseDays")} htmlFor="response_days" hint={t("dash.org.responseDaysHint")}>
              <Input id="response_days" name="response_days" type="number" min={1} max={90} defaultValue={org.response_days} required className="max-w-32" />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("dash.org.identifiers")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {IDENTIFIER_KEYS.map((k) => (
                  <Checkbox key={k} name="identifiers" value={k} label={TEMPLATES[lang].identifiers[k]} defaultChecked={orgIdentifiers(org).includes(k)} />
                ))}
              </div>
            </fieldset>
            <Checkbox name="children_mode" label={t("dash.org.childrenMode")} defaultChecked={org.children_mode === 1} />
            {getPreset(org.sector).exemptionNote ? <Alert tone="info">{getPreset(org.sector).exemptionNote![lang]}</Alert> : null}
          </ActionForm>
        </Panel>
      ) : null}
    </>
  );
}

function ContactsStep({ t, canWrite, contacts }: { t: Awaited<ReturnType<typeof getT>>; canWrite: boolean; contacts: Awaited<ReturnType<typeof getContacts>> }) {
  const g = contacts.grievance;
  const d = contacts.dpo;
  const fields = (prefix: string, c: typeof g) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("dash.contacts.name")} htmlFor={`${prefix}_name`}>
        <Input id={`${prefix}_name`} name={`${prefix}_name`} defaultValue={c?.name ?? ""} maxLength={120} />
      </Field>
      <Field label={t("dash.contacts.designation")} htmlFor={`${prefix}_designation`}>
        <Input id={`${prefix}_designation`} name={`${prefix}_designation`} defaultValue={c?.designation ?? ""} maxLength={120} />
      </Field>
      <Field label={t("dash.contacts.email")} htmlFor={`${prefix}_email`}>
        <Input id={`${prefix}_email`} name={`${prefix}_email`} type="email" defaultValue={c?.email ?? ""} maxLength={190} />
      </Field>
      <Field label={t("dash.contacts.phone")} htmlFor={`${prefix}_phone`}>
        <Input id={`${prefix}_phone`} name={`${prefix}_phone`} type="tel" defaultValue={c?.phone ?? ""} maxLength={40} />
      </Field>
      <Field label={t("dash.contacts.address")} htmlFor={`${prefix}_address`} className="sm:col-span-2">
        <Input id={`${prefix}_address`} name={`${prefix}_address`} defaultValue={c?.address ?? ""} maxLength={400} />
      </Field>
    </div>
  );
  return (
    <Panel title={t("dash.wizard.step2")} description={t("dash.wizard.step2Text")} className="max-w-3xl">
      <ActionForm action={saveWizardStepAction} hidden={{ step: 2 }} submit={t("dash.wizard.next")} pending={t("dash.saving")} disabled={!canWrite}>
        <h3 className="font-sans text-sm font-semibold">{t("dash.contacts.grievance")}</h3>
        {fields("g", g)}
        <Checkbox name="dpo_same" label={t("dash.contacts.dpoSame")} defaultChecked={!d} />
        <h3 className="font-sans text-sm font-semibold">{t("dash.contacts.dpo")}</h3>
        <p className="text-xs text-muted">{t("dash.contacts.dpoHint")}</p>
        {fields("d", d)}
      </ActionForm>
    </Panel>
  );
}

function PurposesStep({ t, lang, canWrite, sector, existing }: { t: Awaited<ReturnType<typeof getT>>; lang: "en" | "hi"; canWrite: boolean; sector: string; existing: string[] }) {
  const preset = getPreset(sector);
  return (
    <Panel title={t("dash.wizard.step3")} description={t("dash.wizard.step3Text", { sector: preset.label[lang] })} className="max-w-3xl">
      <ActionForm
        action={saveWizardStepAction}
        hidden={{ step: 3 }}
        submit={t("dash.wizard.next")}
        pending={t("dash.saving")}
        disabled={!canWrite}
        footer={
          <Link href="/dashboard/purposes" className="text-sm text-primary hover:underline">
            {t("dash.wizard.editPurposes")}
          </Link>
        }
      >
        <ul className="space-y-3">
          {preset.purposes.map((p) => {
            const added = existing.includes(p.key);
            return (
              <li key={p.key} className="rounded-lg border border-line p-4">
                <Checkbox name="purpose" value={p.key} defaultChecked={!added} disabled={added} label={<span className="font-medium">{p.name[lang]}</span>} />
                {added ? <span className="ms-2 text-xs text-muted">{t("dash.wizard.alreadyAdded")}</span> : null}
                <p className="mt-1 text-sm text-muted">{p.description[lang]}</p>
                <p className="mt-2 text-xs text-muted">
                  {t("dash.purposes.items")}: {p.items.map((key) => dataItemLabel({ key }, lang)).join(", ")}
                </p>
              </li>
            );
          })}
        </ul>
      </ActionForm>
    </Panel>
  );
}
