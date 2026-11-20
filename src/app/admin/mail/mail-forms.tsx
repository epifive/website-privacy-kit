"use client";

import { useActionState } from "react";
import { addSuppression, removeSuppression, sendTestMail } from "@/app/admin/actions/mail";
import { initialFormState } from "@/app/actions/types";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";

export function TestMailForm({ defaultTo }: { defaultTo: string }) {
  const [state, action] = useActionState(sendTestMail, initialFormState);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Send to" htmlFor="to">
        <Input id="to" name="to" type="email" defaultValue={defaultTo} required />
      </Field>
      <SubmitButton pendingText="Sending…">Send test email</SubmitButton>
    </form>
  );
}

export function AddSuppressionForm() {
  const [state, action] = useActionState(addSuppression, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Never email this address" htmlFor="suppress_email">
          <Input id="suppress_email" name="email" type="email" required />
        </Field>
        <SubmitButton variant="secondary">Suppress</SubmitButton>
      </div>
    </form>
  );
}

export function RemoveSuppressionForm({ keyHex }: { keyHex: string }) {
  const [state, action] = useActionState(removeSuppression, initialFormState);
  return (
    <form action={action} className="text-end">
      {state.error ? <span className="me-2 text-xs text-red-600">{state.error}</span> : null}
      <input type="hidden" name="key" value={keyHex} />
      <SubmitButton variant="outline" size="sm">
        Remove
      </SubmitButton>
    </form>
  );
}
