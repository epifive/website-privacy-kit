import { saveSiteAction } from "@/app/actions/dashboard/privacy";
import { ActionForm } from "@/components/dashboard/action-form";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import type { Site } from "@/lib/db/schema";
import type { Translator } from "@/lib/i18n/messages";
import { jsonArray } from "@/lib/privacy/util";

export function SiteForm({ t, site, canWrite }: { t: Translator; site: Site | null; canWrite: boolean }) {
  return (
    <ActionForm action={saveSiteAction} hidden={site ? { id: site.id } : undefined} submit={site ? t("dash.save") : t("dash.sites.add")} pending={t("dash.saving")} disabled={!canWrite}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("dash.sites.name")} htmlFor="name">
          <Input id="name" name="name" defaultValue={site?.name ?? ""} required maxLength={120} />
        </Field>
        <Field label={t("dash.sites.domain")} htmlFor="domain" hint={t("dash.sites.domainHint")}>
          <Input id="domain" name="domain" defaultValue={site?.domain ?? ""} required maxLength={255} dir="ltr" placeholder="example.com" />
        </Field>
        <Field label={t("dash.sites.origins")} htmlFor="allowed_origins" hint={t("dash.sites.originsHint")} className="sm:col-span-2">
          <Textarea id="allowed_origins" name="allowed_origins" defaultValue={jsonArray(site?.allowed_origins).join("\n")} rows={2} dir="ltr" placeholder="https://shop.example.com" />
        </Field>
      </div>
      <Checkbox name="children_mode" label={t("dash.org.childrenMode")} defaultChecked={site?.children_mode === 1} />
    </ActionForm>
  );
}
