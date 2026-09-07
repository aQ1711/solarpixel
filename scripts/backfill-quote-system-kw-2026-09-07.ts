/**
 * ONE-OFF backfill (2026-09-07, "system showing 3kW but customer
 * selected 16 panels") — corrects Quote.estimatedSystemSizeKw for
 * every EXISTING quote that was persisted with the old bug: that
 * column used to be a straight copy of the bill-derived sizing TARGET
 * (calculateSystemSize's own systemKw), never reconciled against the
 * customer's actual resolved panel selection (Custom Builder
 * panelQtyOverride/panelCode) — see SystemPricingResult.resolvedSystemKw's
 * doc comment in lib/db/admin.ts for the full explanation, and
 * app/api/quote/calculate/route.ts for the forward-looking fix this
 * backfill complements. Without this, only quotes created AFTER the
 * fix ships would be correct — every quote already in the database
 * (including the one that surfaced this bug) would keep showing the
 * wrong system size on the Report screen, the public quote page, and
 * every admin/Lead Dossier/Checker view that reads this column.
 *
 * Recomputes strictly from each quote's own already-persisted
 * `resolvedEquipmentSnapshot` (panel.count x panel.specValue / 1000) -
 * never re-runs pricing, never touches vendor cost/margin data, and
 * only writes a row when the recomputed value actually differs from
 * what's stored (so a quote that was already correct, i.e. every
 * Recommended-path quote where panel count was never overridden, is
 * left untouched - this is a targeted correction, not a mass rewrite).
 * Quotes with no snapshot (pre-snapshot legacy data, or a null panel
 * specValue) are skipped and reported separately - nothing here ever
 * fabricates a number it can't derive from real, already-stored data.
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.scraper.local") });

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in .env.scraper.local.");
  process.exit(1);
}

interface ResolvedEquipmentSnapshot {
  panel?: { count?: number; specValue?: number | null };
}

async function main() {
  const { getDb } = await import("../lib/db/client");
  const prisma = await getDb();

  const quotes = await prisma.quote.findMany({
    select: { id: true, quoteNumber: true, estimatedSystemSizeKw: true, resolvedEquipmentSnapshot: true },
  });

  console.log(`Checking ${quotes.length} quote(s)...\n`);

  let corrected = 0;
  let skippedNoSnapshot = 0;
  let alreadyCorrect = 0;

  for (const q of quotes) {
    const snapshot = q.resolvedEquipmentSnapshot as ResolvedEquipmentSnapshot | null;
    const count = snapshot?.panel?.count;
    const specValue = snapshot?.panel?.specValue;
    if (!count || !specValue) {
      skippedNoSnapshot++;
      continue;
    }

    const correctKw = Math.round(((count * specValue) / 1000) * 100) / 100;
    const currentKw = q.estimatedSystemSizeKw.toNumber();

    if (Math.abs(correctKw - currentKw) < 0.005) {
      alreadyCorrect++;
      continue;
    }

    console.log(`  ${q.quoteNumber}: ${currentKw}kW -> ${correctKw}kW (${count} x ${specValue}W)`);
    await prisma.quote.update({ where: { id: q.id }, data: { estimatedSystemSizeKw: correctKw } });
    corrected++;
  }

  console.log(`\nDone. Corrected: ${corrected}, already correct: ${alreadyCorrect}, skipped (no snapshot): ${skippedNoSnapshot}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
