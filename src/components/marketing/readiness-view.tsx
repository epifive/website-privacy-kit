import { langPath, marketingT } from "@/core/marketing/text";
import type { ReadinessLang } from "@/core/readiness/model";
import { JsonLd } from "@/components/site/json-ld";
import { PRO_URL } from "@/lib/edition-meta";
import { pickTexts, readinessData } from "@/lib/readiness";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site";
import { PageIntro } from "./page-intro";
import { ReadinessChecker } from "./readiness-checker";

/** /readiness and /hi/readiness. No login; answers never leave the browser. */
export async function ReadinessView({ lang }: { lang: ReadinessLang }) {
  const settings = await getSettings();
  const t = marketingT(lang);
  const data = readinessData(lang);
  const url = absoluteUrl(settings, langPath(lang, "/readiness"));
  return (
    <div lang={lang} className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: t("rc.metaTitle"),
          description: t("rc.metaDescription"),
          url,
          inLanguage: lang,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
          publisher: { "@type": "Organization", name: "EpiFive" },
        }}
      />
      <PageIntro
        eyebrow={t("rc.eyebrow")}
        title={t("rc.title")}
        intro={t("rc.intro")}
        lang={lang}
        switchHref={langPath(lang === "en" ? "hi" : "en", "/readiness")}
        switchLabel={t("lang.switch")}
      />
      <ReadinessChecker
        data={data}
        texts={pickTexts(lang, ["rc.", "common."])}
        links={{ kit: "/dashboard", notice: langPath(lang, "/notice-generator"), pro: PRO_URL }}
      />
    </div>
  );
}
