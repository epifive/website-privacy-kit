import { fillText, WITHDRAW_TEXTS } from "@/core/consent/texts";
import { BOARD_URL, type Lang } from "@/core/notice/templates";
import { getDb } from "@/lib/db";
import { tenantDb, type TenantDb } from "@/lib/db/tenant";
import { getConsentState, readWithdrawToken, withdrawAll } from "@/lib/privacy/consent";
import "@/lib/consent-notify";
import { noticeLinks } from "@/lib/privacy/notices";
import { getOrgBySlug } from "@/lib/privacy/orgs";
import { getContacts, getSite, listPurposes } from "@/lib/privacy/registers";
import { esc, HOSTED_CSP, HOSTED_STYLE } from "@/lib/privacy/hosted-pages";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { baseUrl } from "@/lib/request";

/**
 * Hosted withdraw page (plan M5; Rule 3(c)(i), s.6(4); C2-04).
 *
 *   GET  /p/{org}/withdraw            how to withdraw (banner, links, contact)
 *   GET  /p/{org}/withdraw?t=…        what this person agreed to + one button
 *   POST /p/{org}/withdraw  t=…       withdraw every optional consent (no login)
 *
 * GET never changes anything (mail scanners open links); the single POST
 * button keeps withdrawal as easy as giving consent. Standalone HTML, no
 * scripts. People who gave consent with their email can also withdraw through
 * the rights form (/p/{org}/rights, type "withdraw"), verified by an email code.
 */

type Ctx = { params: Promise<{ org: string }> };

