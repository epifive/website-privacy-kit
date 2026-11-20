import "server-only";
import type { Metadata } from "next";
import { langPath, marketingT } from "@/core/marketing/text";
import type { ReadinessLang } from "@/core/readiness/model";
import { alternateGuide, getGuide, guidePath } from "./guides";

/** Canonical + hreflang (only when the other language exists) + Open Graph article fields. */
export function guideMetadata(lang: ReadinessLang, slug: string): Metadata {
  const g = getGuide(lang, slug);
  if (!g) return {};
  const alt = alternateGuide(g);
  const en = lang === "en" ? g : (alt ?? g);
  const canonical = guidePath(lang, slug);
  return {
    title: { absolute: g.title },
    description: g.description,
    keywords: g.keyword || undefined,
    alternates: {
      canonical,
      languages: alt ? { [g.lang]: canonical, [alt.lang]: guidePath(alt.lang, alt.slug), "x-default": guidePath(en.lang, en.slug) } : undefined,
    },
    openGraph: { type: "article", title: g.title, description: g.description, url: canonical, locale: lang === "hi" ? "hi_IN" : "en_IN", modifiedTime: g.lastReviewed },
    twitter: { card: "summary_large_image", title: g.title, description: g.description },
  };
}

export function guideIndexMetadata(lang: ReadinessLang): Metadata {
  const t = marketingT(lang);
  return {
    title: t("g.indexTitle"),
    description: t("g.indexDescription"),
    alternates: { canonical: langPath(lang, "/guides"), languages: { en: "/guides", hi: "/hi/guides", "x-default": "/guides" } },
    openGraph: { type: "website", title: t("g.indexTitle"), description: t("g.indexDescription"), url: langPath(lang, "/guides") },
  };
}

/** Latin title for the OG image (the bundled OG font has no Devanagari). */
export function guideOgTitle(lang: ReadinessLang, slug: string): { title: string; eyebrow: string } {
  const g = getGuide(lang, slug);
  if (!g) return { title: "DPDP guide", eyebrow: "Guide" };
  if (lang === "en") return { title: g.title, eyebrow: "DPDP guide" };
  const en = alternateGuide(g);
  return { title: en ? en.title : "DPDP guide in Hindi", eyebrow: "DPDP guide · Hindi" };
}
