import type { Lang } from "@/core/notice/templates";
import { IDENTIFIER_KEYS } from "@/core/notice/templates";
import { HOSTED_TEXTS, type HostedTexts } from "@/core/rights/texts";
import "@/lib/consent-notify";
import { hostedContext, langParam, notFoundResponse, type HostedContext } from "@/lib/hosted-context";
import { htmlResponse, MAX_FORM_BYTES, renderRightsForm, TURNSTILE_CSP, type FormValues } from "@/lib/privacy/hosted-pages";
import { orgIdentifiers } from "@/lib/privacy/orgs";
import { submitRequest, type SubmitError } from "@/lib/privacy/rights";
import { clientIp } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { turnstileConfig, verifyTurnstile } from "@/lib/turnstile";

/**
 * Rights request form (plan M7; Rule 14(1)–(2), 14(5); R1, R2):
 *
 *   GET  /p/{org}/rights?lang=hi&type=erasure
 *   POST /p/{org}/rights   multipart form → stored as "unverified", email code sent,
 *                          303 to /p/{org}/rights/verify?r=…
 *
 * Works without JavaScript. Cloudflare Turnstile is added when configured.
 */

type Ctx = { params: Promise<{ org: string }> };

async function form(ctx: HostedContext, lang: Lang, opts: { error?: string | null; values?: FormValues; type?: string | null; status?: number }) {
  const turnstile = turnstileConfig(await getSettings());
  const html = renderRightsForm({
    lang,
    orgName: ctx.org.name,
    links: ctx.links,
    responseDays: ctx.org.response_days,
    identifiers: orgIdentifiers(ctx.org),
    contacts: ctx.contacts,
    turnstileSiteKey: turnstile?.siteKey ?? null,
    error: opts.error,
    values: opts.values,
    type: opts.type,
    detailsRequired: ctx.org.details_required,
  });
  return htmlResponse(html, { status: opts.status, csp: turnstile ? TURNSTILE_CSP : undefined });
}

export async function GET(request: Request, { params }: Ctx) {
  const { org: slug } = await params;
  const url = new URL(request.url);
  const ctx = await hostedContext(slug);
  if (!ctx) return notFoundResponse();
  return form(ctx, langParam(url.searchParams.get("lang")), { type: url.searchParams.get("type") });
}

const errorKey: Record<SubmitError, keyof HostedTexts["err"]> = {
  type: "type",
  name: "name",
  email: "email",
  details: "details",
  nominee: "nominee",
  rate: "rate",
  count: "count",
  size: "size",
  total: "total",
  type_file: "type_file",
  empty: "empty",
};

export async function POST(request: Request, { params }: Ctx) {
  const { org: slug } = await params;
  const ctx = await hostedContext(slug);
  if (!ctx) return notFoundResponse();
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_FORM_BYTES) return form(ctx, "en", { error: HOSTED_TEXTS.en.err.total, status: 413 });
  const fd = await request.formData().catch(() => null);
  const lang = langParam(fd?.get("lang"));
  const tx = HOSTED_TEXTS[lang];
  if (!fd) return form(ctx, lang, { error: tx.err.empty, status: 400 });
  const str = (key: string) => {
    const v = fd.get(key);
    return typeof v === "string" ? v : "";
  };
  const identifiers: Record<string, string> = {};
  for (const key of orgIdentifiers(ctx.org)) if (IDENTIFIER_KEYS.includes(key)) identifiers[key] = str(`id_${key}`);
  const values: FormValues = {
    type: str("type"),
    name: str("name"),
    email: str("email"),
    details: str("details"),
    identifiers,
    nominee_name: str("nominee_name"),
    nominee_relation: str("nominee_relation"),
    nominee_contact: str("nominee_contact"),
  };

  const ip = await clientIp();
  const turnstile = turnstileConfig(await getSettings());
  if (turnstile && !(await verifyTurnstile(turnstile, str("cf-turnstile-response"), ip))) return form(ctx, lang, { error: tx.err.captcha, values, status: 400 });

  const files: Array<{ name: string; size: number; bytes: Uint8Array }> = [];
  for (const entry of fd.getAll("files")) {
    if (typeof entry === "string" || entry.size === 0) continue;
    // Oversized files are rejected by size without reading them into memory again.
    files.push({ name: entry.name, size: entry.size, bytes: entry.size > 3 * 1024 * 1024 ? new Uint8Array() : new Uint8Array(await entry.arrayBuffer()) });
  }

  const result = await submitRequest(
    ctx.t,
    {
      type: values.type ?? "",
      name: values.name ?? "",
      email: values.email ?? "",
      details: values.details ?? "",
      identifiers,
      nominee: { name: values.nominee_name ?? "", relation: values.nominee_relation ?? "", contact: values.nominee_contact ?? "" },
      lang,
      files,
      ip,
    },
    { baseUrl: ctx.base },
  );
  if (!result.ok) return form(ctx, lang, { error: tx.err[errorKey[result.error]], values, status: result.error === "rate" ? 429 : 400 });
  const next = `${ctx.links.rights}/verify?r=${encodeURIComponent(result.token)}&lang=${lang}${result.mailSent ? "" : "&m=0"}`;
  return new Response(null, { status: 303, headers: { Location: next, "Cache-Control": "no-store" } });
}
