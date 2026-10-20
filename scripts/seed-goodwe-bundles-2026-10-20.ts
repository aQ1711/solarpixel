/**
 * Seeds the Futech Energy / Goodwe combo deals (sheet shared 2026-10-20,
 * "All prices are combo deal prices"; 10 years replacement warranty on Goodwe
 * inverter + Goodwe battery combinations). Re-runnable: it upserts by
 * inverter + battery pair. Uses the target environment's ADMIN_DATABASE_URL /
 * DATABASE_URL.
 *   npx tsx --conditions=react-server scripts/seed-goodwe-bundles-2026-10-20.ts [--apply]
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env") });
const APPLY = process.argv.includes("--apply");

const NOTE = "10 years replacement warranty on Goodwe inverter + battery";
const B5 = "GOODWE_LYNX_A_G3_5KWH";
const B14 = "GOODWE_BAT_14_3KWH";

const DEALS: { inverterCode: string; batteryCode: string; comboCostRs: number; sheet: string }[] = [
  { inverterCode: "GOODWE_6KW_HYBRID_1P", batteryCode: B5, comboCostRs: 425000, sheet: "6kW ES Uniq + 5kWh" },
  { inverterCode: "GOODWE_8KW_HYBRID_1P", batteryCode: B5, comboCostRs: 520000, sheet: "8kW ES Uniq + 5kWh" },
  { inverterCode: "GOODWE_10KW_HYBRID_1P", batteryCode: B5, comboCostRs: 597000, sheet: "10kW ES Uniq + 5kWh" },
  { inverterCode: "GOODWE_12KW_HYBRID_1P", batteryCode: B5, comboCostRs: 627000, sheet: "12kW ES Uniq + 5kWh" },
  { inverterCode: "GOODWE_10KW_HYBRID_1P", batteryCode: B14, comboCostRs: 977000, sheet: "10kW ES Uniq + 14.3kWh" },
  { inverterCode: "GOODWE_12KW_HYBRID_1P", batteryCode: B14, comboCostRs: 1007000, sheet: "12kW ES Uniq + 14.3kWh" },
  { inverterCode: "GOODWE_12KW_HYBRID_3P", batteryCode: B14, comboCostRs: 1087000, sheet: "12kW ET LV + 14.3kWh" },
  { inverterCode: "GOODWE_15KW_HYBRID_3P_LV", batteryCode: B14, comboCostRs: 1187000, sheet: "15kW ET LV + 14.3kWh" },
];

async function main() {
  const { upsertBundleDeal, listBundleDealsForAdmin } = await import("../lib/db/admin");
  console.log(APPLY ? "APPLYING\n" : "DRY RUN (pass --apply)\n");
  if (APPLY) for (const d of DEALS) await upsertBundleDeal({ ...d, note: NOTE, isActive: true });
  const rows = APPLY ? await listBundleDealsForAdmin() : [];
  for (const d of DEALS) {
    const r = rows.find((x) => x.inverterCode === d.inverterCode && x.batteryCode === d.batteryCode);
    console.log(
      `  ${d.sheet.padEnd(26)} combo Rs ${d.comboCostRs.toLocaleString("en-PK").padStart(10)}` +
        (r ? `  separate Rs ${r.separateCostRs.toLocaleString("en-PK").padStart(10)}  saving Rs ${r.savingRs.toLocaleString("en-PK")}` : "")
    );
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
