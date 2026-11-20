"use client";

import { useActionState, type ReactNode } from "react";
import { initialFormState, type FormState } from "@/app/actions/types";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/**
 * A form bound to a Server Action, with the action's message shown above the
 * fields. Fields are rendered on the server and passed as children; hidden
 * inputs carry ids, which the action re-checks against the organisation.
 */
export function ActionForm({
  action,
  children,
  submit,
  pending,
  hidden,
  className,
  disabled = false,
  footer,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  submit: string;
  pending: string;
  hidden?: Record<string, string | number>;
  className?: string;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className={cn("space-y-5", className)}>
      <FormMessage state={state} />
      {hidden ? Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={String(value)} />) : null}
      <fieldset disabled={disabled} className="space-y-5 disabled:opacity-70">
        {children}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        {disabled ? null : <SubmitButton pendingText={pending}>{submit}</SubmitButton>}
        {footer}
      </div>
    </form>
  );
}
