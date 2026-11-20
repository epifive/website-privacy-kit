import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Marked, type Tokens } from "marked";
import { langPath } from "@/core/marketing/text";
import type { ReadinessLang } from "@/core/readiness/model";

/**
 * SEO guides (plan §11): Markdown files in content/guides/{en,hi}/<slug>.md
 * with a small YAML front matter, rendered at `/guides/<slug>` and
 * `/hi/guides/<slug>`. The files are our own reviewed content (drafts pending
 * lawyer review); raw HTML is still escaped as defence in depth.
 */

export interface GuideMeta {
  lang: ReadinessLang;
  slug: string;
  title: string;
  description: string;
  keyword: string;
  lastReviewed: string;
  sources: string[];
}

export interface Guide extends GuideMeta {
  /** First heading of the body (the page H1). */
  heading: string;
  /** Markdown body without front matter and without the H1. */
  body: string;
}

export interface RenderedGuide {
  html: string;
  toc: Array<{ id: string; text: string }>;
  faqs: Array<{ q: string; a: string }>;
}

export const GUIDE_LANGS: readonly ReadinessLang[] = ["en", "hi"];
const DIR = path.join(process.cwd(), "content", "guides");

/** Minimal front-matter reader: `key: value`, quoted strings, `- item` lists, one level of nested maps. */
export function parseFrontMatter(source: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!m) return { data: {}, body: source };
  const data: Record<string, unknown> = {};
  let current: string | null = null;
  const unquote = (v: string) => {
    const s = v.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).replace(/\\"/g, '"');
    return s === "null" ? null : s;
  };
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    const nested = /^\s+([\w-]+):\s*(.*)$/.exec(line);
    const top = /^([\w-]+):\s*(.*)$/.exec(line);
    if (item && current) {
      const list = Array.isArray(data[current]) ? (data[current] as unknown[]) : [];
      list.push(unquote(item[1]));
      data[current] = list;
    } else if (nested && current) {
      const map = data[current] && typeof data[current] === "object" && !Array.isArray(data[current]) ? (data[current] as Record<string, unknown>) : {};
      map[nested[1]] = unquote(nested[2]);
      data[current] = map;
    } else if (top) {
      current = top[1];
      data[current] = top[2].trim() === "" ? null : unquote(top[2]);
    }
  }
  return { data, body: source.slice(m[0].length) };
}

function readGuide(lang: ReadinessLang, file: string): Guide {
  const { data, body } = parseFrontMatter(fs.readFileSync(path.join(DIR, lang, file), "utf8"));
  const slug = file.replace(/\.md$/, "");
  const h1 = /^#\s+(.+)$/m.exec(body);
  return {
    lang,
    slug,
    title: String(data.title ?? slug),
    description: String(data.meta_description ?? ""),
    keyword: String(data.primary_keyword ?? ""),
    lastReviewed: String(data.last_reviewed ?? ""),
    sources: Array.isArray(data.sources) ? data.sources.map(String) : [],
    heading: h1 ? h1[1].trim() : String(data.title ?? slug),
    body: h1 ? body.replace(h1[0], "").trim() : body.trim(),
  };
}

const globalCache = globalThis as unknown as { __wpkGuides?: Guide[] };

/** All guides, English first, in a stable order. Cached for the life of the process. */
export function listGuides(): Guide[] {
  if (globalCache.__wpkGuides) return globalCache.__wpkGuides;
  const all: Guide[] = [];
  for (const lang of GUIDE_LANGS) {
    const dir = path.join(DIR, lang);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) all.push(readGuide(lang, file));
  }
  globalCache.__wpkGuides = all;
  return all;
}

export function getGuide(lang: ReadinessLang, slug: string): Guide | null {
  return listGuides().find((g) => g.lang === lang && g.slug === slug) ?? null;
}

/** The same guide in the other language, if it exists. */
export function alternateGuide(g: Pick<Guide, "lang" | "slug">): Guide | null {
  return getGuide(g.lang === "en" ? "hi" : "en", g.slug);
}

