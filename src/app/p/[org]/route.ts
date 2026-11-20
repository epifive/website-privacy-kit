import { brandFrom } from "@/lib/branding";
import { hostedContext, langParam, notFoundResponse } from "@/lib/hosted-context";
import { htmlResponse, renderHub } from "@/lib/privacy/hosted-pages";
import { getNoticeVersion } from "@/lib/privacy/notices";
import { orgIdentifiers } from "@/lib/privacy/orgs";
import { getSettings } from "@/lib/settings";

/**
 * Hosted privacy hub (plan M6): /p/{org}?lang=hi
 * Current notice (EN/HI), rights and the request form, withdraw link, the
 * Rule 9 contacts and how to complain to the Board. Standalone HTML, no scripts.
 */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const lang = langParam(new URL(request.url).searchParams.get("lang"));
  const ctx = await hostedContext(slug);
  if (!ctx) return notFoundResponse();
  const notice = await getNoticeVersion(ctx.t, lang);
  return htmlResponse(
    renderHub({
      lang,
      orgName: ctx.org.name,
      links: ctx.links,
      notice: notice ? { version: notice.version, publishedAt: notice.published_at } : null,
      contacts: ctx.contacts,
      responseDays: ctx.org.response_days,
      identifiers: orgIdentifiers(ctx.org),
      brand: brandFrom(await getSettings()),
    }),
  );
}
