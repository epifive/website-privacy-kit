import { daysUntilCommencement, Deadline } from "@/components/site/landing/deadline";
import { Editions } from "@/components/site/landing/editions";
import { Faq } from "@/components/site/landing/faq";
import { FreeTools } from "@/components/site/landing/free-tools";
import { FinalCta } from "@/components/site/landing/final-cta";
import { Hero, ProofStrip } from "@/components/site/landing/hero";
import { HowItWorks } from "@/components/site/landing/how-it-works";
import { Features } from "@/components/site/landing/features";
import { Privacy } from "@/components/site/landing/privacy";
import { getT, localSetting } from "@/lib/i18n/server";
import { absoluteUrl, getSiteContext } from "@/lib/site";

export default async function HomePage() {
  const { settings, user, locale } = await getSiteContext();
  const [t, heroTitle, heroSubtitle] = await Promise.all([getT(), localSetting(settings, "home_hero_title"), localSetting(settings, "home_hero_subtitle")]);

  const hindi = locale.code === "hi";
  const lp = (path: string) => (hindi ? `/hi${path}` : path);

  return (
    <>
      <Hero t={t} title={heroTitle} subtitle={heroSubtitle} signedIn={Boolean(user)} checkHref={lp("/readiness")} />
      <ProofStrip t={t} showStats={settings.show_stats_on_home} />
      <Deadline t={t} guideHref={lp("/guides/dpdp-deadline-13-may-2027")} days={daysUntilCommencement()} />
      <Features t={t} />
      <FreeTools t={t} hindi={hindi} />
      <HowItWorks t={t} scriptUrl={absoluteUrl(settings, "/w.js")} locale={locale.code} />

      <Privacy t={t} />
      <Editions t={t} />
      <Faq t={t} />

      <section aria-labelledby="disclaimer-title" className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <div className="rounded-2xl border border-line bg-surface p-6 text-sm leading-relaxed text-muted">
          <h2 id="disclaimer-title" className="font-sans text-sm font-semibold tracking-normal text-ink">
            {t("home.disclaimerTitle")}
          </h2>
          <p className="mt-2">{t("legal.disclaimer")}</p>
        </div>
      </section>

      <FinalCta t={t} signedIn={Boolean(user)} />
    </>
  );
}
