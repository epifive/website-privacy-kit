import { ogCard, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Free DPDP privacy notice generator";

export default function Image() {
  return ogCard({ eyebrow: "Free tool", title: "Free DPDP privacy notice generator, English + Hindi" });
}
