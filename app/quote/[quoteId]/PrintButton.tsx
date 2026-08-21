"use client";

import { Download } from "lucide-react";

/** Tiny client-only island — the rest of this route is a Server
 *  Component (see page.tsx), but `window.print()` needs a real click
 *  handler. Same "browser's native print-to-PDF, no PDF library"
 *  convention app/page.tsx's "Download Quotation (PDF)" button already
 *  uses — see this route's own doc comment for why. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex min-h-11 items-center gap-2 rounded-full border border-violet-200 bg-white px-4 text-sm font-semibold text-violet-700 shadow-sm transition-colors duration-200 hover:border-violet-300 hover:bg-violet-50 print:hidden"
    >
      <Download className="h-4 w-4" /> Save as PDF
    </button>
  );
}
