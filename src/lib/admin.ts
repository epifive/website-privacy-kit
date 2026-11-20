import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { adminVerified, getCurrentUser, requestContext, type SessionUser } from "./auth/session";
import { getDb } from "./db";
import { logSecurityEvent, type SecurityAction } from "./security-log";
import { isDemoMode, storagePath } from "./config";

export const DEMO_MESSAGE = "This is a demo. Changes are disabled so every visitor sees the same site.";

/**
 * Guard for admin Server Actions. Returns the admin or an error message.
 * Every admin action must call this first: rendering a form on an admin page
 * is not a security boundary.
 */
export async function guardAdmin(options: { allowInDemo?: boolean } = {}): Promise<
  { ok: true; user: SessionUser } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, error: "You must be signed in as an administrator." };
  // Plan §7.6: administrators act only from a session that passed two-step verification.
  if (!adminVerified(user)) return { ok: false, error: "Set up two-step verification (Account → Security) and sign in with it to use the admin area." };
  if (isDemoMode() && !options.allowInDemo) return { ok: false, error: DEMO_MESSAGE };
  return { ok: true, user };
}

/** Record an administrator action in the platform audit log (security_events). */
export async function adminAudit(adminId: number, action: SecurityAction, target: string, userId: number | null = null): Promise<void> {
  const [db, ctx] = await Promise.all([getDb(), requestContext()]);
  await logSecurityEvent(db, { action, actorId: adminId, userId, target, ...ctx });
}

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

/** Save an uploaded image to storage/uploads and return its relative path. */
export async function saveUpload(file: File, prefix: string): Promise<string> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Upload a PNG, JPG, WebP, GIF, SVG or ICO image.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Images must be smaller than 2 MB.");
  const name = `${prefix}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const dir = storagePath("uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return name;
}
