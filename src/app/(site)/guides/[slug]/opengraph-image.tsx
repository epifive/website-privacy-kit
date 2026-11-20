import { guideOgTitle } from "@/lib/guide-meta";
import { ogCard, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "DPDP guide";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { title, eyebrow } = guideOgTitle("en", (await params).slug);
  return ogCard({ eyebrow, title });
}
