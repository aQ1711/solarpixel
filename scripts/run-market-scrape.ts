/**
 * Standalone, one-shot runner for the market-price scraper — meant to be
 * run from a REAL residential/office internet connection (your own
 * computer), never from Vercel.
 *
 * WHY THIS EXISTS (2026-09-05, "scrapping not working on live" / "we
 * need completely free"): w11stop.com (behind Cloudflare) blocks every
 * request that comes from a cloud/datacenter IP — confirmed live: 0 of
 * 14 brand queries succeeded from production (Vercel), 147 real listings
 * succeeded from this same machine, same code, same day (see
 * lib/scraper/w11stop.ts's top doc comment for the full finding). The
 * only way to make the outbound request look like normal traffic is to
 * route it through a residential-IP proxy service — every one of those
 * is a paid product (ScraperAPI's advertised "free tier" turned out to
 * be a 7-day trial only, not a real free tier, per the user's own
 * correction). There's no automated, fully-free fix for a request that
 * physically originates from Vercel's servers.
 *
 * So this script moves WHERE the scrape physically runs: your own
 * computer, on your own home/office connection, then writes straight
 * into PRODUCTION's database — no Vercel involvement in the scrape
 * itself at all. Genuinely free, at the cost of no longer being fully
 * automated: it only runs when you actually run it (manually, or on a
 * schedule your own machine keeps, e.g. cron — see the usage note below).
 *
 * ── ONE-TIME SETUP ──────────────────────────────────────────────────
 * 1. Copy .env.scraper.example to .env.scraper.local (gitignored, same
 *    as every other *.local env file in this project).
 * 2. Paste PRODUCTION's app_admin_role connection string into it as
 *    ADMIN_DATABASE_URL — get this from the Vercel dashboard: your
 *    project → Settings → Environment Variables → find ADMIN_DATABASE_URL
 *    under the "Production" environment, reveal, copy. This is
 *    deliberately a SEPARATE file from this repo's own .env, which
 *    points at the shared local/staging database — mixing the two would
 *    make it dangerously easy to run this against the wrong database by
 *    accident.
 *
 * ── RUNNING IT ──────────────────────────────────────────────────────
 *   npm run scrape:market-prices
 *
 * (That script runs `tsx --conditions=react-server ...`, not plain
 * `tsx ...` — this file's imports eventually reach the "server-only"
 * package, which throws unconditionally unless the "react-server"
 * export condition is active, normally something only Next.js's own
 * bundler sets. Forcing that condition via Node's --conditions flag is
 * what lets these same shared lib/ files run standalone here, confirmed
 * working live: 147 real listings saved this way against the database
 * this repo's own .env already points at.)
 *
 * ── OPTIONAL: RUN IT AUTOMATICALLY ON A SCHEDULE ───────────────────
 * This only fires while your own Mac is on, awake, and not asleep — a
 * real tradeoff of the zero-cost approach, not a bug. Add a line like
 * this via `crontab -e`:
 *   0 7 * * * cd "/Users/tempuser/Documents/Solar Pixel /dev_1.0" && /usr/local/bin/npm run scrape:market-prices >> /tmp/solarpixel-scrape.log 2>&1
 * (adjust the npm path — run `which npm` to confirm yours; cron doesn't
 * load your shell profile, so a bare `npm` often isn't found otherwise.)
 *
 * This intentionally only ever needs ADMIN_DATABASE_URL (app_admin_role)
 * — never DATABASE_URL/app_public_role — same as every other caller of
 * recordMarketPriceSnapshots in this codebase.
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.scraper.local") });

if (!process.env.ADMIN_DATABASE_URL) {
  console.error(
    "Missing ADMIN_DATABASE_URL.\n\n" +
      "Copy .env.scraper.example to .env.scraper.local and paste in PRODUCTION's\n" +
      "admin connection string (Vercel dashboard -> your project -> Settings ->\n" +
      "Environment Variables -> ADMIN_DATABASE_URL, Production environment)."
  );
  process.exit(1);
}

async function main() {
  // Imported dynamically, after the env var above is set — the admin
  // Prisma client (lib/db/admin.ts) reads process.env.ADMIN_DATABASE_URL
  // once, lazily, on first use, so this ordering matters.
  const { runMarketPriceScrape } = await import("../lib/scraper/marketPriceJob");
  const dbLabel = process.env.ADMIN_DATABASE_URL?.includes("neondb_owner") ? "OWNER (!)" : "app_admin_role";
  console.log(`[${new Date().toISOString()}] Starting market-price scrape (writing via ${dbLabel})...`);

  const result = await runMarketPriceScrape();
  console.log(`Saved ${result.savedCount} listing${result.savedCount === 1 ? "" : "s"}.`);
  if (result.skippedBrands.length > 0) {
    console.log(
      `No results for: ${result.skippedBrands.map((b) => b.searchBrand).join(", ")}.`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Scrape run failed:", err);
    process.exit(1);
  });
