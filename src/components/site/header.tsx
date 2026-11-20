import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { PRO_URL } from "@/lib/edition-meta";
import { getT } from "@/lib/i18n/server";
import { getSiteContext, uploadUrl } from "@/lib/site";
import { Logo } from "./logo";
import { LanguageSwitcher } from "./language-switcher";
import { MobileMenu, UserMenu } from "./header-menus";
import { ThemeToggle, type ThemeChoice } from "./theme";

export async function SiteHeader() {
  const { settings, user, languages, locale } = await getSiteContext();
  const t = await getT();
  const navLink = "rounded-lg px-3 py-2 text-muted transition-colors hover:text-ink";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md print:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <MobileMenu
          signedIn={Boolean(user)}
          isAdmin={user?.role === "admin"}
          hindi={locale.code === "hi"}
        />
        <Logo siteName={settings.site_name} logo={uploadUrl(settings.logo)} logoDark={uploadUrl(settings.logo_dark)} />

        <nav aria-label="Main" className="ms-4 hidden items-center gap-1 text-sm font-medium lg:flex">
          <Link href={locale.code === "hi" ? "/hi/readiness" : "/readiness"} className={navLink}>
            {t("nav.readiness")}
          </Link>
          <Link href={locale.code === "hi" ? "/hi/guides" : "/guides"} className={navLink}>
            {t("nav.guides")}
          </Link>
          <Link href={locale.code === "hi" ? "/hi/notice-generator" : "/notice-generator"} className={navLink}>
            {t("nav.noticeGenerator")}
          </Link>
          <Link href="/#editions" className={navLink}>
            {t("home.editionsEyebrow")}
          </Link>
        </nav>

        <div className="ms-auto flex items-center gap-2">
          {languages.length > 1 ? (
            <LanguageSwitcher current={locale.code} languages={languages.map((l) => ({ code: l.code, name: l.native_name }))} />
          ) : null}
          <ThemeToggle defaultTheme={settings.default_theme as ThemeChoice} />
          {user ? (
            <>
              <ButtonLink href="/dashboard" size="sm" variant="outline" className="max-sm:hidden">
                {t("nav.dashboard")}
              </ButtonLink>
              <UserMenu name={user.name} email={user.email} isAdmin={user.role === "admin"} />
            </>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:block">
                {t("nav.signIn")}
              </Link>
              <a href={PRO_URL} target="_blank" rel="noopener" className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-white hover:opacity-90 max-sm:hidden">
                {t("dash.nav.getPro")}
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
