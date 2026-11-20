import { saveBannerAction } from "@/app/actions/dashboard/privacy";
import { ActionForm } from "@/components/dashboard/action-form";
import { Checkbox, Field, Hint, Input, Select } from "@/components/ui/field";
import { GCM_TYPES, type BannerTheme, type GcmMap } from "@/core/consent/banner";
import type { Translator } from "@/lib/i18n/messages";

const POSITIONS = [
  ["bottom", "dash.banner.pos.bottom"],
  ["bottom-left", "dash.banner.pos.bottomLeft"],
  ["bottom-right", "dash.banner.pos.bottomRight"],
  ["center", "dash.banner.pos.center"],
] as const;
const LANGS = [
  ["auto", "dash.banner.lang.auto"],
  ["en", "dash.banner.lang.en"],
  ["hi", "dash.banner.lang.hi"],
] as const;

/** Banner customisation for one site (plan §7.3): colours, position, language, floating button, Consent Mode mapping. */
export function BannerForm({
  t,
  siteId,
  theme,
  gcm,
  purposes,
  canWrite,
}: {
  t: Translator;
  siteId: number;
  theme: BannerTheme;
  gcm: GcmMap;
  purposes: Array<{ key: string; name: string }>;
  canWrite: boolean;
}) {
  return (
    <ActionForm action={saveBannerAction} hidden={{ id: siteId }} submit={t("dash.save")} pending={t("dash.saving")} disabled={!canWrite}>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label={t("dash.banner.primary")} htmlFor="primary">
          <Input id="primary" name="primary" type="color" defaultValue={theme.primary} className="p-1" />
        </Field>
        <Field label={t("dash.banner.background")} htmlFor="background">
          <Input id="background" name="background" type="color" defaultValue={theme.background} className="p-1" />
        </Field>
        <Field label={t("dash.banner.text")} htmlFor="text">
          <Input id="text" name="text" type="color" defaultValue={theme.text} className="p-1" />
        </Field>
        <Field label={t("dash.banner.position")} htmlFor="position">
          <Select id="position" name="position" defaultValue={theme.position}>
            {POSITIONS.map(([v, k]) => (
              <option key={v} value={v}>
                {t(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("dash.banner.lang")} htmlFor="lang" hint={t("dash.banner.langHint")} className="sm:col-span-2">
          <Select id="lang" name="lang" defaultValue={theme.lang}>
            {LANGS.map(([v, k]) => (
              <option key={v} value={v}>
                {t(k)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div>
        <Checkbox name="floating" label={t("dash.banner.floating")} defaultChecked={theme.floating} />
        <Hint>{t("dash.banner.floatingHint")}</Hint>
      </div>
      <fieldset className="rounded-lg border border-line p-4">
        <legend className="px-1 text-sm font-medium">{t("dash.banner.gcm")}</legend>
        <Hint className="mt-0 mb-3">{t("dash.banner.gcmHint")}</Hint>
        <div className="grid gap-4 sm:grid-cols-2">
          {GCM_TYPES.map((type) => (
            <Field key={type} label={<code dir="ltr">{type}</code>} htmlFor={`gcm_${type}`}>
              <Select id={`gcm_${type}`} name={`gcm_${type}`} defaultValue={gcm[type]}>
                <option value="">{t("dash.banner.gcmNone")}</option>
                {purposes.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted">{t("dash.banner.draft")}</p>
    </ActionForm>
  );
}
