/**
 * Reusable "Update Daily Panel Rates" tool (2026-09-09) — run this
 * whenever a vendor sends a new rate sheet, to update the VENDOR COST
 * of already-cataloged Solar Panel items. Never creates new catalog
 * items and never touches anything but SOLAR_PANEL vendor costs — a
 * genuinely new SKU (no existing active panel matches its brand AND
 * wattage) is reported, never auto-created; add those manually via
 * /admin/pricing or the Add to Inventory flow on /admin/market-prices,
 * same as any other new catalog item (explicit instruction, 2026-09-09
 * — an unattended daily script should never silently add a new SKU to
 * a live site off a vendor typo or an unfamiliar brand shorthand).
 *
 * MARKUP is a standing, hardcoded +Rs0.25/W rule (explicit instruction,
 * 2026-09-09) — every raw vendor rate gets this added before being
 * stored as vendorCostRs, on every run, regardless of whatever note
 * (if any) accompanies that day's sheet. If this rule ever changes,
 * edit MARKUP_PER_WATT below — it's deliberately NOT a CLI flag, so a
 * forgotten argument can never silently apply a Rs0 markup one day.
 *
 * MATCHING — same brand+wattage rule as the Add-to-Inventory fix in
 * app/admin/market-prices/page.tsx's findLikelyMatch() (2026-09-06,
 * "panels from admin not updating on inventory"): brand alone is not a
 * safe match for a panel, since one brand carries many different
 * wattages. Re-implemented standalone here (that function lives in a
 * page component, not an importable module) — if you ever change one,
 * change the other the same way, or they'll silently drift apart.
 *
 * INPUT — the raw text is never hardcoded in this file (so this file
 * never needs editing/re-committing just to run a new day's sheet).
 * Pass it either way:
 *   npm run update-panel-rates -- path/to/todays-rates.txt
 *   npm run update-panel-rates < path/to/todays-rates.txt
 *   pbpaste | npm run update-panel-rates        (macOS clipboard)
 *
 * Expected line format (vendor's own shorthand, unedited):
 *   BRAND [MODEL TOKENS...] WATTSw PRICE
 * e.g. "LONGI X10 BF 650W 42.85" / "CANADIAN 585W 41"
 * A trailing "NOTE..." footnote line (e.g. "NOTE. LESS THAN 10 PANELS
 * WILL CHARGE .25") is recognized and skipped, not parsed as a row.
 *
 * ── ONE-TIME SETUP (same as scripts/run-market-scrape.ts) ──────────
 * Copy .env.scraper.example to .env.scraper.local and paste in the
 * TARGET environment's ADMIN_DATABASE_URL (Vercel dashboard -> your
 * project -> Settings -> Environment Variables -> Production, for the
 * real site; or this repo's own .env value for a staging dry run).
 */
import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";

config({ path: path.resolve(__dirname, "../.env.scraper.local") });

if (!process.env.ADMIN_DATABASE_URL) {
  console.error(
    "Missing ADMIN_DATABASE_URL.\n\n" +
      "Copy .env.scraper.example to .env.scraper.local and paste in the\n" +
      "target environment's admin connection string (Vercel dashboard ->\n" +
      "your project -> Settings -> Environment Variables)."
  );
  process.exit(1);
}

/** Rs/W added to every parsed vendor rate before it's stored — see this
 *  file's top doc comment for why this is hardcoded, not a CLI flag. */
const MARKUP_PER_WATT = 0.25;

/** Vendor sheets use brand shorthand (the first word on the line) that
 *  doesn't match this catalog's own brand naming — same normalization
 *  applied in scripts/update-panel-catalog-2026-09-07.ts, kept here so
 *  matching against the real catalog's `brand` field actually works.
 *  An unrecognized shorthand falls back to Title Case of the raw token
 *  (flagged in the report, not silently trusted) rather than guessing
 *  a brand that doesn't exist in the catalog. */
const BRAND_ALIASES: Record<string, string> = {
  LONGI: "Longi",
  CANADIAN: "Canadian Solar",
  TRINA: "Trina Solar",
  JA: "JA Solar",
  JINKO: "Jinko",
  CORA: "Cora",
};

