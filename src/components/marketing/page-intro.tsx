import Link from "next/link";
import { Languages } from "lucide-react";
import type { ReactNode } from "react";

/** Heading block shared by the lead-magnet pages, with the EN/HI switch. */
export function PageIntro({
  eyebrow,
  title,
  intro,
  lang,
  switchHref,
  switchLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  lang: "en" | "hi";
  switchHref: string;
  switchLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold tracking-wide text-primary-text">{eyebrow}</p>
        <Link
          href={switchHref}
          hrefLang={lang === "en" ? "hi" : "en"}
          lang={lang === "en" ? "hi" : "en"}
          prefetch={false}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium hover:border-primary-line print:hidden"
        >
          <Languages className="size-4" aria-hidden />
          {switchLabel}
        </Link>
      </div>
      <h1 className="mt-3 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">{intro}</p>
      {children}
    </div>
  );
}
