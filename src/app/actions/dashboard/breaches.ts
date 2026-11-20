"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BREACH_STATUSES, CHECKLIST_KEYS, istLocalToUtc, TIMER_KEYS, type BreachStatus, type ChecklistKey, type TimerKey } from "@/core/breach/model";
import type { BreachDetails } from "@/core/breach/templates";
import { idParam } from "@/lib/db/tenant";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { guardOrgAction } from "@/lib/org-context";
import {
  addEvidenceNote,
  addRecipients,
  createBreach,
  emailIntimation,
  markRecipientsManual,
  markStep,
  recordExtension,
  setBreachStatus,
  toggleChecklist,
  updateBreach,
  type BreachError,
  type BreachInput,
} from "@/lib/privacy/breaches";
import { audit } from "@/lib/privacy/registers";
import type { FormState } from "../types";

/**
 * Breach register actions (plan M8; B1–B4). Owners and admins only
 * (guardOrgAction); every id is re-checked through the organisation's
 * TenantDb. Times in the forms are IST (datetime-local) and stored as UTC.
 * The register is available on every plan (B3-01): no plan check here.
 */

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
const lines = (fd: FormData, key: string) =>
  str(fd, key)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const ERRORS: Record<BreachError, MessageKey> = {
  title: "dash.breaches.err.title",
  times: "dash.breaches.err.times",
  future: "dash.breaches.err.future",
  not_found: "dash.err.notFound",
  status: "dash.err.generic",
  step: "dash.err.generic",
  recipients: "dash.breaches.err.recipients",
  empty: "dash.breaches.err.empty",
  extension: "dash.breaches.err.extension",
};

function inputFromForm(fd: FormData): BreachInput {
  const details: Partial<BreachDetails> = {
    nature: str(fd, "nature"),
    extent: str(fd, "extent"),
    occurredWindow: str(fd, "occurred_window"),
    location: str(fd, "location"),
    categories: lines(fd, "categories"),
    affectedSystems: str(fd, "affected_systems"),
    likelyImpact: str(fd, "likely_impact"),
    consequences: lines(fd, "consequences"),
    measuresTaken: lines(fd, "measures_taken"),
    measuresPlanned: lines(fd, "measures_planned"),
    safetySteps: lines(fd, "safety_steps"),
    rootCause: str(fd, "root_cause"),
    findingsPerson: str(fd, "findings_person"),
    remediation: lines(fd, "remediation"),
    certinIncidentType: str(fd, "certin_incident_type"),
    signatoryTitle: str(fd, "signatory_title"),
    processorName: str(fd, "processor_name"),
    processorRef: str(fd, "processor_ref"),
    dpChannels: str(fd, "dp_channels"),
    dpNotReached: str(fd, "dp_not_reached"),
    logFrom: str(fd, "log_from"),
  };
  // Only fields present in the form are changed (the create form is shorter than the edit form).
  for (const key of Object.keys(details) as Array<keyof BreachDetails>) {
    const formKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    if (!fd.has(formKey)) delete details[key];
  }
  return {
    title: str(fd, "title"),
    noticedAt: istLocalToUtc(str(fd, "noticed_at")) ?? "",
    awareAt: istLocalToUtc(str(fd, "aware_at")) ?? "",
    affectedCount: Number(str(fd, "affected_count")) || 0,
    certinApplicable: fd.get("certin_applicable") === "on",
    details,
  };
}

async function done(result: { ok: true } | { ok: false; error: BreachError }, id: number, success: MessageKey = "dash.saved"): Promise<FormState> {
  const tr = await getT();
  if (!result.ok) return { error: tr(ERRORS[result.error]) };
  revalidatePath(`/dashboard/breaches/${id}`);
  revalidatePath("/dashboard/breaches");
  revalidatePath("/dashboard", "layout");
  return { success: tr(success) };
}

