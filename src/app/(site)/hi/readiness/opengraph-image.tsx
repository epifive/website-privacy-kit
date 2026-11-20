import { ogCard, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Free DPDP readiness check";

export default function Image() {
  return ogCard({ eyebrow: "Free tool · Hindi", title: "How ready is your business for DPDP? Free 3-minute check" });
}
