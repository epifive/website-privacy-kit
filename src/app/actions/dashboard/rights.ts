"use server";

import { revalidatePath } from "next/cache";
import { REQUEST_STATUSES, type RequestStatus } from "@/core/rights/model";
import { idParam } from "@/lib/db/tenant";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { guardOrgAction } from "@/lib/org-context";
import { addNote, assignRequest, changeStatus, closeRequest, recordNomination, revokeNomination, sendReply, type ActionResult } from "@/lib/privacy/rights";
import type { FormState } from "../types";

/**
 * Rights request inbox actions (plan M7). Each action re-checks the session
 * and membership (guardOrgAction: owners and admins; viewers read only) and
 * works through the organisation's TenantDb, so a request id from another
 * organisation is simply not found. Every change is written to the audit log
 * by the service functions in src/lib/privacy/rights.ts.
 */

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

const ERRORS: Record<Exclude<ActionResult, { ok: true }>["error"], MessageKey> = {
  not_found: "dash.requests.err.notFound",
  status: "dash.requests.err.status",
  outcome: "dash.requests.err.outcome",
  letter: "dash.requests.err.letter",
  assignee: "dash.requests.err.assignee",
  empty: "dash.requests.err.empty",
  mail: "dash.requests.err.mail",
  nominee: "dash.requests.err.nominee",
};

async function finish(result: ActionResult, id: number, success: MessageKey): Promise<FormState> {
  const tr = await getT();
  if (!result.ok) return { error: tr(ERRORS[result.error]) };
  revalidatePath(`/dashboard/requests/${id}`);
  revalidatePath("/dashboard/requests");
  return { success: tr(success) };
}

export async function changeRequestStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  const to = str(fd, "status") as RequestStatus;
  if (!id || !(REQUEST_STATUSES as readonly string[]).includes(to)) return { error: (await getT())("dash.requests.err.status") };
  return finish(await changeStatus(g.t, id, to, g.user.id), id, "dash.requests.saved");
}

export async function assignRequestAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.requests.err.notFound") };
  return finish(await assignRequest(g.t, id, idParam(str(fd, "assignee")), g.user.id), id, "dash.requests.saved");
}

export async function addRequestNoteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  const kind = str(fd, "kind");
  if (!id) return { error: (await getT())("dash.requests.err.notFound") };
  const noteKind = kind === "identity" || kind === "legal_hold" ? kind : "note";
  return finish(await addNote(g.t, id, noteKind, str(fd, "text"), g.user.id), id, "dash.requests.saved");
}

export async function sendRequestReplyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.requests.err.notFound") };
  return finish(await sendReply(g.t, id, { subject: str(fd, "subject"), text: str(fd, "text") }, g.user.id), id, "dash.requests.reply.sent");
}

export async function closeRequestAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.requests.err.notFound") };
  const letter = fd.get("send") === "on" ? { subject: str(fd, "subject"), text: str(fd, "text") } : null;
  return finish(await closeRequest(g.t, id, { outcome: str(fd, "outcome"), letter }, g.user.id), id, "dash.requests.saved");
}

export async function recordNominationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  if (!id) return { error: (await getT())("dash.requests.err.notFound") };
  return finish(await recordNomination(g.t, id, g.user.id), id, "dash.requests.saved");
}

export async function revokeNominationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guardOrgAction();
  if (!g.ok) return { error: g.error };
  const id = idParam(str(fd, "id"));
  const nominationId = idParam(str(fd, "nomination"));
  if (!id || !nominationId) return { error: (await getT())("dash.requests.err.notFound") };
  return finish(await revokeNomination(g.t, nominationId, g.user.id), id, "dash.requests.saved");
}

