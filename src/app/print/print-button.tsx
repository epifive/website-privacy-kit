"use client";

/** Opens the browser's print dialog (choose "Save as PDF" there). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md border border-[#333] px-3 py-1.5 text-sm font-medium">
      {label}
    </button>
  );
}
