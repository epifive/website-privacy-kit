import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardShell, type ShellBanner } from "@/components/dashboard/shell";
import { BrandStyle } from "@/components/site/brand-style";
import { ThemeScript, type ThemeChoice } from "@/components/site/theme";
import { isDemoMode } from "@/lib/config";
import { I18nProvider } from "@/lib/i18n/client";
import { getClientMessages, getLocale, getT } from "@/lib/i18n/server";
import { getTenant, loadOrgContext } from "@/lib/org-context";
import { breachAlerts } from "@/lib/privacy/breaches";
import { getNonce } from "@/lib/nonce";
import { atLimit, editionLimits, PRO_URL } from "@/lib/edition";
import { getSettings } from "@/lib/settings";
import { uploadUrl } from "@/lib/site";

// Every dashboard page reads the signed-in user's data at request time.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, t] = await Promise.all([getSettings(), getT()]);
  const favicon = uploadUrl(settings.favicon);
  return {
    title: { default: t("dash.title"), template: `%s${settings.title_separator}${settings.site_name}` },
    robots: { index: false, follow: false },
    icons: favicon ? { icon: favicon, apple: favicon } : { icon: "/icon.svg" },
  };
}

/** Shell banner for breach timers that are due soon or overdue (plan M8: dashboard alerts). */
async function breachBanner(orgId: number | null): Promise<(Omit<ShellBanner, "text"> & { vars: Record<string, string> }) | null> {
  if (!orgId) return null;
  const alerts = (await breachAlerts(await getTenant(orgId))).filter((a) => a.worst === "overdue" || a.worst === "due_soon");
  if (!alerts.length) return null;
  const first = alerts[0];
  return { tone: first.worst === "overdue" ? "danger" : "warning", href: `/dashboard/breaches/${first.id}`, vars: { ref: first.ref, count: String(alerts.length) } };
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, orgs, current } = await loadOrgContext();
  const [settings, locale, messages, nonce] = await Promise.all([getSettings(), getLocale(), getClientMessages(), getNonce()]);
  const [alert, tr] = await Promise.all([breachBanner(current?.id ?? null), getT()]);
  const banner: ShellBanner | null = alert ? { tone: alert.tone, href: alert.href, text: tr("dash.breaches.banner", alert.vars), cta: tr("dash.breaches.openIncident") } : null;

  const langScript = `document.documentElement.lang=${JSON.stringify(locale.code)};document.documentElement.dir=${JSON.stringify(locale.dir)};`;

  return (
    <I18nProvider messages={messages}>
      <ThemeScript defaultTheme={settings.default_theme as ThemeChoice} nonce={nonce} />
      <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: langScript }} />
      <BrandStyle color={settings.primary_color} />
      <div dir={locale.dir} lang={locale.code}>
        <DashboardShell
          siteName={settings.site_name}
          logo={uploadUrl(settings.logo)}
          logoDark={uploadUrl(settings.logo_dark)}
          user={{ name: user.name, email: user.email, isAdmin: user.role === "admin" }}
          orgs={orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug }))}
          currentOrgId={current?.id ?? null}
          banner={banner}
          demo={isDemoMode()}
          defaultTheme={settings.default_theme as ThemeChoice}
          canAddOrg={!atLimit(orgs.length, editionLimits().maxOrgs)}
          proUrl={PRO_URL}
        >
          {children}
        </DashboardShell>
      </div>
    </I18nProvider>
  );
}
