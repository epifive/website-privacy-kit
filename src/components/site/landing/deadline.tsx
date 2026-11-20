import Link from "next/link";
import { ArrowRight, CalendarClock, FileText, Inbox, ShieldAlert, ToggleLeft } from "lucide-react";
import type { Translator } from "@/lib/i18n/messages";
import { SectionHeading } from "./section-heading";

/** 13 May 2027, 00:00 IST: most duties apply from this date (DPDP Rules 2025, Rule 1(4)). */
const COMMENCEMENT = Date.UTC(2027, 4, 12, 18, 30);

const DUTIES = [
  { icon: FileText, title: "home.problem1Title", text: "home.problem1" },
  { icon: ToggleLeft, title: "home.problem2Title", text: "home.problem2" },
  { icon: Inbox, title: "home.problem3Title", text: "home.problem3" },
  { icon: ShieldAlert, title: "home.problem4Title", text: "home.problem4" },
] as const;

/** Whole days left until 13 May 2027 (IST), 0 afterwards. */
export function daysUntilCommencement(now: Date = new Date()): number {
  return Math.max(0, Math.ceil((COMMENCEMENT - now.getTime()) / 86_400_000));
}

/** The problem: what applies from 13 May 2027, with a server-rendered day count. */
export function Deadline({ t, guideHref, days }: { t: Translator; guideHref: string; days: number }) {
  return (
    <section id="deadline" aria-labelledby="deadline-title" className="scroll-mt-16 border-b border-line py-24 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <div>
          <SectionHeading id="deadline-title" eyebrow={t("home.problemEyebrow")} title={t("home.problemTitle")} text={t("home.problemText")} />
          {days > 0 ? (
            <p className="mt-8 inline-flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
              <CalendarClock className="size-8 text-primary-text" aria-hidden />
              <span>
                <span className="block font-display text-3xl font-bold tabular-nums">{t("home.daysLeft", { days: days.toLocaleString("en-IN") })}</span>
                <span className="text-sm text-muted">{t("home.daysLeftLabel")}</span>
              </span>
            </p>
          ) : null}
          <p className="mt-6 max-w-[52ch] text-sm leading-relaxed text-muted">{t("home.problemPenalty")}</p>
          <Link href={guideHref} className="group mt-4 inline-flex items-center gap-1.5 font-semibold text-primary-text hover:underline">
            {t("home.problemGuide")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {DUTIES.map((d) => (
            <li key={d.title} className="rounded-2xl border border-line bg-surface p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary-text" aria-hidden>
                <d.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-sans text-base font-semibold tracking-normal">{t(d.title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(d.text)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
