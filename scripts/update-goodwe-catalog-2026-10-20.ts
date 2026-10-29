/**
 * Goodwe catalog sync (2026-10-20) from w11stop.com/goodwe: updates the
 * vendor COST of every Goodwe inverter already in the catalog to w11stop's
 * current listed price, and adds the Goodwe inverters and batteries the
 * catalog was missing. Prices are stored as-listed (no extra markup rule
 * applies to inverters/batteries); the sell price still comes from the
 * normal sector margin.
 *
 * Skipped on purpose (not guessed):
 *   - Goodwe 5kW On-Grid (Rs 295,000): priced ABOVE the 10kW (Rs 175,000),
 *     almost certainly a listing error on the site.
 *   - Goodwe 10kW 3-Phase LV Hybrid: listed at Rs 0.
 *
 * DRY RUN by default; pass --apply to write. The target database is
 * whatever DATABASE_URL / ADMIN_DATABASE_URL are in the environment (falls
 * back to .env), so say which one you are hitting before --apply.
 *
 *   npx tsx --conditions=react-server scripts/update-goodwe-catalog-2026-10-20.ts [--apply]
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env") });

if (!process.env.ADMIN_DATABASE_URL || !process.env.DATABASE_URL) {
  console.error("Missing ADMIN_DATABASE_URL and/or DATABASE_URL.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

/** code -> new vendor cost (existing catalog items). */
const COST_UPDATES: Record<string, number> = {
  GOODWE_10KW_HYBRID_1P: 374000,
  GOODWE_10KW_ONGRID: 175000,
  GOODWE_20KW_HYBRID_3P: 720000,
  GOODWE_20KW_ONGRID: 250000,
  GOODWE_30KW_ONGRID: 330000,
  GOODWE_50KW_ONGRID: 450000,
  GOODWE_100KW_ONGRID: 905000,
};

type NewItem = {
  componentType: "INVERTER" | "BATTERY";
  code: string;
  label: string;
  specValue: number;
  serviceType: "HYBRID_BATTERY" | "ONGRID_ZERO_EXPORT";
  phase?: "SINGLE_PHASE" | "THREE_PHASE";
  cost: number;
};

const NEW_ITEMS: NewItem[] = [
  // Hybrid inverters
  { componentType: "INVERTER", code: "GOODWE_6KW_HYBRID_1P", label: "Goodwe 6kW Hybrid Inverter (Single Phase)", specValue: 6, serviceType: "HYBRID_BATTERY", phase: "SINGLE_PHASE", cost: 195000 },
  { componentType: "INVERTER", code: "GOODWE_8KW_HYBRID_1P", label: "Goodwe 8kW Hybrid Inverter (Single Phase)", specValue: 8, serviceType: "HYBRID_BATTERY", phase: "SINGLE_PHASE", cost: 298000 },
  { componentType: "INVERTER", code: "GOODWE_12KW_HYBRID_1P", label: "Goodwe 12kW Hybrid Inverter (Single Phase)", specValue: 12, serviceType: "HYBRID_BATTERY", phase: "SINGLE_PHASE", cost: 405000 },
  { componentType: "INVERTER", code: "GOODWE_8KW_HYBRID_3P_LV", label: "Goodwe 8kW Hybrid Inverter (Three Phase LV)", specValue: 8, serviceType: "HYBRID_BATTERY", phase: "THREE_PHASE", cost: 388000 },
  { componentType: "INVERTER", code: "GOODWE_12KW_HYBRID_3P", label: "Goodwe 12kW Hybrid Inverter (Three Phase)", specValue: 12, serviceType: "HYBRID_BATTERY", phase: "THREE_PHASE", cost: 477000 },
  { componentType: "INVERTER", code: "GOODWE_15KW_HYBRID_3P_LV", label: "Goodwe 15kW Hybrid Inverter (Three Phase LV)", specValue: 15, serviceType: "HYBRID_BATTERY", phase: "THREE_PHASE", cost: 572000 },
  // On-grid inverters
  { componentType: "INVERTER", code: "GOODWE_15KW_ONGRID", label: "Goodwe 15kW On-Grid Inverter", specValue: 15, serviceType: "ONGRID_ZERO_EXPORT", cost: 220000 },
  { componentType: "INVERTER", code: "GOODWE_25KW_ONGRID", label: "Goodwe 25kW On-Grid Inverter", specValue: 25, serviceType: "ONGRID_ZERO_EXPORT", cost: 280000 },
  { componentType: "INVERTER", code: "GOODWE_125KW_ONGRID", label: "Goodwe 125kW On-Grid Inverter", specValue: 125, serviceType: "ONGRID_ZERO_EXPORT", cost: 1005000 },
  // Batteries
  { componentType: "BATTERY", code: "GOODWE_LYNX_A_G3_5KWH", label: "Goodwe Lynx A G3 5.12kWh (51.2V 100Ah)", specValue: 5.12, serviceType: "HYBRID_BATTERY", cost: 260000 },
  // Lynx-D 5kWh HV is intentionally NOT listed: production already has it as GOODWE_LYNX_D_5KWH_IP66_HV (Rs 270,000).
  { componentType: "BATTERY", code: "GOODWE_BAT_14_3KWH", label: "Goodwe BAT 14.3kWh", specValue: 14.3, serviceType: "HYBRID_BATTERY", cost: 700000 },
  { componentType: "BATTERY", code: "GOODWE_16KWH", label: "Goodwe 16kWh (51V 314Ah)", specValue: 16, serviceType: "HYBRID_BATTERY", cost: 712000 },
];

