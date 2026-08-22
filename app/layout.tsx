import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { CookieConsent } from "@/components/CookieConsent";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Canonical production domain — confirmed with the user (2026-08-22,
// Local SEO task) as the real, owned domain, distinct from the
// currently-deployed solarpixel.netlify.app URL. Every canonical/OG/
// sitemap/robots URL in this app is built from this ONE constant so
// they can never drift from each other. If DNS for this domain isn't
// pointed at the live deployment yet, Google Search Console
// verification (and real indexing) can't happen until it is — that's
// an infrastructure step outside this codebase, not a code bug.
export const SITE_URL = "https://www.solarpixel.pk";

// Real business facts only — every field below is sourced from the
// same constants the site's own footer already uses (see
// app/HomePageContent.tsx's Footer component), never fabricated. No
// street address: Solar Pixel is a service-area business (site visits,
// not walk-in customers), so LocalBusiness.address is deliberately
// city/region-level (Lahore, Punjab) rather than a fictitious street
// address — schema.org supports this for service-area businesses via
// `areaServed`, which is the more accurate signal here anyway.
const BUSINESS_NAME = "Solar Pixel";
const BUSINESS_PHONE = "+923282155550";
const BUSINESS_EMAIL = "solarpixelpk@gmail.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Solar Installation Lahore | Solar Pixel",
    // Every page-specific title (currently just app/page.tsx's) renders
    // as "<page title> | Solar Pixel" via this template — the exact
    // "[Primary Keyword] | [Brand Name]" structure asked for, enforced
    // in one place instead of repeated per page.
    template: "%s | Solar Pixel",
  },
  description:
    "Solar Pixel installs Hybrid (Battery) and On-Grid solar systems for homes and businesses across Lahore and Punjab. Get an instant, real-pricing solar calculator quote and go live in 48 hours — no WAPDA net metering paperwork.",
  keywords: [
    "Solar Installation Lahore",
    "Solar Calculator Pakistan",
    "Solar Panel Prices Lahore",
    "Solar Company Lahore",
    "On-Grid Solar Lahore",
    "Hybrid Solar with Battery Lahore",
    "LESCO Solar Installation",
    "Solar Panel Installation Punjab",
    "Commercial Solar Lahore",
    "Industrial Solar Punjab",
  ],
  applicationName: BUSINESS_NAME,
  authors: [{ name: BUSINESS_NAME }],
  creator: BUSINESS_NAME,
  publisher: BUSINESS_NAME,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_PK",
    siteName: BUSINESS_NAME,
    url: SITE_URL,
    title: "Solar Installation Lahore | Solar Pixel",
    description:
      "Instant solar sizing and pricing for Lahore homes and businesses. Real brand pricing, live in 48 hours, no WAPDA net metering paperwork.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Solar Pixel — Solar Installation Lahore" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Solar Installation Lahore | Solar Pixel",
    description: "Instant solar sizing and pricing for Lahore homes and businesses. Live in 48 hours, no WAPDA net metering paperwork.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  themeColor: "#05070c",
  width: "device-width",
  initialScale: 1,
};

/**
 * LocalBusiness + ProfessionalService JSON-LD (2026-08-22, Local SEO
 * task) — tells Google Maps/local search who and where this business
 * is. Site-wide (root layout), not per-page, since there's currently
 * only one real public page for it to describe. `@type` is an array
 * ([LocalBusiness, ProfessionalService]) — schema.org allows multiple
 * types on one node, which is the standard way to combine "has a
 * physical/local service area" (LocalBusiness) with "sells a
 * professional service, not retail goods" (ProfessionalService)
 * without duplicating the whole object. `areaServed` + city/region-
 * level `address` reflect a real service-area business (site visits,
 * no public storefront) — see the doc comment on BUSINESS_NAME above
 * for why there's no street address here.
 */
const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "ProfessionalService"],
  name: BUSINESS_NAME,
  url: SITE_URL,
  telephone: BUSINESS_PHONE,
  email: BUSINESS_EMAIL,
  priceRange: "$$",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Lahore",
    addressRegion: "Punjab",
    addressCountry: "PK",
  },
  areaServed: [
    { "@type": "City", name: "Lahore" },
    { "@type": "AdministrativeArea", name: "Punjab" },
  ],
  makesOffer: [
    {
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: "Hybrid Solar Installation (with Battery Storage)" },
    },
    {
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: "On-Grid Solar Installation" },
    },
    {
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: "EV Charger Installation" },
    },
    {
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: "Solar Panel Washing & Servicing" },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        {/* Static, hardcoded JSON-LD — never user input. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }} />
        {children}
        <Analytics />
        <CookieConsent />
      </body>
    </html>
  );
}
