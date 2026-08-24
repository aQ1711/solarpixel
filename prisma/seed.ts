import "dotenv/config";
import {
  PrismaClient,
  type ComponentType,
  type CostUnit,
  type Sector,
  type ServiceType,
  type InverterPhase,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// One-time DBA-style setup script — connects with the full-access
// MIGRATE_DATABASE_URL (same role `prisma migrate` uses), NOT either of
// the app's scoped runtime clients. Never reuse this pattern in
// application code — see lib/db/client.ts / lib/db/admin.ts.
const connectionString = process.env.MIGRATE_DATABASE_URL;
if (!connectionString) {
  throw new Error("MIGRATE_DATABASE_URL is not set — required to seed.");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const EFFECTIVE_FROM = new Date("2026-01-01");

/** Reserved code every component's "Other / Specific Requirement"
 *  EquipmentOption uses — see lib/db/admin.ts's OTHER_CODE. No matching
 *  RawVendorCost row: selecting it redirects pricing to that slot's
 *  Recommended default and flags `hasCustomRequirements`. */
const OTHER_CODE = "OTHER";

async function main() {
  console.log("Seeding Solar Pixel dev data...\n");

  // ---- Users (no login system yet — passwordHash is a placeholder) ----
  const superAdmin = await prisma.user.upsert({
    where: { phone: "+923001112222" },
    update: {},
    create: {
      name: "Ayesha Malik",
      email: "ayesha@solarpixel.pk",
      phone: "+923001112222",
      passwordHash: "seed-only-no-login-system-yet",
      role: "SUPER_ADMIN",
    },
  });

  const engineer = await prisma.user.upsert({
    where: { phone: "+923003334444" },
    update: {},
    create: {
      name: "Bilal Ahmed",
      email: "bilal@solarpixel.pk",
      phone: "+923003334444",
      passwordHash: "seed-only-no-login-system-yet",
      role: "FIELD_ENGINEER",
    },
  });

  console.log(`Users:\n  SUPER_ADMIN     ${superAdmin.name.padEnd(14)} ${superAdmin.id}`);
  console.log(`  FIELD_ENGINEER  ${engineer.name.padEnd(14)} ${engineer.id}\n`);

  // ============================================================================
  // Equipment Builder catalog (PUBLIC, cost-free) + matching CONFIDENTIAL
  // vendor costs (vendor_private). `code` is the join key between the two
  // — see EquipmentOption's doc comment in schema.prisma. The codes below
  // MUST match lib/db/admin.ts's DEFAULT_* constants exactly for the
  // Recommended path to resolve.
  // ============================================================================

  interface CatalogEntry {
    componentType: ComponentType;
    code: string;
    label: string;
    brand: string | null;
    specValue: number | null;
    applicableServiceType: ServiceType | null;
    /** Only meaningful for componentType=INVERTER (2026-08-22). */
    phase?: InverterPhase | null;
    isOtherOption?: boolean;
    /** The Recommended-path default for this componentType (+
     *  applicableServiceType) — must match lib/db/admin.ts's DEFAULT_*
     *  fallback constants. See EquipmentOption.isDefault's doc comment. */
    isDefault?: boolean;
    sortOrder: number;
    /** Omitted for the reserved "Other" entries — no cost row for those. */
    cost?: { unitCostRs: number; unit: CostUnit };
  }

  const OTHER_LABEL = "Other / Specific Requirement";

  const catalog: CatalogEntry[] = [
    // ---- Solar Panel (Recommended default: LONGI_TOPCON_610W) ----
    {
      componentType: "SOLAR_PANEL",
      code: "LONGI_TOPCON_610W",
      label: "Longi TOPCon 610W",
      brand: "Longi",
      specValue: 610,
      applicableServiceType: null,
      isDefault: true,
      sortOrder: 1,
      cost: { unitCostRs: 34, unit: "PER_WATT" },
    },
    {
      componentType: "SOLAR_PANEL",
      code: "JINKO_TIGER_NEO_585W",
      label: "Jinko Tiger Neo 585W",
      brand: "Jinko",
      specValue: 585,
      applicableServiceType: null,
      sortOrder: 2,
      cost: { unitCostRs: 32, unit: "PER_WATT" },
    },
    {
      componentType: "SOLAR_PANEL",
      code: "CANADIAN_SOLAR_600W",
      label: "Canadian Solar 600W",
      brand: "Canadian Solar",
      specValue: 600,
      applicableServiceType: null,
      sortOrder: 3,
      cost: { unitCostRs: 33, unit: "PER_WATT" },
    },
    {
      componentType: "SOLAR_PANEL",
      code: OTHER_CODE,
      label: OTHER_LABEL,
      brand: null,
      specValue: null,
      applicableServiceType: null,
      isOtherOption: true,
      sortOrder: 99,
    },

    // ---- Inverter (2026-08-22 rework — real SKUs sourced from w11stop.com,
    // Recommended default: GROWATT_10KW_HYBRID_1P / GOODWE_10KW_ONGRID) ----
    // Replaced the old vague "Huawei Hybrid Inverter"-style placeholders
    // (no real specValue, blended PER_WATT rate) with specific, real
    // products — each a flat PER_PIECE price (an inverter is one fixed
    // unit, never scaled by the customer's system size — see
    // calculateSystemPricing's rawInverterPKR doc comment in
    // lib/db/admin.ts) plus a real `phase` (Single/Three Phase). Costs
    // below are w11stop's real retail price per model — this catalog's
    // sector margins currently sit at 0% (see project memory), so these
    // numbers ARE the customer-facing price today, not a raw cost with
    // markup layered on top.
    {
      componentType: "INVERTER",
      code: "SOLIS_10KW_HYBRID_1P",
      label: "Solis 10kW Hybrid Inverter (Single Phase)",
      brand: "Solis",
      specValue: 10,
      applicableServiceType: "HYBRID_BATTERY",
      phase: "SINGLE_PHASE",
      sortOrder: 1,
      cost: { unitCostRs: 390_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "SOLIS_12KW_HYBRID_3P",
      label: "Solis 12kW Hybrid Inverter (Three Phase)",
      brand: "Solis",
      specValue: 12,
      applicableServiceType: "HYBRID_BATTERY",
      phase: "THREE_PHASE",
      sortOrder: 2,
      cost: { unitCostRs: 570_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "GROWATT_10KW_HYBRID_1P",
      label: "Growatt 10kW Hybrid Inverter (Single Phase)",
      brand: "Growatt",
      specValue: 10,
      applicableServiceType: "HYBRID_BATTERY",
      phase: "SINGLE_PHASE",
      isDefault: true,
      sortOrder: 3,
      cost: { unitCostRs: 380_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "GROWATT_10KW_HYBRID_3P",
      label: "Growatt 10kW Hybrid Inverter (Three Phase)",
      brand: "Growatt",
      specValue: 10,
      applicableServiceType: "HYBRID_BATTERY",
      phase: "THREE_PHASE",
      sortOrder: 4,
      cost: { unitCostRs: 550_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "GOODWE_10KW_HYBRID_1P",
      label: "Goodwe 10kW Hybrid Inverter (Single Phase)",
      brand: "Goodwe",
      specValue: 10,
      applicableServiceType: "HYBRID_BATTERY",
      phase: "SINGLE_PHASE",
      sortOrder: 5,
      cost: { unitCostRs: 393_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "GOODWE_20KW_HYBRID_3P",
      label: "Goodwe 20kW Hybrid Inverter (Three Phase)",
      brand: "Goodwe",
      specValue: 20,
      applicableServiceType: "HYBRID_BATTERY",
      phase: "THREE_PHASE",
      sortOrder: 6,
      cost: { unitCostRs: 765_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "HUAWEI_10KW_ONGRID",
      label: "Huawei 10kW On-Grid Inverter",
      brand: "Huawei",
      // Phase omitted (null) — w11stop's own listing for this model
      // doesn't state it, unlike the Solis/Growatt/Goodwe hybrid models
      // above, which explicitly do. Left unknown rather than guessed.
      specValue: 10,
      applicableServiceType: "ONGRID_ZERO_EXPORT",
      sortOrder: 7,
      cost: { unitCostRs: 336_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "HUAWEI_20KW_ONGRID",
      label: "Huawei 20kW On-Grid Inverter",
      brand: "Huawei",
      specValue: 20,
      applicableServiceType: "ONGRID_ZERO_EXPORT",
      sortOrder: 8,
      cost: { unitCostRs: 445_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "GROWATT_10KW_ONGRID",
      label: "Growatt 10kW On-Grid Inverter (X2 Pro)",
      brand: "Growatt",
      specValue: 10,
      applicableServiceType: "ONGRID_ZERO_EXPORT",
      sortOrder: 9,
      cost: { unitCostRs: 188_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "GROWATT_20KW_ONGRID",
      label: "Growatt 20kW On-Grid Inverter",
      brand: "Growatt",
      specValue: 20,
      applicableServiceType: "ONGRID_ZERO_EXPORT",
      sortOrder: 10,
      cost: { unitCostRs: 320_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "GOODWE_10KW_ONGRID",
      label: "Goodwe 10kW On-Grid Inverter",
      brand: "Goodwe",
      specValue: 10,
      applicableServiceType: "ONGRID_ZERO_EXPORT",
      isDefault: true,
      sortOrder: 11,
      cost: { unitCostRs: 185_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: "GOODWE_20KW_ONGRID",
      label: "Goodwe 20kW On-Grid Inverter",
      brand: "Goodwe",
      specValue: 20,
      applicableServiceType: "ONGRID_ZERO_EXPORT",
      sortOrder: 12,
      cost: { unitCostRs: 275_000, unit: "PER_PIECE" },
    },
    {
      componentType: "INVERTER",
      code: OTHER_CODE,
      label: OTHER_LABEL,
      brand: null,
      specValue: null,
      applicableServiceType: null,
      isOtherOption: true,
      sortOrder: 99,
    },

    // ---- Battery (2026-08-22 rework — real SKUs sourced from w11stop.com,
    // Recommended default: PYLONTECH_5KWH), HYBRID_BATTERY only ----
    // Replaced the old 3-brand "Lithium (LiFePO4)" placeholders (no real
    // specValue, blended PER_KWH rate a customer could dial to any
    // arbitrary number) with specific, real products — each a flat
    // PER_PIECE price for its own fixed kWh capacity, exactly the same
    // rework INVERTER already went through this same day. specValue is
    // the module's real capacity in kWh (EquipmentOption.specValue's own
    // doc comment already documented this exact use case).
    //
    // Only Pylontech and Dyness — Felicity (the third old placeholder
    // brand) is NOT actually stocked on w11stop: every "felicity battery"
    // search result's real listed brand was something totally unrelated
    // (e.g. "Cooler Master"), confirmed live via the market-price scraper
    // built the same day (see lib/scraper/marketPriceJob.ts) — not a
    // search-relevance bug, w11stop simply doesn't carry it. Dropped
    // rather than kept with a fabricated price.
    {
      componentType: "BATTERY",
      code: "PYLONTECH_2_8KWH",
      label: "Pylontech UP2500 2.8kWh",
      brand: "Pylontech",
      specValue: 2.8,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 1,
      cost: { unitCostRs: 185_000, unit: "PER_PIECE" },
    },
    {
      componentType: "BATTERY",
      code: "PYLONTECH_5KWH",
      label: "Pylontech FIDUS 5.12kWh (IP65)",
      brand: "Pylontech",
      specValue: 5.12,
      applicableServiceType: "HYBRID_BATTERY",
      isDefault: true,
      sortOrder: 2,
      cost: { unitCostRs: 250_000, unit: "PER_PIECE" },
    },
    {
      componentType: "BATTERY",
      code: "PYLONTECH_10KWH",
      label: "Pylontech Force H3 10kWh (HV)",
      brand: "Pylontech",
      specValue: 10,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 3,
      cost: { unitCostRs: 793_000, unit: "PER_PIECE" },
    },
    // 15kWh added 2026-08-24 after a live w11stop re-check (triggered by
    // the market-price scraper's own "Run Now", not a fresh manual
    // sourcing pass) confirmed every OTHER active battery SKU's price was
    // still accurate 2 days on, but surfaced this one genuine gap: the
    // Pylontech Force H3 ladder jumped straight from 10kWh to 20kWh with
    // nothing between, while Dyness already had its own 15kWh tier below.
    // A real, currently-priced w11stop listing at exactly this capacity
    // (Force H3 15kWh HV) fills the equivalent gap for Pylontech.
    {
      componentType: "BATTERY",
      code: "PYLONTECH_15KWH",
      label: "Pylontech Force H3 15kWh (HV)",
      brand: "Pylontech",
      specValue: 15,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 4,
      cost: { unitCostRs: 1_070_000, unit: "PER_PIECE" },
    },
    {
      componentType: "BATTERY",
      code: "PYLONTECH_20KWH",
      label: "Pylontech Force H3 20kWh (HV)",
      brand: "Pylontech",
      specValue: 20,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 5,
      cost: { unitCostRs: 1_355_000, unit: "PER_PIECE" },
    },
    // 25/30/35kWh added after live-testing revealed the 4-tier Pylontech
    // range (max 20kWh) left large Commercial/Industrial systems (whose
    // auto-sized TARGET capacity can exceed every SKU on file) falling
    // back to the small admin-default battery instead of something
    // actually sized for them — see findSmallestFittingInStockBattery's
    // doc comment. Real w11stop prices, already sourced during this same
    // catalog pass, not fabricated to plug the gap. Dyness's own catalog
    // stays capped at 15kWh below — every Dyness HV listing past that
    // (20-50kWh) showed no real price on w11stop ("Rs. 0/-"), so those
    // were dropped rather than guessed.
    {
      componentType: "BATTERY",
      code: "PYLONTECH_25KWH",
      label: "Pylontech Force H3 25kWh (HV)",
      brand: "Pylontech",
      specValue: 25,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 6,
      cost: { unitCostRs: 1_635_000, unit: "PER_PIECE" },
    },
    {
      componentType: "BATTERY",
      code: "PYLONTECH_30KWH",
      label: "Pylontech Force H3 30kWh (HV)",
      brand: "Pylontech",
      specValue: 30,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 7,
      cost: { unitCostRs: 1_916_000, unit: "PER_PIECE" },
    },
    {
      componentType: "BATTERY",
      code: "PYLONTECH_35KWH",
      label: "Pylontech Force H3 35kWh (HV)",
      brand: "Pylontech",
      specValue: 35,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 8,
      cost: { unitCostRs: 2_194_000, unit: "PER_PIECE" },
    },
    {
      componentType: "BATTERY",
      code: "DYNESS_2_5KWH",
      label: "Dyness DL2.5 2.56kWh",
      brand: "Dyness",
      specValue: 2.56,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 9,
      cost: { unitCostRs: 135_000, unit: "PER_PIECE" },
    },
    {
      componentType: "BATTERY",
      code: "DYNESS_5KWH",
      label: "Dyness DL5.0C 5.12kWh",
      brand: "Dyness",
      specValue: 5.12,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 10,
      cost: { unitCostRs: 255_000, unit: "PER_PIECE" },
    },
    {
      componentType: "BATTERY",
      code: "DYNESS_10KWH",
      label: "Dyness Powerbox G2 10.24kWh",
      brand: "Dyness",
      specValue: 10.24,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 11,
      cost: { unitCostRs: 545_000, unit: "PER_PIECE" },
    },
    {
      componentType: "BATTERY",
      code: "DYNESS_15KWH",
      label: "Dyness 15kWh (HV)",
      brand: "Dyness",
      specValue: 15,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 12,
      cost: { unitCostRs: 950_000, unit: "PER_PIECE" },
    },
    {
      componentType: "BATTERY",
      code: OTHER_CODE,
      label: OTHER_LABEL,
      brand: null,
      specValue: null,
      applicableServiceType: "HYBRID_BATTERY",
      isOtherOption: true,
      sortOrder: 99,
    },

    // ---- Cable Brand (Recommended default: PAKISTAN_CABLES) ----
    // One catalog entry drives BOTH DC + AC cost lookups — see
    // app/page.tsx, which derives the AC code from the DC code by
    // convention (same code, different componentType/RawVendorCost row)
    // rather than asking the user to pick DC and AC brands separately.
    {
      componentType: "DC_CABLE",
      code: "PAKISTAN_CABLES",
      label: "Pakistan Cables",
      brand: "Pakistan Cables",
      specValue: null,
      applicableServiceType: null,
      isDefault: true,
      sortOrder: 1,
      cost: { unitCostRs: 3, unit: "PER_WATT" },
    },
    {
      componentType: "DC_CABLE",
      code: "FAST_CABLES",
      label: "Fast Cables",
      brand: "Fast Cables",
      specValue: null,
      applicableServiceType: null,
      sortOrder: 2,
      cost: { unitCostRs: 2.6, unit: "PER_WATT" },
    },
    {
      componentType: "DC_CABLE",
      code: OTHER_CODE,
      label: OTHER_LABEL,
      brand: null,
      specValue: null,
      applicableServiceType: null,
      isOtherOption: true,
      sortOrder: 99,
    },
    // Matching AC_CABLE cost rows (same codes, no separate EquipmentOption
    // — the DC_CABLE catalog entries above are what the UI renders).
    { componentType: "AC_CABLE", code: "PAKISTAN_CABLES", label: "Pakistan Cables", brand: "Pakistan Cables", specValue: null, applicableServiceType: null, sortOrder: 1, cost: { unitCostRs: 2, unit: "PER_WATT" } },
    { componentType: "AC_CABLE", code: "FAST_CABLES", label: "Fast Cables", brand: "Fast Cables", specValue: null, applicableServiceType: null, sortOrder: 2, cost: { unitCostRs: 1.8, unit: "PER_WATT" } },

    // ---- Protection & Breakers (Recommended default: SCHNEIDER_DB_BOX) ----
    {
      componentType: "BREAKERS",
      code: "SCHNEIDER_DB_BOX",
      label: "Schneider DB Box",
      brand: "Schneider Electric",
      specValue: null,
      applicableServiceType: null,
      isDefault: true,
      sortOrder: 1,
      cost: { unitCostRs: 6, unit: "PER_WATT" },
    },
    {
      componentType: "BREAKERS",
      code: "CHINT_STANDARD",
      label: "Chint Standard",
      brand: "Chint",
      specValue: null,
      applicableServiceType: null,
      sortOrder: 2,
      cost: { unitCostRs: 4, unit: "PER_WATT" },
    },
    {
      componentType: "BREAKERS",
      code: OTHER_CODE,
      label: OTHER_LABEL,
      brand: null,
      specValue: null,
      applicableServiceType: null,
      isOtherOption: true,
      sortOrder: 99,
    },

    // ---- Structure Choice (Recommended default: STANDARD_L1_L2) ----
    // STANDARD_L1_L2 / CUSTOM_ELEVATED already exist from an earlier
    // seed pass (used by the Maker survey too) — CORRUGATED_ROOF_MOUNT
    // is new. Costs only added here if not already present.
    {
      componentType: "MOUNTING_STRUCTURE",
      code: "STANDARD_L1_L2",
      label: "Standard Ground/Roof L2",
      brand: null,
      specValue: null,
      applicableServiceType: null,
      isDefault: true,
      sortOrder: 1,
      // Rs 18/W per the Admin Pricing spec's base rate (was 11/W before
      // this pass) — this is the "Structure Base Rate" KPI in /admin/pricing.
      cost: { unitCostRs: 18, unit: "PER_WATT" },
    },
    {
      componentType: "MOUNTING_STRUCTURE",
      code: "CUSTOM_ELEVATED",
      label: "Custom Elevated Pergola",
      brand: null,
      specValue: null,
      applicableServiceType: null,
      sortOrder: 2,
      cost: { unitCostRs: 19, unit: "PER_WATT" },
    },
    {
      componentType: "MOUNTING_STRUCTURE",
      code: "CORRUGATED_ROOF_MOUNT",
      label: "Corrugated Roof Mount",
      brand: null,
      specValue: null,
      applicableServiceType: null,
      sortOrder: 3,
      cost: { unitCostRs: 18, unit: "PER_WATT" },
    },
    {
      componentType: "MOUNTING_STRUCTURE",
      code: OTHER_CODE,
      label: OTHER_LABEL,
      brand: null,
      specValue: null,
      applicableServiceType: null,
      isOtherOption: true,
      sortOrder: 99,
    },

    // ---- Installation — no picker in the UI, single flat rate ----
    {
      componentType: "LABOR",
      code: "STANDARD_INSTALLATION",
      label: "Standard Installation",
      brand: null,
      specValue: null,
      applicableServiceType: null,
      sortOrder: 1,
      cost: { unitCostRs: 12, unit: "PER_WATT" },
    },
  ];

  let optionsCreated = 0;
  let optionsUpdated = 0;
  let costsCreated = 0;
  for (const entry of catalog) {
    const existingOption = await prisma.equipmentOption.findUnique({
      where: { componentType_code: { componentType: entry.componentType, code: entry.code } },
    });
    if (!existingOption) {
      await prisma.equipmentOption.create({
        data: {
          componentType: entry.componentType,
          code: entry.code,
          label: entry.label,
          brand: entry.brand,
          specValue: entry.specValue,
          applicableServiceType: entry.applicableServiceType,
          phase: entry.phase ?? null,
          isOtherOption: entry.isOtherOption ?? false,
          isDefault: entry.isDefault ?? false,
          sortOrder: entry.sortOrder,
          isActive: true,
        },
      });
      optionsCreated++;
    } else if (existingOption.isDefault !== (entry.isDefault ?? false)) {
      // isDefault is admin-editable via /admin/pricing after seed time —
      // only re-sync it here if this run's seed data disagrees with what's
      // already in the DB, so a re-seed doesn't clobber an admin's changes
      // to unrelated fields, but still keeps freshly-added `isDefault: true`
      // catalog entries (like this pass's) in sync on existing installs.
      await prisma.equipmentOption.update({
        where: { id: existingOption.id },
        data: { isDefault: entry.isDefault ?? false },
      });
      optionsUpdated++;
    }

    if (entry.cost) {
      const existingCost = await prisma.rawVendorCost.findFirst({
        where: { componentType: entry.componentType, itemName: entry.code, unit: entry.cost.unit, isActive: true },
      });
      if (!existingCost) {
        await prisma.rawVendorCost.create({
          data: {
            componentType: entry.componentType,
            vendorName: entry.brand ?? "Solar Pixel EPC",
            itemName: entry.code,
            model: entry.label,
            unitCostRs: entry.cost.unitCostRs,
            unit: entry.cost.unit,
            currency: "PKR",
            effectiveFrom: EFFECTIVE_FROM,
            isActive: true,
            createdById: superAdmin.id,
          },
        });
        costsCreated++;
      }
    }
  }
  console.log(`Equipment options: ${optionsCreated} created, ${optionsUpdated} isDefault-synced, ${catalog.length - optionsCreated - optionsUpdated} unchanged`);
  console.log(`Equipment vendor costs: ${costsCreated} created\n`);

  // ---- Other vendor costs used elsewhere (Checker exact-BOQ pricing —
  // unaffected by the Equipment Builder change; PER_METER cable rates,
  // CT coil, DB upgrade) ----
  const otherVendorCosts: {
    componentType: ComponentType;
    vendorName: string;
    itemName: string;
    unitCostRs: number;
    unit: CostUnit;
  }[] = [
    { componentType: "DC_CABLE", vendorName: "Pakistan Cables", itemName: "6mm² Solar DC Cable", unitCostRs: 180, unit: "PER_METER" },
    { componentType: "AC_CABLE", vendorName: "Pakistan Cables", itemName: "4mm² AC Cable", unitCostRs: 140, unit: "PER_METER" },
    { componentType: "CT_COIL", vendorName: "Eastron", itemName: "CT Coil / Smart Meter Comms Cable", unitCostRs: 90, unit: "PER_METER" },
    { componentType: "DB_UPGRADE", vendorName: "Schneider Electric", itemName: "DB Panel Upgrade (flat)", unitCostRs: 45000, unit: "LUMP_SUM" },
  ];

  let otherCostsCreated = 0;
  for (const cost of otherVendorCosts) {
    const existing = await prisma.rawVendorCost.findFirst({
      where: { componentType: cost.componentType, itemName: cost.itemName, unit: cost.unit, isActive: true },
    });
    if (!existing) {
      await prisma.rawVendorCost.create({
        data: { ...cost, currency: "PKR", effectiveFrom: EFFECTIVE_FROM, isActive: true, createdById: superAdmin.id },
      });
      otherCostsCreated++;
    }
  }
  console.log(`Other vendor costs (Checker exact-BOQ): ${otherCostsCreated} created, ${otherVendorCosts.length - otherCostsCreated} already present`);

  // ---- Margin rules (CONFIDENTIAL) — one system-level default per sector ----
  const marginRules: { sector: Sector; targetMarginPercent: number; minMarginPercent: number }[] = [
    { sector: "RESIDENTIAL", targetMarginPercent: 22, minMarginPercent: 15 },
    { sector: "COMMERCIAL", targetMarginPercent: 18, minMarginPercent: 12 },
    { sector: "INDUSTRIAL", targetMarginPercent: 15, minMarginPercent: 10 },
  ];

  let rulesCreated = 0;
  for (const rule of marginRules) {
    const existing = await prisma.marginRule.findFirst({
      where: { sector: rule.sector, componentType: null, isActive: true },
    });
    if (!existing) {
      await prisma.marginRule.create({
        data: { ...rule, componentType: null, effectiveFrom: EFFECTIVE_FROM, isActive: true, createdById: superAdmin.id },
      });
      rulesCreated++;
    }
  }
  console.log(`Margin rules: ${rulesCreated} created, ${marginRules.length - rulesCreated} already present\n`);

  console.log("Seed complete. Test accounts:");
  console.log(`  Field Engineer for /maker/survey:  ${engineer.name}`);
  console.log(`  Super Admin for /admin/checker:    ${superAdmin.name}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
