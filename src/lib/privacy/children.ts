import "server-only";
import { isChildBlockedPurpose } from "@/core/children";
import type { PurposeRow } from "../db/schema";
import type { TenantDb } from "../db/tenant";
import { listPurposes } from "./registers";

/**
 * Children mode in the Free edition (plan M10, "age gate only"): the widget asks
 * "18 or older?" first; an under-18 visitor's choices are not recorded and every
 * optional purpose stays off. Tracking, analytics and advertising purposes can
 * never be switched on for a child (s.9(3)). The verifiable parental-consent flow
 * (Rule 10: parent link, declarations, verification methods, staff review and
 * in-person records) is part of the Pro edition.
 */

const SUBJECT = /^[A-Za-z0-9_-]{16,64}$/;

/** Consent purposes a parent could agree to for this site (tracking/ads excluded, s.9(3)). */
export async function childPurposes(t: TenantDb, siteId: number): Promise<PurposeRow[]> {
  return (await listPurposes(t)).filter((p) => p.active === 1 && p.basis === "consent" && (p.site_id === null || p.site_id === siteId) && !isChildBlockedPurpose(p));
}

/** Granted purposes for a browser id (the widget asks in children mode). Tracking purposes never appear. */
export async function grantedForSubject(t: TenantDb, siteId: number, subjectRef: string): Promise<string[]> {
  if (!SUBJECT.test(subjectRef)) return [];
  const blocked = new Set((await listPurposes(t)).filter((p) => isChildBlockedPurpose(p)).map((p) => p.purpose_key));
  const rows = await t.selectFrom("consent_state").select(["purpose_key", "status"]).where("site_id", "=", siteId).where("subject_ref", "=", subjectRef).execute();
  return rows.filter((r) => r.status === "granted" && !blocked.has(r.purpose_key)).map((r) => r.purpose_key);
}
