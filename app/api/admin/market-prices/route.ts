import { NextRequest, NextResponse } from "next/server";
import { listLatestMarketPriceSnapshots } from "@/lib/db/admin";
import { runMarketPriceScrape } from "@/lib/scraper/marketPriceJob";
import { assertSuperAdminAccess, InternalAuthError } from "@/lib/auth/internal-guard";

/**
 * /api/admin/market-prices — real-vendor price-scraping control, same
 * confidentiality boundary as /api/admin/pricing (Super Admin only,
 * assertSuperAdminAccess gates both handlers before anything else runs).
 *
 * GET  — the most recent scrape run's rows (see listLatestMarketPriceSnapshots).
 * POST — runs a scrape RIGHT NOW and returns how it went. Two callers:
 *   1. A human clicking "Run Now" in /admin/market-prices.
 *   2. The daily 7am scheduled Netlify Function
 *      (netlify/functions/scrape-market-prices.mts), which is just a
 *      dumb HTTP trigger against this same endpoint — see that file's
 *      doc comment for why the real scraping logic lives here instead
 *      of inside the Netlify Function itself.
 * Both paths hit the exact same code (runMarketPriceScrape), so there is
 * no separate "scheduled" behavior to drift from "manual" — verifying
 * one verifies the other.
 */
export async function GET(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const snapshots = await listLatestMarketPriceSnapshots();
  return NextResponse.json({ snapshots });
}

export async function POST(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const result = await runMarketPriceScrape();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Market price scrape failed:", err);
    return NextResponse.json({ error: "The scrape run failed. Check server logs for details." }, { status: 502 });
  }
}
