"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, FileText, Printer, RotateCcw } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import {
  applicableQuestions,
  scoreReadiness,
  SECTOR_TO_PRESET,
  type Answers,
  type ProfileAnswers,
  type ReadinessData,
  type RProfileQuestion,
  type RQuestion,
} from "@/core/readiness/model";
import { cn } from "@/lib/utils";

type Texts = Record<string, string>;
type Step = { kind: "profile"; q: RProfileQuestion } | { kind: "scored"; q: RQuestion };

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * One-question-at-a-time DPDP readiness check. Everything happens in this
 * component's state: no storage and no network request.
 */
export function ReadinessChecker({
  data,
  texts,
  links,
}: {
  data: ReadinessData;
  texts: Texts;
  links: { kit: string; notice: string; pro: string };
}) {
  const t = (key: string, vars?: Record<string, string | number>) => (vars ? fill(texts[key] ?? key, vars) : (texts[key] ?? key));
  const [stage, setStage] = useState<"intro" | "questions" | "result">("intro");
  const [index, setIndex] = useState(0);
  const [profile, setProfile] = useState<ProfileAnswers>({});
  const [answers, setAnswers] = useState<Answers>({});
  const [allOpen, setAllOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const steps: Step[] = useMemo(
    () => [
      ...data.profile.map((q) => ({ kind: "profile" as const, q })),
      ...applicableQuestions(data.questions, profile).map((q) => ({ kind: "scored" as const, q })),
    ],
    [data, profile],
  );
  const result = useMemo(() => scoreReadiness(data, profile, answers), [data, profile, answers]);

  // Printing (button or Ctrl+P) shows the full list of gaps.
  useEffect(() => {
    const open = () => setAllOpen(true);
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);

  const focusHeading = () => requestAnimationFrame(() => headingRef.current?.focus());
  const go = (next: number) => {
    if (next >= steps.length) {
      setStage("result");
      window.scrollTo({ top: 0 });
    } else setIndex(Math.max(0, next));
    focusHeading();
  };

  const choose = (step: Step, optionId: string) => {
    if (step.kind === "profile") setProfile((p) => ({ ...p, [step.q.id]: optionId }));
    else setAnswers((a) => ({ ...a, [step.q.id]: optionId }));
    // Recompute the step count with the new profile answer before moving on.
    const nextProfile = step.kind === "profile" ? { ...profile, [step.q.id]: optionId } : profile;
    const total = data.profile.length + applicableQuestions(data.questions, nextProfile).length;
    if (index + 1 >= total) {
      setStage("result");
      window.scrollTo({ top: 0 });
      focusHeading();
    } else go(index + 1);
  };

  const restart = () => {
    setProfile({});
    setAnswers({});
    setIndex(0);
    setStage("intro");
    focusHeading();
  };

  if (stage === "intro") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold focus:outline-none">
          {t("rc.introCard", { n: data.profile.length + data.questions.length })}
        </h2>
        <p className="mt-3 text-muted">{data.keyDates}</p>
        <p className="mt-3 text-sm text-muted">{t("rc.privacy")}</p>
        <button type="button" onClick={() => { setStage("questions"); focusHeading(); }} className={buttonClass("primary", "lg", "mt-6")}>
          {t("rc.start")}
          <ArrowRight aria-hidden className="rtl:rotate-180" />
        </button>
      </div>
    );
  }

  if (stage === "questions") {
    const step = steps[Math.min(index, steps.length - 1)];
    const selected = step.kind === "profile" ? profile[step.q.id] : answers[step.q.id];
    const section = step.kind === "profile" ? t("rc.aboutYou") : t(`rc.section.${step.q.section}`);
    const pct = Math.round((index / steps.length) * 100);
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-4 text-sm text-muted">
          <span className="font-medium text-primary-text">{section}</span>
          <span>{t("rc.progress", { n: index + 1, total: steps.length })}</span>
        </div>
        <div
          role="progressbar"
          aria-label={t("rc.progressLabel")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-3 h-2 overflow-hidden rounded-full bg-line"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>

        <h2 ref={headingRef} tabIndex={-1} id="rc-question" className="mt-6 text-xl leading-snug font-bold focus:outline-none sm:text-2xl">
          {step.q.text}
        </h2>
        {step.q.help ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-primary-text">{t("rc.whyAsk")}</summary>
            <p className="mt-2 leading-relaxed text-muted">{step.q.help}</p>
          </details>
        ) : null}

        <ul role="list" aria-labelledby="rc-question" className="mt-5 grid gap-2.5">
          {step.q.options.map((o) => {
            const active = selected === o.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => choose(step, o.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-start text-[15px] leading-snug transition-colors",
                    active ? "border-primary bg-primary-soft font-medium" : "border-line bg-paper hover:border-primary-line",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", active ? "border-primary" : "border-line")}
                  >
                    {active ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                  </span>
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => (index === 0 ? setStage("intro") : go(index - 1))} className={buttonClass("ghost", "md")}>
            <ArrowLeft aria-hidden className="rtl:rotate-180" />
            {t("rc.back")}
          </button>
          <div className="flex flex-wrap gap-2">
            {step.kind === "scored" ? (
              <button type="button" onClick={() => go(index + 1)} className={buttonClass("ghost", "md")}>
                {t("rc.skip")}
              </button>
            ) : null}
            {selected ? (
              <button type="button" onClick={() => go(index + 1)} className={buttonClass("outline", "md")}>
                {index + 1 >= steps.length ? t("rc.seeResult") : t("rc.next")}
                {index + 1 >= steps.length ? null : <ArrowRight aria-hidden className="rtl:rotate-180" />}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Result ---------- */
  const { score, band, gaps, flags } = result;
  const top = gaps.slice(0, 5);
  const presetSector = SECTOR_TO_PRESET[profile.p_sector ?? "other"] ?? "other";
  const date = new Date().toISOString().slice(0, 10);

  const downloadReport = () => {
    const gapHtml = gaps
      .map(
        (g) =>
          `<li><strong>${esc(g.question.gapLabel)}</strong><br><span class="m">${esc(t("rc.yourAnswer"))} ${esc(g.option.label)}</span>${
            g.option.recommendation ? `<p>${esc(g.option.recommendation)}</p>` : ""
          }${g.option.ruleRefs.length ? `<p class="m">${esc(t("rc.refs"))} ${esc(g.option.ruleRefs.join(", "))}</p>` : ""}</li>`,
      )
      .join("");
    const html = `<!doctype html><html lang="${data.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(
      t("rc.resultTitle"),
    )}</title><style>body{font:16px/1.6 system-ui,"Noto Sans","Noto Sans Devanagari","Nirmala UI",sans-serif;max-width:46rem;margin:2rem auto;padding:0 1.25rem;color:#1c1917}h1{font-size:1.6rem}.s{font-size:3rem;font-weight:700}.m{color:#57534e;font-size:.9rem}li{margin-bottom:1rem}.b{border-left:4px solid #b45309;background:#fffbeb;padding:.75rem 1rem}</style></head><body>
<h1>${esc(t("rc.resultTitle"))}</h1>
<p class="b">${esc(data.disclaimer)}</p>
<p class="s">${score ?? "–"}<span class="m"> / 100</span></p>
${band ? `<h2>${esc(band.label)}</h2><p>${esc(band.summary)}</p>` : ""}
<p class="m">${esc(t("rc.answered", { n: result.answered, inPlace: result.inPlace, gaps: gaps.length }))}</p>
${result.enough ? "" : `<p class="m">${esc(t("rc.notEnough", { n: data.minimumAnswered }))}</p>`}
${flags.length ? `<h2>${esc(t("rc.notes"))}</h2><ul>${flags.map((f) => `<li>${esc(f.message)} <span class="m">(${esc(f.ruleRefs.join(", "))})</span></li>`).join("")}</ul>` : ""}
<h2>${esc(t("rc.allGaps", { n: gaps.length }))}</h2>${gaps.length ? `<ol>${gapHtml}</ol>` : `<p>${esc(t("rc.noGaps"))}</p>`}
${band ? `<h2>${esc(t("rc.ctaTitle"))}</h2><p>${esc(band.cta)}</p>` : ""}
<p class="m">${esc(data.keyDates)}</p>
<p class="m">${esc(t("rc.reportFor", { date, version: data.version, reviewed: data.lastReviewed }))}</p>
<h2>${esc(t("rc.sources"))}</h2><ul>${data.sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.title)}</a></li>`).join("")}</ul>
</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("rc.reportFile")}-${date}.html`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="space-y-6">
      <section aria-labelledby="rc-result" className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <h2 ref={headingRef} tabIndex={-1} id="rc-result" className="text-2xl font-bold focus:outline-none">
          {t("rc.resultTitle")}
        </h2>
        <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="relative grid size-36 shrink-0 place-items-center">
            <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - (score ?? 0) / 100)}
              />
            </svg>
            <p className="text-center">
              <span className="sr-only">{t("rc.scoreLabel")}: </span>
              <span className="block font-display text-4xl font-bold">{score ?? "–"}</span>
              <span className="text-xs text-muted">{t("rc.outOf")}</span>
            </p>
          </div>
          <div>
            {band ? <p className="text-xl font-semibold text-primary-text">{band.label}</p> : <p>{t("rc.noScore")}</p>}
            {band ? <p className="mt-2 leading-relaxed">{band.summary}</p> : null}
            <p className="mt-3 text-sm text-muted">{t("rc.answered", { n: result.answered, inPlace: result.inPlace, gaps: gaps.length })}</p>
            {!result.enough ? <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">{t("rc.notEnough", { n: data.minimumAnswered })}</p> : null}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={() => { setAllOpen(true); setTimeout(() => window.print(), 50); }} className={buttonClass("outline", "sm")}>
            <Printer aria-hidden />
            {t("rc.print")}
          </button>
          <button type="button" onClick={downloadReport} className={buttonClass("outline", "sm")}>
            <Download aria-hidden />
            {t("rc.download")}
          </button>
          <button type="button" onClick={restart} className={buttonClass("ghost", "sm")}>
            <RotateCcw aria-hidden />
            {t("rc.restart")}
          </button>
        </div>
      </section>

      {flags.length ? (
        <section aria-labelledby="rc-notes" className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <h2 id="rc-notes" className="text-lg font-bold">
            {t("rc.notes")}
          </h2>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed">
            {flags.map((f) => (
              <li key={f.id}>
                {f.message} <span className="font-mono text-xs opacity-80">({f.ruleRefs.join(", ")})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="rc-gaps" className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 id="rc-gaps" className="text-lg font-bold">
          {t("rc.topGaps")}
        </h2>
        {top.length ? <GapList gaps={top} t={t} /> : <p className="mt-3 text-muted">{t("rc.noGaps")}</p>}
        {gaps.length > top.length ? (
          <details className="mt-6" open={allOpen} onToggle={(e) => setAllOpen(e.currentTarget.open)}>
            <summary className="cursor-pointer font-semibold text-primary-text">{t("rc.allGaps", { n: gaps.length })}</summary>
            <GapList gaps={gaps.slice(top.length)} t={t} start={top.length + 1} />
          </details>
        ) : null}
      </section>

      <section aria-labelledby="rc-next" className="rounded-2xl border border-primary-line bg-primary-soft p-6 sm:p-8 print:hidden">
        <h2 id="rc-next" className="text-lg font-bold">
          {t("rc.ctaTitle")}
        </h2>
        {band ? <p className="mt-2 text-sm leading-relaxed">{band.cta}</p> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="font-semibold">{t("rc.ctaKit")}</p>
            <p className="mt-1 text-sm text-muted">{t("rc.ctaKitText")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={links.kit} className={buttonClass("primary", "md")}>
                {t("rc.ctaKit")}
                <ArrowRight aria-hidden className="rtl:rotate-180" />
              </a>
              <a href={`${links.notice}?sector=${presetSector}`} className={buttonClass("outline", "md")}>
                <FileText aria-hidden />
                {t("rc.ctaNotice")}
              </a>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="font-semibold">{t("rc.ctaSetup")}</p>
            <p className="mt-1 text-sm text-muted">{t("rc.ctaSetupText")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={links.pro} target="_blank" rel="noopener" className={buttonClass("outline", "md")}>
                {t("rc.ctaWhatsapp")}
                <ArrowRight aria-hidden className="rtl:rotate-180" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section aria-label={t("common.notLegalAdvice")} className="text-xs leading-relaxed text-muted">
        <p>{data.disclaimer}</p>
        <p className="mt-2">{t("rc.reportFor", { date, version: data.version, reviewed: data.lastReviewed })}</p>
        <p className="mt-2">
          {t("rc.sources")}:{" "}
          {data.sources.map((s, i) => (
            <span key={s.url}>
              {i ? " · " : ""}
              <a href={s.url} className="underline underline-offset-2" rel="noopener noreferrer" target="_blank">
                {s.title}
              </a>
            </span>
          ))}
        </p>
      </section>
    </div>
  );
}

function GapList({
  gaps,
  t,
  start = 1,
}: {
  gaps: Array<{ question: RQuestion; option: RQuestion["options"][number] }>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  start?: number;
}) {
  return (
    <ol start={start} className="mt-4 space-y-4">
      {gaps.map((g, i) => (
        <li key={g.question.id} className="flex gap-4 rounded-xl border border-line bg-paper p-4">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">
            {start + i}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{g.question.gapLabel}</p>
            <p className="mt-1 text-sm text-muted">
              {t("rc.yourAnswer")} {g.option.label}
            </p>
            {g.option.recommendation ? <p className="mt-2 text-sm leading-relaxed">{g.option.recommendation}</p> : null}
            {g.option.ruleRefs.length ? (
              <p className="mt-2 flex flex-wrap gap-1.5" aria-label={t("rc.refs")}>
                {g.option.ruleRefs.map((r) => (
                  <span key={r} className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-xs text-muted">
                    {r}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
