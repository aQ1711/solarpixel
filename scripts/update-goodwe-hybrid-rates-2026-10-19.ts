/**
 * Goodwe hybrid inverter rate sheet of 19.10.2026 (vendor's own text):
 *   6KW 190K | 8KW 290K | 10KW 370K | 12KW 1P 405K | 12KW 3P 470K | 15kw 3P 575K
 * Updates the vendor COST of the matching existing catalog items. The sheet
 * gives no phase for 6/8/10kW; those map to the single-phase items (the 8kW
 * three-phase LV unit is left unchanged). Run with ADMIN_DATABASE_URL and
 * DATABASE_URL of the target environment set:
 *   npx tsx --conditions=react-server scripts/update-goodwe-hybrid-rates-2026-10-19.ts [--apply]
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env") });
const APPLY = process.argv.includes("--apply");

const RATES: Record<string, number> = {
  GOODWE_6KW_HYBRID_1P: 190000,
  GOODWE_8KW_HYBRID_1P: 290000,
  GOODWE_10KW_HYBRID_1P: 370000,
  GOODWE_12KW_HYBRID_1P: 405000,
  GOODWE_12KW_HYBRID_3P: 470000,
  GOODWE_15KW_HYBRID_3P_LV: 575000,
};

async function main() {
  const { listMaterialCatalog, updateMaterialItem } = await import("../lib/db/admin");
  const catalog = await listMaterialCatalog();
  console.log(APPLY ? "APPLYING\n" : "DRY RUN\n");
  for (const [code, newCost] of Object.entries(RATES)) {
    const item = catalog.items.find((i) => i.componentType === "INVERTER" && i.code === code && i.isActive);
    if (!item) {
      console.log(`  ! ${code}: not found/active, skipped`);
      continue;
    }
    const old = Number(item.unitCostRs);
    console.log(`  ${code.padEnd(26)} Rs ${old.toLocaleString("en-PK").padStart(9)} -> Rs ${newCost.toLocaleString("en-PK").padStart(9)}`);
    if (APPLY && old !== newCost) await updateMaterialItem(item.id, { vendorCostRs: newCost });
  }
  console.log("\nDone.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
