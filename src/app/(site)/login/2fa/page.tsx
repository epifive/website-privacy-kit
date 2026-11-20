import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AuthCard } from "@/components/site/auth-card";
import { TwoFactorLoginForm } from "@/components/site/security-forms";
import { readChallenge } from "@/lib/auth/service";
import { CHALLENGE_COOKIE } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("security.loginTitle"), robots: { index: false } };
}

/** Second sign-in step for accounts with 2FA (after the password, within 5 minutes). */
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, t, jar] = await Promise.all([searchParams, getT(), cookies()]);
  const pending = readChallenge(jar.get(CHALLENGE_COOKIE)?.value) !== null;
  return (
    <AuthCard title={t("security.loginTitle")} subtitle={pending ? t("security.loginSubtitle") : t("auth.err.challengeExpired")}>
      {pending ? (
        <TwoFactorLoginForm next={typeof next === "string" ? next : undefined} />
      ) : (
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("auth.signInTitle")}
        </Link>
      )}
    </AuthCard>
  );
}
