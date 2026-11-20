import type { Metadata } from "next";
import { GuideIndexView } from "@/components/marketing/guide-views";
import { guideIndexMetadata } from "@/lib/guide-meta";

export function generateMetadata(): Metadata {
  return guideIndexMetadata("hi");
}

export default function GuidesPage() {
  return <GuideIndexView lang="hi" />;
}
