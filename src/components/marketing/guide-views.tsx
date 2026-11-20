import Link from "next/link";
import { PRO_URL } from "@/lib/edition-meta";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, Languages } from "lucide-react";
import { langPath, marketingT } from "@/core/marketing/text";
import type { ReadinessLang } from "@/core/readiness/model";
import { JsonLd } from "@/components/site/json-ld";
import { buttonClass } from "@/components/ui/button";
import { alternateGuide, getGuide, guidePath, listGuides, renderGuide } from "@/lib/guides";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site";

const formatReviewed = (iso: string, lang: ReadinessLang) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/** /guides and /hi/guides */
export async function GuideIndexView({ lang }: { lang: ReadinessLang }) {
  const t = marketingT(lang);
  const guides = listGuides().filter((g) => g.lang === lang);
  const other = listGuides().filter((g) => g.lang !== lang);
  return (
    <div lang={lang} className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("g.indexTitle")}</h1>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">{t("g.indexIntro")}</p>
      <ul className="mt-10 grid gap-5 sm:grid-cols-2">
        {guides.map((g) => (
          <li key={g.slug}>
            <Link href={guidePath(lang, g.slug)} className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-primary-line">
              <span className="text-lg leading-snug font-semibold group-hover:text-primary-text">{g.heading}</span>
              <span className="mt-2 text-sm leading-relaxed text-muted">{g.description}</span>
              <span className="mt-4 text-xs text-muted">{t("g.reviewed", { date: formatReviewed(g.lastReviewed, lang) })}</span>
            </Link>
          </li>
        ))}
      </ul>
      {other.length ? (
        <section aria-labelledby="other-lang" className="mt-14" lang={lang === "en" ? "hi" : "en"}>
          <h2 id="other-lang" className="text-xl font-bold">
            {lang === "en" ? t("g.hindiGuides") : t("g.englishGuides")}
          </h2>
          <ul className="mt-4 space-y-2">
            {other.map((g) => (
              <li key={`${g.lang}-${g.slug}`}>
                <Link href={guidePath(g.lang, g.slug)} hrefLang={g.lang} className="text-primary-text underline underline-offset-2">
                  {g.heading}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <GuideCta lang={lang} />
    </div>
  );
}

function GuideCta({ lang }: { lang: ReadinessLang }) {
  const t = marketingT(lang);
  return (
    <aside aria-label={t("g.ctaTitle")} className="mt-12 rounded-2xl border border-primary-line bg-primary-soft p-6 sm:p-8">
      <p className="text-xl font-bold">{t("g.ctaTitle")}</p>
      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed">{t("g.ctaText")}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={langPath(lang, "/readiness")} className={buttonClass("primary", "md")}>
          {t("g.ctaButton")}
          <ArrowRight aria-hidden className="rtl:rotate-180" />
        </Link>
        <a href={PRO_URL} target="_blank" rel="noopener" className={buttonClass("outline", "md")}>
          {t("g.ctaPricing")}
        </a>
      </div>
    </aside>
  );
}

/** /guides/<slug> and /hi/guides/<slug> */
export async function GuideView({ lang, slug }: { lang: ReadinessLang; slug: string }) {
  const guide = getGuide(lang, slug);
  if (!guide) notFound();
  const settings = await getSettings();
  const t = marketingT(lang);
  const { html, toc, faqs } = renderGuide(guide);
  const alt = alternateGuide(guide);
  const url = absoluteUrl(settings, guidePath(lang, slug));
  const related = listGuides()
    .filter((g) => g.lang === lang && g.slug !== slug)
    .slice(0, 4);

  return (
    <div lang={lang} className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              headline: guide.title,
              description: guide.description,
              inLanguage: lang,
              url,
              mainEntityOfPage: url,
              dateModified: guide.lastReviewed,
              author: { "@type": "Organization", name: "EpiFive" },
              publisher: { "@type": "Organization", name: "EpiFive" },
              citation: guide.sources,
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: t("g.home"), item: absoluteUrl(settings, "/") },
                { "@type": "ListItem", position: 2, name: t("g.guides"), item: absoluteUrl(settings, langPath(lang, "/guides")) },
                { "@type": "ListItem", position: 3, name: guide.heading, item: url },
              ],
            },
            ...(faqs.length
              ? [
                  {
                    "@type": "FAQPage",
                    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
                  },
                ]
              : []),
          ],
        }}
      />
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-ink">
              {t("g.home")}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5 rtl:rotate-180" />
          </li>
          <li>
            <Link href={langPath(lang, "/guides")} className="hover:text-ink">
              {t("g.guides")}
            </Link>
          </li>
        </ol>
      </nav>

      <header className="mt-5 max-w-3xl">
        <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-[2.6rem]">{guide.heading}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">{guide.description}</p>
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span>{t("g.reviewed", { date: formatReviewed(guide.lastReviewed, lang) })}</span>
          {alt ? (
            <Link
              href={guidePath(alt.lang, alt.slug)}
              hrefLang={alt.lang}
              lang={alt.lang}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 font-medium text-ink hover:border-primary-line"
            >
              <Languages className="size-4" aria-hidden />
              {alt.lang === "hi" ? t("g.readHindi") : t("g.readEnglish")}
            </Link>
          ) : null}
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        {toc.length ? (
          <nav aria-label={t("g.onThisPage")} className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto">
            <p className="text-sm font-semibold tracking-wide uppercase">{t("g.onThisPage")}</p>
            <ol className="mt-3 space-y-2 border-s border-line ps-4 text-sm">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-muted hover:text-primary-text">
                    {item.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <div className="min-w-0">
          <article className="prose-guide" dangerouslySetInnerHTML={{ __html: html }} />
          <GuideCta lang={lang} />
          {related.length ? (
            <section aria-labelledby="related" className="mt-12">
              <h2 id="related" className="text-xl font-bold">
                {t("g.related")}
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {related.map((g) => (
                  <li key={g.slug}>
                    <Link href={guidePath(lang, g.slug)} className="block h-full rounded-xl border border-line bg-surface p-4 font-medium hover:border-primary-line hover:text-primary-text">
                      {g.heading}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
