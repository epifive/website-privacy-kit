import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { DisableTotpForm, EnableTotpForm, RegenerateCodesForm, SignOutOthersForm } from "@/components/site/security-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { remainingRecoveryCodes, signSetupSecret, twoFactorRequired } from "@/lib/auth/service";
import { generateTotpSecret, otpauthQrSvg, otpauthUri } from "@/lib/auth/totp";
import { hashToken, requireUser, SESSION_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { truncateIp, uaFamily } from "@/lib/privacy/consent";
import { listSecurityEvents } from "@/lib/security-log";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("security.title"), robots: { index: false } };
}

export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const [user, { required }, t, settings, jar] = await Promise.all([requireUser("/account/security"), searchParams, getT(), getSettings(), cookies()]);
  const db = await getDb();
  const currentId = hashToken(jar.get(SESSION_COOKIE)?.value ?? "");
  const [sessions, events, codesLeft] = await Promise.all([
    db.selectFrom("sessions").select(["id", "ip", "user_agent", "created_at", "last_seen_at", "mfa"]).where("user_id", "=", user.id).orderBy("created_at", "desc").limit(20).execute(),
    listSecurityEvents(db, { userId: user.id, limit: 15 }),
    user.totpEnabled ? remainingRecoveryCodes(db, user.id) : Promise.resolve(0),
  ]);
  const mustSetUp = twoFactorRequired(user) && !user.totpEnabled;
  const secret = user.totpEnabled ? "" : generateTotpSecret();
  const uri = secret ? otpauthUri(secret, user.email, settings.site_name) : "";
  const qrSvg = uri ? await otpauthQrSvg(uri) : "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <p className="text-sm">
        <Link href="/account" className="text-primary hover:underline">
          ← {t("account.title")}
        </Link>
      </p>
      <h1 className="mt-2 text-3xl font-bold">{t("security.title")}</h1>
      {mustSetUp || required ? (
        <Alert tone="warning" className="mt-6">
          {t("security.requiredForAdmins")}
        </Alert>
      ) : null}
      <div className="mt-8 space-y-6">
        <Section
          title={
            <span className="flex items-center gap-2">
              {t("security.twoFactor")} {user.totpEnabled ? <Badge tone="success">{t("security.on")}</Badge> : <Badge tone="neutral">{t("security.off")}</Badge>}
            </span>
          }
        >
          {user.totpEnabled ? (
            <div className="space-y-6">
              <p className="text-sm text-muted">{t("security.onText", { count: codesLeft })}</p>
              <div>
                <h3 className="mb-2 text-sm font-semibold">{t("security.newCodes")}</h3>
                <RegenerateCodesForm />
              </div>
              {!twoFactorRequired(user) ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{t("security.disable")}</h3>
                  <DisableTotpForm />
                </div>
              ) : null}
            </div>
          ) : (
            <EnableTotpForm secret={secret} sig={signSetupSecret(user.id, secret)} uri={uri} qrSvg={qrSvg} />
          )}
        </Section>

        <Section title={t("security.sessions")}>
          <ul className="divide-y divide-line text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {uaFamily(s.user_agent) || t("security.unknownDevice")} · {truncateIp(s.ip) || "—"}
                  {s.id === currentId ? <Badge tone="success" className="ms-2">{t("security.thisDevice")}</Badge> : null}
                  {s.mfa ? <Badge tone="neutral" className="ms-2">2FA</Badge> : null}
                </span>
                <span className="text-muted">{t("security.lastActive", { date: formatDate(s.last_seen_at ?? s.created_at, true) })}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <SignOutOthersForm />
          </div>
        </Section>

        <Section title={t("security.activity")}>
          {events.length ? (
            <ul className="divide-y divide-line text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-mono text-xs">{e.action}</span>
                  <span className="text-muted">
                    {e.ua_family || "—"} · {e.ip_trunc || "—"} · {formatDate(e.created_at, true)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="mb-4 font-sans text-base font-semibold tracking-normal">{title}</h2>
      {children}
    </section>
  );
}
