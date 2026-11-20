import "server-only";
import { BOARD_URL, BOARD_URL_VERIFIED, TEMPLATES, type Lang } from "@/core/notice/templates";
import type { ContactInfo } from "@/core/rights/emails";
import { ATTACHMENT_LIMITS, detailsRequired, REQUEST_TYPES, type RequestType } from "@/core/rights/model";
import { HOSTED_TEXTS, type HostedTexts } from "@/core/rights/texts";

/**
 * Standalone HTML for the hosted privacy pages (plan M6; Rule 3(c), Rule 9,
 * Rule 14(1)–(5)): the hub /p/{org}, the rights request form and the email
 * code page. Plain HTML forms that work without JavaScript; the only script is
 * Cloudflare Turnstile when the operator turns it on. Pure functions: the
 * route handlers gather data and wrap the result in a Response.
 */

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const HOSTED_STYLE = `body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari","Nirmala UI",sans-serif;color:#17201c;background:#fff}main{max-width:40rem;margin:0 auto;padding:2rem 1.25rem 4rem}h1{font-size:1.6rem;line-height:1.25}h2{font-size:1.15rem;margin:0 0 .5rem}a{color:#0f5c4d}button,.button{display:inline-block;font:inherit;font-weight:600;padding:.7rem 1.2rem;border-radius:.5rem;border:2px solid #0f5c4d;background:#0f5c4d;color:#fff;cursor:pointer;text-decoration:none}.button.secondary,button.secondary{background:#fff;color:#0f5c4d}ul{padding-left:1.2rem}.muted{color:#4b5563;font-size:.9rem}.box{border:1px solid #d6ddd9;border-radius:.75rem;padding:1rem 1.25rem;margin:1.25rem 0}nav{font-size:.9rem;display:flex;gap:1rem;flex-wrap:wrap}label{display:block;font-weight:600;margin:.9rem 0 .25rem}input[type=text],input[type=email],input[type=tel],textarea{box-sizing:border-box;width:100%;font:inherit;padding:.55rem .7rem;border:1px solid #9aa8a1;border-radius:.45rem}textarea{min-height:7rem}fieldset{border:1px solid #d6ddd9;border-radius:.75rem;padding:.75rem 1rem;margin:1.25rem 0}legend{font-weight:700;padding:0 .3rem}.choice{display:flex;gap:.6rem;align-items:flex-start;margin:.55rem 0}.choice input{margin-top:.35rem}.choice label{margin:0;font-weight:600}.choice span{display:block;font-weight:400;color:#4b5563;font-size:.9rem}.err{border:2px solid #b42318;background:#fef3f2;color:#7a271a;border-radius:.5rem;padding:.6rem .9rem}.ok{border:2px solid #0f5c4d;background:#eef7f3;border-radius:.5rem;padding:.6rem .9rem}.hint{color:#4b5563;font-size:.88rem;margin:.2rem 0 0}.code{font-size:1.4rem;letter-spacing:.3em;max-width:12rem}`;

export const HOSTED_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'";
export const TURNSTILE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; form-action 'self'; base-uri 'none'; frame-ancestors 'self'";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export interface PageLinks {
  hub: string;
  notice: string;
  rights: string;
  withdraw: string;
}

export function hostedLinks(baseUrl: string, slug: string): PageLinks {
  const hub = `${baseUrl.replace(/\/+$/, "")}/p/${slug}`;
  return { hub, notice: `${hub}/notice`, rights: `${hub}/rights`, withdraw: `${hub}/withdraw` };
}

export function htmlPage(lang: Lang, title: string, body: string, opts: { altHref?: string; head?: string } = {}): string {
  const other: Lang = lang === "en" ? "hi" : "en";
  const nav = opts.altHref ? `<nav><a href="${esc(opts.altHref)}" hreflang="${other}" lang="${other}">${esc(HOSTED_TEXTS[other].langName)}</a></nav>` : "";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><style>${HOSTED_STYLE}</style>${opts.head ?? ""}</head><body><main>${nav}<h1>${esc(title)}</h1>${body}</main></body></html>`;
}

export function htmlResponse(html: string, opts: { status?: number; csp?: string } = {}): Response {
  return new Response(html, {
    status: opts.status ?? 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": opts.csp ?? HOSTED_CSP,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Identifier labels a business asks for (Rule 14(5)), e.g. "the mobile number you used with us". */
export function identifierLabels(keys: string[], lang: Lang): Array<{ key: string; label: string }> {
  const map = TEMPLATES[lang].identifiers;
  return keys.filter((k) => k in map).map((k) => ({ key: k, label: map[k] }));
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function contactHtml(tx: HostedTexts, contacts: { dpo: ContactInfo | null; grievance: ContactInfo | null }): string {
  const one = (c: ContactInfo, role: string) => {
    const who = c.designation ? `${c.name}, ${c.designation}` : c.name;
    const parts = [
      `<p><strong>${esc(role)}:</strong> ${esc(who)}</p><ul>`,
      c.email ? `<li>${esc(tx.email)}: <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : "",
      c.phone ? `<li>${esc(tx.phone)}: ${esc(c.phone)}</li>` : "",
      c.address ? `<li>${esc(tx.address)}: ${esc(c.address)}</li>` : "",
      "</ul>",
    ];
    return parts.join("");
  };
  const list = [contacts.dpo ? one(contacts.dpo, tx.contactDpo) : "", contacts.grievance ? one(contacts.grievance, tx.contactGrievance) : ""].join("");
  return `<section class="box" id="contact"><h2>${esc(tx.contactHeading)}</h2>${list || `<p>${esc(tx.contactNone)}</p>`}</section>`;
}

