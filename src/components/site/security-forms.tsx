"use client";

import { useActionState } from "react";
import { verifyLogin2fa } from "@/app/actions/auth";
import { disableTotpAction, enableTotpAction, regenerateCodesAction, signOutOthersAction, type SecurityFormState } from "@/app/actions/security";
import { initialFormState } from "@/app/actions/types";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { useT } from "@/lib/i18n/client";

const initial: SecurityFormState = {};

function CodeInput({ id = "code", allowRecovery = false }: { id?: string; allowRecovery?: boolean }) {
  return (
    <Input
      id={id}
      name="code"
      required
      autoComplete="one-time-code"
      inputMode={allowRecovery ? "text" : "numeric"}
      pattern={allowRecovery ? undefined : "[0-9 ]{6,7}"}
      maxLength={allowRecovery ? 20 : 7}
      spellCheck={false}
      className="tracking-widest"
    />
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const t = useT();
  return (
    <Alert tone="warning" title={t("security.codesTitle")} className="mt-4">
      <p>{t("security.codesHint")}</p>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </Alert>
  );
}

export function TwoFactorLoginForm({ next }: { next?: string }) {
  const t = useT();
  const [state, action] = useActionState(verifyLogin2fa, initialFormState);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label={t("security.codeLabel")} htmlFor="code" hint={t("security.codeOrRecovery")}>
        <CodeInput allowRecovery />
      </Field>
      <SubmitButton className="w-full" pendingText={t("security.checking")}>
        {t("security.verify")}
      </SubmitButton>
    </form>
  );
}

export function EnableTotpForm({ secret, sig, uri, qrSvg }: { secret: string; sig: string; uri: string; qrSvg?: string }) {
  const t = useT();
  const [state, action] = useActionState(enableTotpAction, initial);
  if (state.codes) {
    return (
      <div>
        <FormMessage state={state} />
        <RecoveryCodes codes={state.codes} />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <ol className="list-decimal space-y-2 ps-5 text-sm">
        <li>{t("security.step1")}</li>
        <li>
          {t("security.step2")}
          {qrSvg ? (
            <span
              role="img"
              aria-label={t("security.qrAlt")}
              data-testid="totp-qr"
              className="mt-2 block size-48 rounded-lg border border-line bg-white p-1 [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : null}
          <p className="mt-2 rounded-lg border border-line bg-paper px-3 py-2 font-mono text-base tracking-wider break-all select-all">{secret.match(/.{1,4}/g)!.join(" ")}</p>
          <a href={uri} className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
            {t("security.openApp")}
          </a>
        </li>
        <li>{t("security.step3")}</li>
      </ol>
      <input type="hidden" name="secret" value={secret} />
      <input type="hidden" name="sig" value={sig} />
      <Field label={t("security.codeLabel")} htmlFor="enable_code">
        <CodeInput id="enable_code" />
      </Field>
      <SubmitButton>{t("security.enable")}</SubmitButton>
    </form>
  );
}

export function RegenerateCodesForm() {
  const t = useT();
  const [state, action] = useActionState(regenerateCodesAction, initial);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      {state.codes ? <RecoveryCodes codes={state.codes} /> : null}
      <Field label={t("security.codeLabel")} htmlFor="regen_code">
        <CodeInput id="regen_code" />
      </Field>
      <SubmitButton variant="secondary">{t("security.regenerate")}</SubmitButton>
    </form>
  );
}

export function DisableTotpForm() {
  const t = useT();
  const [state, action] = useActionState(disableTotpAction, initial);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("account.currentPassword")} htmlFor="disable_password">
          <Input id="disable_password" name="password" type="password" required autoComplete="current-password" />
        </Field>
        <Field label={t("security.codeLabel")} htmlFor="disable_code">
          <CodeInput id="disable_code" allowRecovery />
        </Field>
      </div>
      <SubmitButton variant="danger">{t("security.disable")}</SubmitButton>
    </form>
  );
}

export function SignOutOthersForm() {
  const t = useT();
  const [state, action] = useActionState(signOutOthersAction, initial);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <SubmitButton variant="secondary">{t("security.signOutOthers")}</SubmitButton>
    </form>
  );
}
