import Link from "next/link";
import { getT, localSetting } from "@/lib/i18n/server";
import { PRO_URL, SOURCE_URL } from "@/lib/edition-meta";
import { fillPlaceholders } from "@/lib/settings";
import { getSiteContext, uploadUrl } from "@/lib/site";
import { Logo } from "./logo";

export async function SiteFooter() {
  const { settings } = await getSiteContext();
  const [t, footerText, copyright] = await Promise.all([getT(), localSetting(settings, "footer_text"), localSetting(settings, "copyright_text")]);
  const columns: Array<{ title: string; links: Array<{ href: string; label: string; external?: boolean }> }> = [
    {
      title: t("footer.product"),
      links: [
        { href: "/#features", label: t("nav.features") },
        { href: "/#editions", label: t("home.editionsEyebrow") },
        { href: PRO_URL, label: t("dash.nav.getPro"), external: true },
      ],
    },
    {
      title: t("footer.tools"),
      links: [
        { href: "/readiness", label: t("nav.readiness") },
        { href: "/notice-generator", label: t("nav.noticeGenerator") },
        { href: "/guides", label: t("nav.guides") },
      ],
    },
    {
      title: t("footer.resources"),
      links: [
        { href: SOURCE_URL, label: t("footer.source"), external: true },
        { href: "https://www.epifive.com/open-source", label: t("footer.moreOss"), external: true },
        { href: "/login", label: t("nav.signIn") },
      ],
    },
  ];

  return (
    <footer className="mt-24 border-t border-line bg-surface print:hidden">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_2fr]">
        <div className="max-w-sm">
          <Logo siteName={settings.site_name} logo={uploadUrl(settings.logo)} logoDark={uploadUrl(settings.logo_dark)} />
          <p className="mt-4 text-sm leading-relaxed text-muted">{fillPlaceholders(footerText, settings)}</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {columns
            .filter((c) => c.links.length)
            .map((column) => (
              <div key={column.title}>
                <h2 className="font-sans text-sm font-semibold tracking-normal">{column.title}</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      {link.external ? (
                        <a href={link.href} target="_blank" rel="noopener" className="text-muted hover:text-ink">
                          {link.label}
                        </a>
                      ) : (
                        <Link href={link.href} prefetch={false} className="text-muted hover:text-ink">
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{fillPlaceholders(copyright, settings)}</p>
          <p className="max-w-2xl text-xs leading-relaxed sm:text-end">{t("legal.disclaimer")}</p>
        </div>
      </div>
    </footer>
  );
}
