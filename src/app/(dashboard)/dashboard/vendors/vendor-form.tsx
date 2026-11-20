import { saveVendorAction } from "@/app/actions/dashboard/privacy";
import { ActionForm } from "@/components/dashboard/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import type { VendorRow } from "@/lib/db/schema";
import type { Translator } from "@/lib/i18n/messages";
import { jsonArray } from "@/lib/privacy/util";

/** Processor register entry (s.8(2) valid contract; Rule 6(1)(f) security clause). */
export function VendorForm({ t, vendor, canWrite }: { t: Translator; vendor: VendorRow | null; canWrite: boolean }) {
  return (
    <ActionForm action={saveVendorAction} hidden={vendor ? { id: vendor.id } : undefined} submit={vendor ? t("dash.save") : t("dash.vendors.add")} pending={t("dash.saving")} disabled={!canWrite}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("dash.vendors.name")} htmlFor="name">
          <Input id="name" name="name" defaultValue={vendor?.name ?? ""} required maxLength={120} />
        </Field>
        <Field label={t("dash.vendors.service")} htmlFor="service">
          <Input id="service" name="service" defaultValue={vendor?.service ?? ""} maxLength={160} />
        </Field>
        <Field label={t("dash.vendors.dataShared")} htmlFor="data_shared" hint={t("dash.vendors.dataSharedHint")} className="sm:col-span-2">
          <Textarea id="data_shared" name="data_shared" defaultValue={jsonArray(vendor?.data_shared).join(", ")} rows={2} />
        </Field>
        <Field label={t("dash.vendors.location")} htmlFor="location">
          <Select id="location" name="location" defaultValue={vendor?.location ?? "india"}>
            <option value="india">{t("dash.vendors.india")}</option>
            <option value="abroad">{t("dash.vendors.abroad")}</option>
          </Select>
        </Field>
        <Field label={t("dash.vendors.contract")} htmlFor="contract_status">
          <Select id="contract_status" name="contract_status" defaultValue={vendor?.contract_status ?? "none"}>
            <option value="none">{t("dash.vendors.contract.none")}</option>
            <option value="pending">{t("dash.vendors.contract.pending")}</option>
            <option value="signed">{t("dash.vendors.contract.signed")}</option>
          </Select>
        </Field>
        <Field label={t("dash.vendors.contractDate")} htmlFor="contract_date">
          <Input id="contract_date" name="contract_date" type="date" defaultValue={vendor?.contract_date ?? ""} />
        </Field>
        <Field label={t("dash.vendors.reviewAt")} htmlFor="review_at">
          <Input id="review_at" name="review_at" type="date" defaultValue={vendor?.review_at ?? ""} />
        </Field>
        <Field label={t("dash.vendors.erasureContact")} htmlFor="erasure_contact" className="sm:col-span-2">
          <Input id="erasure_contact" name="erasure_contact" defaultValue={vendor?.erasure_contact ?? ""} maxLength={190} />
        </Field>
      </div>
      <Checkbox name="security_clause" label={t("dash.vendors.securityClause")} defaultChecked={vendor?.security_clause === 1} />
    </ActionForm>
  );
}
