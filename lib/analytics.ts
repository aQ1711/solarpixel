/**
 * Client-side event tracking for outbound WhatsApp CTAs — Meta Pixel
 * `Contact` event + a matching Google Analytics event, fired on click.
 *
 * IMPORTANT, READ BEFORE WIRING UP A REAL PIXEL: neither Meta Pixel nor
 * Google Analytics is actually installed in this project as of
 * 2026-08-21 (confirmed — no `fbq`/`gtag` script anywhere in the
 * codebase before this file). `trackWhatsAppClick` is written to be
 * SAFE either way — it no-ops silently if `window.fbq`/`window.gtag`
 * aren't present, so calling it never throws. But until `components/
 * Analytics.tsx` is actually activated (see that file's doc comment —
 * it needs `NEXT_PUBLIC_META_PIXEL_ID`/`NEXT_PUBLIC_GA_MEASUREMENT_ID`
 * set), every call here is a genuine no-op, not a working pixel. This
 * is a deliberate scope decision, not an oversight — see the project
 * memory entry for this task for the full reasoning (privacy/consent
 * implications of a real Pixel are worth a conscious decision, not a
 * silent default-on).
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

/** Fired on every outbound WhatsApp CTA click across the storefront —
 *  header, footer, the floating mobile badge, the Complete Solar report
 *  CTA, and the Panel Washing/EV Charger inquiry CTAs. `source` names
 *  WHICH CTA fired it (for later funnel analysis); `quoteId` is only
 *  ever present for the Complete Solar flow (Panel Washing/EV Charger
 *  never create a Quote — see AddOnResult's doc comment in app/page.tsx). */
export function trackWhatsAppClick(source: string, quoteId?: string | null): void {
  if (typeof window === "undefined") return;

  if (typeof window.fbq === "function") {
    window.fbq("track", "Contact", {
      content_name: "WhatsApp Click",
      quote_id: quoteId ?? undefined,
      source,
    });
  }

  if (typeof window.gtag === "function") {
    window.gtag("event", "whatsapp_click", {
      content_name: "WhatsApp Click",
      quote_id: quoteId ?? undefined,
      source,
    });
  }
}
