import "server-only";
import type { ComponentType } from "@prisma/client";
import { searchW11stop } from "@/lib/scraper/w11stop";
import { recordMarketPriceSnapshots, type MarketPriceSnapshotInput } from "@/lib/db/admin";

/**
 * One entry per real brand this catalog actually stocks (mirrors the
 * brands in prisma/seed.ts — see EquipmentOption's doc comments) that
 * w11stop.com carries a matching search page for. Every query below was
 * individually confirmed live (2026-08-22, before this file was written)
 * to return real, brand-matching product results — this isn't a guessed
 * list. Solar Panel brands intentionally differ from the earlier
 * Inverter brand set (Huawei/Solis/Growatt/Goodwe are inverter-only
 * brands in this catalog; Longi/Jinko/Canadian Solar are the panel
 * brands) — see prisma/seed.ts for the current real-SKU catalog.
 */
const BRAND_QUERIES: { componentType: ComponentType; searchBrand: string; query: string }[] = [
  { componentType: "SOLAR_PANEL", searchBrand: "Longi", query: "longi" },
  { componentType: "SOLAR_PANEL", searchBrand: "Jinko", query: "jinko" },
  { componentType: "SOLAR_PANEL", searchBrand: "Canadian Solar", query: "canadian solar" },
  { componentType: "INVERTER", searchBrand: "Huawei", query: "huawei inverter" },
  { componentType: "INVERTER", searchBrand: "Solis", query: "solis inverter" },
  { componentType: "INVERTER", searchBrand: "Growatt", query: "growatt inverter" },
  { componentType: "INVERTER", searchBrand: "Goodwe", query: "goodwe inverter" },
  { componentType: "BATTERY", searchBrand: "Pylontech", query: "pylontech" },
  { componentType: "BATTERY", searchBrand: "Dyness", query: "dyness" },
  { componentType: "BATTERY", searchBrand: "Felicity", query: "felicity battery" },
];

// Small bounded concurrency — polite to w11stop (never all 10 requests
// at once) while keeping total wall time low enough to comfortably fit
// inside a serverless function's execution window (this whole job is
// called synchronously from the /api/admin/market-prices POST handler,
// which the scheduled Netlify Function in turn waits on — see that
// function's doc comment for why the split is architected this way).
const CONCURRENCY = 3;

export interface MarketPriceScrapeResult {
  /** Rows actually written to MarketPriceSnapshot this run. */
  savedCount: number;
  /** Brands that produced zero usable rows this run (either the fetch
   *  itself failed, or every result's own listed brand didn't match what
   *  we searched for) — surfaced so a human can tell "the scraper ran
   *  but Huawei had nothing today" apart from "the scraper is broken." */
  skippedBrands: { searchBrand: string; reason: string }[];
}

/** Runs every brand query in BRAND_QUERIES (bounded concurrency),
 *  filters each result set down to listings whose OWN displayed brand
 *  actually matches the brand we searched for — a real observed issue
 *  live-testing this: a plain "longi" search once surfaced an unrelated
 *  "Dongjin" battery in the results, presumably matched on some other
 *  field the search indexes — then writes everything that survives as
 *  one shared-timestamp snapshot batch via recordMarketPriceSnapshots.
 *  Called from both /api/admin/market-prices (manual "Run Now" trigger)
 *  and the daily scheduled Netlify Function — see that function's doc
 *  comment for the full trigger chain. */
export async function runMarketPriceScrape(): Promise<MarketPriceScrapeResult> {
  const skippedBrands: { searchBrand: string; reason: string }[] = [];
  const perBrandItems: MarketPriceSnapshotInput[][] = new Array(BRAND_QUERIES.length);

  let cursor = 0;
  async function worker() {
    while (cursor < BRAND_QUERIES.length) {
      const index = cursor++;
      const { componentType, searchBrand, query } = BRAND_QUERIES[index];
      try {
        const products = await searchW11stop(query);
        // `.includes`, not strict equality — w11stop's own displayed
        // brand text isn't always the bare brand name (e.g. Huawei's
        // listings show brand "Huawei Solar", not "Huawei"); confirmed
        // live this genuinely matters (Huawei returned 0 rows under a
        // strict `===` filter before this was caught) without letting
        // through anything actually irrelevant — the site's fuzzy
        // search can and does return completely unrelated products
        // (confirmed live for "felicity battery": every result's real
        // brand was something unrelated like "Cooler Master" — meaning
        // w11stop simply doesn't stock Felicity, not a filter bug).
        const relevant = products.filter((p) => p.brand && p.brand.toLowerCase().includes(searchBrand.toLowerCase()));
        if (relevant.length === 0) {
          skippedBrands.push({ searchBrand, reason: "No matching-brand results in this run" });
          perBrandItems[index] = [];
          continue;
        }
        perBrandItems[index] = relevant.map((p) => ({
          componentType,
          searchBrand,
          brand: p.brand,
          model: p.model,
          itemName: p.itemName,
          priceRs: p.priceRs,
          oldPriceRs: p.oldPriceRs,
          sourceUrl: p.sourceUrl,
        }));
      } catch (err) {
        skippedBrands.push({ searchBrand, reason: err instanceof Error ? err.message : "Unknown fetch error" });
        perBrandItems[index] = [];
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const items = perBrandItems.flat();
  const savedCount = await recordMarketPriceSnapshots(items);
  return { savedCount, skippedBrands };
}