const rs = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;

async function main() {
  const { listMaterialCatalog, createMaterialItem, updateMaterialItem } = await import("../lib/db/admin");
  const { getSuperAdminActorId } = await import("../lib/auth/internal-guard");

  console.log(APPLY ? "APPLYING changes.\n" : "DRY RUN (nothing is written; pass --apply to write).\n");
  const catalog = await listMaterialCatalog();
  const byKey = new Map(catalog.items.map((it) => [`${it.componentType}::${it.code}`, it]));
  const actingAdminId = await getSuperAdminActorId();

  console.log("Cost updates (existing Goodwe inverters):");
  for (const [code, newCost] of Object.entries(COST_UPDATES)) {
    const item = byKey.get(`INVERTER::${code}`);
    if (!item || !item.isActive) {
      console.log(`  ! ${code}: not found/active in this database, skipped`);
      continue;
    }
    const old = Number(item.unitCostRs);
    const pct = ((newCost - old) / old) * 100;
    console.log(`  ${code.padEnd(24)} ${rs(old).padStart(14)} -> ${rs(newCost).padStart(14)}  (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`);
    if (APPLY && old !== newCost) await updateMaterialItem(item.id, { vendorCostRs: newCost });
  }

  console.log("\nNew catalog items:");
  for (const n of NEW_ITEMS) {
    const exists = byKey.get(`${n.componentType}::${n.code}`);
    if (exists) {
      console.log(`  = ${n.code}: already exists, skipped`);
      continue;
    }
    console.log(`  + ${n.componentType.padEnd(8)} ${n.label.padEnd(46)} ${rs(n.cost).padStart(14)}`);
    if (APPLY) {
      await createMaterialItem({
        componentType: n.componentType,
        code: n.code,
        label: n.label,
        brand: "Goodwe",
        specValue: n.specValue,
        applicableServiceType: n.serviceType,
        phase: n.phase ?? null,
        unit: "PER_PIECE",
        vendorCostRs: n.cost,
        vendorName: "Goodwe",
        isDefault: false,
        inStock: true,
        createdById: actingAdminId,
      });
    }
  }
  console.log(APPLY ? "\nDone." : "\nDry run complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Goodwe catalog update failed:", err);
    process.exit(1);
  });
