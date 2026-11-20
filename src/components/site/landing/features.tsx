import { Bell, ClipboardList, FileText, Inbox, Scale, ShieldAlert, Timer, ToggleLeft } from "lucide-react";
import type { Translator } from "@/lib/i18n/messages";
import { SectionHeading } from "./section-heading";

/** The kit's modules, each tied to the DPDP duty it helps with. */
const FEATURES = [
  { icon: FileText, title: "home.feat.noticeTitle", text: "home.feat.notice", law: "s.5, Rule 3" },
  { icon: ToggleLeft, title: "home.feat.bannerTitle", text: "home.feat.banner", law: "s.6(1), 6(4)" },
  { icon: ClipboardList, title: "home.feat.recordsTitle", text: "home.feat.records", law: "s.6(10)" },
  { icon: Inbox, title: "home.feat.rightsTitle", text: "home.feat.rights", law: "s.11–14, Rule 14" },
  { icon: ShieldAlert, title: "home.feat.breachTitle", text: "home.feat.breach", law: "Rule 7" },
  { icon: Timer, title: "home.feat.retentionTitle", text: "home.feat.retention", law: "s.8(7), Rule 8" },
  { icon: Scale, title: "home.feat.vendorsTitle", text: "home.feat.vendors", law: "s.8(2)" },
  { icon: Bell, title: "home.feat.childrenTitle", text: "home.feat.children", law: "s.9, Rule 10" },
] as const;

export function Features({ t }: { t: Translator }) {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-16 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading id="features-title" align="center" eyebrow={t("home.featEyebrow")} title={t("home.featTitle")} text={t("home.featText")} />
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-2xl border border-line bg-surface p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary-text" aria-hidden>
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-sans text-base font-semibold tracking-normal">{t(f.title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(f.text)}</p>
              <p className="mt-3 font-mono text-xs text-muted">{f.law}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
