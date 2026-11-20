"use server";

import { revalidatePath } from "next/cache";
import { adminAudit, guardAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { mailConfigured, sendMail, suppressAddress, unsuppress } from "@/lib/mail";
import { normalizeIdentifier } from "@/lib/secrets";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import type { FormState } from "@/app/actions/types";

/** Admin → Email: send a test message with the saved settings and show the exact error, if any. */
export async function sendTestMail(_prev: FormState, fd: FormData): Promise<FormState> {
  const guard = await guardAdmin();
  if (!guard.ok) return { error: guard.error };
  if (!rateLimit(`mail-test:${guard.user.id}`, 5, 10 * 60_000)) return { error: "Too many test emails. Wait a few minutes." };
  const to = normalizeIdentifier("email", String(fd.get("to") ?? "") || guard.user.email);
  if (!to) return { error: "Enter a valid address." };
  const settings = await getSettings();
  if (!mailConfigured(settings)) return { error: "Email is off or incomplete. Save the Email settings first (SMTP host, sender, credentials)." };
  try {
    await sendMail({
      to,
      subject: `${settings.site_name}: test email`,
      text: `This is a test email from ${settings.site_name}.\n\nServer: SMTP ${settings.smtp_host}\nSent: ${new Date().toISOString()}`,
    });
  } catch (error) {
    return { error: `Sending failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  await adminAudit(guard.user.id, "admin.mail_test", "smtp");
  return { success: `Test email sent to ${to}. Check the inbox (and the spam folder).` };
}

export async function addSuppression(_prev: FormState, fd: FormData): Promise<FormState> {
  const guard = await guardAdmin();
  if (!guard.ok) return { error: guard.error };
  const ok = await suppressAddress(await getDb(), String(fd.get("email") ?? ""), "manual", `added by ${guard.user.email}`);
  if (!ok) return { error: "Enter a valid address." };
  await adminAudit(guard.user.id, "admin.suppression", "added");
  revalidatePath("/admin/mail");
  return { success: "Address suppressed." };
}

export async function removeSuppression(_prev: FormState, fd: FormData): Promise<FormState> {
  const guard = await guardAdmin();
  if (!guard.ok) return { error: guard.error };
  const key = String(fd.get("key") ?? "");
  if (!/^[0-9a-f]{64}$/.test(key)) return { error: "Unknown entry." };
  await unsuppress(await getDb(), key);
  await adminAudit(guard.user.id, "admin.suppression", "removed");
  revalidatePath("/admin/mail");
  return { success: "Removed. The address can be emailed again." };
}
