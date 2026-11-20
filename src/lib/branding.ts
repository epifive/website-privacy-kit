import { EDITION, SOURCE_URL } from "./edition-meta";

/**
 * The small branding link under the consent banner and on the privacy hub.
 * Free edition: always "Privacy tools by EpiFive". Pro edition (white-label):
 * Admin → Settings → Banner & privacy page sets the text and link; an empty text
 * shows no branding at all.
 */
export interface Brand {
  text: string;
  url: string;
}

export const EPIFIVE_BRAND: Brand = { text: "Privacy tools by EpiFive", url: SOURCE_URL };

export function brandFrom(settings: { branding_text: string; branding_url: string }): Brand | null {
  if (EDITION === "free") return EPIFIVE_BRAND;
  const text = settings.branding_text.trim().slice(0, 60);
  const url = settings.branding_url.trim();
  return text ? { text, url: /^https:\/\//.test(url) ? url : "" } : null;
}
