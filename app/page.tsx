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
 *
 * Broadened 2026-09-05 ("do all the seo... top in Pakistan") — was
 * Lahore-only in the title/description. The live calculator's own
 * pricing data (real Longi/Jinko/Huawei/Solis/Growatt rates, the Market
 * Watch ticker) is genuinely useful to anyone in Pakistan pricing out
 * solar, whether or not they're in Punjab — that's the honest basis for
 * targeting the national keyword here. Confirmed with the user (via
 * AskUserQuestion) before making this change: installation itself stays
 * honestly scoped to Lahore/Punjab in this description and in the
 * LocalBusiness schema (app/layout.tsx) — this page's title/keywords are
 * broader than its service-area claims on purpose, not an accidental
 * overclaim.
 */
export const metadata: Metadata = {
  title: "Solar Panel Price in Pakistan | Instant Calculator | Solar Pixel",
  description:
    "See real, live solar panel and inverter prices in Pakistan (Longi, Jinko, Huawei, Solis, Growatt) and get an instant system size and cost estimate. Solar Pixel installs Hybrid and On Grid solar systems in Lahore and across Punjab, live in 48 hours, with no WAPDA net metering paperwork.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Solar Panel Price in Pakistan | Instant Calculator | Solar Pixel",
    description:
      "Real, live solar panel and inverter pricing for Pakistan, plus an instant cost estimate. Installing in Lahore and across Punjab, live in 48 hours, no WAPDA net metering paperwork.",
    url: "/",
  },
};

export default function Page() {
  return <HomePageContent />;
}
