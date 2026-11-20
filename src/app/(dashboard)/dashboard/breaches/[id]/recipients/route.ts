import { idParam } from "@/lib/db/tenant";
import { orgForRoute } from "@/lib/org-context";
import { breachTemplates, getBreach, recipientsCsv } from "@/lib/privacy/breaches";
import { audit } from "@/lib/privacy/registers";

/** B1-02: CSV of the people to tell (Rule 7(1)) with the message, for mail-merge or SMS tools. Owners and admins only (it holds contact details). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await orgForRoute();
  if (!ctx) return new Response("Sign in first.", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (ctx.role === "viewer") return new Response("Not allowed.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const id = idParam((await params).id);
  const row = id ? await getBreach(ctx.t, id) : undefined;
  if (!row) return new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const lang = new URL(request.url).searchParams.get("lang") === "hi" ? "hi" : "en";
  const tpl = (await breachTemplates(ctx.t, row.id, lang))!;
  const csv = (await recipientsCsv(ctx.t, row.id, { subject: tpl.dp.subject, text: tpl.dp.text, sms: tpl.short.sms }))!;
  await audit(ctx.t, ctx.user.id, "breach.recipients.export", row.ref);
  return new Response(String.fromCharCode(0xfeff) + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="breach-${row.ref}-recipients-${lang}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
