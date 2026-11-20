import type { Metadata } from "next";
import type { ReactNode } from "react";

// Print views read the signed-in user's data at request time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Print-to-PDF views (plan §7.2: browser print / @media print instead of a PDF
 * library). A4 portrait, black on white, tables that break cleanly across pages.
 */
const PRINT_CSS = `
.print-page{max-width:60rem;margin:0 auto;padding:2rem 1.5rem;color:#111;background:#fff;font-size:13px;line-height:1.5}
.print-page h1{font-size:1.5rem;margin:0 0 .25rem}.print-page h2{font-size:1.05rem;margin:1.5rem 0 .5rem}
.print-page table{width:100%;border-collapse:collapse;margin:.5rem 0}.print-page th,.print-page td{border:1px solid #999;padding:.3rem .4rem;text-align:start;vertical-align:top}
.print-page th{background:#eee}.print-page pre{white-space:pre-wrap;font:inherit;border:1px solid #bbb;padding:.75rem}
.print-page .muted{color:#555;font-size:.85em}.print-bar{display:flex;gap:.75rem;justify-content:flex-end;margin-bottom:1rem}
@page{size:A4;margin:14mm}
@media print{.no-print{display:none!important}.print-page{padding:0;max-width:none}.print-page tr,.print-page pre{break-inside:avoid}.print-page h2{break-after:avoid}a{color:inherit;text-decoration:none}}
`;

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="print-page">{children}</div>
    </>
  );
}
