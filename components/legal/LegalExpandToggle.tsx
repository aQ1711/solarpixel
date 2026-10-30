"use client";

import { useState } from "react";

/** Opens or closes every collapsible section on a legal page at once. */
export function LegalExpandToggle() {
  const [allOpen, setAllOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !allOpen;
        document.querySelectorAll<HTMLDetailsElement>("details[data-legal-section]").forEach((d) => {
          d.open = next;
        });
        setAllOpen(next);
      }}
      className="min-h-9 rounded-full border border-[#1E3550]/20 bg-white px-3.5 text-xs font-semibold text-[#1E3550] transition-colors duration-200 hover:border-orange-400 hover:text-orange-700"
    >
      {allOpen ? "Close all sections" : "Open all sections"}
    </button>
  );
}
