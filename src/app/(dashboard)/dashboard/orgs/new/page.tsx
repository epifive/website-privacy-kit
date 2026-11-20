import type { Metadata } from "next";
import { createOrgAction } from "@/app/actions/dashboard/privacy";
import { ActionForm } from "@/components/dashboard/action-form";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Field, Input, Select } from "@/components/ui/field";
import { SECTOR_PRESETS, SECTORS } from "@/core/presets";
import { getLocale, getT } from "@/lib/i18n/server";
import { loadOrgContext } from "@/lib/org-context";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.org.newTitle") };
}

export default async function NewOrgPage() {
  const [ctx, t, locale] = await Promise.all([loadOrgContext(), getT(), getLocale()]);
  const lang = locale.code === "hi" ? "hi" : "en";
  return (
    <>
      <DashHeader title={ctx.orgs.length ? t("dash.org.newTitle") : t("dash.org.firstTitle")} description={t("dash.org.newText")} />
      <Panel className="max-w-xl">
        <ActionForm action={createOrgAction} submit={t("dash.org.create")} pending={t("dash.saving")}>
          <Field label={t("dash.org.name")} htmlFor="name" hint={t("dash.org.nameHint")}>
            <Input id="name" name="name" required minLength={2} maxLength={120} autoFocus />
          </Field>
          <Field label={t("dash.org.sector")} htmlFor="sector" hint={t("dash.org.sectorHint")}>
            <Select id="sector" name="sector" defaultValue="clinic">
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {SECTOR_PRESETS[s].label[lang]}
                </option>
              ))}
            </Select>
          </Field>
        </ActionForm>
      </Panel>
    </>
  );
}
