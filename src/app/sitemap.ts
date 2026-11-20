import type { MetadataRoute } from "next";
import { alternateGuide, guidePath, listGuides } from "@/lib/guides";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSettings();
  const url = (path: string) => absoluteUrl(settings, path);
  // Pages that exist at /x and /hi/x: one entry per language with hreflang alternates.
  const bilingual = (path: string, priority: number, changeFrequency: "weekly" | "monthly" = "monthly") =>
    (["", "/hi"] as const).map((prefix) => ({
      url: url(`${prefix}${path}`),
      changeFrequency,
      priority,
      alternates: { languages: { en: url(path), hi: url(`/hi${path}`) } },
    }));
  const guides = listGuides().map((g) => {
    const alt = alternateGuide(g);
    return {
      url: url(guidePath(g.lang, g.slug)),
      lastModified: g.lastReviewed,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      ...(alt ? { alternates: { languages: { [g.lang]: url(guidePath(g.lang, g.slug)), [alt.lang]: url(guidePath(alt.lang, alt.slug)) } } } : {}),
    };
  });

  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    ...bilingual("/readiness", 0.9),
    ...bilingual("/notice-generator", 0.9),
    ...bilingual("/guides", 0.7, "weekly"),
    ...guides,
  ];
}
