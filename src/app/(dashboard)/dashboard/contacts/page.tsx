import type { Metadata } from "next";
import { deleteContactAction, saveContactAction } from "@/app/actions/dashboard/privacy";
import { ActionButton } from "@/components/dashboard/actions";
import { ActionForm } from "@/components/dashboard/action-form";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Field, Input } from "@/components/ui/field";
import type { ContactRow } from "@/lib/db/schema";
import type { Translator } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { requireOrg } from "@/lib/org-context";
import { getContacts } from "@/lib/privacy/registers";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("dash.nav.contacts") };
}

/** Rule 9 / s.8(9): grievance contact and DPO or authorised person, shown in every notice and reply. */
export default async function ContactsPage() {
  const [{ t: tenant, canWrite }, t] = await Promise.all([requireOrg(), getT()]);
  const contacts = await getContacts(tenant);
  return (
    <>
      <DashHeader title={t("dash.nav.contacts")} description={t("dash.contacts.subtitle")} />
      <div className="grid gap-6 xl:grid-cols-2">
        <ContactPanel t={t} kind="grievance" title={t("dash.contacts.grievance")} text={t("dash.contacts.grievanceHint")} contact={contacts.grievance} canWrite={canWrite} />
        <ContactPanel t={t} kind="dpo_or_authorised" title={t("dash.contacts.dpo")} text={t("dash.contacts.dpoHint")} contact={contacts.dpo} canWrite={canWrite} />
      </div>
    </>
  );
}

function ContactPanel({ t, kind, title, text, contact, canWrite }: { t: Translator; kind: ContactRow["kind"]; title: string; text: string; contact: ContactRow | null; canWrite: boolean }) {
  return (
    <Panel
      title={title}
      description={text}
      actions={
        contact && canWrite ? (
          <ActionButton action={deleteContactAction} fields={{ kind }} variant="ghost" confirmText={t("dash.confirmDelete")}>
            {t("dash.delete")}
          </ActionButton>
        ) : null
      }
    >
      <ActionForm action={saveContactAction} hidden={{ kind }} submit={t("dash.save")} pending={t("dash.saving")} disabled={!canWrite}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("dash.contacts.name")} htmlFor={`${kind}_name`}>
            <Input id={`${kind}_name`} name="name" defaultValue={contact?.name ?? ""} required maxLength={120} />
          </Field>
          <Field label={t("dash.contacts.designation")} htmlFor={`${kind}_designation`}>
            <Input id={`${kind}_designation`} name="designation" defaultValue={contact?.designation ?? ""} maxLength={120} />
          </Field>
          <Field label={t("dash.contacts.email")} htmlFor={`${kind}_email`}>
            <Input id={`${kind}_email`} name="email" type="email" defaultValue={contact?.email ?? ""} maxLength={190} />
          </Field>
          <Field label={t("dash.contacts.phone")} htmlFor={`${kind}_phone`}>
            <Input id={`${kind}_phone`} name="phone" type="tel" defaultValue={contact?.phone ?? ""} maxLength={40} />
          </Field>
          <Field label={t("dash.contacts.address")} htmlFor={`${kind}_address`} className="sm:col-span-2">
            <Input id={`${kind}_address`} name="address" defaultValue={contact?.address ?? ""} maxLength={400} />
          </Field>
        </div>
      </ActionForm>
    </Panel>
  );
}
