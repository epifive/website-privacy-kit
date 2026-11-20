import { generatorSectors, identifierOptions } from "@/core/free-notice";
import { langPath, marketingT } from "@/core/marketing/text";
import { SECTORS } from "@/core/presets";
import type { ReadinessLang } from "@/core/readiness/model";
import { JsonLd } from "@/components/site/json-ld";
import { pickTexts } from "@/lib/readiness";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site";
import { NoticeGenerator } from "./notice-generator";
import { PageIntro } from "./page-intro";

/** /notice-generator and /hi/notice-generator (no login, nothing stored). */
export async function NoticeGeneratorView({ lang, sector }: { lang: ReadinessLang; sector?: string }) {
  const settings = await getSettings();
  const t = marketingT(lang);
  return (
    <div lang={lang} className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: t("ng.metaTitle"),
          description: t("ng.metaDescription"),
          url: absoluteUrl(settings, langPath(lang, "/notice-generator")),
          inLanguage: lang,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
          publisher: { "@type": "Organization", name: "EpiFive" },
        }}
      />
      <PageIntro
        eyebrow={t("ng.eyebrow")}
        title={t("ng.title")}
        intro={t("ng.intro")}
        lang={lang}
        switchHref={langPath(lang === "en" ? "hi" : "en", "/notice-generator")}
        switchLabel={t("lang.switch")}
      >
        <p className="mt-4 max-w-[62ch] rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          {t("ng.banner")}
        </p>
      </PageIntro>
      <NoticeGenerator
        lang={lang}
        texts={pickTexts(lang, ["ng."])}
        sectors={generatorSectors(lang)}
        identifiers={identifierOptions(lang)}
        initialSector={(SECTORS as readonly string[]).includes(sector ?? "") ? sector! : "other"}
        links={{ dashboard: "/dashboard/notices" }}
      />
      <p className="mt-10 text-xs leading-relaxed text-muted">{t("common.disclaimer")}</p>
    </div>
  );
}
