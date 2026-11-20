import type { Metadata } from "next";
import { detailsRequired } from "@/core/rights/model";
import { saveOrgSettingsAction } from "@/app/actions/dashboard/privacy";
import { ActionForm } from "@/components/dashboard/action-form";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { IDENTIFIER_KEYS, TEMPLATES } from "@/core/notice/templates";
import { SECTOR_PRESETS, SECTORS } from "@/core/presets";
import { THIRD_SCHEDULE } from "@/core/questionnaire";
import type { MessageKey } from "@/lib/i18n/messages";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { orgIdentifiers } from "@/lib/privacy/orgs";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.org") };
}

export default async function OrgSettingsPage() {
  const [{ org, canWrite, role }, t, locale] = await Promise.all([requireOrg(), getT(), getLocale()]);
  const lang = locale.code === "hi" ? "hi" : "en";
  return (
    <>
      <DashHeader title={t("dash.nav.org")} description={t("dash.org.settingsText", { slug: org.slug, role: t(`dash.role.${role}` as MessageKey) })} />
      <Panel className="max-w-3xl">
        <ActionForm action={saveOrgSettingsAction} submit={t("dash.save")} pending={t("dash.saving")} disabled={!canWrite}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("dash.org.name")} htmlFor="name">
              <Input id="name" name="name" defaultValue={org.name} required maxLength={120} />
            </Field>
            <Field label={t("dash.org.legalName")} htmlFor="legal_name">
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
            <Field label={t("dash.org.website")} htmlFor="website_url">
              <Input id="website_url" name="website_url" type="url" defaultValue={org.website_url} maxLength={300} />
            </Field>
            <Field label={t("dash.org.goodsEn")} htmlFor="goods_services_en" className="sm:col-span-2">
              <Textarea id="goods_services_en" name="goods_services_en" defaultValue={org.goods_services_en} required maxLength={400} rows={2} />
            </Field>
            <Field label={t("dash.org.goodsHi")} htmlFor="goods_services_hi" className="sm:col-span-2">
              <Textarea id="goods_services_hi" name="goods_services_hi" lang="hi" defaultValue={org.goods_services_hi} required maxLength={400} rows={2} />
            </Field>
            <Field label={t("dash.org.thirdSchedule")} htmlFor="third_schedule" className="sm:col-span-2">
              <Select id="third_schedule" name="third_schedule" defaultValue={org.third_schedule}>
                {THIRD_SCHEDULE.map((c) => (
                  <option key={c} value={c}>
                    {t(`dash.third.${c}` as MessageKey)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("dash.org.responseDays")} htmlFor="response_days" hint={t("dash.org.responseDaysHint")}>
              <Input id="response_days" name="response_days" type="number" min={1} max={90} defaultValue={org.response_days} required />
            </Field>
            <Field label={t("dash.org.internalTarget")} htmlFor="internal_target_days" hint={t("dash.org.internalTargetHint")}>
              <Input id="internal_target_days" name="internal_target_days" type="number" min={0} max={89} defaultValue={org.internal_target_days} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t("dash.org.identifiers")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {IDENTIFIER_KEYS.map((k) => (
                <Checkbox key={k} name="identifiers" value={k} label={TEMPLATES[lang].identifiers[k]} defaultChecked={orgIdentifiers(org).includes(k)} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{t("dash.org.detailsRequired")}</legend>
            <p className="mb-2 text-xs text-muted">{t("dash.org.detailsRequiredHint")}</p>
            <div className="flex flex-wrap gap-4">
              <Checkbox name="details_required" value="access" label={t("dash.requests.type.access")} defaultChecked={detailsRequired("access", org.details_required)} />
              <Checkbox name="details_required" value="erasure" label={t("dash.requests.type.erasure")} defaultChecked={detailsRequired("erasure", org.details_required)} />
            </div>
          </fieldset>
          <Checkbox name="children_mode" label={t("dash.org.childrenMode")} defaultChecked={org.children_mode === 1} />
        </ActionForm>
      </Panel>
    </>
  );
}
