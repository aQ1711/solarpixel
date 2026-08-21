import Script from "next/script";

/**
 * Conditionally loads the Meta Pixel base snippet and/or Google Analytics
 * (gtag.js), ONLY if the corresponding env var is actually set. Neither
 * is configured out of the box — this project has no Pixel ID or GA
 * Measurement ID today (2026-08-21). That's deliberate, not a stub left
 * half-done: both are third-party trackers with real privacy/consent
 * implications (Meta Pixel's base snippet fires a `PageView` event on
 * every single page load, not just on the WhatsApp-click events
 * lib/analytics.ts sends), and this site currently has zero cookie-
 * consent infrastructure. Flip them on by setting the env var below —
 * nothing else needs to change, lib/analytics.ts's trackWhatsAppClick()
 * already checks for `window.fbq`/`window.gtag` before calling either.
 *
 * Set in .env (see .env.example):
 *   NEXT_PUBLIC_META_PIXEL_ID="123456789012345"
 *   NEXT_PUBLIC_GA_MEASUREMENT_ID="G-XXXXXXXXXX"
 */
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function Analytics() {
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