function titleCase(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Same wattage regex as extractWatts() in app/admin/market-prices/page.tsx
 *  — kept consistent so a panel labeled the same way parses the same
 *  wattage everywhere in this codebase. */
function extractWatts(text: string): number | null {
  const match = text.match(/\b(\d{3,4})\s*watts?\b/i) ?? text.match(/\b(\d{3,4})\s*w\b/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface ParsedRow {
  raw: string;
  brand: string;
  brandIsKnownAlias: boolean;
  watts: number | null;
  rawPriceRs: number | null;
}

function parseLine(line: string): ParsedRow {
  const parts = line.trim().split(/\s+/);
  const rawPriceStr = parts.pop() ?? "";
  const firstToken = parts[0] ?? "";
  const restTokens = parts.slice(1);
  const knownAlias = BRAND_ALIASES[firstToken.toUpperCase()];
  const brand = knownAlias ?? titleCase(firstToken);
  const rawPriceRs = rawPriceStr !== "" && Number.isFinite(Number(rawPriceStr)) ? Number(rawPriceStr) : null;
  return {
    raw: line,
    brand,
    brandIsKnownAlias: knownAlias !== undefined,
    watts: extractWatts(restTokens.join(" ")),
    rawPriceRs,
  };
}

function readInput(): string {
  const fileArg = process.argv[2];
  if (fileArg) return fs.readFileSync(fileArg, "utf8");
  return fs.readFileSync(0, "utf8"); // stdin
}

async function main() {
  const raw = readInput();
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.toUpperCase().startsWith("NOTE") && !l.toUpperCase().startsWith("TODAY"));

  if (lines.length === 0) {
    console.error("No input rows found. Pipe or pass a file with one panel per line.");
    process.exit(1);
  }

  const { listMaterialCatalog, updateMaterialItem } = await import("../lib/db/admin");
  const catalog = await listMaterialCatalog();
  const activePanels = catalog.items.filter((it) => it.componentType === "SOLAR_PANEL" && it.isActive);

  console.log(`Parsing ${lines.length} row(s) against ${activePanels.length} active Solar Panel item(s)...\n`);

  let updated = 0;
  let unmatched = 0;
  let skippedUnparseable = 0;

  for (const line of lines) {
    const row = parseLine(line);

    if (row.rawPriceRs === null) {
      console.log(`  SKIP (couldn't parse a price): "${row.raw}"`);
      skippedUnparseable++;
      continue;
    }
    if (row.watts === null) {
      console.log(`  SKIP (couldn't parse a wattage, can't match safely): "${row.raw}"`);
      skippedUnparseable++;
      continue;
    }
    if (!row.brandIsKnownAlias) {
      console.log(`  NOTE: "${row.brand}" isn't a known brand alias — verify this is intentional.`);
    }

    const scrapedBrand = row.brand.toLowerCase();
    const candidates = activePanels.filter((p) => {
      const b = (p.brand ?? "").toLowerCase();
      return (b.includes(scrapedBrand) || scrapedBrand.includes(b)) && extractWatts(p.label) === row.watts;
    });

    if (candidates.length === 0) {
      console.log(`  UNMATCHED (no existing ${row.watts}W ${row.brand} panel) — needs manual review: "${row.raw}"`);
      unmatched++;
      continue;
    }
    if (candidates.length > 1) {
      console.log(
        `  AMBIGUOUS (${candidates.length} existing panels match ${row.watts}W ${row.brand}) — needs manual review: "${row.raw}"`
      );
      unmatched++;
      continue;
    }

    const target = candidates[0];
    const newVendorCostRs = Math.round((row.rawPriceRs + MARKUP_PER_WATT) * 100) / 100;
    console.log(
      `  UPDATE ${target.label}: Rs ${target.unitCostRs}/W -> Rs ${newVendorCostRs}/W (vendor rate ${row.rawPriceRs} + Rs${MARKUP_PER_WATT})`
    );
    await updateMaterialItem(target.id, { vendorCostRs: newVendorCostRs });
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, unmatched (needs manual review): ${unmatched}, unparseable: ${skippedUnparseable}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Rate update failed:", err);
    process.exit(1);
  });
