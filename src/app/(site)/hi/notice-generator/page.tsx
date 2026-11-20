import type { Metadata } from "next";
import { NoticeGeneratorView } from "@/components/marketing/notice-generator-view";
import { marketingT } from "@/core/marketing/text";
import { bilingualMetadata } from "@/lib/marketing-meta";

const LANG = "hi" as const;

export function generateMetadata(): Metadata {
  const t = marketingT(LANG);
  return bilingualMetadata({ lang: LANG, path: "/notice-generator", title: t("ng.metaTitle"), description: t("ng.metaDescription") });
}

export default async function NoticeGeneratorPage({ searchParams }: { searchParams: Promise<{ sector?: string }> }) {
  const { sector } = await searchParams;
  return <NoticeGeneratorView lang={LANG} sector={typeof sector === "string" ? sector : undefined} />;
}
