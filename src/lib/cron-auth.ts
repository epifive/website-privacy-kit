import "server-only";
import crypto from "node:crypto";
import { rateLimit, rateLimitPeek } from "./rate-limit";

/**
 * Bearer-secret check for job endpoints. `CRON_SECRET` protects the reminder
 * jobs; `WPK_MAINTENANCE_SECRET` (a different secret) protects maintenance
 * jobs that delete data, such as the consent-record retention purge.
 * Secrets shorter than 16 characters disable the endpoint.
 */
export function bearerAuthorized(request: Request, envName: "CRON_SECRET" | "WPK_MAINTENANCE_SECRET"): boolean {
  const secret = process.env[envName] ?? "";
  // Guessing the secret: at most 20 wrong attempts per address and 10 minutes.
  const forwarded = (request.headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const ip = forwarded[forwarded.length - 1] ?? request.headers.get("x-real-ip") ?? "local";
  const failKey = `bearer-fail:${envName}:${ip}`;
  if (rateLimitPeek(failKey) >= 20) return false;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secret.length >= 16 && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) rateLimit(failKey, 20, 10 * 60_000);
  return ok;
}

export const notFoundJson = () => Response.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
