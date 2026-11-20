/**
 * Banner settings stored per site (sites.theme_json) and the Google Consent
 * Mode v2 mapping (plan §7.3, M2). Pure functions, no I/O.
 */

export const BANNER_POSITIONS = ["bottom", "bottom-left", "bottom-right", "center"] as const;
export type BannerPosition = (typeof BANNER_POSITIONS)[number];
export const BANNER_LANGS = ["auto", "en", "hi"] as const;
export type BannerLang = (typeof BANNER_LANGS)[number];

/** Consent Mode v2 types the banner can grant. security/functionality are always "granted" (necessary). */
export const GCM_TYPES = ["analytics_storage", "ad_storage", "ad_user_data", "ad_personalization", "personalization_storage"] as const;
export type GcmType = (typeof GCM_TYPES)[number];
/** GCM type → purpose key ("" = stays denied). */
export type GcmMap = Record<GcmType, string>;

export interface BannerTheme {
  primary: string;
  background: string;
  text: string;
  position: BannerPosition;
  lang: BannerLang;
  /** Show the floating "Privacy choices" button after a choice (s.6(4) easy withdrawal). */
  floating: boolean;
  /** Explicit Consent Mode mapping; missing entries fall back to defaultGcmMap(). */
  gcm: Partial<GcmMap>;
}

export const DEFAULT_THEME: BannerTheme = {
  primary: "#0f5c4d",
  background: "#ffffff",
  text: "#17201c",
  position: "bottom",
  lang: "auto",
  floating: true,
  gcm: {},
};

const HEX = /^#[0-9a-f]{6}$/i;

export function parseTheme(json: string | null | undefined): BannerTheme {
  let raw: Record<string, unknown> = {};
  try {
    const v = JSON.parse(json || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) raw = v as Record<string, unknown>;
  } catch {
    // Fall back to defaults.
  }
  const color = (k: "primary" | "background" | "text") => (typeof raw[k] === "string" && HEX.test(raw[k] as string) ? (raw[k] as string).toLowerCase() : DEFAULT_THEME[k]);
  const gcm: Partial<GcmMap> = {};
  if (raw.gcm && typeof raw.gcm === "object") {
    for (const type of GCM_TYPES) {
      const v = (raw.gcm as Record<string, unknown>)[type];
      if (typeof v === "string" && /^[a-z0-9_]{0,60}$/.test(v)) gcm[type] = v;
    }
  }
  return {
    primary: color("primary"),
    background: color("background"),
    text: color("text"),
    position: (BANNER_POSITIONS as readonly string[]).includes(raw.position as string) ? (raw.position as BannerPosition) : DEFAULT_THEME.position,
    lang: (BANNER_LANGS as readonly string[]).includes(raw.lang as string) ? (raw.lang as BannerLang) : DEFAULT_THEME.lang,
    floating: raw.floating === undefined ? DEFAULT_THEME.floating : raw.floating === true,
    gcm,
  };
}

/** Relative luminance contrast ratio (WCAG 2.1). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Problems that would make the banner hard to read (plan §7.3: 4.5:1 contrast). */
export function themeIssues(theme: BannerTheme): Array<"text_contrast" | "button_contrast"> {
  const issues: Array<"text_contrast" | "button_contrast"> = [];
  if (contrastRatio(theme.text, theme.background) < 4.5) issues.push("text_contrast");
  // Buttons: white text on the primary colour, and the outline buttons use the primary on the background.
  if (contrastRatio("#ffffff", theme.primary) < 4.5 || contrastRatio(theme.primary, theme.background) < 3) issues.push("button_contrast");
  return issues;
}

/** Suggested Consent Mode mapping from purpose keys (analytics → analytics_storage, ads → ad_*). */
export function defaultGcmMap(consentPurposeKeys: string[]): GcmMap {
  const find = (re: RegExp) => consentPurposeKeys.find((k) => re.test(k)) ?? "";
  const analytics = find(/analytic|statistic|measure/);
  const ads = find(/(^|_)ads?($|_)|advert|remarketing/);
  const personal = find(/personal/);
  return { analytics_storage: analytics, ad_storage: ads, ad_user_data: ads, ad_personalization: ads, personalization_storage: personal };
}

/** Effective mapping: explicit choices win; unknown purpose keys are dropped. */
export function resolveGcmMap(theme: BannerTheme, consentPurposeKeys: string[]): GcmMap {
  const defaults = defaultGcmMap(consentPurposeKeys);
  const out = { ...defaults };
  for (const type of GCM_TYPES) {
    const v = theme.gcm[type];
    if (v !== undefined) out[type] = v === "" || consentPurposeKeys.includes(v) ? v : defaults[type];
  }
  return out;
}
