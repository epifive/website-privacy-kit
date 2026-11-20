"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * Live breach clock (plan M8): counts up from `since` ("without delay"
 * timers) or down to `due` (6 h / 72 h). Server-rendered first, then updated
 * every 30 seconds in the browser. Text only, so it works without colour.
 */
export function BreachClock({ since, due, doneAt, serverNow }: { since: string; due?: string | null; doneAt?: string | null; serverNow: number }) {
  const t = useT();
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (doneAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [doneAt]);
  const fmt = (ms: number) => {
    const total = Math.floor(Math.abs(ms) / 60_000);
    return t("dash.breaches.duration", { h: Math.floor(total / 60), m: total % 60 });
  };
  const end = doneAt ? Date.parse(doneAt) : now;
  if (due && !doneAt) {
    const left = Date.parse(due) - now;
    return <span className="tabular-nums">{left >= 0 ? t("dash.breaches.dueIn", { time: fmt(left) }) : t("dash.breaches.overdueBy", { time: fmt(left) })}</span>;
  }
  return <span className="tabular-nums">{t(doneAt ? "dash.breaches.tookTime" : "dash.breaches.elapsed", { time: fmt(end - Date.parse(since)) })}</span>;
}
