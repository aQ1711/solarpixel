"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { WHATSAPP_BUSINESS_NUMBER, GENERAL_INQUIRY_WA_MESSAGE } from "@/lib/constants/contact";
import { trackWhatsAppClick } from "@/lib/analytics";

/**
 * The one real site header (2026-09-05, "header should remain the same
 * across the application... don't you think so?" — yes). Previously
 * lived only inside app/HomePageContent.tsx (a "use client" component
 * built around the homepage's own calculator state) as a local `Header`
 * function; every OTHER page (About/Privacy/Terms, via LegalPageShell)
 * had its own separate, much plainer hand-rolled header instead of this
 * one — genuinely inconsistent, not a deliberate design choice. Moved
 * here so both trees render the identical component. "use client" only
 * because of the WhatsApp click-tracking handler below (trackWhatsAppClick
 * is itself a no-op outside the browser, but attaching an onClick at all
 * requires a Client Component) — everything else here is static markup.
 *
 * "Get Instant Quote" is a plain `<a href="/#calculator">`, not the
 * homepage's old `scrollToCalculator()` DOM-scrollIntoView handler —
 * that only ever worked when #calculator existed on the CURRENT page
 * (i.e. only from the homepage itself; silently did nothing from About/
 * Privacy/Terms). A plain hash link works everywhere: same-page smooth
 * scroll on "/" (see globals.css's `scroll-behavior: smooth`), and a
 * real navigation-then-scroll from anywhere else.
 */
export function SiteHeader() {
  return (
    <header className="px-3 pt-3 sm:px-5">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 rounded-full border border-stone-200 bg-white/90 py-2 pl-4 pr-2 shadow-sm shadow-stone-200/50 backdrop-blur-md sm:pl-5 sm:pr-2.5">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" />
          <span className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg">Solar Pixel</span>
          <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 sm:inline-block">
            No Net Metering
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          {/* Mobile — a static location pill instead of the Contact
              Us/Get Instant Quote CTAs below (redundant on a screen this
              short, and "Get Instant Quote" is one scroll away either
              way). "Punjab · Pakistan", not "LESCO · Lahore" — LESCO
              only serves Lahore; this business quotes across Punjab. */}
          <span className="flex min-h-9 items-center rounded-full border border-[#E8E1D8] bg-white px-3.5 font-mono text-[11px] font-semibold text-[#5A6472] lg:hidden">
            Punjab · Pakistan
          </span>
          <a
            href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(GENERAL_INQUIRY_WA_MESSAGE)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackWhatsAppClick("header")}
            className="hidden min-h-9 items-center rounded-full border border-stone-200 px-3.5 text-xs font-medium text-stone-600 transition-colors duration-200 hover:border-stone-300 hover:text-stone-900 lg:flex"
          >
            Contact Us
          </a>
          <Link
            href="/#calculator"
            className="hidden min-h-9 items-center gap-1.5 rounded-full bg-stone-900 px-4 text-xs font-semibold text-white transition-colors duration-200 hover:bg-stone-800 lg:flex"
          >
            Get Instant Quote
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
