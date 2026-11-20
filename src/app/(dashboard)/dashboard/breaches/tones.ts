import type { TimerState } from "@/core/breach/model";

export const TIMER_TONE: Record<TimerState, "danger" | "warning" | "primary" | "success" | "neutral"> = {
  overdue: "danger",
  due_soon: "warning",
  running: "primary",
  done: "success",
  not_applicable: "neutral",
};