function page(lang: Lang, title: string, body: string, altHref: string): Response {
  const other: Lang = lang === "en" ? "hi" : "en";
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><style>${HOSTED_STYLE}</style></head><body><main><nav><a href="${esc(altHref)}" hreflang="${other}" lang="${other}">${esc(WITHDRAW_TEXTS[other].langName)}</a></nav><h1>${esc(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": HOSTED_CSP,
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function context(t: TenantDb, slug: string, lang: Lang) {
  const base = await baseUrl();
  const links = noticeLinks(base, slug);
  const contacts = await getContacts(t);
  const c = contacts.dpo ?? contacts.grievance;
  const contact = c ? [c.designation ? `${c.name}, ${c.designation}` : c.name, c.email, c.phone].filter(Boolean).join(" · ") : "";
  const tx = WITHDRAW_TEXTS[lang];
  const footer = `<div class="box"><ul><li><a href="${esc(base)}/p/${esc(slug)}?lang=${lang}">${esc(tx.linkHub)}</a></li><li><a href="${esc(links.rights)}?lang=${lang}&amp;type=withdraw">${esc(tx.linkRightsWithdraw)}</a></li><li><a href="${esc(links.notice)}?lang=${lang}">${esc(tx.linkNotice)}</a></li><li><a href="${esc(links.rights)}">${esc(tx.linkRights)}</a></li><li><a href="${esc(BOARD_URL)}" rel="noopener">${esc(tx.linkBoard)}</a></li></ul>${contact ? `<p>${esc(fillText(tx.contact, { contact }))}</p>` : ""}</div>`;
  return { footer, tx };
}

async function purposeNames(t: TenantDb, lang: Lang): Promise<Map<string, string>> {
  return new Map((await listPurposes(t)).map((p) => [p.purpose_key, lang === "hi" && p.name_hi.trim() ? p.name_hi : p.name_en]));
}

async function resolve(slug: string, token: string | null) {
  const db = await getDb();
  const org = await getOrgBySlug(db, slug);
  if (!org) return null;
  const t = tenantDb(db, org.id);
  const parsed = token ? readWithdrawToken(token) : null;
  // The site must belong to this organisation: a token for another organisation's site is not found here.
  const site = parsed ? await getSite(t, parsed.siteId) : undefined;
  return { org, t, subjectRef: site && parsed ? parsed.subjectRef : null, site, tokenGiven: Boolean(token) };
}

export async function GET(request: Request, { params }: Ctx) {
  const { org: slug } = await params;
  const url = new URL(request.url);
  const lang: Lang = url.searchParams.get("lang") === "hi" ? "hi" : "en";
  const token = url.searchParams.get("t");
  const r = await resolve(slug, token);
  if (!r) return new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const { footer, tx } = await context(r.t, r.org.slug, lang);
  const title = fillText(tx.title, { org: r.org.name });
  const alt = `?lang=${lang === "en" ? "hi" : "en"}${token ? `&t=${encodeURIComponent(token)}` : ""}`;
  const end = `${footer}<p class="muted">${esc(fillText(tx.footer, { org: r.org.name }))}</p><p class="muted">${esc(tx.draft)}</p>`;

  if (!r.site || !r.subjectRef) {
    const invalid = r.tokenGiven ? `<p><strong>${esc(tx.invalid)}</strong></p>` : "";
    return page(lang, title, `${invalid}<p>${esc(tx.intro)}</p><p>${esc(tx.deviceNote)}</p>${end}`, alt);
  }
  const names = await purposeNames(r.t, lang);
  const granted = (await getConsentState(r.t, r.site.id, r.subjectRef)).filter((s) => s.status === "granted");
  if (!granted.length) return page(lang, title, `<p>${esc(tx.intro)}</p><p>${esc(tx.empty)}</p>${end}`, alt);
  const items = granted
    .map((s) => `<li>${esc(names.get(s.purpose_key) ?? s.purpose_key)} <span class="muted">(${esc(fillText(tx.given, { date: s.updated_at.slice(0, 10), version: s.notice_version }))})</span></li>`)
    .join("");
  const form = `<form method="post"><input type="hidden" name="t" value="${esc(token ?? "")}"><input type="hidden" name="lang" value="${lang}"><p>${esc(tx.confirm)}</p><button type="submit">${esc(tx.button)}</button></form>`;
  return page(lang, title, `<p>${esc(tx.intro)}</p><div class="box"><h2>${esc(tx.agreedTo)}</h2><ul>${items}</ul>${form}</div>${end}`, alt);
}

export async function POST(request: Request, { params }: Ctx) {
  const ip = await clientIp();
  if (!rateLimit(`withdraw:${ip}`, 20, 60_000)) return new Response("Too many requests.", { status: 429, headers: { "Retry-After": "60" } });
  const { org: slug } = await params;
  const form = await request.formData().catch(() => null);
  const token = typeof form?.get("t") === "string" ? (form!.get("t") as string) : null;
  const lang: Lang = form?.get("lang") === "hi" ? "hi" : "en";
  const r = await resolve(slug, token);
  if (!r) return new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const { footer, tx } = await context(r.t, r.org.slug, lang);
  const title = fillText(tx.title, { org: r.org.name });
  const alt = `?lang=${lang === "en" ? "hi" : "en"}${token ? `&t=${encodeURIComponent(token)}` : ""}`;
  const end = `${footer}<p class="muted">${esc(tx.draft)}</p>`;
  if (!r.site || !r.subjectRef) return page(lang, title, `<p><strong>${esc(tx.invalid)}</strong></p>${end}`, alt);

  const result = await withdrawAll(r.t, r.site, r.subjectRef, { channel: "link", lang, ip, userAgent: request.headers.get("user-agent") ?? undefined });
  if (!result.ok) return page(lang, title, `<p><strong>${esc(tx.invalid)}</strong></p>${end}`, alt);
  if (!result.recorded) return page(lang, title, `<p>${esc(tx.empty)}</p>${end}`, alt);
  const names = await purposeNames(r.t, lang);
  const list = result.events.map((e) => names.get(e.purpose_key) ?? e.purpose_key).join(", ");
  return page(lang, title, `<div class="box"><p><strong>${esc(tx.doneTitle)}</strong></p><p>${esc(fillText(tx.doneList, { purposes: list }))}</p><p>${esc(tx.doneCease)}</p><p>${esc(tx.doneAgain)}</p></div>${end}`, alt);
}