function boardHtml(tx: HostedTexts): string {
  const unverified = BOARD_URL_VERIFIED ? "" : `<p class="muted" data-board-unverified="1">${esc(tx.boardUnverified)}</p>`;
  return `<section class="box" id="board"><h2>${esc(tx.boardHeading)}</h2><p>${esc(tx.boardText)}</p><p><a href="${esc(BOARD_URL)}" rel="noopener noreferrer">${esc(tx.boardLink)}</a></p>${unverified}</section>`;
}

function footerHtml(tx: HostedTexts, org: string, brand?: { text: string; url: string } | null): string {
  const b = brand ? `<p class="muted">${brand.url ? `<a href="${esc(brand.url)}" rel="noopener">${esc(brand.text)}</a>` : esc(brand.text)}</p>` : "";
  return `<p class="muted">${esc(fill(tx.footer, { org }))}</p><p class="muted">${esc(tx.draft)}</p>${b}`;
}

// ── Hub: /p/{org} ──

export interface HubData {
  lang: Lang;
  orgName: string;
  links: PageLinks;
  notice: { version: number; publishedAt: string } | null;
  contacts: { dpo: ContactInfo | null; grievance: ContactInfo | null };
  responseDays: number;
  identifiers: string[];
  /** Branding link (Free: EpiFive; Pro: white-label setting, null hides it). */
  brand?: { text: string; url: string } | null;
}

export function renderHub(d: HubData): string {
  const tx = HOSTED_TEXTS[d.lang];
  const other: Lang = d.lang === "en" ? "hi" : "en";
  const notice = d.notice
    ? `<p>${esc(fill(tx.noticeText, { version: d.notice.version, date: d.notice.publishedAt.slice(0, 10) }))}</p><p><a class="button" href="${esc(`${d.links.notice}?lang=${d.lang}`)}">${esc(tx.noticeRead)}</a> <a href="${esc(`${d.links.notice}?lang=${other}`)}" hreflang="${other}" lang="${other}">${esc(tx.noticeOther)}</a></p>`
    : `<p>${esc(tx.noticeMissing)}</p>`;
  const ids = identifierLabels(d.identifiers, d.lang).map((i) => i.label);
  const rights = [
    `<section class="box" id="rights"><h2>${esc(tx.rightsHeading)}</h2><ul>${TEMPLATES[d.lang].rightsList.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`,
    `<p>${esc(fill(tx.rightsPeriod, { days: d.responseDays }))} ${esc(tx.rightsFree)}</p>`,
    ids.length ? `<p>${esc(fill(tx.rightsIdentifiers, { list: ids.join(d.lang === "hi" ? ", " : ", ") }))}</p>` : "",
    `<p><a class="button" href="${esc(`${d.links.rights}?lang=${d.lang}`)}">${esc(tx.rightsButton)}</a></p></section>`,
  ].join("");
  const withdraw = `<section class="box" id="withdraw"><h2>${esc(tx.withdrawHeading)}</h2><p>${esc(tx.withdrawText)}</p><p><a href="${esc(`${d.links.withdraw}?lang=${d.lang}`)}">${esc(tx.withdrawLink)}</a></p></section>`;
  const body = [
    `<p>${esc(fill(tx.hubIntro, { org: d.orgName }))}</p>`,
    `<section class="box" id="notice"><h2>${esc(tx.noticeHeading)}</h2>${notice}</section>`,
    rights,
    withdraw,
    contactHtml(tx, d.contacts),
    boardHtml(tx),
    footerHtml(tx, d.orgName, d.brand),
  ].join("");
  return htmlPage(d.lang, fill(tx.hubTitle, { org: d.orgName }), body, { altHref: `?lang=${other}` });
}

