"use server";

import { revalidatePath } from "next/cache";
import { istLocalToUtc } from "@/core/breach/model";
import { idParam } from "@/lib/db/tenant";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { guardOrgAction } from "@/lib/org-context";
import { audit } from "@/lib/privacy/registers";
import { createRequestErasureTasks, markPreNoticeSent, reopenTask, signOffTask, updateRetentionSettings, type SignOffResult } from "@/lib/privacy/retention";
import type { FormState } from "../types";

/**
 * Retention settings and erasure tasks (plan M9; E1–E3). Owners and admins
 * only; ids are re-checked through the organisation's TenantDb. Sign-offs are
 * audited by the service.
 */

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

const SIGN_OFF_ERRORS: Record<Exclude<SignOffResult, { ok: true }>["error"], MessageKey> = {
  not_found: "dash.err.notFound",
  closed: "dash.tasks.err.closed",
  note: "dash.tasks.err.note",
  log_floor: "dash.tasks.err.logFloor",
  pre_notice_not_sent: "dash.tasks.err.preNoticeNotSent",
  pre_notice_wait: "dash.tasks.err.preNoticeWait",
};

export async function saveRetentionSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  await updateRetentionSettings(g.t, { consentRetentionDays: Number(str(fd, "consent_retention_days")), preErasureNotice: fd.get("pre_erasure_notice") === "on" });
  await audit(g.t, g.user.id, "retention.settings");
  revalidatePath("/dashboard/retention");
  return { success: (await getT())("dash.saved") };
}

export async function signOffTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const id = idParam(str(fd, "id"));
  if (!id) return { error: tr("dash.err.notFound") };
  const result = await signOffTask(g.t, id, { status: str(fd, "status") === "skipped" ? "skipped" : "done", note: str(fd, "note") }, g.user.id);
  if (!result.ok) return { error: tr(SIGN_OFF_ERRORS[result.error]) };
  revalidatePath(`/dashboard/retention/tasks/${id}`);
  revalidatePath("/dashboard/retention");
  return { success: tr("dash.tasks.signedOff") };
}

export async function reopenTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const id = idParam(str(fd, "id"));
  if (!id || !(await reopenTask(g.t, id, g.user.id))) return { error: tr("dash.err.notFound") };
  revalidatePath(`/dashboard/retention/tasks/${id}`);
  return { success: tr("dash.saved") };
}

export async function preNoticeSentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const id = idParam(str(fd, "id"));
  const at = istLocalToUtc(str(fd, "at"));
  if (!id || !at) return { error: tr("dash.breaches.err.times") };
  const result = await markPreNoticeSent(g.t, id, at, g.user.id);
  if (!result.ok) return { error: tr(result.error === "not_found" ? "dash.err.notFound" : "dash.breaches.err.times") };
  revalidatePath(`/dashboard/retention/tasks/${id}`);
  return { success: tr("dash.saved") };
}

export async function requestErasureTasksAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const tr = await getT();
  const id = idParam(str(fd, "id"));
  const result = id ? await createRequestErasureTasks(g.t, id, g.user.id) : ({ ok: false, error: "not_found" } as const);
  if (!result.ok) return { error: tr("dash.err.notFound") };
  revalidatePath(`/dashboard/requests/${id}`);
  return { success: tr("dash.tasks.created", { count: result.created }) };
}
