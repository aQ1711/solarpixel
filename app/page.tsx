import type { Metadata } from "next";
import HomePageContent from "./HomePageContent";

/**
 * Homepage-specific metadata (2026-08-22, Local SEO task) — overrides
 * app/layout.tsx's site-wide defaults for this one route. Split into
 * its own Server Component file specifically so this export is
 * possible at all: the actual page content (app/HomePageContent.tsx)
 * is a Client Component, and Next.js only reads `metadata` from Server
 * Components. This is currently the app's only real public marketing
 * page — /admin/*, /maker/survey, and /quote/[quoteId] are all
 * deliberately excluded from search visibility (see app/robots.ts and
 * app/sitemap.ts for why each one is excluded).
 *
 * `title` is the FULL string, not just the keyword — confirmed against
 * this project's own bundled Next.js docs (node_modules/next/dist/docs/
 * .../generate-metadata.md: "title.template defined in layout.js will
 * not apply to a title defined in a page.js of the SAME route
 * segment" — this page.js and the root layout.js ARE the same segment,
 * so layout.tsx's `template: "%s | Solar Pixel"` never touches this
 * title; only a title set in a genuinely nested child route would get
 * it). Caught live: the template silently didn't apply in both dev and
 * a full production build before this was fixed.
 */
export const metadata: Metadata = {
  title: "Live Solar Calculator & Quotations in Lahore | Solar Pixel",
  description:
    "Get an instant solar system quote for your home or business in Lahore. Compare real Longi, Jinko, Huawei, Solis & Growatt panel and inverter prices, size your system in seconds, and go live in 48 hours, with no WAPDA net metering paperwork.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Live Solar Calculator & Quotations in Lahore | Solar Pixel",
    description:
      "Instant solar sizing and pricing for Lahore homes and businesses. Real brand pricing, live in 48 hours, no WAPDA net metering paperwork.",
    url: "/",
  },
};

export default function Page() {
  return <HomePageContent />;
}
