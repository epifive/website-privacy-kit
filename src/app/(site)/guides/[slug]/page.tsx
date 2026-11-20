import type { Metadata } from "next";
import { GuideView } from "@/components/marketing/guide-views";
import { guideMetadata } from "@/lib/guide-meta";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return guideMetadata("en", (await params).slug);
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  return <GuideView lang="en" slug={(await params).slug} />;
}
