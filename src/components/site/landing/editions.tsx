import { ArrowUpRight, Check, Minus } from "lucide-react";
import type { MessageKey, Translator } from "@/lib/i18n/messages";
import { PRO_URL } from "@/lib/edition";
import { SectionHeading } from "./section-heading";

type Cell = MessageKey | boolean;

const ROWS: Array<{ label: MessageKey; free: Cell; pro: Cell }> = [
  { label: "home.editionRowCore", free: true, pro: true },
  { label: "home.editionRowScale", free: "home.editionRowScaleFree", pro: "home.editionRowScalePro" },
  { label: "home.editionRowChildren", free: "home.editionRowChildrenFree", pro: "home.editionRowChildrenPro" },
  { label: "home.editionRowEvidence", free: false, pro: true },
  { label: "home.editionRowApi", free: false, pro: true },
  { label: "home.editionRowWhiteLabel", free: false, pro: true },
  { label: "home.editionRowPacks", free: false, pro: true },
  { label: "home.editionRowUpdates", free: "home.editionRowUpdatesFree", pro: "home.editionRowUpdatesPro" },
];

function CellView({ t, value }: { t: Translator; value: Cell }) {
  if (value === true) return <Check className="mx-auto size-5 text-emerald-600 dark:text-emerald-400" aria-label="Yes" />;
  if (value === false) return <Minus className="mx-auto size-5 text-muted" aria-label="No" />;
  return <span className="text-sm">{t(value)}</span>;
}

/** Free vs Pro (vs hosted, coming soon) comparison with the "Get Pro" link. */
export function Editions({ t }: { t: Translator }) {
  return (
    <section id="editions" aria-labelledby="editions-title" className="scroll-mt-16 border-y border-line bg-surface py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading id="editions-title" eyebrow={t("home.editionsEyebrow")} title={t("home.editionsTitle")} text={t("home.editionsText")} />
        <div className="-mx-4 mt-12 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-start">
            <thead>
              <tr>
                <th scope="col" className="border-b border-line p-3 text-sm font-medium text-muted">
                  {t("home.editionFeature")}
                </th>
                <th scope="col" className="border-b border-line p-3 text-center">
                  <span className="block font-semibold">{t("home.editionFree")}</span>
                  <span className="block text-xs font-normal text-muted">{t("home.editionFreePrice")}</span>
                </th>
                <th scope="col" className="rounded-t-xl border-b border-primary-line bg-primary-soft p-3 text-center">
                  <span className="block font-semibold text-primary-text">{t("home.editionPro")}</span>
                  <span className="block text-xs font-normal text-muted">{t("home.editionProPrice")}</span>
                </th>
                <th scope="col" className="border-b border-line p-3 text-center">
                  <span className="block font-semibold">{t("home.editionHosted")}</span>
                  <span className="block text-xs font-normal text-muted">{t("home.editionHostedPrice")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="border-b border-line p-3 text-sm font-normal">
                    {t(row.label)}
                  </th>
                  <td className="border-b border-line p-3 text-center">
                    <CellView t={t} value={row.free} />
                  </td>
                  <td className="border-b border-primary-line bg-primary-soft/60 p-3 text-center">
                    <CellView t={t} value={row.pro} />
                  </td>
                  <td className="border-b border-line p-3 text-center text-sm text-muted">{t("home.editionHostedPrice")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href={PRO_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-white shadow-lg shadow-primary/30 hover:opacity-90"
          >
            {t("home.editionGetPro")}
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
          <p className="text-sm text-muted">{t("home.editionAgency")}</p>
        </div>
      </div>
    </section>
  );
}
