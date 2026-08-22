import type { MetadataRoute } from "next";
import { SITE_URL } from "./layout";

/**
 * Dynamic robots.txt (2026-08-22, Local SEO task) — GET /robots.txt.
 * Allows the real public homepage; disallows everything that shouldn't
 * be crawled — same reasoning as app/sitemap.ts's exclusions:
 *   - /admin/, /maker/ — internal tools, shared-secret gated.
 *   - /quote/ — per-customer private share links, not search content.
 *   - /api/ — data endpoints, not pages; nothing for a crawler to index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/maker/", "/quote/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
