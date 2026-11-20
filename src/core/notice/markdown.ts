/**
 * The small Markdown subset used by generated notices, and a safe renderer for it.
 *
 * Notices are stored as Markdown (immutable `notice_versions.body_md`). Business
 * input is always passed through `md()` before it is placed in the document, so
 * names or descriptions can never inject formatting, links or HTML. The renderer
 * escapes every character it outputs and only emits a fixed set of tags; it
 * never passes raw HTML through (plan §7.6: "Sanitised Markdown, no raw HTML").
 *
 * Supported blocks: `#`, `##`, `###` headings, `- ` list items, `> ` quotes,
 * `---` rules, paragraphs. Inline: `**bold**`, `[text](url)`, `\` escapes.
 */

const SPECIAL = /[\\`*_[\]()#<>&|!~+-]/g;

/** Escape business-provided text for safe inclusion in a notice. */
export function md(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(SPECIAL, (c) => `\\${c}`);
}

/** A link with an escaped label. The URL must be http(s), mailto:, tel: or site-relative. */
export function mdLink(label: string, url: string): string {
  return `[${md(label)}](${safeUrl(url) ?? "#"})`;
}

export function safeUrl(url: string): string | null {
  const u = url.trim();
  if (/^(https?:\/\/|mailto:|tel:)[^\s()<>"']+$/i.test(u)) return u;
  if (/^\/[^\s()<>"']*$/.test(u) && !u.startsWith("//")) return u;
  return null;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Inline formatting: escapes, bold and links, everything else HTML-escaped. */
export function renderInline(src: string): string {
  let out = "";
  let bold = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\" && i + 1 < src.length) {
      out += escapeHtml(src[i + 1]);
      i += 2;
      continue;
    }
    if (c === "*" && src[i + 1] === "*") {
      out += bold ? "</strong>" : "<strong>";
      bold = !bold;
      i += 2;
      continue;
    }
    if (c === "[") {
      // Find the unescaped closing bracket followed by "(url)".
      let j = i + 1;
      let label = "";
      while (j < src.length && src[j] !== "]") {
        if (src[j] === "\\" && j + 1 < src.length) {
          label += src.slice(j, j + 2);
          j += 2;
        } else label += src[j++];
      }
      const m = j < src.length ? /^\(([^()\s]*)\)/.exec(src.slice(j + 1)) : null;
      if (m) {
        const url = safeUrl(m[1]);
        const text = renderInline(label);
        out += url ? `<a href="${escapeHtml(url)}">${text}</a>` : text;
        i = j + 1 + m[0].length;
        continue;
      }
    }
    out += escapeHtml(c);
    i++;
  }
  if (bold) out += "</strong>";
  return out;
}

/** Render the notice Markdown subset to an HTML fragment. */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (para.length) html.push(`<p>${renderInline(para.join(" "))}</p>`);
    if (list.length) html.push(`<ul>${list.map((l) => `<li>${renderInline(l)}</li>`).join("")}</ul>`);
    if (quote.length) html.push(`<blockquote><p>${renderInline(quote.join(" "))}</p></blockquote>`);
    para = [];
    list = [];
    quote = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (!line.trim()) {
      flush();
    } else if (heading) {
      flush();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (line === "---") {
      flush();
      html.push("<hr>");
    } else if (line.startsWith("- ")) {
      if (para.length || quote.length) flush();
      list.push(line.slice(2));
    } else if (line.startsWith("> ")) {
      if (para.length || list.length) flush();
      quote.push(line.slice(2));
    } else {
      if (list.length || quote.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return html.join("\n");
}
