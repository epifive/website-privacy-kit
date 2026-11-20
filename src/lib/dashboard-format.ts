import "server-only";

/** Formatting and query helpers shared by dashboard pages. */

/** Positive integer from a query-string value (page numbers, ranges). */
export function intParam(value: string | string[] | undefined, fallback: number, max = 100_000): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

export function formatNumber(n: number, locale: string): string {
  try {
    return n.toLocaleString(locale);
  } catch {
    return n.toLocaleString("en");
  }
}

export function formatDateTime(iso: string | null | undefined, locale: string, withTime = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) };
  try {
    return d.toLocaleString(locale, options);
  } catch {
    return d.toLocaleString("en", options);
  }
}

/** "3 hours ago" in the visitor's language. */
export function formatRelative(iso: string, locale: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  } catch {
    rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
}

/** Percentage with one decimal, "0%" when the base is zero. */
export function percent(part: number, whole: number, locale: string): string {
  const value = whole > 0 ? part / whole : 0;
  try {
    return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
  } catch {
    return `${(value * 100).toFixed(1)}%`;
  }
}

/** Search text for a LIKE pattern (wildcards typed by the user are dropped; works on MySQL and SQLite). */
export function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, "")}%`;
}
