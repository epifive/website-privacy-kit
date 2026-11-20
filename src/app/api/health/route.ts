import { sql } from "kysely";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness for Docker HEALTHCHECK, Caddy and uptime monitors.
 * 200 {"ok":true} when the database answers; 503 otherwise. No details, no secrets.
 */
export async function GET() {
  try {
    const db = await getDb();
    await sql`SELECT 1`.execute(db);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
