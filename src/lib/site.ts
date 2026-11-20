import "server-only";
import { cache } from "react";
import { getCurrentUser } from "./auth/session";
import { getSettings, type Settings } from "./settings";
import { getActiveLanguages, getLocale } from "./i18n/server";

/** Everything the public layout needs, loaded once per request. */
export const getSiteContext = cache(async () => {
  const [settings, user, locale] = await Promise.all([getSettings(), getCurrentUser(), getLocale()]);
  const languages = await getActiveLanguages();
  return { settings, user, locale, languages };
});

export function absoluteUrl(settings: Settings, path = "/"): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
  const base = (settings.site_url || process.env.SITE_URL || vercel || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function uploadUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return `/uploads/${path}`;
}
