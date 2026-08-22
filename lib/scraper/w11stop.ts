import "server-only";
import * as cheerio from "cheerio";

/**
 * Plain server-side scraper for w11stop.com's product search page — a
 * real Pakistani solar/electronics retailer, already used earlier this
 * session as the source for real panel/inverter brand+price data entered
 * by hand into prisma/seed.ts. This module automates that same lookup.
 *
 * Confirmed live (2026-08-22) that the search page is a plain server-
 * rendered HTML response — NOT JS-rendered — so a bare `fetch()` +
 * cheerio parse works, no headless browser needed. An earlier curl test
 * with a multi-word query joined by a literal `+` (e.g.
 * "solis+inverter") returned HTTP 200 but with zero matches for the
 * search term anywhere in the HTML; switching to proper
 * `encodeURIComponent` (%20 for spaces) fixed it and every brand query
 * this scraper actually uses (single- and multi-word alike, e.g.
 * "canadian solar") was individually confirmed to return real,
 * brand-matching results before this file was written — see
 * lib/scraper/marketPriceJob.ts's BRAND_QUERIES list.
 */

const SEARCH_URL = "https://w11stop.com/index.php?route=product/search&search=";

// A real desktop browser UA — w11stop is behind Cloudflare and a
// default Node/undici UA is more likely to get treated differently.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface ScrapedProduct {
  itemName: string;
  /** The listing's own displayed brand text (e.g. "Solis"), not
   *  necessarily the brand we searched for — callers filter for
   *  relevance, see marketPriceJob.ts. */
  brand: string | null;
  model: string | null;
  priceRs: number;
  /** The struck-through "was" price on a discounted listing, if any. */
  oldPriceRs: number | null;
  sourceUrl: string;
}

/** "Rs. 390,000/-" -> 390000. Returns null (never a guessed number) if
 *  the text has no parseable digits — a genuinely priceless listing
 *  ("Call for Price" etc.) is dropped by the caller, not defaulted.
 *
 *  Deliberately matches the numeric run with `text.match()` rather than
 *  stripping every non-digit character with `.replace(/[^\d.]/g, "")` —
 *  the latter was a real bug caught live: it kept the "." in the "Rs."
 *  prefix itself, so "Rs. 32,750/-" became the string ".32750" (period
 *  from "Rs.", digits from the price, comma silently dropped) which
 *  parsed to 0.3275 instead of 32750 — a ~100,000x-too-small price that
 *  would have silently corrupted the whole snapshot table. Matching the
 *  digit run directly skips straight past the "Rs." prefix instead of
 *  merging its punctuation into the number. */
function parsePkrPrice(text: string): number | null {
  const match = text.match(/[\d,]+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Fetches w11stop's search-results page for `query` and parses every
 * product card on the first page (the site paginates at 20 results;
 * a brand search returning more than that is out of scope for a daily
 * market-price snapshot — this isn't a full catalog mirror).
 *
 * Markup reference (OpenCart's standard theme, confirmed live):
 *   <div class="product-thumb">
 *     ...
 *     <div class="caption">
 *       <div class="stats">
 *         <span class="stat-1">Brand: <a>Solis</a></span>
 *         <span class="stat-2">Model: SOLS-34</span>
 *       </div>
 *       <div class="name"><a href="...">Solis 10kW ... Hybrid Inverter</a></div>
 *       <div class="price"><div>
 *         <span class="price-new">Rs. 390,000/-</span>
 *         <span class="price-old">Rs. 415,000/-</span>
 *       </div></div>
 *       <!-- OR, for a non-discounted listing: -->
 *       <div class="price"><div><span class="price-normal">Rs. 30,750/-</span></div></div>
 *     </div>
 *   </div>
 */
export async function searchW11stop(query: string): Promise<ScrapedProduct[]> {
  const url = SEARCH_URL + encodeURIComponent(query);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    // A market-price scrape must always hit the live site, never a
    // cached copy of a previous run's response.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`w11stop search failed: HTTP ${res.status} for query "${query}"`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const products: ScrapedProduct[] = [];
  $(".product-thumb").each((_, el) => {
    const root = $(el);
    const nameAnchor = root.find(".caption .name a").first();
    const itemName = nameAnchor.text().trim();
    const sourceUrl = nameAnchor.attr("href") ?? "";
    if (!itemName || !sourceUrl) return; // not a real product card — skip

    const brand = root.find(".stats .stat-1 a").first().text().trim() || null;
    // No dedicated class for the model VALUE (it's a plain sibling span
    // next to a ".stats-label" span) — strip the "Model:" label text
    // instead of relying on span position, which is more robust to
    // minor markup changes on the vendor's side.
    const stat2Text = root.find(".stats .stat-2").first().text().trim();
    const model = stat2Text.replace(/^Model:\s*/i, "").trim() || null;

    const priceText =
      root.find(".price .price-new").first().text().trim() || root.find(".price .price-normal").first().text().trim();
    const priceRs = parsePkrPrice(priceText);
    if (priceRs === null) return; // no real price on this listing — skip, never fabricate

    const oldPriceText = root.find(".price .price-old").first().text().trim();
    const oldPriceRs = oldPriceText ? parsePkrPrice(oldPriceText) : null;

    products.push({ itemName, brand, model, priceRs, oldPriceRs, sourceUrl });
  });

  return products;
}
