import "dotenv/config";
import { PrismaClient, type ComponentType, type CostUnit, type Sector, type ServiceType } from "@prisma/client";
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

    // ---- Inverter (Recommended default: HUAWEI_HYBRID / HUAWEI_ONGRID) ----
    {
      componentType: "INVERTER",
      code: "HUAWEI_HYBRID",
      label: "Huawei Hybrid Inverter",
      brand: "Huawei",
      specValue: null,
      applicableServiceType: "HYBRID_BATTERY",
      isDefault: true,
      sortOrder: 1,
      cost: { unitCostRs: 15, unit: "PER_WATT" },
    },
    {
      componentType: "INVERTER",
      code: "SOFAR_HYBRID",
      label: "Sofar Hybrid Inverter",
      brand: "Sofar",
      specValue: null,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 2,
      cost: { unitCostRs: 13, unit: "PER_WATT" },
    },
    {
      // Named "Solis 10kW Hybrid" in the admin catalog spec — specValue
      // is informational (kW rating), same as SOLAR_PANEL's wattage;
      // pricing stays PER_WATT/blended like every other inverter, not a
      // fixed-unit price, since sizing a quote around discrete inverter
      // SKUs would need real quantity/bin-packing logic this system
      // doesn't have (see EquipmentOption.specValue's doc comment).
      componentType: "INVERTER",
      code: "SOLIS_HYBRID_10KW",
      label: "Solis 10kW Hybrid Inverter",
      brand: "Solis",
      specValue: 10,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 3,
      cost: { unitCostRs: 11, unit: "PER_WATT" },
    },
    {
      componentType: "INVERTER",
      code: "HUAWEI_ONGRID",
      label: "Huawei On-Grid Inverter",
      brand: "Huawei",
      specValue: null,
      applicableServiceType: "ONGRID_ZERO_EXPORT",
      isDefault: true,
      sortOrder: 4,
      cost: { unitCostRs: 12, unit: "PER_WATT" },
    },
    {
      componentType: "INVERTER",
      code: "GROWATT_ONGRID",
      label: "Growatt On-Grid Inverter",
      brand: "Growatt",
      specValue: null,
      applicableServiceType: "ONGRID_ZERO_EXPORT",
      sortOrder: 5,
      cost: { unitCostRs: 10, unit: "PER_WATT" },
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

    // ---- Battery (Recommended default: PYLONTECH_LITHIUM), HYBRID_BATTERY only ----
    {
      componentType: "BATTERY",
      code: "PYLONTECH_LITHIUM",
      label: "Pylontech Lithium (LiFePO4)",
      brand: "Pylontech",
      specValue: null,
      applicableServiceType: "HYBRID_BATTERY",
      isDefault: true,
      sortOrder: 1,
      cost: { unitCostRs: 190_000, unit: "PER_KWH" },
    },
    {
      componentType: "BATTERY",
      code: "DYNESS_LITHIUM",
      label: "Dyness Lithium (LiFePO4)",
      brand: "Dyness",
      specValue: null,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 2,
      cost: { unitCostRs: 165_000, unit: "PER_KWH" },
    },
    {
      componentType: "BATTERY",
      code: "FELICITY_LITHIUM",
      label: "Felicity Lithium (LiFePO4)",
      brand: "Felicity",
      specValue: null,
      applicableServiceType: "HYBRID_BATTERY",
      sortOrder: 3,
      cost: { unitCostRs: 210_000, unit: "PER_KWH" },
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
