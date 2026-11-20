import type { SettingKey } from "@/lib/settings";

/**
 * Declarative description of every settings screen. The admin UI renders forms
 * from this list and the save action uses it to validate which keys a section
 * may change, so adding a setting only takes one entry here plus a default in
 * lib/settings.ts.
 */

export type FieldType = "text" | "textarea" | "code" | "switch" | "number" | "select" | "color" | "image" | "password" | "email" | "url";

export interface SettingField {
  key: SettingKey;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  /** Visually group fields under a sub-heading. */
  group?: string;
}

export interface SettingSection {
  slug: string;
  title: string;
  description: string;
  fields: SettingField[];
}

export const SETTING_SECTIONS: SettingSection[] = [
  {
    slug: "general",
    title: "General",
    description: "Your site's name, address, logo and footer.",
    fields: [
      { key: "site_name", label: "Site name", type: "text" },
      { key: "site_tagline", label: "Tagline", type: "text" },
      { key: "site_url", label: "Site URL", type: "url", hint: "Full address without a trailing slash, e.g. https://privacy.example.com" },
      { key: "site_email", label: "Contact email", type: "email", hint: "Shown in the footer and used as the reply-to address of emails." },
      { key: "logo", label: "Logo", type: "image", hint: "PNG, SVG or WebP, about 160 × 40 px. Leave empty to show the site name.", group: "Branding" },
      { key: "logo_dark", label: "Logo for dark mode", type: "image", hint: "Optional light-coloured version of your logo.", group: "Branding" },
      { key: "favicon", label: "Favicon", type: "image", hint: "Square PNG or ICO, at least 48 × 48 px.", group: "Branding" },
      { key: "footer_text", label: "Footer text", type: "textarea", group: "Footer" },
      { key: "copyright_text", label: "Copyright line", type: "text", hint: "{year} and {site_name} are replaced automatically.", group: "Footer" },
    ],
  },
  {
    slug: "appearance",
    title: "Appearance",
    description: "Brand colour, theme and home page text.",
    fields: [
      { key: "primary_color", label: "Brand colour", type: "color", hint: "Used for buttons, links and highlights." },
      {
        key: "default_theme",
        label: "Default theme",
        type: "select",
        options: [
          { value: "system", label: "Follow the visitor's device" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ],
      },
      { key: "home_hero_title", label: "Home page headline", type: "text", group: "Home page" },
      { key: "home_hero_subtitle", label: "Home page introduction", type: "textarea", group: "Home page" },
      { key: "show_stats_on_home", label: "Show the benefits strip under the hero", type: "switch", group: "Home page" },
    ],
  },
  {
    slug: "seo",
    title: "SEO",
    description: "Search engine titles, descriptions and verification.",
    fields: [
      { key: "meta_title", label: "Home page title", type: "text", hint: "50–60 characters works best." },
      { key: "meta_description", label: "Home page description", type: "textarea", hint: "120–160 characters works best." },
      { key: "meta_keywords", label: "Keywords", type: "text", hint: "Comma separated. Most search engines ignore this." },
      { key: "title_separator", label: "Title separator", type: "text", hint: "Placed between page and site name, e.g. \" | \" or \" – \"." },
      { key: "og_image", label: "Social sharing image", type: "image", hint: "1200 × 630 px. Shown when links are shared on social media." },
      { key: "google_site_verification", label: "Google Search Console code", type: "text", group: "Verification", placeholder: "Content value of the meta tag" },
      { key: "bing_site_verification", label: "Bing Webmaster code", type: "text", group: "Verification" },
      {
        key: "robots_extra",
        label: "Extra disallowed paths",
        type: "textarea",
        group: "Robots.txt",
        hint: "One rule per line, e.g. \"Disallow: /private\". Admin and account pages are always blocked.",
      },
    ],
  },
  {
    slug: "banner",
    title: "Banner & privacy page",
    description: "Your own banner on these pages and the bot check on the rights request form. (White-label branding is in the Pro edition.)",
    fields: [
      {
        key: "own_site_key",
        label: "Run a consent banner on this website",
        type: "text",
        group: "Your own website",
        hint: "Paste the public key of one of your sites from the dashboard to run its banner on these public pages (you are the Data Fiduciary for your own visitors). Leave empty to show none.",
      },
      {
        key: "turnstile_site_key",
        label: "Cloudflare Turnstile site key",
        type: "text",
        group: "Rights request form",
        hint: "Adds a Turnstile check to the public request form at /p/{org}/rights. Leave both keys empty to turn it off (the email code still verifies every request). WPK_TURNSTILE=off disables it for development and tests.",
      },
      { key: "turnstile_secret_key", label: "Cloudflare Turnstile secret key", type: "password", group: "Rights request form" },
    ],
  },
  {
    slug: "security",
    title: "Security & data",
    description: "The daily consent-record digest.",
    fields: [
      {
        key: "chain_digest_enabled",
        label: "Email each owner a daily consent-record digest",
        type: "switch",
        group: "Daily digest",
        hint: "Chain head (last record and its hash) per website, so later tampering is evident (plan §7.4). Sent only for websites with new records.",
      },
    ],
  },
  {
    slug: "email",
    title: "Email",
    description: "Any SMTP server (Amazon SES, Zoho, Gmail, your host), for every email the app sends. Send a test from Admin → Email.",
    fields: [
      { key: "mail_enabled", label: "Send emails", type: "switch" },
      { key: "smtp_host", label: "SMTP host", type: "text", placeholder: "smtp.example.com" },
      { key: "smtp_port", label: "SMTP port", type: "number", hint: "Usually 587 (STARTTLS) or 465 (SSL)." },
      { key: "smtp_secure", label: "Use SSL (port 465)", type: "switch" },
      { key: "smtp_user", label: "Username", type: "text" },
      { key: "smtp_pass", label: "Password", type: "password" },
      { key: "mail_from_name", label: "Sender name", type: "text" },
      { key: "mail_from_address", label: "Sender email", type: "email" },
    ],
  },
  {
    slug: "advanced",
    title: "Advanced",
    description: "Cookie notice, maintenance mode and custom code.",
    fields: [
      { key: "cookie_consent_enabled", label: "Show the essential-cookie notice on public pages", type: "switch", group: "Cookie notice" },
      { key: "cookie_consent_text", label: "Cookie notice text", type: "textarea", group: "Cookie notice" },
      { key: "maintenance_mode", label: "Maintenance mode", type: "switch", hint: "Only administrators can see the site while this is on." },
      { key: "maintenance_message", label: "Maintenance message", type: "textarea" },
      { key: "custom_head_code", label: "Analytics / tracking code", type: "code", group: "Custom code", hint: "E.g. Google Analytics. Loaded on every public page." },
      { key: "custom_body_code", label: "Additional code", type: "code", group: "Custom code", hint: "E.g. a live chat widget." },
    ],
  },
];

export function getSection(slug: string): SettingSection | undefined {
  return SETTING_SECTIONS.find((s) => s.slug === slug);
}
