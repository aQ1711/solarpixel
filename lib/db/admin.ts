import "server-only";
import { PrismaClient, Prisma, type ComponentType, type CostUnit, type Sector, type ServiceType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { formatGoogleDriveLink } from "@/lib/utils/googleDrive";

/**
 * The ADMIN Prisma client — connects as `app_admin_role`, the only
 * application role granted access to the `vendor_private` schema
 * (raw_vendor_costs, margin_rules).
 *
 * DO NOT import `adminPrisma` itself anywhere outside this file. Every
 * other module — including API routes — must go through
 * `calculateSystemPricing()` below, which is the single sanctioned
 * boundary between vendor_private data and the rest of the app. It
 * returns a sanitized, client-safe DTO only; raw costs and margin
 * percentages are read, used, and discarded entirely inside this
 * function's stack frame.
 */
declare global {
  var __solarPixelAdminPrisma: PrismaClient | undefined;
}

function createAdminClient(): PrismaClient {
  const connectionString = process.env.ADMIN_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "ADMIN_DATABASE_URL is not set. This must be an app_admin_role connection string, distinct from DATABASE_URL."
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const adminPrisma = globalThis.__solarPixelAdminPrisma ?? createAdminClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__solarPixelAdminPrisma = adminPrisma;
}

/** Thrown when Super Admin hasn't configured the vendor cost / margin
 *  data an estimate needs. Safe to surface to the client as a generic
 *  503 — its `.message` (which may reference internal config) must
 *  never be forwarded to the API response, only logged server-side. */
export class PricingConfigurationError extends Error {}

/**
 * Client-facing itemized cost breakdown — each line is the RAW vendor
 * cost for that component marked up by the SAME margin multiplier
 * applied to the total (price = cost / (1 - margin%)), so the lines sum
 * to exactly `totalClientPricePKR` (see calculateSystemPricing's return).
 * This is NOT the raw vendor cost itself — that never leaves this
 * module — it's a proportional, already-marked-up split of the sell
 * price, which is standard practice for a customer-facing BOQ and
 * doesn't require exposing the underlying PKR/watt vendor rate or the
 * margin percentage itself.
 */
export interface ItemizedBreakdown {
  panelsPKR: number;
  inverterPKR: number;
  /** 0 for ONGRID_ZERO_EXPORT systems (no battery line at all). */
  batteryPKR: number;
  /** DC cable + AC cable + breakers/DB box combined into one line —
   *  none of the three individually was asked for in the BOQ UI, and
   *  splitting them further isn't worth the clutter. */
  cablingAndProtectionPKR: number;
  structurePKR: number;
  installationPKR: number;
}

/** One resolved catalog item — the ACTUAL EquipmentOption a slot priced
 *  against, after OTHER/omitted substitution (see resolveSelection),
 *  never the raw un-resolved selection. Cost-free by construction (only
 *  EquipmentOption fields, never RawVendorCost) — safe to return straight
 *  through to the client, same boundary as GET /api/equipment-options. */
export interface ResolvedEquipmentItem {
  code: string;
  brand: string | null;
  label: string;
  /** Informational catalog spec (EquipmentOption.specValue) — panel
   *  wattage, inverter kW rating, or one battery module's kWh rating.
   *  Often null; see specValue's own doc comment in schema.prisma. */
  specValue: number | null;
}

export interface ResolvedEquipment {
  panel: ResolvedEquipmentItem;
  inverter: ResolvedEquipmentItem;
  /** null for ONGRID_ZERO_EXPORT (no battery line at all). `capacityKwh`
   *  is the TOTAL capacity actually priced (explicit selection, or the
   *  DEFAULT_BATTERY_KWH_PER_SYSTEM_KW × systemKw fallback) — distinct
   *  from `specValue`, which (if set) describes a single catalog module. */
  battery: (ResolvedEquipmentItem & { capacityKwh: number }) | null;
}

export interface SystemPricingResult {
  totalClientPricePKR: number;
  /** True if the customer picked "Other / Specific Requirement" for any
   *  component — the price shown used the Recommended default as a
   *  placeholder for that slot, and the WhatsApp/BOQ flow must make clear
   *  the number is preliminary pending manual engineering pricing. */
  hasCustomRequirements: boolean;
  breakdown: ItemizedBreakdown;
  /** The exact equipment this quote priced — on BOTH the Recommended and
   *  Custom paths (the Recommended path resolves real EquipmentOption
   *  rows too, it just never received an explicit selections object).
   *  Lets the client render an accurate BOQ (panel wattage/count, brand
   *  names) without separately re-deriving "what the backend must have
   *  defaulted to," which used to be a client-side guess — see
   *  app/page.tsx's Brand-Aligned Quotation update in project memory. */
  resolvedEquipment: ResolvedEquipment;
}

/** Equipment Builder selections (Custom path) — each field is an
 *  EquipmentOption.code for that componentType, or the reserved value
 *  "OTHER" for "Other / Specific Requirement" (falls back to the
 *  Recommended default's cost as a placeholder, and sets
 *  `hasCustomRequirements`). Omitted fields also fall back to the
 *  Recommended default — this is exactly how the Recommended path itself
 *  prices (call with `selections` omitted entirely). */
export interface EquipmentSelections {
  panelCode?: string;
  inverterCode?: string;
  /** A real BATTERY EquipmentOption.code, "OTHER", or the reserved value
   *  NONE_CODE ("NONE") meaning the customer opted out of a battery
   *  entirely (only meaningful when serviceType is HYBRID_BATTERY —
   *  prices/resolves exactly like ONGRID_ZERO_EXPORT's battery-free
   *  state). Omitted falls back to the Recommended default battery. */
  batteryCode?: string;
  /** kWh — only meaningful when serviceType is HYBRID_BATTERY and
   *  batteryCode isn't NONE_CODE. Omitted defaults to
   *  DEFAULT_BATTERY_KWH_PER_SYSTEM_KW × systemKw. */
  batteryCapacityKwh?: number;
  dcCableCode?: string;
  acCableCode?: string;
  breakersCode?: string;
  /** Must match a MOUNTING_STRUCTURE RawVendorCost.itemName, e.g.
   *  "STANDARD_L1_L2". Omitted defaults to DEFAULT_STRUCTURE_CODE. */
  structureCode?: string;
}

/** Safely narrows `Quote.equipmentSelections` (a Prisma `Json?` column)
 *  back to `EquipmentSelections` for calculateAdminBoqPricing — a light
 *  shape check, not full re-validation, since the value was already
 *  validated by Zod at write time in /api/quote/calculate. Returns
 *  undefined for null/non-object values rather than throwing, so a
 *  corrupted or pre-this-feature row degrades to "Recommended path"
 *  instead of blocking the Checker from pricing the quote at all. */
export function parseEquipmentSelections(json: unknown): EquipmentSelections | undefined {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return undefined;
  return json as EquipmentSelections;
}

// Recommended-path defaults — deterministic EquipmentOption codes rather
// than "just grab whichever row is active," since multiple brand rows
// now share the same componentType (see EquipmentOption's doc comment in
// schema.prisma). Must match prisma/seed.ts's seeded codes exactly, and
// each has a corresponding RawVendorCost row with itemName = the code.
const DEFAULT_PANEL_CODE = "LONGI_TOPCON_610W";
const DEFAULT_INVERTER_CODE_BY_SERVICE_TYPE: Record<ServiceType, string> = {
  HYBRID_BATTERY: "HUAWEI_HYBRID",
  ONGRID_ZERO_EXPORT: "HUAWEI_ONGRID",
};
const DEFAULT_BATTERY_CODE = "PYLONTECH_LITHIUM";
// Same code used for both DC_CABLE and AC_CABLE rows — one "Cable Brand"
// catalog entry (under DC_CABLE) drives both lookups, differentiated by
// componentType alone; see app/page.tsx and prisma/seed.ts.
const DEFAULT_CABLE_CODE = "PAKISTAN_CABLES";
const DEFAULT_BREAKERS_CODE = "SCHNEIDER_DB_BOX";
const DEFAULT_STRUCTURE_CODE = "STANDARD_L1_L2";
// Installation no longer prices off a RawVendorCost row (see
// GlobalPricingSettings/getGlobalPricingSettings) — the old
// raw_vendor_costs(LABOR, "STANDARD_INSTALLATION") row is now an inert,
// unread leftover from prisma/seed.ts, harmless to leave in place.

/** Recommended-path default battery sizing, kWh per kW of solar —
 *  matches the ratio the earlier blended-per-watt approximation implied,
 *  kept so Recommended-path pricing didn't jump when Custom Builder
 *  capacity selection was introduced. */
const DEFAULT_BATTERY_KWH_PER_SYSTEM_KW = 1.2;
/** Reserved EquipmentOption code for "Other / Specific Requirement". */
const OTHER_CODE = "OTHER";
/** Reserved `batteryCode` value meaning "the customer explicitly opted
 *  out of a battery" — distinct from `undefined` (which means "no
 *  preference, use the Recommended default battery"). Only meaningful
 *  when serviceType is HYBRID_BATTERY; a HYBRID_BATTERY quote with this
 *  selection prices/resolves battery exactly like ONGRID_ZERO_EXPORT
 *  does (batteryPKR: 0, resolvedEquipment.battery: null) without
 *  reclassifying the quote's serviceType — the customer still gets the
 *  hybrid-capable inverter, they've just declined the battery hardware
 *  itself. See the Custom Equipment Builder's "No Battery" swap card in
 *  app/page.tsx. */
const NONE_CODE = "NONE";

/** The pre-survey web estimate for battery capacity — same fallback chain
 *  `calculateAdminBoqPricing`/`calculateSystemPricing` use before a
 *  Checker/Maker-confirmed figure exists. Exported so `/api/maker/quotes/:id`
 *  can pre-fill the Field Engineer's "Client Requested Battery Capacity"
 *  input with the exact number the customer originally saw, without
 *  duplicating the fallback math. */
export function estimatedBatteryCapacityKwh(systemKw: number, selections?: EquipmentSelections | null): number {
  return selections?.batteryCapacityKwh ?? systemKw * DEFAULT_BATTERY_KWH_PER_SYSTEM_KW;
}

/** Looks up the admin-configured Recommended default for a component
 *  slot (EquipmentOption.isDefault, editable via /admin/pricing) —
 *  `applicableServiceType: null` means "applies regardless" (panels,
 *  cables, breakers, structure); pass the actual serviceType for
 *  INVERTER/BATTERY, whose defaults are chosen per service type. Falls
 *  back to `fallbackCode` (one of the DEFAULT_* constants above) if
 *  nothing is marked default yet, so pricing never breaks from an empty
 *  admin table before anyone has touched it. */
async function getDefaultCode(
  componentType: ComponentType,
  applicableServiceType: ServiceType | null,
  fallbackCode: string
): Promise<string> {
  const row = await adminPrisma.equipmentOption.findFirst({
    where: { componentType, applicableServiceType, isDefault: true, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return row?.code ?? fallbackCode;
}

/** Combines getDefaultCode's DB lookup with the same "OTHER / omitted ->
 *  default" fallback calculateSystemPricing's resolveSelection applies —
 *  shared by calculateAdminBoqPricing so the Checker's exact-BOQ prices
 *  the SAME equipment code the customer's original instant estimate
 *  would have resolved to for that selection, not a separately-derived
 *  answer. Doesn't track hasCustomRequirements (the Checker route isn't
 *  currently surfacing that signal — see project memory's open-gaps). */
async function resolveEquipmentCode(
  componentType: ComponentType,
  applicableServiceType: ServiceType | null,
  selectedCode: string | undefined,
  fallbackCode: string
): Promise<string> {
  if (!selectedCode || selectedCode === OTHER_CODE) {
    return getDefaultCode(componentType, applicableServiceType, fallbackCode);
  }
  return selectedCode;
}

/** Per-item margin override (RawVendorCost.marginPercentOverride,
 *  admin-editable via /admin/pricing) takes precedence over the sector
 *  default when present. Shared by calculateSystemPricing (the instant
 *  estimate) and calculateAdminBoqPricing (the Checker's exact BOQ) so
 *  the two engines can never apply margin differently for the same
 *  material — see the 2026-08-16 alignment fix in project memory. */
function effectiveMarginPercent(
  row: { marginPercentOverride: { toNumber(): number } | null } | null,
  sectorDefaultMarginPercent: number
): number {
  const override = row?.marginPercentOverride;
  if (override == null) return sectorDefaultMarginPercent;
  const pct = override.toNumber();
  if (pct < 0 || pct >= 100) {
    throw new PricingConfigurationError(`A material's margin override (${pct}%) is out of range.`);
  }
  return pct;
}

/** Gross-margin markup: price = cost / (1 - margin%). Shared by both
 *  pricing engines — see effectiveMarginPercent's doc comment. */
function markUp(rawPKR: number, marginPercent: number): number {
  return rawPKR / (1 - marginPercent / 100);
}

/**
 * Prices a system for the INSTANT / automated-estimate stage — either the
 * Recommended default bundle (`selections` omitted) or an itemized
 * Custom Equipment Builder selection, on the SAME pricing engine so the
 * two paths can never drift apart in how a price is computed.
 *
 * Cost basis = Σ(component PKR/watt × systemKw × 1000) for panel,
 * inverter, DC cable, AC cable, breakers, structure, and installation,
 * PLUS battery (PKR/kWh × chosen capacity, HYBRID_BATTERY only) — marked
 * up to the sector's target gross margin: price = cost / (1 - margin%).
 * This is still a blended, pre-survey estimate for cable/breakers (exact
 * meters aren't known until the Field Engineer's site survey — see
 * BoqItem) — brand selection changes the PKR/watt rate used, not the
 * pricing MODEL itself.
 *
 * NOTE: `calculateAdminBoqPricing()` below (the Checker's exact-BOQ
 * pricing after a site survey) does NOT yet know about BREAKERS or this
 * dynamic structure/installation split — same category of gap as the
 * pre-existing "Checker doesn't know about ServiceType/battery" one,
 * tracked in project memory, not covered by this change.
 *
 * SECURITY: this is the only function (besides calculateAdminBoqPricing)
 * allowed to read raw_vendor_costs / margin_rules. It returns ONLY the
 * resulting sell price and a boolean — callers never see underlying
 * costs, margin %, or which specific vendor rate was used.
 */
export async function calculateSystemPricing(
  systemKw: number,
  sector: Sector,
  serviceType: ServiceType,
  selections?: EquipmentSelections
): Promise<SystemPricingResult> {
  const now = new Date();
  const watts = systemKw * 1000;
  const needsBattery = serviceType === "HYBRID_BATTERY";
  // See NONE_CODE's doc comment — an explicit customer opt-out, distinct
  // from "no preference." Forces batteryCode/batteryCapacityKwh to the
  // same null/0 shape ONGRID_ZERO_EXPORT already produces below, so every
  // downstream `needsBattery && batteryCode`/`needsBattery && battery`
  // check already skips battery correctly with no further branching.
  const batteryOptedOut = needsBattery && selections?.batteryCode === NONE_CODE;

  let hasCustomRequirements = false;
  /** "OTHER" -> flag it and fall back to the Recommended default for
   *  that slot (used as a placeholder cost); an explicit code passes
   *  through; omitted also falls back to the default. Takes an
   *  ALREADY-RESOLVED default code (see getDefaultCode below) rather
   *  than looking it up itself, so the DB lookup can run in parallel
   *  with everything else instead of blocking this per-field logic. */
  function resolveSelection(code: string | undefined, defaultCode: string): string {
    if (code === OTHER_CODE) {
      hasCustomRequirements = true;
      return defaultCode;
    }
    return code ?? defaultCode;
  }

  const activeFilter = (componentType: ComponentType, unit: CostUnit, itemName: string) => ({
    componentType,
    unit,
    itemName,
    isActive: true,
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
  });

  // Recommended-path defaults are admin-editable (EquipmentOption.isDefault,
  // see /admin/pricing) — looked up per component slot, falling back to the
  // hardcoded DEFAULT_* constants only if nothing is marked default yet, so
  // pricing never breaks from an empty admin table. AC_CABLE has no
  // EquipmentOption rows of its own (see DEFAULT_CABLE_CODE's doc comment)
  // so it reuses DC_CABLE's resolved default rather than querying separately.
  const [defaultPanelCode, defaultInverterCode, defaultCableCode, defaultBreakersCode, defaultStructureCode, defaultBatteryCode] =
    await Promise.all([
      getDefaultCode("SOLAR_PANEL", null, DEFAULT_PANEL_CODE),
      getDefaultCode("INVERTER", serviceType, DEFAULT_INVERTER_CODE_BY_SERVICE_TYPE[serviceType]),
      getDefaultCode("DC_CABLE", null, DEFAULT_CABLE_CODE),
      getDefaultCode("BREAKERS", null, DEFAULT_BREAKERS_CODE),
      getDefaultCode("MOUNTING_STRUCTURE", null, DEFAULT_STRUCTURE_CODE),
      needsBattery && !batteryOptedOut
        ? getDefaultCode("BATTERY", serviceType, DEFAULT_BATTERY_CODE)
        : Promise.resolve(DEFAULT_BATTERY_CODE),
    ]);

  const panelCode = resolveSelection(selections?.panelCode, defaultPanelCode);
  const inverterCode = resolveSelection(selections?.inverterCode, defaultInverterCode);
  const dcCableCode = resolveSelection(selections?.dcCableCode, defaultCableCode);
  const acCableCode = resolveSelection(selections?.acCableCode, defaultCableCode);
  const breakersCode = resolveSelection(selections?.breakersCode, defaultBreakersCode);
  const structureCode = resolveSelection(selections?.structureCode, defaultStructureCode);
  const batteryCode = needsBattery && !batteryOptedOut ? resolveSelection(selections?.batteryCode, defaultBatteryCode) : null;
  const batteryCapacityKwh =
    needsBattery && !batteryOptedOut ? (selections?.batteryCapacityKwh ?? systemKw * DEFAULT_BATTERY_KWH_PER_SYSTEM_KW) : 0;

  const [panel, inverter, dcCable, acCable, breakers, structure, settings, battery, marginRule, panelOption, inverterOption, batteryOption] =
    await Promise.all([
      adminPrisma.rawVendorCost.findFirst({
        where: activeFilter("SOLAR_PANEL", "PER_WATT", panelCode),
        orderBy: { effectiveFrom: "desc" },
      }),
      adminPrisma.rawVendorCost.findFirst({
        where: activeFilter("INVERTER", "PER_WATT", inverterCode),
        orderBy: { effectiveFrom: "desc" },
      }),
      adminPrisma.rawVendorCost.findFirst({
        where: activeFilter("DC_CABLE", "PER_WATT", dcCableCode),
        orderBy: { effectiveFrom: "desc" },
      }),
      adminPrisma.rawVendorCost.findFirst({
        where: activeFilter("AC_CABLE", "PER_WATT", acCableCode),
        orderBy: { effectiveFrom: "desc" },
      }),
      adminPrisma.rawVendorCost.findFirst({
        where: activeFilter("BREAKERS", "PER_WATT", breakersCode),
        orderBy: { effectiveFrom: "desc" },
      }),
      adminPrisma.rawVendorCost.findFirst({
        where: activeFilter("MOUNTING_STRUCTURE", "PER_WATT", structureCode),
        orderBy: { effectiveFrom: "desc" },
      }),
      // Installation/labor: sector-specific rate, no brand selection — see
      // GlobalPricingSettings/installationRateForSector. Never "missing"
      // (getGlobalPricingSettings falls back to a hardcoded default), so
      // this isn't part of the missing[] check below the way the other
      // RawVendorCost lookups are.
      getGlobalPricingSettings(),
      needsBattery && batteryCode
        ? adminPrisma.rawVendorCost.findFirst({
            where: activeFilter("BATTERY", "PER_KWH", batteryCode),
            orderBy: { effectiveFrom: "desc" },
          })
        : null,
      // System-level default margin for this sector (componentType: null).
      adminPrisma.marginRule.findFirst({
        where: {
          sector,
          componentType: null,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
      }),
      // EquipmentOption lookups for resolvedEquipment below — cost-free
      // catalog metadata (brand/label/specValue), NOT pricing, so a miss
      // here degrades to a bare code string rather than failing the
      // whole quote (see the ?? fallbacks after this Promise.all).
      adminPrisma.equipmentOption.findFirst({ where: { componentType: "SOLAR_PANEL", code: panelCode } }),
      adminPrisma.equipmentOption.findFirst({ where: { componentType: "INVERTER", code: inverterCode } }),
      needsBattery && batteryCode
        ? adminPrisma.equipmentOption.findFirst({ where: { componentType: "BATTERY", code: batteryCode } })
        : null,
    ]);

  const missing = [
    !panel && "raw_vendor_costs(SOLAR_PANEL)",
    !inverter && "raw_vendor_costs(INVERTER)",
    !dcCable && "raw_vendor_costs(DC_CABLE)",
    !acCable && "raw_vendor_costs(AC_CABLE)",
    !breakers && "raw_vendor_costs(BREAKERS)",
    !structure && `raw_vendor_costs(MOUNTING_STRUCTURE, itemName="${structureCode}")`,
    needsBattery && !batteryOptedOut && !battery && "raw_vendor_costs(BATTERY)",
    !marginRule && "margin_rules(default)",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new PricingConfigurationError(
      `Cannot price sector=${sector}, serviceType=${serviceType}, systemKw=${systemKw}: missing active ${missing.join(", ")}.`
    );
  }

  const sectorDefaultMarginPercent = marginRule!.targetMarginPercent.toNumber();
  if (sectorDefaultMarginPercent < 0 || sectorDefaultMarginPercent >= 100) {
    throw new PricingConfigurationError(
      `Configured default margin (${sectorDefaultMarginPercent}%) for sector=${sector} is out of range.`
    );
  }

  const rawPanelPKR = panel!.unitCostRs.toNumber() * watts;
  const rawInverterPKR = inverter!.unitCostRs.toNumber() * watts;
  const rawDcCablePKR = dcCable!.unitCostRs.toNumber() * watts;
  const rawAcCablePKR = acCable!.unitCostRs.toNumber() * watts;
  const rawBreakersPKR = breakers!.unitCostRs.toNumber() * watts;
  const rawStructurePKR = structure!.unitCostRs.toNumber() * watts;
  const rawInstallationPKR = installationRateForSector(settings, sector) * watts;
  const rawBatteryPKR = needsBattery && battery ? battery.unitCostRs.toNumber() * batteryCapacityKwh : 0;

  // Gross-margin convention: margin% = (price - cost) / price
  //                       => price = cost / (1 - margin%)
  // Applied per LINE using that specific item's own margin override if
  // it has one (RawVendorCost.marginPercentOverride, admin-editable),
  // else the sector default — not one blended multiplier for the whole
  // system — so a per-item margin change in /admin/pricing actually
  // changes what a customer is quoted for that component.
  const breakdown: ItemizedBreakdown = {
    panelsPKR: Math.round(markUp(rawPanelPKR, effectiveMarginPercent(panel!, sectorDefaultMarginPercent))),
    inverterPKR: Math.round(markUp(rawInverterPKR, effectiveMarginPercent(inverter!, sectorDefaultMarginPercent))),
    batteryPKR:
      needsBattery && battery ? Math.round(markUp(rawBatteryPKR, effectiveMarginPercent(battery, sectorDefaultMarginPercent))) : 0,
    cablingAndProtectionPKR: Math.round(
      markUp(rawDcCablePKR, effectiveMarginPercent(dcCable!, sectorDefaultMarginPercent)) +
        markUp(rawAcCablePKR, effectiveMarginPercent(acCable!, sectorDefaultMarginPercent)) +
        markUp(rawBreakersPKR, effectiveMarginPercent(breakers!, sectorDefaultMarginPercent))
    ),
    structurePKR: Math.round(markUp(rawStructurePKR, effectiveMarginPercent(structure!, sectorDefaultMarginPercent))),
    // Installation is a flat admin-set sector rate now, not a RawVendorCost
    // row — no per-item override concept, so just the sector default margin.
    installationPKR: Math.round(markUp(rawInstallationPKR, sectorDefaultMarginPercent)),
  };

  // Total is the SUM of the (already-rounded) breakdown lines, not a
  // separately-rounded figure — guarantees the itemized BOQ always adds
  // up to exactly the headline price shown next to it, never off by a
  // rupee or two from independent rounding.
  const totalClientPricePKR =
    breakdown.panelsPKR +
    breakdown.inverterPKR +
    breakdown.batteryPKR +
    breakdown.cablingAndProtectionPKR +
    breakdown.structurePKR +
    breakdown.installationPKR;

  const resolvedEquipment: ResolvedEquipment = {
    panel: {
      code: panelCode,
      brand: panelOption?.brand ?? null,
      label: panelOption?.label ?? panelCode,
      specValue: panelOption?.specValue?.toNumber() ?? null,
    },
    inverter: {
      code: inverterCode,
      brand: inverterOption?.brand ?? null,
      label: inverterOption?.label ?? inverterCode,
      specValue: inverterOption?.specValue?.toNumber() ?? null,
    },
    battery:
      needsBattery && batteryCode
        ? {
            code: batteryCode,
            brand: batteryOption?.brand ?? null,
            label: batteryOption?.label ?? batteryCode,
            specValue: batteryOption?.specValue?.toNumber() ?? null,
            capacityKwh: batteryCapacityKwh,
          }
        : null,
  };

  return { totalClientPricePKR, hasCustomRequirements, breakdown, resolvedEquipment };
}

// ============================================================================
// Checker / Super Admin — exact BOQ pricing (CONFIDENTIAL, admin-only)
// ============================================================================

export interface AdminBoqPricingInput {
  systemKw: number;
  sector: Sector;
  /** Determines whether a BATTERY line is priced at all, and which
   *  INVERTER/BATTERY default applies when the customer didn't pick a
   *  specific one — same role as in calculateSystemPricing. */
  serviceType: ServiceType;
  dcCableMeters: number;
  acCableMeters: number;
  dataCableMeters: number;
  /** "STANDARD_L1_L2" | "CUSTOM_ELEVATED" — must exactly match a
   *  RawVendorCost.itemName for componentType=MOUNTING_STRUCTURE. Sourced
   *  from the Field Engineer's on-site choice (SiteSurvey.structureChoice),
   *  NOT the customer's pre-survey equipmentSelections — the physical site
   *  can require a different structure than what was estimated. */
  structureChoice: string;
  requiresDbUpgrade: boolean;
  /** The customer's original equipment picks (Quote.equipmentSelections)
   *  — resolved the SAME way the instant estimate did (isDefault lookup
   *  for anything unset or "OTHER", see resolveEquipmentCode), so the
   *  Checker's binding contract prices the equipment actually promised
   *  pre-survey, not an arbitrary "most recently created" catalog row.
   *  Cables are the one exception: DC_CABLE/AC_CABLE here price by
   *  Field-Engineer-measured meters against a single fixed-vendor
   *  per-meter rate (a different pricing basis than the customer's
   *  brand pick, which is PER_WATT/blended) — so equipmentSelections'
   *  cable codes aren't consulted, only whatever per-item margin
   *  override exists on those specific per-meter rows. Undefined/null
   *  is treated as "Recommended path" — every slot resolves to its
   *  admin-configured default. */
  equipmentSelections?: EquipmentSelections | null;
  /** The Checker's confirmed final capacity (Quote.finalBatteryCapacityKwh),
   *  edited/verified in /admin/checker before approval — takes precedence
   *  over equipmentSelections.batteryCapacityKwh when provided. Ignored
   *  for ONGRID_ZERO_EXPORT (no battery line at all regardless). Null/
   *  undefined falls back to the pre-survey estimate, same as before this
   *  field existed. */
  finalBatteryCapacityKwh?: number | null;
}

interface AdminBoqPricingBreakdown {
  panelPKR: number;
  inverterPKR: number;
  /** 0 for ONGRID_ZERO_EXPORT systems. */
  batteryPKR: number;
  breakersPKR: number;
  structurePKR: number;
  installationPKR: number;
  dcCablePKR: number;
  acCablePKR: number;
  dataCablePKR: number;
  dbUpgradePKR: number;
}

export interface AdminBoqPricingResult {
  /** CONFIDENTIAL. Only ever return this from an admin-guarded route
   *  (see lib/auth/internal-guard.ts) — never from anything reachable
   *  by Client/Field Engineer traffic. */
  exactRawCostPKR: number;
  exactClientPricePKR: number;
  profitPKR: number;
  profitPercent: number;
  /** RAW (pre-margin) cost per line — for Checker cost auditing only,
   *  never customer-facing. */
  breakdown: AdminBoqPricingBreakdown;
  /** Same lines, each individually marked up (own margin override or
   *  sector default) — client-safe, sums to exactClientPricePKR. Use
   *  THIS for anything customer-facing (WhatsApp contract, PDF), never
   *  `breakdown`. */
  markedUpBreakdown: AdminBoqPricingBreakdown;
  /** The battery capacity actually priced — null for ONGRID_ZERO_EXPORT
   *  and for a HYBRID_BATTERY quote where the customer picked NONE_CODE
   *  (opted out), otherwise `finalBatteryCapacityKwh` if provided, else
   *  the pre-survey estimate. Lets callers (the Checker UI) know what to
   *  pre-populate an editable field with — and whether to show it at
   *  all — without re-deriving the same fallback logic. */
  batteryCapacityKwh: number | null;
}

/**
 * Prices the EXACT system using the Field Engineer's measured BOQ
 * (site_surveys), for the Checker's approval review. Unlike
 * `calculateSystemPricing` above, this DELIBERATELY returns raw cost and
 * profit figures — that's the whole point of the Checker stage (Business
 * Rule #3: "verifies profit margins"). The safety boundary here is which
 * ROUTE is allowed to call this function and forward its result, not
 * what the function itself withholds. Only `/api/admin/checker/*` (guarded
 * by `assertInternalAccess(req, "ADMIN")`) may call this.
 */
export async function calculateAdminBoqPricing(input: AdminBoqPricingInput): Promise<AdminBoqPricingResult> {
  const now = new Date();
  const { systemKw, sector, serviceType, dcCableMeters, acCableMeters, dataCableMeters, structureChoice, requiresDbUpgrade } =
    input;
  const needsBattery = serviceType === "HYBRID_BATTERY";
  const selections = input.equipmentSelections ?? undefined;
  // Same reserved opt-out value calculateSystemPricing honors above (see
  // NONE_CODE's doc comment) — the Checker's exact BOQ must respect the
  // customer's original "no battery" pick, not silently reintroduce one.
  const batteryOptedOut = needsBattery && selections?.batteryCode === NONE_CODE;
  // Checker's confirmed capacity wins over the pre-survey estimate when
  // provided — see AdminBoqPricingInput.finalBatteryCapacityKwh's doc comment.
  const hasFinalCapacity = needsBattery && !batteryOptedOut && input.finalBatteryCapacityKwh != null;

  // Resolve the ACTUAL equipment codes the customer's original quote
  // selected (falling back to the admin-configured default for anything
  // unset or "OTHER") — Panel/Inverter/Breakers/Battery all price by
  // whichever specific catalog row this resolves to, not an arbitrary
  // "most recently created" row for the componentType. Structure is
  // deliberately NOT resolved this way — see AdminBoqPricingInput's doc
  // comment on structureChoice. DC_CABLE/AC_CABLE/CT_COIL/DB_UPGRADE are
  // exact-measurement, single-fixed-vendor items with no brand selection
  // at this stage, so there's no code to resolve for them either.
  const [panelCode, inverterCode, breakersCode, batteryCode] = await Promise.all([
    resolveEquipmentCode("SOLAR_PANEL", null, selections?.panelCode, DEFAULT_PANEL_CODE),
    resolveEquipmentCode("INVERTER", serviceType, selections?.inverterCode, DEFAULT_INVERTER_CODE_BY_SERVICE_TYPE[serviceType]),
    resolveEquipmentCode("BREAKERS", null, selections?.breakersCode, DEFAULT_BREAKERS_CODE),
    needsBattery && !batteryOptedOut
      ? resolveEquipmentCode("BATTERY", serviceType, selections?.batteryCode, DEFAULT_BATTERY_CODE)
      : Promise.resolve(null),
  ]);
  const batteryCapacityKwh =
    needsBattery && !batteryOptedOut
      ? hasFinalCapacity
        ? input.finalBatteryCapacityKwh!
        : (selections?.batteryCapacityKwh ?? systemKw * DEFAULT_BATTERY_KWH_PER_SYSTEM_KW)
      : 0;
  if (needsBattery && !batteryOptedOut && (!Number.isFinite(batteryCapacityKwh) || batteryCapacityKwh <= 0)) {
    throw new PricingConfigurationError(`Invalid battery capacity (${batteryCapacityKwh} kWh) for sector=${sector}.`);
  }

  const activeCostFilter = (componentType: ComponentType, itemName?: string) => ({
    componentType,
    ...(itemName !== undefined && { itemName }),
    isActive: true,
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
  });

  const [panel, inverter, breakers, battery, structure, settings, dcCable, acCable, dataCable, dbUpgrade, marginRule] =
    await Promise.all([
      adminPrisma.rawVendorCost.findFirst({ where: activeCostFilter("SOLAR_PANEL", panelCode), orderBy: { effectiveFrom: "desc" } }),
      adminPrisma.rawVendorCost.findFirst({ where: activeCostFilter("INVERTER", inverterCode), orderBy: { effectiveFrom: "desc" } }),
      adminPrisma.rawVendorCost.findFirst({ where: activeCostFilter("BREAKERS", breakersCode), orderBy: { effectiveFrom: "desc" } }),
      needsBattery && batteryCode
        ? adminPrisma.rawVendorCost.findFirst({ where: activeCostFilter("BATTERY", batteryCode), orderBy: { effectiveFrom: "desc" } })
        : null,
      adminPrisma.rawVendorCost.findFirst({
        where: activeCostFilter("MOUNTING_STRUCTURE", structureChoice),
        orderBy: { effectiveFrom: "desc" },
      }),
      // Installation/labor — sector-specific rate, same source
      // (GlobalPricingSettings) and same installationRateForSector() the
      // instant estimate uses, so the two can never disagree.
      getGlobalPricingSettings(),
      // DC/AC cable, comms wiring, and DB upgrade have no brand selection
      // at this stage — one fixed vendor, exact-measured meters — so no
      // itemName filter, same as before this pass.
      adminPrisma.rawVendorCost.findFirst({ where: activeCostFilter("DC_CABLE"), orderBy: { effectiveFrom: "desc" } }),
      adminPrisma.rawVendorCost.findFirst({ where: activeCostFilter("AC_CABLE"), orderBy: { effectiveFrom: "desc" } }),
      adminPrisma.rawVendorCost.findFirst({ where: activeCostFilter("CT_COIL"), orderBy: { effectiveFrom: "desc" } }),
      requiresDbUpgrade
        ? adminPrisma.rawVendorCost.findFirst({ where: activeCostFilter("DB_UPGRADE"), orderBy: { effectiveFrom: "desc" } })
        : null,
      adminPrisma.marginRule.findFirst({
      where: {
        sector,
        componentType: null,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: "desc" },
    }),
  ]);

  const missing = [
    !panel && `raw_vendor_costs(SOLAR_PANEL, itemName="${panelCode}")`,
    !inverter && `raw_vendor_costs(INVERTER, itemName="${inverterCode}")`,
    !breakers && `raw_vendor_costs(BREAKERS, itemName="${breakersCode}")`,
    needsBattery && !batteryOptedOut && !battery && `raw_vendor_costs(BATTERY, itemName="${batteryCode}")`,
    !structure && `raw_vendor_costs(MOUNTING_STRUCTURE, itemName="${structureChoice}")`,
    !dcCable && "raw_vendor_costs(DC_CABLE)",
    !acCable && "raw_vendor_costs(AC_CABLE)",
    !dataCable && "raw_vendor_costs(CT_COIL)",
    requiresDbUpgrade && !dbUpgrade && "raw_vendor_costs(DB_UPGRADE)",
    !marginRule && "margin_rules(default)",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new PricingConfigurationError(
      `Cannot price exact BOQ for sector=${sector}, systemKw=${systemKw}: missing active ${missing.join(", ")}.`
    );
  }
  // `missing` guarantees these are non-null past this point (dbUpgrade is
  // only required/checked when requiresDbUpgrade is true; battery only
  // when needsBattery is true).
  const p = panel!;
  const inv = inverter!;
  const brk = breakers!;
  const struct = structure!;
  const dc = dcCable!;
  const ac = acCable!;
  const data = dataCable!;

  const sectorDefaultMarginPercent = marginRule!.targetMarginPercent.toNumber();
  if (sectorDefaultMarginPercent < 0 || sectorDefaultMarginPercent >= 100) {
    throw new PricingConfigurationError(
      `Configured default margin (${sectorDefaultMarginPercent}%) for sector=${sector} is out of range.`
    );
  }

  const watts = systemKw * 1000;
  // RAW (pre-margin) costs — this breakdown stays the true underlying
  // cost, unaffected by margin, same as before this pass: it's what the
  // Checker uses to audit true spend vs. price (Business Rule #3), not
  // what a customer is quoted. See markedUpBreakdown below for that.
  const breakdown: AdminBoqPricingBreakdown = {
    panelPKR: round2(p.unitCostRs.toNumber() * watts),
    inverterPKR: round2(inv.unitCostRs.toNumber() * watts),
    batteryPKR: needsBattery && battery ? round2(battery.unitCostRs.toNumber() * batteryCapacityKwh) : 0,
    breakersPKR: round2(brk.unitCostRs.toNumber() * watts),
    structurePKR: round2(struct.unitCostRs.toNumber() * watts),
    installationPKR: round2(installationRateForSector(settings, sector) * watts),
    dcCablePKR: round2(dc.unitCostRs.toNumber() * dcCableMeters),
    acCablePKR: round2(ac.unitCostRs.toNumber() * acCableMeters),
    dataCablePKR: round2(data.unitCostRs.toNumber() * dataCableMeters),
    dbUpgradePKR: requiresDbUpgrade && dbUpgrade ? round2(dbUpgrade.unitCostRs.toNumber()) : 0,
  };

  const exactRawCostPKR = round2(Object.values(breakdown).reduce((sum, n) => sum + n, 0));

  // Each line's OWN marked-up price — using that specific material's
  // margin override if /admin/pricing has one configured, else the
  // sector default — not one blended multiplier off exactRawCostPKR.
  // This (not `breakdown`) is what actually goes to WhatsApp/PDF dispatch
  // and Quote.finalPriceRs, so it must reflect the exact same per-item
  // margins the instant estimate (calculateSystemPricing) used.
  const markedUpBreakdown: AdminBoqPricingBreakdown = {
    panelPKR: round2(markUp(breakdown.panelPKR, effectiveMarginPercent(p, sectorDefaultMarginPercent))),
    inverterPKR: round2(markUp(breakdown.inverterPKR, effectiveMarginPercent(inv, sectorDefaultMarginPercent))),
    batteryPKR:
      needsBattery && battery ? round2(markUp(breakdown.batteryPKR, effectiveMarginPercent(battery, sectorDefaultMarginPercent))) : 0,
    breakersPKR: round2(markUp(breakdown.breakersPKR, effectiveMarginPercent(brk, sectorDefaultMarginPercent))),
    structurePKR: round2(markUp(breakdown.structurePKR, effectiveMarginPercent(struct, sectorDefaultMarginPercent))),
    // Installation is a flat admin-set sector rate now, not a
    // RawVendorCost row — no per-item override concept, so just the
    // sector default margin (same as calculateSystemPricing).
    installationPKR: round2(markUp(breakdown.installationPKR, sectorDefaultMarginPercent)),
    dcCablePKR: round2(markUp(breakdown.dcCablePKR, effectiveMarginPercent(dc, sectorDefaultMarginPercent))),
    acCablePKR: round2(markUp(breakdown.acCablePKR, effectiveMarginPercent(ac, sectorDefaultMarginPercent))),
    dataCablePKR: round2(markUp(breakdown.dataCablePKR, effectiveMarginPercent(data, sectorDefaultMarginPercent))),
    dbUpgradePKR:
      requiresDbUpgrade && dbUpgrade ? round2(markUp(breakdown.dbUpgradePKR, effectiveMarginPercent(dbUpgrade, sectorDefaultMarginPercent))) : 0,
  };

  const exactClientPricePKR = Math.round(Object.values(markedUpBreakdown).reduce((sum, n) => sum + n, 0));
  const profitPKR = Math.round(exactClientPricePKR - exactRawCostPKR);
  const profitPercent = Math.round((profitPKR / exactClientPricePKR) * 1000) / 10; // 1 decimal place

  return {
    exactRawCostPKR: Math.round(exactRawCostPKR),
    exactClientPricePKR,
    profitPKR,
    profitPercent,
    breakdown,
    markedUpBreakdown,
    batteryCapacityKwh: needsBattery && !batteryOptedOut ? batteryCapacityKwh : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// Material Catalog & Global Pricing Rules — /admin/pricing (CONFIDENTIAL)
// ============================================================================
// Management surface over the SAME EquipmentOption (public, cost-free
// catalog) + RawVendorCost/MarginRule (vendor_private, confidential)
// tables calculateSystemPricing() already reads — deliberately not a
// separate MaterialCatalog/GlobalPricingRule schema, so there is exactly
// one source of truth for pricing data. Only reachable via
// /api/admin/pricing/*, itself gated by assertInternalAccess(req, "ADMIN").
//
// Sectors are omitted from the two rate constants below (structure,
// installation) — those RawVendorCost rows aren't sector-scoped, unlike
// margin. MarginRule IS per-sector (Residential/Commercial/Industrial
// each keep their own default), so `sectorMargins` stays a 3-entry
// record rather than collapsing to one number — see the 2026-08-16
// architecture discussion in project memory for why a single "Default
// Margin" figure would either silently overwrite differentiated margins
// or be meaningless.

/** One row of a material's "Comparison Specifications" — freeform,
 *  admin-entered key/value pairs (e.g. {key: "Efficiency", value:
 *  "22.5%"}), stored as an ordered array in EquipmentOption.specs. */
export interface SpecEntry {
  key: string;
  value: string;
}

/** Safely narrows EquipmentOption.specs (a Prisma `Json?` column) back to
 *  `SpecEntry[]` — mirrors parseEquipmentSelections' shape-check-not-
 *  validation approach. Drops any malformed entries rather than
 *  discarding the whole array, and returns null (not []) for
 *  empty/absent specs so callers can treat "no specs" uniformly. */
function parseSpecs(json: unknown): SpecEntry[] | null {
  if (!Array.isArray(json)) return null;
  const entries = json.filter(
    (entry): entry is SpecEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).key === "string" &&
      typeof (entry as Record<string, unknown>).value === "string"
  );
  return entries.length > 0 ? entries : null;
}

export interface MaterialCatalogItem {
  /** EquipmentOption.id — the stable identifier every /admin/pricing
   *  mutation (PUT/DELETE) is keyed by. */
  id: string;
  componentType: ComponentType;
  code: string;
  label: string;
  brand: string | null;
  specValue: number | null;
  applicableServiceType: ServiceType | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  vendorCostId: string | null;
  vendorName: string | null;
  unitCostRs: number | null;
  unit: CostUnit | null;
  marginPercentOverride: number | null;
  /** Preview only, using Residential's default margin when this item has
   *  no override — materials aren't sector-scoped (a panel isn't
   *  Residential-only), so there's no single "correct" sector to preview
   *  with. The actual quote a customer sees resolves the sector-
   *  appropriate margin at calculation time regardless; this is purely
   *  for the admin table's "Customer Price" column. Null if there's no
   *  cost row yet (shouldn't normally happen for a non-placeholder item). */
  customerPricePreviewPKR: number | null;
  /** Google Drive direct-view links — see formatGoogleDriveLink's doc
   *  comment for the normalized shape these are always stored in. */
  logoUrl: string | null;
  brochureUrl: string | null;
  /** Ordered key/value comparison specs — see SpecEntry. Null if none
   *  have been entered yet. */
  specs: SpecEntry[] | null;
}

export interface GlobalPricingRules {
  structureCostPerWatt: number;
  /** Replaced the old single flat `installationCostPerWatt` — installation
   *  now varies by sector, see GlobalPricingSettings in schema.prisma and
   *  installationRateForSector() below. */
  installationCostPerWattResidential: number;
  installationCostPerWattCommercial: number;
  installationCostPerWattIndustrial: number;
  evChargerInstallationFee: number;
  washingCostPerPanel: number;
  sectorMargins: Record<Sector, number>;
}

export interface GlobalPricingSettingsDTO {
  installationCostPerWattResidential: number;
  installationCostPerWattCommercial: number;
  installationCostPerWattIndustrial: number;
  evChargerInstallationFee: number;
  washingCostPerPanel: number;
}

// Matches the seed migration's own values — pricing (and the admin UI)
// never breaks from an empty/missing settings row, same "hardcoded
// fallback" convention as getDefaultCode's DEFAULT_* constants elsewhere
// in this file.
const FALLBACK_GLOBAL_PRICING_SETTINGS: GlobalPricingSettingsDTO = {
  installationCostPerWattResidential: 12,
  installationCostPerWattCommercial: 12,
  installationCostPerWattIndustrial: 12,
  evChargerInstallationFee: 25000,
  washingCostPerPanel: 500,
};

/** The one GlobalPricingSettings row — see its doc comment in
 *  schema.prisma for why this is a plain singleton rather than another
 *  effective-dated RawVendorCost-style table. Exported so the `/rules`
 *  route can read current values without duplicating this fallback logic. */
export async function getGlobalPricingSettings(): Promise<GlobalPricingSettingsDTO> {
  const row = await adminPrisma.globalPricingSettings.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!row) return FALLBACK_GLOBAL_PRICING_SETTINGS;
  return {
    installationCostPerWattResidential: row.installationCostPerWattResidential.toNumber(),
    installationCostPerWattCommercial: row.installationCostPerWattCommercial.toNumber(),
    installationCostPerWattIndustrial: row.installationCostPerWattIndustrial.toNumber(),
    evChargerInstallationFee: row.evChargerInstallationFee.toNumber(),
    washingCostPerPanel: row.washingCostPerPanel.toNumber(),
  };
}

/** Picks the sector-appropriate installation PKR/W rate — the whole
 *  point of this feature: installation is no longer one flat number
 *  regardless of sector. Used by both calculateSystemPricing (instant
 *  estimate) and calculateAdminBoqPricing (Checker exact-BOQ), so the
 *  two can never disagree on which rate applies. */
function installationRateForSector(settings: GlobalPricingSettingsDTO, sector: Sector): number {
  if (sector === "RESIDENTIAL") return settings.installationCostPerWattResidential;
  if (sector === "COMMERCIAL") return settings.installationCostPerWattCommercial;
  return settings.installationCostPerWattIndustrial;
}

export interface PanelWashingQuote {
  panelCount: number;
  rawCostPKR: number;
  clientPricePKR: number;
}

/** Standalone add-on pricing — Panel Washing has no BOQ/system sizing of
 *  its own, just panelCount × the admin-set per-panel rate, marked up by
 *  the sector's default margin (a flat admin rate, not a per-item
 *  RawVendorCost row, so there's no per-item override to apply here).
 *  NOT wired into a customer-facing submission flow yet — the System
 *  Upgrades inquiry in app/page.tsx has no panel-count input to call
 *  this with today; exported so that wiring is a small follow-up rather
 *  than a rebuild of this calculation. */
export async function calculatePanelWashingQuote(panelCount: number, sector: Sector): Promise<PanelWashingQuote> {
  if (!Number.isFinite(panelCount) || panelCount <= 0) {
    throw new PricingConfigurationError(`Invalid panel count (${panelCount}) for a washing quote.`);
  }
  const [settings, sectorMargins] = await Promise.all([getGlobalPricingSettings(), getSectorDefaultMargins(new Date())]);
  const marginPercent = sectorMargins.get(sector) ?? 15;
  const rawCostPKR = round2(panelCount * settings.washingCostPerPanel);
  const clientPricePKR = Math.round(markUp(rawCostPKR, marginPercent));
  return { panelCount, rawCostPKR, clientPricePKR };
}

/** EV Charger installation is a flat admin-set fee, no BOQ to size — same
 *  "not yet wired into a customer flow" note as calculatePanelWashingQuote. */
export async function getEvChargerInstallationFeePKR(): Promise<number> {
  const settings = await getGlobalPricingSettings();
  return settings.evChargerInstallationFee;
}

/**
 * Marked-up, client-safe per-unit price (PKR/W for PER_WATT items, PKR/kWh
 * for PER_KWH items — i.e. exactly the unit each EquipmentOption's own
 * RawVendorCost row uses) for every active, real (non-"Other") catalog
 * item, at the given sector's margin. Powers the Custom Equipment
 * Builder's per-pill price/delta display (GET /api/equipment-options) —
 * NEVER returns raw cost or margin % itself, same sanitized-output
 * boundary as calculateSystemPricing/effectiveMarginPercent/markUp.
 * Keyed by EquipmentOption.code; an item with no matching active
 * RawVendorCost row (a data-entry gap, not expected in practice) is
 * simply omitted rather than thrown — this is a display nicety, not the
 * authoritative price, so it should degrade quietly rather than take the
 * whole equipment catalog down.
 */
export async function getPublicUnitPricesPKR(sector: Sector): Promise<Record<string, number>> {
  const now = new Date();
  const [options, costs, sectorMargins] = await Promise.all([
    adminPrisma.equipmentOption.findMany({ where: { isActive: true, isOtherOption: false } }),
    adminPrisma.rawVendorCost.findMany({ where: activeAsOf(now), orderBy: { effectiveFrom: "desc" } }),
    getSectorDefaultMargins(now),
  ]);
  // Matches calculatePanelWashingQuote's own fallback precedent — falls
  // back to the seeded Residential default (22%) rather than 0%, so a
  // momentarily-missing margin row shows a plausible price instead of
  // "price equals cost."
  const sectorDefaultMarginPercent = sectorMargins.get(sector) ?? 22;

  // Most-recent active cost row per (componentType, itemName) — `costs`
  // is already ordered effectiveFrom desc, so the first hit per key wins.
  const costByKey = new Map<string, (typeof costs)[number]>();
  for (const cost of costs) {
    const key = `${cost.componentType}::${cost.itemName}`;
    if (!costByKey.has(key)) costByKey.set(key, cost);
  }

  const prices: Record<string, number> = {};
  for (const option of options) {
    const cost = costByKey.get(`${option.componentType}::${option.code}`);
    if (!cost) continue;
    prices[option.code] = round2(markUp(cost.unitCostRs.toNumber(), effectiveMarginPercent(cost, sectorDefaultMarginPercent)));
  }
  return prices;
}

export interface MaterialCatalogResponse {
  items: MaterialCatalogItem[];
  globalRules: GlobalPricingRules;
}

const ALL_SECTORS: Sector[] = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL"];

function activeAsOf(now: Date) {
  return { isActive: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] };
}

/** Fetches every active sector-default MarginRule (componentType: null),
 *  most-recent per sector, as a Sector -> percent map. Shared by
 *  listMaterialCatalog and updateGlobalPricingRule so the two can't drift
 *  on how "current" margin is determined. */
async function getSectorDefaultMargins(now: Date): Promise<Map<Sector, number>> {
  const rows = await adminPrisma.marginRule.findMany({
    where: { componentType: null, ...activeAsOf(now) },
    orderBy: { effectiveFrom: "desc" },
  });
  const map = new Map<Sector, number>();
  for (const row of rows) {
    if (!map.has(row.sector)) map.set(row.sector, row.targetMarginPercent.toNumber());
  }
  return map;
}

/**
 * Everything /admin/pricing needs in one call: every material (grouped
 * client-side by componentType — the API returns a flat, sorted list),
 * joined with its current vendor cost, plus the two global base rates
 * and all three sectors' default margins. "Other / Specific Requirement"
 * placeholder rows are excluded — they're a customer-facing UI
 * construct (see EquipmentOption.isOtherOption's doc comment), not a
 * manageable material.
 */
export async function listMaterialCatalog(): Promise<MaterialCatalogResponse> {
  const now = new Date();

  const [options, costs, sectorMargins, settings] = await Promise.all([
    adminPrisma.equipmentOption.findMany({
      where: { isOtherOption: false },
      orderBy: [{ componentType: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    }),
    adminPrisma.rawVendorCost.findMany({ where: activeAsOf(now), orderBy: { effectiveFrom: "desc" } }),
    getSectorDefaultMargins(now),
    getGlobalPricingSettings(),
  ]);

  // Most-recent active cost row per (componentType, itemName) — `costs`
  // is already ordered effectiveFrom desc, so the first hit per key wins.
  const costByKey = new Map<string, (typeof costs)[number]>();
  for (const cost of costs) {
    const key = `${cost.componentType}::${cost.itemName}`;
    if (!costByKey.has(key)) costByKey.set(key, cost);
  }

  const residentialMargin = sectorMargins.get("RESIDENTIAL") ?? null;

  const items: MaterialCatalogItem[] = options.map((opt) => {
    const cost = costByKey.get(`${opt.componentType}::${opt.code}`) ?? null;
    const marginPercent = cost?.marginPercentOverride?.toNumber() ?? residentialMargin;
    const unitCostRs = cost?.unitCostRs.toNumber() ?? null;
    const customerPricePreviewPKR =
      unitCostRs !== null && marginPercent !== null && marginPercent < 100
        ? Math.round(unitCostRs / (1 - marginPercent / 100))
        : null;

    return {
      id: opt.id,
      componentType: opt.componentType,
      code: opt.code,
      label: opt.label,
      brand: opt.brand,
      specValue: opt.specValue?.toNumber() ?? null,
      applicableServiceType: opt.applicableServiceType,
      isDefault: opt.isDefault,
      isActive: opt.isActive,
      sortOrder: opt.sortOrder,
      vendorCostId: cost?.id ?? null,
      vendorName: cost?.vendorName ?? null,
      unitCostRs,
      unit: cost?.unit ?? null,
      marginPercentOverride: cost?.marginPercentOverride?.toNumber() ?? null,
      customerPricePreviewPKR,
      logoUrl: opt.logoUrl,
      brochureUrl: opt.brochureUrl,
      specs: parseSpecs(opt.specs),
    };
  });

  const structureCost = costByKey.get(`MOUNTING_STRUCTURE::${DEFAULT_STRUCTURE_CODE}`);

  return {
    items,
    globalRules: {
      structureCostPerWatt: structureCost?.unitCostRs.toNumber() ?? 0,
      installationCostPerWattResidential: settings.installationCostPerWattResidential,
      installationCostPerWattCommercial: settings.installationCostPerWattCommercial,
      installationCostPerWattIndustrial: settings.installationCostPerWattIndustrial,
      evChargerInstallationFee: settings.evChargerInstallationFee,
      washingCostPerPanel: settings.washingCostPerPanel,
      sectorMargins: Object.fromEntries(ALL_SECTORS.map((s) => [s, sectorMargins.get(s) ?? 0])) as Record<Sector, number>,
    },
  };
}

/** Clears any existing default for this exact (componentType,
 *  applicableServiceType) slot before a new one is set — at most one
 *  default per slot. INVERTER/BATTERY have two independent slots
 *  (HYBRID_BATTERY vs ONGRID_ZERO_EXPORT); everything else has one
 *  (applicableServiceType: null). */
async function clearExistingDefault(componentType: ComponentType, applicableServiceType: ServiceType | null): Promise<void> {
  await adminPrisma.equipmentOption.updateMany({
    where: { componentType, applicableServiceType, isDefault: true },
    data: { isDefault: false },
  });
}

async function toMaterialCatalogItem(
  option: {
    id: string;
    componentType: ComponentType;
    code: string;
    label: string;
    brand: string | null;
    specValue: { toNumber(): number } | null;
    applicableServiceType: ServiceType | null;
    isDefault: boolean;
    isActive: boolean;
    sortOrder: number;
    logoUrl: string | null;
    brochureUrl: string | null;
    specs: unknown;
  },
  cost: { id: string; vendorName: string; unitCostRs: { toNumber(): number }; unit: CostUnit; marginPercentOverride: { toNumber(): number } | null } | null
): Promise<MaterialCatalogItem> {
  const sectorMargins = await getSectorDefaultMargins(new Date());
  const residentialMargin = sectorMargins.get("RESIDENTIAL") ?? null;
  const marginPercent = cost?.marginPercentOverride?.toNumber() ?? residentialMargin;
  const unitCostRs = cost?.unitCostRs.toNumber() ?? null;
  const customerPricePreviewPKR =
    unitCostRs !== null && marginPercent !== null && marginPercent < 100
      ? Math.round(unitCostRs / (1 - marginPercent / 100))
      : null;

  return {
    id: option.id,
    componentType: option.componentType,
    code: option.code,
    label: option.label,
    brand: option.brand,
    specValue: option.specValue?.toNumber() ?? null,
    applicableServiceType: option.applicableServiceType,
    isDefault: option.isDefault,
    isActive: option.isActive,
    sortOrder: option.sortOrder,
    vendorCostId: cost?.id ?? null,
    vendorName: cost?.vendorName ?? null,
    unitCostRs,
    unit: cost?.unit ?? null,
    marginPercentOverride: cost?.marginPercentOverride?.toNumber() ?? null,
    customerPricePreviewPKR,
    logoUrl: option.logoUrl,
    brochureUrl: option.brochureUrl,
    specs: parseSpecs(option.specs),
  };
}

export interface CreateMaterialInput {
  componentType: ComponentType;
  /** Stable code/join-key, e.g. "TRINA_VERTEX_620W" — must be unique
   *  within componentType. Uppercase snake_case by convention, not enforced. */
  code: string;
  label: string;
  brand?: string | null;
  specValue?: number | null;
  applicableServiceType?: ServiceType | null;
  unit: CostUnit;
  vendorCostRs: number;
  vendorName?: string | null;
  marginPercentOverride?: number | null;
  isDefault?: boolean;
  /** Google Drive share or direct links — run through
   *  formatGoogleDriveLink() before being stored, regardless of whether
   *  the client already normalized them. */
  logoUrl?: string | null;
  brochureUrl?: string | null;
  specs?: SpecEntry[] | null;
  /** Super Admin's User.id — RawVendorCost.createdById is a required FK. */
  createdById: string;
}

/** Creates a new material — an EquipmentOption (public catalog) + its
 *  matching RawVendorCost (confidential cost) row, joined by `code` ===
 *  `itemName` per the established convention (see EquipmentOption's doc
 *  comment in schema.prisma). Not wrapped in a DB transaction: these are
 *  two independent single-admin writes, not a customer-facing critical
 *  path, so a rare partial failure is an acceptable trade-off against
 *  the added complexity of an interactive transaction here. */
export async function createMaterialItem(input: CreateMaterialInput): Promise<MaterialCatalogItem> {
  const existing = await adminPrisma.equipmentOption.findUnique({
    where: { componentType_code: { componentType: input.componentType, code: input.code } },
  });
  if (existing) {
    throw new PricingConfigurationError(`An item with code "${input.code}" already exists for ${input.componentType}.`);
  }

  if (input.isDefault) {
    await clearExistingDefault(input.componentType, input.applicableServiceType ?? null);
  }

  const option = await adminPrisma.equipmentOption.create({
    data: {
      componentType: input.componentType,
      code: input.code,
      label: input.label,
      brand: input.brand ?? null,
      specValue: input.specValue ?? null,
      applicableServiceType: input.applicableServiceType ?? null,
      isDefault: input.isDefault ?? false,
      sortOrder: 50,
      isActive: true,
      logoUrl: input.logoUrl ? formatGoogleDriveLink(input.logoUrl) : null,
      brochureUrl: input.brochureUrl ? formatGoogleDriveLink(input.brochureUrl) : null,
      specs: input.specs && input.specs.length > 0 ? (input.specs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  const cost = await adminPrisma.rawVendorCost.create({
    data: {
      componentType: input.componentType,
      vendorName: input.vendorName ?? input.brand ?? "Unspecified Vendor",
      itemName: input.code,
      model: input.label,
      unitCostRs: input.vendorCostRs,
      unit: input.unit,
      currency: "PKR",
      marginPercentOverride: input.marginPercentOverride ?? null,
      effectiveFrom: new Date(),
      isActive: true,
      createdById: input.createdById,
    },
  });

  return toMaterialCatalogItem(option, cost);
}

export interface UpdateMaterialInput {
  vendorCostRs?: number;
  /** Pass null explicitly to clear an override back to the sector
   *  default; omit to leave it unchanged. */
  marginPercentOverride?: number | null;
  isDefault?: boolean;
  label?: string;
  brand?: string | null;
  /** Google Drive share or direct links, re-normalized via
   *  formatGoogleDriveLink() on every update. Pass null explicitly to
   *  clear; omit to leave unchanged. */
  logoUrl?: string | null;
  brochureUrl?: string | null;
  /** Pass null or [] to clear all specs; omit to leave unchanged. */
  specs?: SpecEntry[] | null;
}

/** Updates vendor cost, margin override, default status, label, and/or
 *  media/specs for one material — PUT /api/admin/pricing/[id]. `id` is
 *  EquipmentOption.id; the matching RawVendorCost row is resolved via
 *  componentType+itemName=code, same join convention as everywhere else. */
export async function updateMaterialItem(id: string, input: UpdateMaterialInput): Promise<MaterialCatalogItem> {
  const option = await adminPrisma.equipmentOption.findUnique({ where: { id } });
  if (!option) {
    throw new PricingConfigurationError(`Material item ${id} not found.`);
  }

  if (input.isDefault === true) {
    await clearExistingDefault(option.componentType, option.applicableServiceType);
  }

  const needsOptionUpdate =
    input.isDefault !== undefined ||
    input.label !== undefined ||
    input.brand !== undefined ||
    input.logoUrl !== undefined ||
    input.brochureUrl !== undefined ||
    input.specs !== undefined;
  const updatedOption = needsOptionUpdate
    ? await adminPrisma.equipmentOption.update({
        where: { id },
        data: {
          ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
          ...(input.label !== undefined && { label: input.label }),
          ...(input.brand !== undefined && { brand: input.brand }),
          ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl ? formatGoogleDriveLink(input.logoUrl) : null }),
          ...(input.brochureUrl !== undefined && {
            brochureUrl: input.brochureUrl ? formatGoogleDriveLink(input.brochureUrl) : null,
          }),
          ...(input.specs !== undefined && {
            specs: input.specs && input.specs.length > 0 ? (input.specs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          }),
        },
      })
    : option;

  let cost = await adminPrisma.rawVendorCost.findFirst({
    where: { componentType: option.componentType, itemName: option.code, isActive: true },
    orderBy: { effectiveFrom: "desc" },
  });

  if (cost && (input.vendorCostRs !== undefined || input.marginPercentOverride !== undefined)) {
    cost = await adminPrisma.rawVendorCost.update({
      where: { id: cost.id },
      data: {
        ...(input.vendorCostRs !== undefined && { unitCostRs: input.vendorCostRs }),
        ...(input.marginPercentOverride !== undefined && { marginPercentOverride: input.marginPercentOverride }),
      },
    });
  }

  return toMaterialCatalogItem(updatedOption, cost);
}

/** Soft-deletes a material: isActive=false on both the EquipmentOption
 *  (disappears from the public /api/equipment-options catalog and the
 *  Custom Builder pickers) and its RawVendorCost row (disappears from
 *  pricing lookups; effectiveTo stamped for the historical record). Also
 *  clears isDefault — a deactivated item can't stay a Recommended default. */
export async function deactivateMaterialItem(id: string): Promise<void> {
  const option = await adminPrisma.equipmentOption.findUnique({ where: { id } });
  if (!option) {
    throw new PricingConfigurationError(`Material item ${id} not found.`);
  }

  await adminPrisma.equipmentOption.update({ where: { id }, data: { isActive: false, isDefault: false } });
  await adminPrisma.rawVendorCost.updateMany({
    where: { componentType: option.componentType, itemName: option.code, isActive: true },
    data: { isActive: false, effectiveTo: new Date() },
  });
}

export interface UpdateGlobalRulesInput {
  structureCostPerWatt?: number;
  /** Partial — only the sectors present are changed. */
  sectorMargins?: Partial<Record<Sector, number>>;
  /** Super Admin's User.id — MarginRule.createdById is a required FK,
   *  only actually used if a sector has no existing margin row to update. */
  updatedById: string;
}

/** Updates the structure per-watt base rate and/or one or more sectors'
 *  default margin — the KPI banner at the top of /admin/pricing.
 *  Installation rates moved to updateGlobalPricingSettings() below
 *  (POST /api/admin/pricing/rules) since they're no longer one flat
 *  RawVendorCost row — this function's return still includes the full
 *  GlobalPricingRules shape (fetching current settings alongside) so
 *  every caller gets one complete, consistent object regardless of
 *  which endpoint they hit. */
export async function updateGlobalPricingRule(input: UpdateGlobalRulesInput): Promise<GlobalPricingRules> {
  if (input.structureCostPerWatt !== undefined) {
    await adminPrisma.rawVendorCost.updateMany({
      where: { componentType: "MOUNTING_STRUCTURE", itemName: DEFAULT_STRUCTURE_CODE, isActive: true },
      data: { unitCostRs: input.structureCostPerWatt },
    });
  }

  if (input.sectorMargins) {
    for (const sector of ALL_SECTORS) {
      const percent = input.sectorMargins[sector];
      if (percent === undefined) continue;

      const existing = await adminPrisma.marginRule.findFirst({
        where: { sector, componentType: null, isActive: true },
        orderBy: { effectiveFrom: "desc" },
      });
      if (existing) {
        await adminPrisma.marginRule.update({ where: { id: existing.id }, data: { targetMarginPercent: percent } });
      } else {
        await adminPrisma.marginRule.create({
          data: {
            sector,
            componentType: null,
            targetMarginPercent: percent,
            minMarginPercent: Math.max(0, percent - 5),
            effectiveFrom: new Date(),
            isActive: true,
            createdById: input.updatedById,
          },
        });
      }
    }
  }

  const now = new Date();
  const [structureCost, sectorMargins, settings] = await Promise.all([
    adminPrisma.rawVendorCost.findFirst({
      where: { componentType: "MOUNTING_STRUCTURE", itemName: DEFAULT_STRUCTURE_CODE, ...activeAsOf(now) },
      orderBy: { effectiveFrom: "desc" },
    }),
    getSectorDefaultMargins(now),
    getGlobalPricingSettings(),
  ]);

  return {
    structureCostPerWatt: structureCost?.unitCostRs.toNumber() ?? 0,
    installationCostPerWattResidential: settings.installationCostPerWattResidential,
    installationCostPerWattCommercial: settings.installationCostPerWattCommercial,
    installationCostPerWattIndustrial: settings.installationCostPerWattIndustrial,
    evChargerInstallationFee: settings.evChargerInstallationFee,
    washingCostPerPanel: settings.washingCostPerPanel,
    sectorMargins: Object.fromEntries(ALL_SECTORS.map((s) => [s, sectorMargins.get(s) ?? 0])) as Record<Sector, number>,
  };
}

export interface UpdateGlobalPricingSettingsInput {
  installationCostPerWattResidential?: number;
  installationCostPerWattCommercial?: number;
  installationCostPerWattIndustrial?: number;
  evChargerInstallationFee?: number;
  washingCostPerPanel?: number;
  /** Super Admin's User.id — GlobalPricingSettings.updatedById is a
   *  required FK. */
  updatedById: string;
}

/** Updates the singleton GlobalPricingSettings row — creates it (from
 *  the same fallback defaults getGlobalPricingSettings() would return)
 *  if it doesn't exist yet, otherwise updates only the fields present
 *  in `input` in place. Backs `POST /api/admin/pricing/rules`. */
export async function updateGlobalPricingSettings(input: UpdateGlobalPricingSettingsInput): Promise<GlobalPricingRules> {
  const existing = await adminPrisma.globalPricingSettings.findFirst({ orderBy: { updatedAt: "desc" } });
  const current = existing
    ? {
        installationCostPerWattResidential: existing.installationCostPerWattResidential.toNumber(),
        installationCostPerWattCommercial: existing.installationCostPerWattCommercial.toNumber(),
        installationCostPerWattIndustrial: existing.installationCostPerWattIndustrial.toNumber(),
        evChargerInstallationFee: existing.evChargerInstallationFee.toNumber(),
        washingCostPerPanel: existing.washingCostPerPanel.toNumber(),
      }
    : FALLBACK_GLOBAL_PRICING_SETTINGS;

  const merged = {
    installationCostPerWattResidential: input.installationCostPerWattResidential ?? current.installationCostPerWattResidential,
    installationCostPerWattCommercial: input.installationCostPerWattCommercial ?? current.installationCostPerWattCommercial,
    installationCostPerWattIndustrial: input.installationCostPerWattIndustrial ?? current.installationCostPerWattIndustrial,
    evChargerInstallationFee: input.evChargerInstallationFee ?? current.evChargerInstallationFee,
    washingCostPerPanel: input.washingCostPerPanel ?? current.washingCostPerPanel,
  };

  if (existing) {
    await adminPrisma.globalPricingSettings.update({
      where: { id: existing.id },
      data: { ...merged, updatedById: input.updatedById },
    });
  } else {
    await adminPrisma.globalPricingSettings.create({
      data: { ...merged, updatedById: input.updatedById },
    });
  }

  const now = new Date();
  const [structureCost, sectorMargins] = await Promise.all([
    adminPrisma.rawVendorCost.findFirst({
      where: { componentType: "MOUNTING_STRUCTURE", itemName: DEFAULT_STRUCTURE_CODE, ...activeAsOf(now) },
      orderBy: { effectiveFrom: "desc" },
    }),
    getSectorDefaultMargins(now),
  ]);

  return {
    structureCostPerWatt: structureCost?.unitCostRs.toNumber() ?? 0,
    ...merged,
    sectorMargins: Object.fromEntries(ALL_SECTORS.map((s) => [s, sectorMargins.get(s) ?? 0])) as Record<Sector, number>,
  };
}
