import Link from "next/link";
import { ArrowRight, Check, FileText, Sparkles } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import type { Translator } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export function Hero({
  t,
  title,
  subtitle,
  signedIn,
  checkHref = "/readiness",
}: {
  t: Translator;
  title: string;
  subtitle: string;
  signedIn: boolean;
  checkHref?: string;
}) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden border-b border-line">
      <div aria-hidden className="mat-grid mat-grid-fade absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-48 mx-auto h-[520px] max-w-4xl rounded-full bg-primary/20 blur-[120px] dark:bg-primary/25" />
      <div aria-hidden className="pointer-events-none absolute -end-40 top-40 h-[360px] w-[360px] rounded-full bg-marker/25 blur-[110px] dark:bg-marker/10" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-4 pt-14 pb-24 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.08fr] lg:gap-12 lg:pt-24 lg:pb-32">
        <div className="text-center lg:text-start">
          <Link
            href="#features"
            className="group inline-flex max-w-full items-center gap-2 rounded-full border border-primary-line bg-surface/80 py-1 ps-1 pe-3 text-sm font-medium shadow-sm backdrop-blur transition-colors hover:border-primary"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-marker text-[#3d2e00]">
              <Sparkles className="size-3.5" aria-hidden />
            </span>
            <span className="truncate">{t("home.eyebrow")}</span>
            <ArrowRight className="size-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary-text rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
          </Link>

          <p className="mt-7 text-sm font-semibold tracking-[0.12em] text-primary-text uppercase">{t("home.brand")}</p>
          <h1
            id="hero-title"
            className="mx-auto mt-3 max-w-[16ch] bg-gradient-to-b from-ink from-40% to-ink/70 bg-clip-text text-[2.6rem] leading-[1.02] font-bold tracking-[-0.035em] text-balance text-transparent sm:text-6xl lg:mx-0 lg:text-[3.5rem] xl:text-[4.25rem]"
          >
            {title}
          </h1>
          <p className="mx-auto mt-6 max-w-[54ch] text-lg leading-relaxed text-muted lg:mx-0">
            {subtitle}
          </p>

          <div className="mt-9 flex flex-wrap justify-center gap-3 lg:justify-start">
            <Link href={signedIn ? "/dashboard" : "/login"} className={buttonClass("primary", "lg", "group shadow-lg shadow-primary/30")}>
              {signedIn ? t("nav.dashboard") : t("home.ctaStart")}
              <ArrowRight aria-hidden className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </Link>
            <Link href={checkHref} className={buttonClass("outline", "lg")}>
              {t("home.ctaCheck")}
            </Link>
          </div>

          <ul className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted lg:justify-start">
            {(["home.trustFree", "home.trustFast", "home.trustCancel"] as const).map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                {t(key)}
              </li>
            ))}
          </ul>

          <p className="mx-auto mt-8 max-w-[60ch] text-xs leading-relaxed text-muted lg:mx-0">
            {t("legal.disclaimerShort")}
          </p>
        </div>

        <div className="lg:ps-4">
          <NoticePreview t={t} />
        </div>
      </div>
    </section>
  );
}

const PLATFORMS = ["WordPress", "Shopify", "WooCommerce", "Wix", "Webflow", "HTML"];

/** Benefits strip (Admin → Settings → Home page) and the "works with" list. */
export function ProofStrip({ t, showStats }: { t: Translator; showStats: boolean }) {
  const stats = [
    ["home.stat1Value", "home.stat1Label"],
    ["home.stat2Value", "home.stat2Label"],
    ["home.stat3Value", "home.stat3Label"],
    ["home.stat4Value", "home.stat4Label"],
  ] as const;
  return (
    <section aria-label={t("home.worksWith")} className="border-b border-line bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {showStats ? (
          <dl className="grid grid-cols-2 border-b border-line md:grid-cols-4">
            {stats.map(([value, label], i) => (
              <div
                key={value}
                className={cn(
                  "flex flex-col-reverse gap-1 px-2 py-7 text-center sm:py-9",
                  i % 2 === 1 && "border-s border-line",
                  i >= 2 && "border-t border-line md:border-t-0",
                  i === 2 && "md:border-s",
                )}
              >
                <dt className="text-sm text-muted">{t(label)}</dt>
                <dd className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="flex flex-col items-center gap-4 py-7 sm:flex-row sm:justify-center sm:gap-6">
          <p className="shrink-0 text-xs font-semibold tracking-[0.14em] text-muted uppercase">{t("home.worksWith")}</p>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {PLATFORMS.map((name) => (
              <li key={name} className="font-display text-[15px] font-semibold text-ink/75 dark:text-ink/75">
                {name}
              </li>
            ))}
            <li className="font-display text-[15px] font-semibold text-ink/75 dark:text-ink/75">+ {t("home.anySite")}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Static illustration of a generated, itemised notice (not a live widget). */
function NoticePreview({ t }: { t: Translator }) {
  const items = [
    ["home.preview.purpose1", "home.preview.items1"],
    ["home.preview.purpose2", "home.preview.items2"],
  ] as const;
  return (
    <figure
      aria-label={t("home.preview.label")}
      className="relative mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl shadow-black/10 dark:shadow-black/40"
    >
      <figcaption className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="size-4 text-primary" aria-hidden />
        {t("home.preview.title")}
        <span className="ms-auto rounded-full border border-line px-2 py-0.5 text-xs font-normal text-muted">EN · हिंदी</span>
      </figcaption>
      <ul className="mt-5 space-y-4">
        {items.map(([purpose, list]) => (
          <li key={purpose} className="rounded-xl border border-line bg-paper p-4">
            <p className="text-sm font-semibold">{t(purpose)}</p>
            <p className="mt-1 text-sm text-muted">{t(list)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs text-muted">{t("home.preview.links")}</p>
    </figure>
  );
}
