import "server-only";

/**
 * Cloudflare Turnstile for the public rights request form (plan §7.5).
 *
 * On when both keys are set in Admin → Settings → Privacy pages, unless
 * WPK_TURNSTILE=off (development and automated tests run without it; the
 * email OTP still verifies every request).
 */

export interface TurnstileConfig {
  siteKey: string;
  secretKey: string;
}

export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfig(settings: { turnstile_site_key: string; turnstile_secret_key: string }, env: Record<string, string | undefined> = process.env): TurnstileConfig | null {
  if ((env.WPK_TURNSTILE ?? "").toLowerCase() === "off") return null;
  const siteKey = settings.turnstile_site_key.trim();
  const secretKey = settings.turnstile_secret_key.trim();
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

/** Server-side token check. Fails closed: any network or parse error is a failure. */
export async function verifyTurnstile(config: TurnstileConfig, token: string, ip?: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret: config.secretKey, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
