"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle } from "lucide-react";

/**
 * Intermediate landing page for Google Ads URL-based conversion
 * tracking (2026-09-08) — the WhatsApp CTA now navigates HERE first
 * (via `?waUrl=<encoded wa.me link>`, see the "Lock In Price on
 * WhatsApp" CTA in app/HomePageContent.tsx) instead of opening wa.me
 * directly, so a real page load of `solarpixel.pk/thank-you` exists
 * for Google Ads to fire a conversion against. Fires the SAME
 * fbq/gtag globals components/Analytics.tsx already sets up
 * (cookie-consent-gated — these calls are safe no-ops if a visitor
 * declined/hasn't decided, same guard pattern as
 * lib/analytics.ts's trackWhatsAppClick), then redirects on to the
 * real WhatsApp link after a brief delay.
 */
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

function ThankYouContent() {
  const searchParams = useSearchParams();
  const waUrl = searchParams.get("waUrl");

  useEffect(() => {
    if (typeof window.fbq === "function") {
      window.fbq("track", "PageView");
      window.fbq("track", "Lead");
    }
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", { page_path: "/thank-you" });
      window.gtag("event", "generate_lead");
    }

    if (!waUrl) return;
    const timer = setTimeout(() => {
      window.location.href = waUrl;
    }, 1000);
    return () => clearTimeout(timer);
  }, [waUrl]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0F172A] px-5 text-center text-white">
      <MessageCircle className="h-10 w-10 text-emerald-400" />
      <p className="text-lg font-semibold">Redirecting to WhatsApp...</p>
      {waUrl && (
        <a
          href={waUrl}
          className="mt-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-600"
        >
          Click here if WhatsApp doesn&apos;t open
        </a>
      )}
    </main>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={null}>
      <ThankYouContent />
    </Suspense>
  );
}