export function guidePath(lang: ReadinessLang, slug: string): string {
  return langPath(lang, `/guides/${slug}`);
}

/** Rewrite the content repo's planned URLs to this app's routes. */
export function rewriteHref(href: string, lang: ReadinessLang): string {
  let m = /^\/hi\/dpdp\/([a-z0-9-]+)\/?(#.*)?$/.exec(href);
  if (m) return guidePath("hi", m[1]) + (m[2] ?? "");
  m = /^\/dpdp\/([a-z0-9-]+)\/?(#.*)?$/.exec(href);
  if (m) return guidePath(lang === "hi" && getGuide("hi", m[1]) ? "hi" : "en", m[1]) + (m[2] ?? "");
  if (/^\/website-privacy-kit\/?$/.test(href)) return "/dashboard/setup";
  if (/^\/readiness\/?$/.test(href)) return langPath(lang, "/readiness");
  return href;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (md: string) =>
  md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function slugifyHeading(text: string, index: number): string {
  const s = plain(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s.length >= 3 ? s : `section-${index + 1}`;
}

const FAQ_HEADING = /^##\s+(FAQ|Frequently asked questions|अक्सर पूछे जाने वाले सवाल)\s*$/im;

/** Question/answer pairs of the FAQ section (`**Question**` followed by the answer), as plain text. */
export function extractFaqs(body: string): Array<{ q: string; a: string }> {
  const start = FAQ_HEADING.exec(body);
  if (!start) return [];
  const rest = body.slice(start.index + start[0].length);
  const end = /^##\s/m.exec(rest);
  const section = end ? rest.slice(0, end.index) : rest;
  const faqs: Array<{ q: string; a: string }> = [];
  for (const block of section.split(/\n(?=\*\*)/)) {
    const m = /^\*\*(.+?)\*\*\s*\n?([\s\S]*)$/.exec(block.trim());
    if (!m) continue;
    const a = plain(m[2]);
    if (a) faqs.push({ q: plain(m[1]), a });
  }
  return faqs;
}

/** Render a guide body to HTML with heading ids (for the table of contents) and rewritten internal links. */
export function renderGuide(g: Guide): RenderedGuide {
  const toc: RenderedGuide["toc"] = [];
  const used = new Set<string>();
  let headingIndex = 0;
  const marked = new Marked({ gfm: true, breaks: false, async: false });
  marked.use({
    walkTokens(token) {
      if (token.type === "link") (token as Tokens.Link).href = rewriteHref((token as Tokens.Link).href, g.lang);
    },
    renderer: {
      heading(token: Tokens.Heading) {
        const text = this.parser.parseInline(token.tokens);
        let id = slugifyHeading(token.text, headingIndex++);
        while (used.has(id)) id = `${id}-${headingIndex}`;
        used.add(id);
        if (token.depth === 2) toc.push({ id, text: plain(token.text) });
        return `<h${token.depth} id="${id}">${text}</h${token.depth}>\n`;
      },
      link(token: Tokens.Link) {
        const text = this.parser.parseInline(token.tokens);
        const href = escapeHtml(token.href);
        const external = /^https?:\/\//.test(token.href);
        return external ? `<a href="${href}" rel="noopener noreferrer" target="_blank">${text}</a>` : `<a href="${href}">${text}</a>`;
      },
      table(token: Tokens.Table) {
        const cell = (c: Tokens.TableCell, tag: "th" | "td") => `<${tag}${tag === "th" ? ' scope="col"' : ""}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        const head = `<tr>${token.header.map((c) => cell(c, "th")).join("")}</tr>`;
        const rows = token.rows.map((r) => `<tr>${r.map((c) => cell(c, "td")).join("")}</tr>`).join("");
        return `<div class="table-wrap" role="region" tabindex="0" aria-label="${escapeHtml(plain(token.header.map((c) => c.text).join(", ")))}"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`;
      },
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(token.text);
      },
    },
  });
  const html = marked.parse(g.body) as string;
  return { html, toc, faqs: extractFaqs(g.body) };
}
