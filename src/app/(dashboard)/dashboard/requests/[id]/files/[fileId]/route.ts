import { idParam } from "@/lib/db/tenant";
import { orgForRoute } from "@/lib/org-context";
import { readAttachment } from "@/lib/privacy/attachments";
import { audit } from "@/lib/privacy/registers";

/**
 * Download a request attachment: signed-in members of the request's
 * organisation only (any role). Files are decrypted on the fly and always
 * served as downloads, never rendered inline. Each download is audited.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const ctx = await orgForRoute();
  if (!ctx) return new Response("Not found.", { status: 404 });
  const { id, fileId } = await params;
  const requestId = idParam(id);
  const attachmentId = idParam(fileId);
  const file = requestId && attachmentId ? await readAttachment(ctx.t, attachmentId) : null;
  if (!file || file.row.request_id !== requestId) return new Response("Not found.", { status: 404 });
  await audit(ctx.t, ctx.user.id, "request.attachment.download", `${requestId}/${attachmentId}`);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.row.mime,
      "Content-Disposition": `attachment; filename="${file.row.filename.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