// ── Rights request form: /p/{org}/rights ──

export interface FormValues {
  type?: string;
  name?: string;
  email?: string;
  details?: string;
  identifiers?: Record<string, string>;
  nominee_name?: string;
  nominee_relation?: string;
  nominee_contact?: string;
}

export interface RightsFormData {
  lang: Lang;
  orgName: string;
  links: PageLinks;
  responseDays: number;
  identifiers: string[];
  contacts: { dpo: ContactInfo | null; grievance: ContactInfo | null };
  turnstileSiteKey: string | null;
  error?: string | null;
  values?: FormValues;
  /** Pre-selected type from ?type= */
  type?: string | null;
  /** Organisation setting (JSON list): access/erasure requests that must include a description. */
  detailsRequired?: string | null;
}

export function renderRightsForm(d: RightsFormData): string {
  const tx = HOSTED_TEXTS[d.lang];
  const other: Lang = d.lang === "en" ? "hi" : "en";
  const v = d.values ?? {};
  const selected = v.type ?? d.type ?? "";
  const types = REQUEST_TYPES.map(
    (type: RequestType) =>
      `<div class="choice"><input type="radio" id="type-${type}" name="type" value="${type}"${selected === type ? " checked" : ""} required><label for="type-${type}">${esc(tx.types[type].label)}<span>${esc(tx.types[type].hint)}</span></label></div>`,
  ).join("");
  const idFields = identifierLabels(
    d.identifiers.filter((k) => k !== "email" && k !== "name"),
    d.lang,
  )
    .map((i) => `<label for="id-${i.key}">${esc(cap(i.label))}</label><input type="text" id="id-${i.key}" name="id_${i.key}" maxlength="120" value="${esc(v.identifiers?.[i.key] ?? "")}">`)
    .join("");
  const ids = identifierLabels(d.identifiers, d.lang).map((i) => i.label);
  const turnstile = d.turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${esc(d.turnstileSiteKey)}" data-language="${d.lang}"></div>` : "";
  const body = [
    `<p>${esc(tx.formIntro)}</p>`,
    `<p>${esc(fill(tx.rightsPeriod, { days: d.responseDays }))} ${esc(tx.rightsFree)}</p>`,
    ids.length ? `<p data-identifiers="1">${esc(fill(tx.rightsIdentifiers, { list: ids.join(", ") }))}</p>` : "",
    `<div class="box"><p>${esc(tx.withdrawShortcut)}</p><p><a href="${esc(`${d.links.withdraw}?lang=${d.lang}`)}">${esc(tx.withdrawShortcutLink)}</a></p></div>`,
    d.error ? `<p class="err" role="alert">${esc(d.error)}</p>` : "",
    `<form method="post" enctype="multipart/form-data"><input type="hidden" name="lang" value="${d.lang}">`,
    `<fieldset><legend>${esc(tx.typeLegend)}</legend>${types}</fieldset>`,
    `<label for="name">${esc(tx.nameLabel)} <span class="muted">(${esc(tx.required)})</span></label><input type="text" id="name" name="name" required maxlength="120" autocomplete="name" value="${esc(v.name ?? "")}">`,
    `<label for="email">${esc(tx.emailLabel)} <span class="muted">(${esc(tx.required)})</span></label><input type="email" id="email" name="email" required maxlength="190" autocomplete="email" value="${esc(v.email ?? "")}"><p class="hint">${esc(tx.emailHint)}</p>`,
    idFields ? `<fieldset><legend>${esc(tx.identifiersLegend)}</legend><p class="hint">${esc(tx.identifiersHint)}</p>${idFields}</fieldset>` : "",
    `<label for="details">${esc(tx.detailsLabel)}</label><textarea id="details" name="details" maxlength="4000">${esc(v.details ?? "")}</textarea><p class="hint">${esc(tx.detailsHint)}</p><p class="hint" data-details-required="1">${esc(fill(tx.detailsRequiredFor, { list: REQUEST_TYPES.filter((rt) => detailsRequired(rt, d.detailsRequired)).map((rt) => tx.types[rt].label).join("; ") }))}</p>`,
    `<fieldset><legend>${esc(tx.nomineeLegend)}</legend><label for="nominee_name">${esc(tx.nomineeName)}</label><input type="text" id="nominee_name" name="nominee_name" maxlength="120" value="${esc(v.nominee_name ?? "")}"><label for="nominee_relation">${esc(tx.nomineeRelation)}</label><input type="text" id="nominee_relation" name="nominee_relation" maxlength="60" value="${esc(v.nominee_relation ?? "")}"><label for="nominee_contact">${esc(tx.nomineeContact)}</label><input type="text" id="nominee_contact" name="nominee_contact" maxlength="190" value="${esc(v.nominee_contact ?? "")}"></fieldset>`,
    `<label for="files">${esc(tx.attachLabel)}</label><input type="file" id="files" name="files" multiple accept="application/pdf,image/png,image/jpeg"><p class="hint">${esc(tx.attachHint)}</p>`,
    `<div class="box"><h2>${esc(tx.identityHeading)}</h2><p>${esc(tx.identityNote)}</p></div>`,
    turnstile,
    `<p class="muted">${esc(tx.privacyNote)}</p><p><button type="submit">${esc(tx.submit)}</button></p></form>`,
    contactHtml(tx, d.contacts),
    `<p><a href="${esc(`${d.links.hub}?lang=${d.lang}`)}">${esc(tx.backToHub)}</a></p>`,
    footerHtml(tx, d.orgName),
  ].join("");
  const head = d.turnstileSiteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : "";
  return htmlPage(d.lang, fill(tx.formTitle, { org: d.orgName }), body, { altHref: `?lang=${other}${selected ? `&type=${encodeURIComponent(selected)}` : ""}`, head });
}

