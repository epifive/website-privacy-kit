import { savePurposeAction } from "@/app/actions/dashboard/privacy";
import { ActionForm } from "@/components/dashboard/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { DATA_ITEMS, parseDataItems, type CatalogueItem } from "@/core/data-items";
import { BASES } from "@/core/notice/render";
import type { PurposeRow, RetentionRuleRow, Site, VendorRow } from "@/lib/db/schema";
import type { MessageKey, Translator } from "@/lib/i18n/messages";
import { idList } from "@/lib/privacy/util";

const GROUPS: CatalogueItem["group"][] = ["identity", "contact", "health", "education", "finance", "commerce", "online", "other"];

/** Create / edit form for a purpose: itemised data checklist (Rule 3(b)(i)), basis, vendors, retention. */
export function PurposeForm({
  t,
  lang,
  purpose,
  vendors,
  rules,
  sites,
  canWrite,
}: {
  t: Translator;
  lang: "en" | "hi";
  purpose: PurposeRow | null;
  vendors: VendorRow[];
  rules: RetentionRuleRow[];
  sites: Site[];
  canWrite: boolean;
}) {
  const items = parseDataItems(purpose?.data_items);
  const selected = new Set(items.flatMap((i) => ("key" in i ? [i.key] : [])));
  const custom = items.flatMap((i) => ("key" in i ? [] : [`${i.en} | ${i.hi}`])).join("\n");
  const vendorIds = new Set(idList(purpose?.vendor_ids));
  return (
    <ActionForm action={savePurposeAction} hidden={purpose ? { id: purpose.id } : undefined} submit={purpose ? t("dash.save") : t("dash.purposes.add")} pending={t("dash.saving")} disabled={!canWrite}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("dash.purposes.nameEn")} htmlFor="name_en">
          <Input id="name_en" name="name_en" defaultValue={purpose?.name_en ?? ""} required maxLength={160} />
        </Field>
        <Field label={t("dash.purposes.nameHi")} htmlFor="name_hi">
          <Input id="name_hi" name="name_hi" lang="hi" defaultValue={purpose?.name_hi ?? ""} maxLength={160} />
        </Field>
        <Field label={t("dash.purposes.descEn")} htmlFor="desc_en" className="sm:col-span-2">
          <Textarea id="desc_en" name="desc_en" defaultValue={purpose?.desc_en ?? ""} rows={2} maxLength={600} />
        </Field>
        <Field label={t("dash.purposes.descHi")} htmlFor="desc_hi" className="sm:col-span-2">
          <Textarea id="desc_hi" name="desc_hi" lang="hi" defaultValue={purpose?.desc_hi ?? ""} rows={2} maxLength={600} />
        </Field>
        <Field label={t("dash.purposes.basis")} htmlFor="basis" hint={t("dash.purposes.basisHint")}>
          <Select id="basis" name="basis" defaultValue={purpose?.basis ?? "consent"}>
            {BASES.map((b) => (
              <option key={b} value={b}>
                {t(`dash.basis.${b}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("dash.purposes.key")} htmlFor="key" hint={t("dash.purposes.keyHint")}>
          <Input id="key" name="key" defaultValue={purpose?.purpose_key ?? ""} pattern="[a-z0-9_]{1,60}" maxLength={60} dir="ltr" />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t("dash.purposes.items")}</legend>
        <p className="mb-3 text-xs text-muted">{t("dash.purposes.itemsHint")}</p>
        <div className="space-y-4">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{t(`dash.itemGroup.${group}` as MessageKey)}</p>
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {DATA_ITEMS.filter((i) => i.group === group).map((i) => (
                  <Checkbox key={i.key} name="items" value={i.key} label={i[lang]} defaultChecked={selected.has(i.key)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <Field label={t("dash.purposes.customItems")} htmlFor="custom_items" hint={t("dash.purposes.customItemsHint")}>
        <Textarea id="custom_items" name="custom_items" defaultValue={custom} rows={3} placeholder="Shoe size | जूते का नाप" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("dash.purposes.vendors")}</legend>
          {vendors.length ? (
            <div className="space-y-1.5">
              {vendors.map((v) => (
                <Checkbox key={v.id} name="vendor_ids" value={v.id} label={v.name} defaultChecked={vendorIds.has(v.id)} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">{t("dash.purposes.noVendors")}</p>
          )}
        </fieldset>
        <div className="space-y-5">
          <Field label={t("dash.purposes.retention")} htmlFor="retention_rule_id">
            <Select id="retention_rule_id" name="retention_rule_id" defaultValue={purpose?.retention_rule_id ?? ""}>
              <option value="">{t("dash.purposes.noRetention")}</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {lang === "hi" && r.category_hi ? r.category_hi : r.category}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("dash.purposes.site")} htmlFor="site_id">
            <Select id="site_id" name="site_id" defaultValue={purpose?.site_id ?? ""}>
              <option value="">{t("dash.purposes.allSites")}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      <div className="space-y-2">
        <Checkbox name="is_tracking" label={t("dash.purposes.tracking")} defaultChecked={purpose?.is_tracking === 1} />
        <Checkbox name="active" label={t("dash.purposes.active")} defaultChecked={purpose ? purpose.active === 1 : true} />
      </div>
    </ActionForm>
  );
}
