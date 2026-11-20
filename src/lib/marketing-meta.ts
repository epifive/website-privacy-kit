import type { Metadata } from "next";
import { langPath } from "@/core/marketing/text";
import type { ReadinessLang } from "@/core/readiness/model";

/**
 * Metadata for a page that exists in English and Hindi at `/x` and `/hi/x`:
 * self-referencing canonical, hreflang alternates (x-default = English) and
 * Open Graph fields. `hasHindi: false` for English-only pages.
 */
export function bilingualMetadata(opts: {
  lang: ReadinessLang;
  path: string;
  title: string;
  description: string;
  hasHindi?: boolean;
  type?: "website" | "article";
  absoluteTitle?: boolean;
}): Metadata {
  const hasHindi = opts.hasHindi ?? true;
  const canonical = langPath(opts.lang, opts.path);
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: {
      canonical,
      languages: hasHindi ? { en: opts.path, hi: langPath("hi", opts.path), "x-default": opts.path } : undefined,
    },
    openGraph: {
      type: opts.type ?? "website",
      title: opts.title,
      description: opts.description,
      url: canonical,
      locale: opts.lang === "hi" ? "hi_IN" : "en_IN",
    },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description },
  };
}
