import type { MetadataRoute } from "next";
import { SITE_URL } from "./layout";

/**
 * Dynamic XML sitemap (2026-08-22, Local SEO task) — GET /sitemap.xml.
 * Deliberately just ONE entry: the homepage is currently the only real
 * public, indexable page this app has.
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
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
