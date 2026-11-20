import Link from "next/link";
import { ArrowRight, BookOpen, FileText, Gauge } from "lucide-react";
import type { Translator } from "@/lib/i18n/messages";
import { SectionHeading } from "./section-heading";

/** Lead magnets: readiness check, free notice generator, guides. No login. */
export function FreeTools({ t, hindi }: { t: Translator; hindi: boolean }) {
  const p = (path: string) => (hindi ? `/hi${path}` : path);
  const tools = [
    { icon: Gauge, title: "home.tool1Title", text: "home.tool1", cta: "home.tool1Cta", href: p("/readiness") },
    { icon: FileText, title: "home.tool2Title", text: "home.tool2", cta: "home.tool2Cta", href: p("/notice-generator") },
    { icon: BookOpen, title: "home.tool3Title", text: "home.tool3", cta: "home.tool3Cta", href: p("/guides") },
  ] as const;
  return (
    <section id="free-tools" aria-labelledby="tools-title" className="scroll-mt-16 bg-surface py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading id="tools-title" align="center" eyebrow={t("home.toolsEyebrow")} title={t("home.toolsTitle")} text={t("home.toolsText")} />
        <ul className="mt-14 grid gap-5 md:grid-cols-3">
          {tools.map((tool) => (
            <li key={tool.title}>
              <Link href={tool.href} className="group flex h-full flex-col rounded-2xl border border-line bg-paper p-7 transition-colors hover:border-primary-line">
                <span className="grid size-11 place-items-center rounded-xl bg-primary text-white" aria-hidden>
                  <tool.icon className="size-5" />
                </span>
                <span className="mt-5 text-lg font-semibold">{t(tool.title)}</span>
                <span className="mt-2 flex-1 text-sm leading-relaxed text-muted">{t(tool.text)}</span>
                <span className="mt-5 inline-flex items-center gap-1.5 font-semibold text-primary-text">
                  {t(tool.cta)}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
