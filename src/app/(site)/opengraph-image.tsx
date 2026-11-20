import { ogCard, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "EpiFive Website Privacy Kit";

export default function Image() {
  return ogCard({ eyebrow: "DPDP Rules apply from 13 May 2027", title: "Privacy notices in English and Hindi, consent banner, records and rights requests", footer: "From Rs 299/month · Done-for-you setup Rs 4,999 · Not legal advice" });
}
