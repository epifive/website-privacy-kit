"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { Download, Pencil, Printer, TriangleAlert } from "lucide-react";
import { generateFreeNotice, type FreeNoticeState } from "@/app/actions/free-notice";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Texts = Record<string, string>;

export interface GeneratorSectorView {
  id: string;
  label: string;
  goods: string;
  childrenMode: boolean;
  identifiers: string[];
  purposes: Array<{ key: string; name: string; items: string; optional: boolean }>;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** The free notice generator: questionnaire, then the EN/HI draft with download, print and the signup upsell. */
export function NoticeGenerator({
  lang,
  texts,
  sectors,
  identifiers,
  initialSector,
  links,
}: {
  lang: "en" | "hi";
  texts: Texts;
  sectors: GeneratorSectorView[];
  identifiers: Array<{ key: string; label: string }>;
  initialSector: string;
  links: { dashboard: string };
}) {
  const t = (k: string, vars?: Record<string, string | number>) => (vars ? fill(texts[k] ?? k, vars) : (texts[k] ?? k));
  const [state, action, pending] = useActionState<FreeNoticeState, FormData>(generateFreeNotice, {});
  const [sectorId, setSectorId] = useState(initialSector);
  const [tab, setTab] = useState<"en" | "hi">(lang);
  const sector = sectors.find((s) => s.id === sectorId) ?? sectors[0];
  const previewRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const f = (n: string) => `${id}-${n}`;

  useEffect(() => {
    if (state.runId && previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      previewRef.current.focus({ preventScroll: true });
    }
  }, [state.runId]);

  const notice = state.notices?.find((n) => n.lang === tab);

  const download = (n: NonNullable<FreeNoticeState["notices"]>[number]) => {
    const url = URL.createObjectURL(new Blob([n.document], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `privacy-notice-${n.lang}.html`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const printNotice = (n: NonNullable<FreeNoticeState["notices"]>[number]) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(n.document);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="space-y-8">
      <form
        id="ng-form"
        className="space-y-8 print:hidden"
        onSubmit={(e) => {
          // No automatic reset: "Edit answers" brings the person back to what they typed.
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
      >
        <input type="hidden" name="lang" value={lang} />
        <fieldset className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <legend className="px-1 text-lg font-bold">1. {t("ng.step1")}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <Field label={t("ng.orgName")} htmlFor={f("org")}>
              <Input id={f("org")} name="org_name" required minLength={2} maxLength={120} autoComplete="organization" />
            </Field>
            <Field label={t("ng.legalName")} htmlFor={f("legal")} hint={t("ng.legalNameHint")}>
              <Input id={f("legal")} name="legal_name" maxLength={160} />
            </Field>
            <Field label={t("ng.sector")} htmlFor={f("sector")}>
              <Select id={f("sector")} name="sector" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("ng.website")} htmlFor={f("website")}>
              <Input id={f("website")} name="website" required inputMode="url" maxLength={255} placeholder="https://example.com" autoComplete="url" />
            </Field>
            <Field label={t("ng.goodsEn")} htmlFor={f("goods-en")} hint={t("ng.goodsHint")}>
              <Textarea id={f("goods-en")} name="goods_en" maxLength={300} rows={2} className="min-h-16" placeholder={sector.goods && lang === "en" ? sector.goods : undefined} />
            </Field>
            <Field label={t("ng.goodsHi")} htmlFor={f("goods-hi")} hint={t("ng.goodsHint")}>
              <Textarea id={f("goods-hi")} name="goods_hi" maxLength={300} rows={2} className="min-h-16" lang="hi" placeholder={sector.goods && lang === "hi" ? sector.goods : undefined} />
            </Field>
            <Field label={t("ng.noticeUrl")} htmlFor={f("notice-url")} hint={t("ng.noticeUrlHint")} className="sm:col-span-2">
              <Input id={f("notice-url")} name="notice_url" inputMode="url" maxLength={255} placeholder="https://example.com/privacy" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <legend className="px-1 text-lg font-bold">2. {t("ng.step2")}</legend>
          <p className="mt-2 text-sm text-muted">{t("ng.purposes")}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2" key={sector.id}>
            {sector.purposes.map((p) => (
              <li key={p.key}>
                <label className="flex h-full cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-4 has-[:checked]:border-primary-line">
                  <input type="checkbox" name="purposes" value={p.key} defaultChecked className="mt-1 size-4 shrink-0 accent-[var(--primary)]" />
                  <span>
                    <span className="block font-medium">{p.name}</span>
                    <span className="mt-1 block text-sm text-muted">{t("ng.purposeItems", { items: p.items })}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm" key={`kids-${sector.id}`}>
            <input type="checkbox" name="children" defaultChecked={sector.childrenMode} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
            <span>{t("ng.children")}</span>
          </label>
        </fieldset>

        <fieldset className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <legend className="px-1 text-lg font-bold">3. {t("ng.step3")}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <Field label={t("ng.contactName")} htmlFor={f("cname")}>
              <Input id={f("cname")} name="contact_name" required minLength={2} maxLength={120} />
            </Field>
            <Field label={t("ng.contactDesignation")} htmlFor={f("cdes")}>
              <Input id={f("cdes")} name="contact_designation" maxLength={120} />
            </Field>
            <Field label={t("ng.contactEmail")} htmlFor={f("cemail")}>
              <Input id={f("cemail")} name="contact_email" type="email" required maxLength={190} />
            </Field>
            <Field label={t("ng.contactPhone")} htmlFor={f("cphone")}>
              <Input id={f("cphone")} name="contact_phone" type="tel" maxLength={30} />
            </Field>
            <Field label={t("ng.contactAddress")} htmlFor={f("caddr")} className="sm:col-span-2">
              <Input id={f("caddr")} name="contact_address" maxLength={300} />
            </Field>
            <Field label={t("ng.responseDays")} htmlFor={f("days")}>
              <Input id={f("days")} name="response_days" type="number" min={1} max={90} defaultValue={30} className="max-w-32" />
            </Field>
          </div>
          <fieldset className="mt-5" key={`ids-${sector.id}`}>
            <legend className="mb-2 text-sm font-medium">{t("ng.identifiers")}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {identifiers.map((o) => (
                <label key={o.key} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="identifiers"
                    value={o.key}
                    defaultChecked={o.key === "email" || sector.identifiers.includes(o.key)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>

        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass("primary", "lg")}>
            {pending ? t("ng.generating") : t("ng.generate")}
          </button>
          <p className="text-sm text-muted">{t("ng.privacy")}</p>
        </div>
      </form>

      {state.notices && notice ? (
        <section aria-labelledby="ng-preview" className="space-y-5">
          <h2 ref={previewRef} tabIndex={-1} id="ng-preview" className="scroll-mt-24 text-2xl font-bold focus:outline-none">
            {t("ng.previewTitle")}
          </h2>
          <div role="note" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{t("ng.banner")}</p>
              <p className="mt-1">{t("ng.linksNote")}</p>
              <p className="mt-1">{t("ng.notStored")}</p>
            </div>
          </div>
          {state.warning ? <Alert tone="warning">{state.warning}</Alert> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label={t("ng.previewTitle")} className="inline-flex rounded-lg border border-line bg-surface p-1">
              {(["en", "hi"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  id={`ng-tab-${l}`}
                  aria-selected={tab === l}
                  aria-controls="ng-panel"
                  onClick={() => setTab(l)}
                  className={cn("rounded-md px-4 py-1.5 text-sm font-medium", tab === l ? "bg-primary text-white" : "text-muted hover:text-ink")}
                >
                  {t(l === "en" ? "ng.tabEn" : "ng.tabHi")}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {state.notices.map((n) => (
                <button key={n.lang} type="button" onClick={() => download(n)} className={buttonClass("outline", "sm")}>
                  <Download aria-hidden />
                  {t("ng.download", { lang: n.lang === "en" ? "English" : "हिंदी" })}
                </button>
              ))}
              <button type="button" onClick={() => printNotice(notice)} className={buttonClass("outline", "sm")}>
                <Printer aria-hidden />
                {t("ng.print")}
              </button>
              <a href="#ng-form" className={buttonClass("ghost", "sm")}>
                <Pencil aria-hidden />
                {t("ng.edit")}
              </a>
            </div>
          </div>

          <article
            id="ng-panel"
            role="tabpanel"
            aria-labelledby={`ng-tab-${tab}`}
            lang={notice.lang}
            className="notice-preview rounded-2xl border border-line bg-surface p-6 sm:p-10"
            dangerouslySetInnerHTML={{ __html: notice.html }}
          />
          <p className="font-mono text-xs break-all text-muted">SHA-256 {notice.sha256}</p>

          <div className="rounded-2xl border border-primary-line bg-primary-soft p-6 sm:p-8">
            <h3 className="text-lg font-bold">{t("ng.upsellTitle")}</h3>
            <p className="mt-2 max-w-[65ch] text-sm leading-relaxed">{t("ng.upsellText")}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href={links.dashboard} className={buttonClass("primary", "md")}>
                {t("ng.upsellCta")}
              </a>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
