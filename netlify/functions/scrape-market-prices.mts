import type { Config } from "@netlify/functions";

/**
 * Daily 7:00 AM (Pakistan Standard Time) trigger for the market-price
 * scraper. Schedule below is UTC — PKT is a fixed UTC+5 offset (Pakistan
 * doesn't observe DST), so 7:00 AM PKT = 02:00 UTC. Flagging this
 * explicitly: if "7am" was meant as some other timezone, this cron
 * expression needs updating.
 *
 * Deliberately a THIN HTTP trigger, not where the actual scraping logic
 * lives — this function's entire job is one authenticated POST to
 * /api/admin/market-prices, the same endpoint a human hits via the
 * "Run Now" button on /admin/market-prices. All the real work
 * (searchW11stop, runMarketPriceScrape, recordMarketPriceSnapshots)
 * runs inside the normal Next.js API route, in the normal Next.js
 * runtime, where `@/` path aliases and Prisma's driver-adapter setup
 * are already proven to work (verified live against the local dev
 * server — see lib/scraper/marketPriceJob.ts and the API route's own
 * doc comments). Standalone Netlify Functions are bundled by a
 * DIFFERENT tool (esbuild, not Next.js's own bundler) with no local way
 * to test tsconfig path-alias resolution in this environment — rather
 * than gamble on that working the same way in production, this function
 * carries zero app-code imports at all, just a plain `fetch()`. This
 * split also means "does the scheduled run work" and "does the scrape
 * logic work" are testable independently: this file only needs proving
 * it can reach the site and send the right header, which any manual
 * `curl`/Netlify CLI invocation of the deployed function proves, without
 * ever needing to wait for 7am.
 *
 * ADMIN_ACCESS_TOKEN must be set as a Netlify site environment variable
 * (same value the Super Admin uses to unlock /admin/*) — this function
 * reads it from its own execution environment, never hardcoded.
 */
async function scrapeMarketPrices() {
  const siteUrl = process.env.URL || "https://solarpixel.netlify.app";
  const token = process.env.ADMIN_ACCESS_TOKEN;

  if (!token) {
    console.error("scrape-market-prices: ADMIN_ACCESS_TOKEN is not set — cannot authenticate to /api/admin/market-prices.");
    return new Response("ADMIN_ACCESS_TOKEN not configured", { status: 500 });
  }

  try {
    const res = await fetch(`${siteUrl}/api/admin/market-prices`, {
      method: "POST",
      headers: { "x-internal-token": token },
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`scrape-market-prices: POST /api/admin/market-prices returned HTTP ${res.status}: ${body}`);
      return new Response(body, { status: res.status });
    }
    console.log(`scrape-market-prices: OK — ${body}`);
    return new Response(body, { status: 200 });
  } catch (err) {
    console.error("scrape-market-prices: fetch failed —", err);
    return new Response(err instanceof Error ? err.message : "Unknown error", { status: 502 });
  }
}

export default scrapeMarketPrices;

export const config: Config = {
  schedule: "0 2 * * *",
};
