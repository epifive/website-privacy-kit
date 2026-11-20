import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { idParam } from "@/lib/db/tenant";
import { switchOrg } from "@/lib/org-context";

/** Switch the current organisation (membership is checked before the cookie is set). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const url = new URL("/dashboard", request.url);
  if (!user) return NextResponse.redirect(new URL("/login?next=/dashboard", request.url));
  const id = idParam((await params).id);
  if (id) await switchOrg(user.id, id);
  return NextResponse.redirect(url);
}
