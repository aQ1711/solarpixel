"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookieConsent, setCookieConsent } from "@/lib/cookieConsent";

/**
 * Lightweight, non-intrusive fixed-bottom cookie consent banner.
 * Deliberately shows only ONCE (until the choice is cleared) — reads
 * localStorage on mount and renders nothing at all if a choice already
 * exists, rather than a dismiss-but-reappear-next-visit pattern. Accept/
 * Decline both just record a choice here; components/Analytics.tsx is
 * what actually gates Meta Pixel/GA on the "accepted" value (see its own
 * doc comment) — this component has no tracking-script knowledge itself,
 * keeping the two concerns cleanly separated.
 */
export function CookieConsent() {
  // Starts null on every render (server AND client) so the initial
  // client render matches SSR — localStorage doesn't exist server-side,
  // reading it in a useState initializer would disagree with the SSR
  // markup and trigger a hydration mismatch, same reasoning as
  // AccessGate's `unlocked` state (components/internal/AccessGate.tsx).
  const [choiceMade, setChoiceMade] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoiceMade(getCookieConsent() !== null);
  }, []);

  function handleChoice(accepted: boolean) {
    setCookieConsent(accepted ? "accepted" : "declined");
    setChoiceMade(true);
  }

  if (choiceMade !== false) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-stone-200 bg-white/95 px-4 py-3.5 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-sm print:hidden"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-center text-xs text-stone-600 sm:text-left">
          We use cookies for basic site functionality and, only if you accept, for analytics to understand how
          visitors use our site. See our{" "}
          <Link href="/privacy-policy" className="font-medium text-orange-700 hover:text-orange-800">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => handleChoice(false)}
            className="rounded-lg border border-stone-200 px-3.5 py-2 text-xs font-medium text-stone-600 transition-colors duration-200 hover:border-stone-300 hover:text-stone-900"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => handleChoice(true)}
            className="rounded-lg bg-stone-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-stone-800"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
