"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { getCookieConsent, onCookieConsentChange } from "@/lib/cookieConsent";

/**
 * Conditionally loads the Meta Pixel base snippet and/or Google Analytics
 * (gtag.js) — gated on BOTH of two independent conditions:
 *   1. The corresponding env var is actually set. Neither is configured
 *      out of the box — this project has no Pixel ID or GA Measurement
 *      ID today (2026-08-21). Flip one on by setting the env var below;
 *      lib/analytics.ts's trackWhatsAppClick() already checks for
 *      `window.fbq`/`window.gtag` before calling either, so nothing else
 *      needs to change.
 *   2. The visitor has actually accepted cookies via
 *      components/CookieConsent.tsx (2026-08-22 — this project's cookie-
 *      consent infrastructure, which didn't exist when this file's first
 *      version was written; see that component's own doc comment). A
 *      declined or not-yet-decided visitor gets neither script, even if
 *      both env vars are set.
 * This is now a Client Component (it wasn't before) specifically because
 * consent lives in localStorage — client-only, and the whole reason
 * these scripts must NOT fire on the very first server-rendered paint
 * before that choice is known.
 *
 * Set in .env (see .env.example):
 *   NEXT_PUBLIC_META_PIXEL_ID="123456789012345"
 *   NEXT_PUBLIC_GA_MEASUREMENT_ID="G-XXXXXXXXXX"
 */
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function Analytics() {
  // Starts false on both server and client — same "don't read an
  // external-to-React source inside a useState initializer" reasoning as
  // AccessGate/CookieConsent's own state. Consent is checked once on
  // mount, then kept in sync live via onCookieConsentChange so accepting
  // the banner fires these scripts immediately, with no reload needed.
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasConsent(getCookieConsent() === "accepted");
    return onCookieConsentChange((value) => setHasConsent(value === "accepted"));
  }, []);

  if (!hasConsent) return null;

  return (
    <>
      {META_PIXEL_ID && (
        <Script id="meta-pixel-base" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
            document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}
      {GA_MEASUREMENT_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `}
          </Script>
        </>
      )}
    </>
  );
}