export async function createBreachAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const result = await createBreach(g.t, inputFromForm(fd), g.user.id);
  if (!result.ok) return { error: (await getT())(ERRORS[result.error]) };
  await audit(g.t, g.user.id, "breach.create", result.ref);
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/breaches/${result.id}?created=1`);
}

export async function updateBreachAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.err.notFound") };
  const result = await updateBreach(g.t, id, inputFromForm(fd), g.user.id);
  if (result.ok) await audit(g.t, g.user.id, "breach.update", String(id));
  return done(result, id);
}

export async function markBreachStepAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  const step = str(fd, "step") as TimerKey;
  if (!id || !(TIMER_KEYS as readonly string[]).includes(step)) return { error: (await getT())("dash.err.notFound") };
  const clear = str(fd, "clear") === "1";
  const at = clear ? null : istLocalToUtc(str(fd, "at"));
  if (!clear && !at) return { error: (await getT())("dash.breaches.err.times") };
  const result = await markStep(g.t, id, step, at, g.user.id, str(fd, "note"));
  if (result.ok) await audit(g.t, g.user.id, clear ? "breach.step.clear" : "breach.step", `${id}:${step}`);
  return done(result, id);
}

export async function breachExtensionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.err.notFound") };
  const requested = str(fd, "requested_at").trim();
  const until = str(fd, "until").trim();
  const result = await recordExtension(g.t, id, { requestedAt: requested ? istLocalToUtc(requested) : null, until: until ? istLocalToUtc(until) : null, reason: str(fd, "reason") }, g.user.id);
  if (result.ok) await audit(g.t, g.user.id, "breach.extension", String(id));
  return done(result, id);
}

export async function breachStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  const status = str(fd, "status") as BreachStatus;
  if (!id || !(BREACH_STATUSES as readonly string[]).includes(status)) return { error: (await getT())("dash.err.notFound") };
  const result = await setBreachStatus(g.t, id, status, g.user.id);
  if (result.ok) await audit(g.t, g.user.id, "breach.status", `${id}:${status}`);
  return done(result, id);
}

export async function breachChecklistAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.err.notFound") };
  let result: { ok: true } | { ok: false; error: BreachError } = { ok: true };
  for (const key of CHECKLIST_KEYS) {
    if (!fd.has(`was_${key}`)) continue;
    const want = fd.get(`check_${key}`) === "on";
    const was = str(fd, `was_${key}`) === "1";
    if (want !== was) result = await toggleChecklist(g.t, id, key as ChecklistKey, want, g.user.id);
    if (!result.ok) break;
  }
  return done(result, id);
}

export async function breachEvidenceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.err.notFound") };
  return done(await addEvidenceNote(g.t, id, str(fd, "note"), g.user.id), id, "dash.breaches.noteAdded");
}

export async function breachRecipientsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.err.notFound") };
  const result = await addRecipients(g.t, id, str(fd, "recipients"));
  const tr = await getT();
  if (!result.ok) return { error: tr(ERRORS[result.error]) };
  await audit(g.t, g.user.id, "breach.recipients", `${id}:${result.added}`);
  revalidatePath(`/dashboard/breaches/${id}`);
  return { success: tr("dash.breaches.recipientsAdded", { added: result.added, invalid: result.invalid }) };
}

export async function breachEmailAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.err.notFound") };
  const result = await emailIntimation(g.t, id, { subject: str(fd, "subject"), text: str(fd, "text") }, g.user.id);
  const tr = await getT();
  if (!result.ok) return { error: tr(ERRORS[result.error]) };
  await audit(g.t, g.user.id, "breach.dp_email", `${id}:${result.sent}`);
  revalidatePath(`/dashboard/breaches/${id}`);
  revalidatePath("/dashboard", "layout");
  return result.failed ? { error: tr("dash.breaches.emailFailed", { sent: result.sent, failed: result.failed }) } : { success: tr("dash.breaches.emailSent", { sent: result.sent }) };
}

export async function breachManualAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.err.notFound") };
  const at = istLocalToUtc(str(fd, "at"));
  if (!at) return { error: (await getT())("dash.breaches.err.times") };
  const result = await markRecipientsManual(g.t, id, str(fd, "channel"), at, g.user.id);
  const tr = await getT();
  if (!result.ok) return { error: tr(ERRORS[result.error]) };
  await audit(g.t, g.user.id, "breach.dp_manual", `${id}:${result.marked}`);
  revalidatePath(`/dashboard/breaches/${id}`);
  revalidatePath("/dashboard", "layout");
  return { success: tr("dash.breaches.manualMarked", { count: result.marked }) };
}
