import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { PasswordForm, ProfileForm } from "@/components/site/account-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { editionLimits, PRO_URL } from "@/lib/edition";
import { interpolateParts } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.title"), robots: { index: false } };
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const [user, query, t] = await Promise.all([requireUser("/account"), searchParams, getT()]);
  const limits = editionLimits();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold">{t("account.title")}</h1>
      <p className="mt-1 text-muted">{t("account.signedInAs", { email: user.email })}</p>

      {query.password === "reset" ? (
        <div className="mt-6">
          <Alert tone="success">{t("account.passwordReset")}</Alert>
        </div>
      ) : null}

      <div className="mt-8 space-y-6">
        <Section title={t("account.edition")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xl font-bold">
                {t("account.editionFree")}
                <Badge tone="success">MIT</Badge>
              </p>
              <p className="mt-3 text-sm">
                {interpolateParts(t("account.limits"), {
                  sites: <strong>{limits.maxSites ? limits.maxSites.toLocaleString() : t("account.unlimited")}</strong>,
                  users: <strong>{limits.maxUsers ? limits.maxUsers.toLocaleString() : t("account.unlimited")}</strong>,
                  events: <strong>{limits.maxMonthlyEvents ? limits.maxMonthlyEvents.toLocaleString() : t("account.unlimited")}</strong>,
                }).map((part, i) => (
                  <Fragment key={i}>{part}</Fragment>
                ))}
                .
              </p>
              <p className="mt-2 text-sm text-muted">{t("account.editionProText")}</p>
              <p className="mt-1 text-sm text-muted">{t("account.hostedSoon")}</p>
            </div>
            <ButtonLink href={PRO_URL} target="_blank" rel="noopener">
              {t("dash.nav.getPro")}
            </ButtonLink>
          </div>
        </Section>

        <Section title={t("account.profile")}>
          <ProfileForm name={user.name} email={user.email} />
        </Section>

        <Section title={t("account.passwordSection")}>
          <p className="mb-4 text-sm">
            <Link href="/account/security" className="font-medium text-primary hover:underline">
              {t("account.securityLink")}
            </Link>
          </p>
          <PasswordForm />
        </Section>

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="mb-4 font-sans text-base font-semibold tracking-normal">{title}</h2>
      {children}
    </section>
  );
}
