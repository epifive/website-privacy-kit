import "server-only";
import { headers } from "next/headers";

/** The per-request CSP nonce set by src/proxy.ts on strict pages (undefined on public pages). */
export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}
