/**
 * ONE-OFF, run-once script (2026-09-07, real vendor rate sheet from one
 * of our vendors, dated 07.09.2026) — replaces the entire active Solar
 * Panel catalog with exactly these 9 items, per explicit instruction
 * ("remove all panels and add these only"). Not meant to be reused for
 * a future rate update — a new rate sheet gets a new script (or should
 * just go through /admin/pricing directly), so this doesn't grow into a
 * general-purpose tool that silently assumes stale business rules.
 *
 * Source (vendor's own text, unedited):
 *   LONGI X10 BF 650W       42.75
 *   CORA DAWN 645W X10      36.5
 *   LONGI HIMOX7 615W       42
 *   LONGI HIMOX7 620W       42
 *   CANADIAN 585W           41
 *   CANADIAN 625W           41
 *   TRINA 720W              38.5
 *   JINKO X20 645W          40.5
 *   JA 625W                 39
 *   NOTE: less than 10 panels will charge .25
 *
 * Per explicit instruction, the "<10 panels: +Rs0.25/W" note is baked
 * directly into every vendor rate below (rate + 0.25) rather than built
 * as real quantity-tiered pricing logic (which doesn't exist in this
 * catalog's data model — every material has one flat Rs/W cost). This
 * means an order of 10+ panels is technically overcharged by Rs0.25/W
 * relative to this vendor's own bulk rate — a known, accepted trade-off
 * of not building real min-order-quantity pricing today, not an
 * oversight.
 *
 * Brand names are normalized to their real, recognizable full form
 * (Canadian -> Canadian Solar, Trina -> Trina Solar, JA -> JA Solar) to
 * match the existing catalog's own naming convention (see the current
 * "Canadian Solar 600W" entry) and so /admin/pricing's brand grouping
 * groups these sensibly. Model text (X10 BF, HIMO X7, X20, Dawn) is kept
 * verbatim from the vendor's own listing — genuinely ambiguous whether
 * "X10"/"X20" denote a product line or a pack-size code, so nothing here
 * is guessed or silently corrected.
 *
 * IMPORTANT: deactivating every existing panel clears isDefault on all
 * of them (see deactivateMaterialItem's doc comment in lib/db/admin.ts)
 * — with nothing marked default, getDefaultCode() falls back to the
 * hardcoded DEFAULT_PANEL_CODE constant, which pointed at the very item
 * this script deactivates (LONGI_TOPCON_610W). Left alone, that would
 * silently break the Recommended-path panel lookup for every quote site-
 * wide the instant this runs. LONGI_HIMOX7_620W is marked isDefault
 * below for exactly that reason (closest match to the old default:
 * same brand, similar wattage), and lib/db/admin.ts's DEFAULT_PANEL_CODE
 * constant was updated to match as the fallback's own fallback.
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.scraper.local") });

if (!process.env.ADMIN_DATABASE_URL || !process.env.DATABASE_URL) {
  console.error("Missing ADMIN_DATABASE_URL and/or DATABASE_URL in .env.scraper.local.");
  process.exit(1);
}

const SURCHARGE_PER_WATT = 0.25;

const NEW_PANELS: {
  code: string;
  label: string;
  brand: string;
  watts: number;
  vendorRate: number;
  /** Recommended-path default (see this file's top doc comment for why
   *  exactly one item must carry this). */
  isDefault?: boolean;
}[] = [
  { code: "LONGI_X10_BF_650W", label: "Longi X10 BF 650W", brand: "Longi", watts: 650, vendorRate: 42.75 },
  { code: "CORA_DAWN_645W_X10", label: "Cora Dawn 645W X10", brand: "Cora", watts: 645, vendorRate: 36.5 },
  { code: "LONGI_HIMOX7_615W", label: "Longi HIMO X7 615W", brand: "Longi", watts: 615, vendorRate: 42 },
  { code: "LONGI_HIMOX7_620W", label: "Longi HIMO X7 620W", brand: "Longi", watts: 620, vendorRate: 42, isDefault: true },
  { code: "CANADIAN_SOLAR_585W", label: "Canadian Solar 585W", brand: "Canadian Solar", watts: 585, vendorRate: 41 },
  { code: "CANADIAN_SOLAR_625W", label: "Canadian Solar 625W", brand: "Canadian Solar", watts: 625, vendorRate: 41 },
  { code: "TRINA_SOLAR_720W", label: "Trina Solar 720W", brand: "Trina Solar", watts: 720, vendorRate: 38.5 },
  { code: "JINKO_X20_645W", label: "Jinko X20 645W", brand: "Jinko", watts: 645, vendorRate: 40.5 },
  { code: "JA_SOLAR_625W", label: "JA Solar 625W", brand: "JA Solar", watts: 625, vendorRate: 39 },
];

async function main() {
  const { listMaterialCatalog, createMaterialItem, deactivateMaterialItem } = await import("../lib/db/admin");
  const { getSuperAdminActorId } = await import("../lib/auth/internal-guard");

  const actingAdminId = await getSuperAdminActorId();
  console.log(`Acting as Super Admin user ${actingAdminId}.`);

  const catalog = await listMaterialCatalog();
  const activePanels = catalog.items.filter((it) => it.componentType === "SOLAR_PANEL" && it.isActive);

  console.log(`\nDeactivating ${activePanels.length} currently active Solar Panel item(s):`);
  for (const p of activePanels) {
    console.log(`  - ${p.label} (${p.code}) @ Rs ${p.unitCostRs}/W`);
    await deactivateMaterialItem(p.id);
  }

  console.log(`\nCreating ${NEW_PANELS.length} new Solar Panel item(s):`);
  for (const p of NEW_PANELS) {
    const vendorCostRs = Math.round((p.vendorRate + SURCHARGE_PER_WATT) * 100) / 100;
    console.log(`  - ${p.label} @ Rs ${vendorCostRs}/W (vendor rate ${p.vendorRate} + Rs${SURCHARGE_PER_WATT} surcharge)`);
    await createMaterialItem({
      componentType: "SOLAR_PANEL",
      code: p.code,
      label: p.label,
      brand: p.brand,
      specValue: p.watts,
      unit: "PER_WATT",
      vendorCostRs,
      vendorName: p.brand,
      isDefault: p.isDefault ?? false,
      createdById: actingAdminId,
    });
  }

  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Panel catalog update failed:", err);
    process.exit(1);
  });
