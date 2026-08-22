import type { MetadataRoute } from "next";
import { SITE_URL } from "./layout";

/**
 * Dynamic XML sitemap (2026-08-22, Local SEO task; updated same day for
 * the 3 new trust/legal pages) — GET /sitemap.xml. Lists every real
 * public, indexable page this app has: the homepage and the 3 static
 * trust pages (About/Privacy/Terms).
 *
 * Everything else is intentionally excluded, not an oversight:
 *   - /admin/*, /maker/survey — internal tools behind a shared-secret
 *     gate (see lib/auth/internal-guard.ts). Listing them would just
 *     advertise their existence to crawlers/scrapers for no SEO benefit.
 *   - /quote/[quoteId] — one unique, unauthenticated page PER CUSTOMER
 *     QUOTE (see that route's own doc comment). These aren't content
 *     pages meant for public search discovery; each one is effectively
 *     a private "share link." Indexing them would be a real problem,
 *     not just noise.
 * See app/robots.ts for the matching Disallow rules.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/privacy-policy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
