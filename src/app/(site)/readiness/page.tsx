import type { Metadata } from "next";
import { ReadinessView } from "@/components/marketing/readiness-view";
import { marketingT } from "@/core/marketing/text";
import { bilingualMetadata } from "@/lib/marketing-meta";

const LANG = "en" as const;

export function generateMetadata(): Metadata {
  const t = marketingT(LANG);
  return bilingualMetadata({ lang: LANG, path: "/readiness", title: t("rc.metaTitle"), description: t("rc.metaDescription") });
}

export default function ReadinessPage() {
  return <ReadinessView lang={LANG} />;
}