export const MAX_FORM_BYTES = ATTACHMENT_LIMITS.maxTotalBytes + 512 * 1024;

// ── Email code page: /p/{org}/rights/verify ──

export interface VerifyData {
  lang: Lang;
  orgName: string;
  links: PageLinks;
  token: string;
  maskedEmail: string;
  error?: string | null;
  notice?: string | null;
}

export function renderVerify(d: VerifyData): string {
  const tx = HOSTED_TEXTS[d.lang];
  const other: Lang = d.lang === "en" ? "hi" : "en";
  const body = [
    d.error ? `<p class="err" role="alert">${esc(d.error)}</p>` : "",
    d.notice ? `<p class="ok" role="status">${esc(d.notice)}</p>` : "",
    `<p>${esc(fill(tx.verifyText, { email: d.maskedEmail }))}</p>`,
    `<form method="post"><input type="hidden" name="r" value="${esc(d.token)}"><input type="hidden" name="lang" value="${d.lang}"><input type="hidden" name="action" value="verify"><label for="code">${esc(tx.codeLabel)}</label><input class="code" type="text" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" maxlength="8" required><p><button type="submit">${esc(tx.verifyButton)}</button></p></form>`,
    `<form method="post"><input type="hidden" name="r" value="${esc(d.token)}"><input type="hidden" name="lang" value="${d.lang}"><input type="hidden" name="action" value="resend"><p><button class="secondary" type="submit">${esc(tx.resendButton)}</button></p></form>`,
    footerHtml(tx, d.orgName),
  ].join("");
  return htmlPage(d.lang, tx.verifyTitle, body, { altHref: `?r=${encodeURIComponent(d.token)}&lang=${other}` });
}

export interface DoneData {
  lang: Lang;
  orgName: string;
  links: PageLinks;
  ref: string;
  dueDate: string;
  responseDays: number;
  withdrawn: string[] | null;
  already: boolean;
  mailSent: boolean;
}

export function renderDone(d: DoneData): string {
  const tx = HOSTED_TEXTS[d.lang];
  const lines = d.already
    ? [`<p class="ok">${esc(fill(tx.alreadyVerified, { ref: d.ref }))}</p>`]
    : [
        `<p class="ok" role="status"><strong>${esc(fill(tx.doneRef, { ref: d.ref }))}</strong></p>`,
        d.withdrawn ? `<p>${esc(d.withdrawn.length ? fill(tx.doneWithdraw, { purposes: d.withdrawn.join(", ") }) : tx.doneWithdrawNone)}</p>` : `<p>${esc(fill(tx.doneDue, { due: d.dueDate, days: d.responseDays }))}</p>`,
        `<p>${esc(d.mailSent ? tx.doneEmail : tx.mailFailed)}</p>`,
      ];
  const body = [...lines, `<p><a href="${esc(`${d.links.hub}?lang=${d.lang}`)}">${esc(tx.backToHub)}</a></p>`, footerHtml(tx, d.orgName)].join("");
  return htmlPage(d.lang, tx.doneTitle, body);
}

export function renderMessage(lang: Lang, orgName: string, links: PageLinks, title: string, message: string, status: "err" | "ok" = "err"): string {
  const tx = HOSTED_TEXTS[lang];
  return htmlPage(lang, title, `<p class="${status}" role="alert">${esc(message)}</p><p><a href="${esc(`${links.rights}?lang=${lang}`)}">${esc(tx.rightsButton)}</a> · <a href="${esc(`${links.hub}?lang=${lang}`)}">${esc(tx.backToHub)}</a></p>${footerHtml(tx, orgName)}`);
}
