import "server-only";
import { getDb } from "./db";

/**
 * Every configurable option with its default value. Values are stored as
 * strings in the `settings` table; the type of the default decides how the
 * stored value is parsed.
 */
export const SETTING_DEFAULTS = {
  // General
  site_name: "EpiFive Website Privacy Kit",
  site_tagline: "DPDP consent, notices and rights requests for Indian websites",
  site_url: "",
  site_email: "support@example.com",
  logo: "",
  logo_dark: "",
  favicon: "",
  footer_text: "EpiFive Website Privacy Kit helps you organise DPDP tasks. It is not legal advice and is not a Consent Manager registered with the Data Protection Board of India.",
  copyright_text: "© {year} EpiFive. All rights reserved.",

  // Appearance
  primary_color: "#0f766e",
  default_theme: "system",
  home_hero_title: "Get your website DPDP-ready before May 2027",
  home_hero_subtitle:
    "Privacy notices in English and Hindi, a purpose-wise consent banner, consent records, rights requests, a breach register and a retention schedule, built for small Indian businesses.",
  show_stats_on_home: true,

  // SEO
  meta_title: "EpiFive Website Privacy Kit — DPDP consent, notices and rights requests for Indian websites",
  meta_description:
    "DPDP Act and Rules 2025 toolkit for Indian websites: itemised privacy notice in English and Hindi, consent banner, consent records, rights requests and breach register. Not legal advice.",
  meta_keywords: "DPDP, DPDP Act 2023, DPDP Rules 2025, privacy notice, consent banner, India",
  og_image: "",
  google_site_verification: "",
  bing_site_verification: "",
  robots_extra: "",
  title_separator: " | ",

  // Banner and hosted privacy page
  // Free edition: the small "Privacy tools by EpiFive" link is fixed (white-label is a Pro feature).
  branding_text: "Privacy tools by EpiFive",
  branding_url: "https://www.epifive.com/products/website-privacy-kit-pro",
  own_site_key: "",
  // Cloudflare Turnstile on the public rights request form (off when empty).
  turnstile_site_key: "",
  turnstile_secret_key: "",

  // Custom code
  custom_head_code: "",
  custom_body_code: "",

  // Cookie consent
  cookie_consent_enabled: true,
  cookie_consent_text:
    "This site uses only essential cookies, to keep you signed in and remember your language. They are needed for the service to work.",

  // Language
  default_language: "en",

  // Email
  mail_enabled: false,
  smtp_host: "",
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: "",
  smtp_pass: "",
  mail_from_name: "Website Privacy Kit",
  mail_from_address: "no-reply@example.com",

  // Daily email to each organisation owner with the consent chain heads (plan §7.4 "Integrity").
  chain_digest_enabled: true,

  // Maintenance
  maintenance_mode: false,
  maintenance_message: "We are performing scheduled maintenance. Please check back soon.",
};

export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;

/** Settings that must never be sent to the browser. */
export const SECRET_SETTINGS: SettingKey[] = [
  "smtp_pass",
  "turnstile_secret_key",
];

const globalForSettings = globalThis as unknown as { __wpkSettings?: Settings };

function parse<K extends SettingKey>(key: K, raw: string | null): Settings[K] {
  const fallback = SETTING_DEFAULTS[key];
  if (raw === null || raw === undefined) return fallback;
  if (typeof fallback === "boolean") return (raw === "1" || raw === "true") as Settings[K];
  if (typeof fallback === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : fallback) as Settings[K];
  }
  return raw as Settings[K];
}

export async function getSettings(): Promise<Settings> {
  if (globalForSettings.__wpkSettings) return globalForSettings.__wpkSettings;
  const db = await getDb();
  const rows = await db.selectFrom("settings").selectAll().execute();
  const settings: Settings = { ...SETTING_DEFAULTS };
  const record = settings as Record<string, unknown>;
  for (const row of rows) {
    if (row.key in SETTING_DEFAULTS) {
      record[row.key] = parse(row.key as SettingKey, row.value);
    }
  }
  globalForSettings.__wpkSettings = settings;
  return settings;
}

function serialize(value: unknown): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value ?? "");
}

export async function updateSettings(values: Partial<Settings>): Promise<void> {
  const db = await getDb();
  await db.transaction().execute(async (trx) => {
    for (const [key, value] of Object.entries(values)) {
      if (!(key in SETTING_DEFAULTS)) continue;
      const serialized = serialize(value);
      const updated = await trx
        .updateTable("settings")
        .set({ value: serialized })
        .where("key", "=", key)
        .executeTakeFirst();
      if (Number(updated.numUpdatedRows) === 0) {
        // MySQL reports 0 changed rows when the value is unchanged, so check existence.
        const exists = await trx
          .selectFrom("settings")
          .select("key")
          .where("key", "=", key)
          .executeTakeFirst();
        if (!exists) await trx.insertInto("settings").values({ key, value: serialized }).execute();
      }
    }
  });
  clearSettingsCache();
}

export function clearSettingsCache(): void {
  globalForSettings.__wpkSettings = undefined;
}

/** Replace `{site_name}`, `{site_email}` and `{year}` placeholders. */
export function fillPlaceholders(text: string, settings: Settings): string {
  return text
    .replaceAll("{site_name}", settings.site_name)
    .replaceAll("{site_email}", settings.site_email)
    .replaceAll("{year}", String(new Date().getFullYear()));
}
