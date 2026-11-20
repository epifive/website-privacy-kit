import "server-only";
import crypto from "node:crypto";

/**
 * TOTP two-factor sign-in (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits),
 * accepting the previous and next step for clock drift. A step that was
 * already used is refused (replay). Recovery codes: 10 single-use codes,
 * stored only as keyed hashes.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 character.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export const TOTP_STEP_SECONDS = 30;

export function timeStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const bin = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/**
 * The matching time step for a code (current ±1), or null. Steps at or before
 * `lastStep` are refused so a code works only once.
 */
export function verifyTotp(secret: string, code: string, lastStep: number, nowMs = Date.now()): number | null {
  const given = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const now = timeStep(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (step <= lastStep) continue;
    const expected = totpCode(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return step;
  }
  return null;
}

/** otpauth:// link for authenticator apps (open it on the phone, or type the key in by hand). */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

/** 10 recovery codes like "k7m2q-9xw4p". */
export function generateRecoveryCodes(count = 10): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: count }, () => {
    const bytes = crypto.randomBytes(10);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The otpauth:// link as an SVG QR code (server-side, `qrcode` package, MIT).
 * Error correction M, a 4-module quiet zone, black on white so every phone
 * camera reads it in light and dark themes. The key stays on the page as text
 * for typing in by hand.
 */
export async function otpauthQrSvg(uri: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 4, color: { dark: "#000000", light: "#ffffff" } });
}
