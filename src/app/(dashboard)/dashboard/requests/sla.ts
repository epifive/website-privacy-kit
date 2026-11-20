import type { SlaState } from "@/core/rights/model";

/** Badge colours for SLA states in the inbox and on the request page. */
export const SLA_TONE: Record<SlaState, "danger" | "warning" | "success" | "neutral" | "primary"> = {
  overdue: "danger",
  due_soon: "warning",
  target_missed: "warning",
  on_track: "success",
  closed: "neutral",
  unverified: "neutral",
};
