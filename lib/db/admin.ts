import "server-only";
import {
  PrismaClient,
  Prisma,
  type ComponentType,
  type CostUnit,
  type Sector,
  type ServiceType,
  type InverterPhase,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { formatGoogleDriveLink } from "@/lib/utils/googleDrive";

/**
 * The ADMIN Prisma client — connects as `app_admin_role`, the only
 * application role granted access to the `vendor_private` schema
 * (raw_vendor_costs, margin_rules).
 *
 * DO NOT import `getAdminPrisma`/its resolved client itself anywhere
 * outside this file. Every other module — including API routes — must
 * go through `calculateSystemPricing()` below, which is the single
 * sanctioned boundary between vendor_private data and the rest of the
 * app. It returns a sanitized, client-safe DTO only; raw costs and
 * margin percentages are read, used, and discarded entirely inside
 * this function's stack frame.
 *
 * Was a plain module-level `const adminPrisma`, created once at import
 * time from `process.env.ADMIN_DATABASE_URL`. Became a resolver
 * function (2026-08-25, Cloudflare production leg) for the exact same
 * reason as lib/db/client.ts's matching `getDb()` — see that file's
 * doc comment for the full explanation (Cloudflare Hyperdrive bindings
 * are only reachable per-request, never at module load time). Every
 * exported function below that touches `adminPrisma` now starts with
 * `const adminPrisma = await getAdminPrisma();` — a local binding that
 * shadows this file's old module-level name, so none of the 57 actual
 * `adminPrisma.___` call sites elsewhere in this file needed touching,
 * only the ~24 function signatures that use it.
 */
declare global {
  var __solarPixelAdminPrisma: PrismaClient | undefined;
}

function createAdminClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

async function getAdminPrisma(): Promise<PrismaClient> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    // See lib/db/client.ts's matching getDb() for why this is a narrow
    // local cast rather than relying on the globally-ambient
    // CloudflareEnv interface — that generated file is excluded from
    // tsconfig.json entirely (it was silently breaking global Web API
    // type inference project-wide).
    const hyperdriveAdmin = (env as { HYPERDRIVE_ADMIN?: { connectionString: string } }).HYPERDRIVE_ADMIN;
    if (hyperdriveAdmin) {
      const adapter = new PrismaPg({ connectionString: hyperdriveAdmin.connectionString, maxUses: 1 });
      return new PrismaClient({ adapter });
    }
  } catch {
    // Not running on Cloudflare (no Worker request context available) —
    // fall through to the standard env-var-based singleton below. This
    // is the expected, normal path on Netlify and localhost, not an
    // error condition.
  }

  if (!globalThis.__solarPixelAdminPrisma) {
    const connectionString = process.env.ADMIN_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "ADMIN_DATABASE_URL is not set. This must be an app_admin_role connection string, distinct from DATABASE_URL."
      );
    }
    globalThis.__solarPixelAdminPrisma = createAdminClient(connectionString);
  }
  return globalThis.__solarPixelAdminPrisma;
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
  /** Civil blocks + earthing/boring + lightning arrestor combined into
   *  one line — same "flat admin rate x customer-picked quantity"
   *  reasoning as cablingAndProtectionPKR grouping DC/AC cable +
   *  breakers, and 0 whenever every quantity is 0. See EquipmentSelections'
   *  civilBlockQty/earthingBoreQty/lightningArrestorQty doc comments. */
  siteWorksPKR: number;
  /** "One-Time Panel Washing Visit" (2026-08-21) — 0 unless the customer
   *  toggled it on in the Custom Equipment Builder's Services section
   *  (selections.includePanelWashing). Uses the SAME tiered rate
   *  (panelWashingRawCostPKR) the standalone "Panel Washing & Servicing"
   *  inquiry flow already uses, priced against the real, already-clamped
   *  panel count (post Panel Quantity Adjuster). UNLIKE every other line
   *  in this interface, this one is NOT marked up — it's the raw tiered
   *  rate exactly, no margin added (explicit instruction, see
   *  calculatePanelWashingQuote's doc comment). */
  panelWashingPKR: number;
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
  /** count/baselineCount/maxCount added 2026-08-20 for the Panel
   *  Quantity Adjuster — count is the REAL, already-clamped panel count
   *  actually priced (post panelQtyOverride, if any); baselineCount is
   *  the bill-required minimum (the adjuster's floor); maxCount is the
   *  selected inverter's own rated-kW ceiling, or null when that
   *  inverter has no specValue on file (no real cap can be computed, so
   *  the adjuster should treat it as unbounded rather than stuck at
   *  baseline). The client must render panel count from `count` here,
   *  never re-derive it from systemKw — that guess breaks the instant
   *  the customer adjusts the count away from baseline. */
  panel: ResolvedEquipmentItem & { count: number; baselineCount: number; maxCount: number | null };
  /** `quantity` added 2026-08-29 for industrial-scale "clubbing" — how
   *  many of this exact SKU are actually priced/installed. 1 for the
   *  overwhelming majority of quotes (a single unit already covers the
   *  system); >1 only once systemKw exceeds every single in-stock
   *  unit's own rated capacity, in which case this is N × the largest
   *  available unit (see findLargestInStockInverter/
   *  inverterQuantityFor). Always present (never optional/undefined) so
   *  every consumer can safely render `× {quantity}` without a
   *  fallback — mirrors panel.count's own "always a real number, never
   *  re-derived client-side" contract. */
  inverter: ResolvedEquipmentItem & { quantity: number };
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
  /** The exact "Site Works" quantities this quote priced (see
   *  EquipmentSelections.civilBlockQty and friends) — same "let the
   *  client render this from the real resolved value, never re-guess
   *  the default" reasoning as resolvedEquipment above. */
  siteWorks: SiteWorksQuantities;
  /** "One-Time Panel Washing Visit" (2026-08-21) — null when not toggled
   *  on (breakdown.panelWashingPKR is 0 in that case too). Lets the
   *  client render the exact "N Panels @ Rs X/panel" / "(Minimum
   *  Call-Out Fee)" wording without re-deriving which tier/floor applied. */
  panelWashing: PanelWashingSelection | null;
}

export interface PanelWashingSelection {
  panelCount: number;
  ratePerPanel: number;
  isMinimumFeeApplied: boolean;
}

export interface SiteWorksQuantities {
  civilBlockQty: number;
  earthingBoreQty: number;
  lightningArrestorQty: number;
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
   *  "STANDARD_L1_L2". Omitted defaults to whichever active, in-stock
   *  structure type is currently cheapest (see getCheapestStructureCode's
   *  doc comment) — not a fixed admin-flagged default like every other
   *  slot here. */
  structureCode?: string;
  /** "Site Works" quantities — each x its flat admin rate
   *  (GlobalPricingSettings) makes up siteWorksPKR. Not a brand/model
   *  pick like everything else here, just a customer-adjustable count;
   *  0 is valid (customer doesn't need that item at all). Omitted
   *  defaults to DEFAULT_EARTHING_BORE_QTY/DEFAULT_LIGHTNING_ARRESTOR_QTY
   *  below — same "omitted -> Recommended default" convention as every
   *  other slot in this interface.
   *
   *  civilBlockQty is UNUSED as of 2026-08-20 — civil block count is now
   *  always auto-computed as Math.ceil(panelCount × 1.5) (see
   *  calculateSystemPricing), never customer-set. Field kept (not
   *  removed) purely so already-persisted Quote.equipmentSelections JSON
   *  from before this change still parses without error; a value here is
   *  silently ignored. */
  civilBlockQty?: number;
  earthingBoreQty?: number;
  lightningArrestorQty?: number;
  /** Panel Quantity Adjuster (2026-08-20) — a customer-adjustable count
   *  of panels, Custom Builder only. Clamped server-side to
   *  [PANEL_COUNT_ABSOLUTE_MINIMUM, maxPanelCount] (see
   *  calculateSystemPricing) — NOT floored at baselinePanelCount as of
   *  2026-08-29 (explicit instruction: "don't block user to lower the
   *  panels - lower they can go at any level"); never above what the
   *  selected inverter's own rated kW can carry. Omitted defaults to
   *  baselinePanelCount (today's existing bill-derived count, unchanged
   *  behavior). Only panelsPKR scales with this — inverter/cabling/
   *  structure/installation still price off the bill-derived systemKw,
   *  a deliberate v1 simplification (see calculateSystemPricing's
   *  comment on why), not an oversight. */
  panelQtyOverride?: number;
  /** Manual inverter "clubbing" override (2026-08-29) — lets the customer
   *  deliberately raise how many of the RESOLVED inverter SKU get priced,
   *  beyond what inverterQuantityFor(systemKw, specValue) alone would
   *  pick (e.g. 2× a 100kW unit instead of the auto-computed 1×, to
   *  leave headroom for a planned future expansion). Server-clamped to
   *  never go BELOW the auto-computed minimum needed to actually cover
   *  systemKw — this can only ever add headroom, never silently
   *  undersize the system (see calculateSystemPricing's use of this
   *  field). Omitted/undefined = pure auto (inverterQuantityFor's answer,
   *  unchanged from before this field existed). Ignored entirely once
   *  MAX_INVERTER_UNITS is exceeded (Zod already rejects that at the API
   *  boundary, this is just defense in depth). */
  inverterQuantityOverride?: number;
  /** "One-Time Panel Washing Visit" (2026-08-21) — a toggleable Services/
   *  Maintenance add-on in the Custom Equipment Builder, priced with the
   *  SAME tiered per-panel rate the standalone "System Upgrades &
   *  Washing" flow uses (see panelWashingRawCostPKR), against the real,
   *  already-clamped panel count. Omitted/false = not included, 0 cost. */
  includePanelWashing?: boolean;
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
// Updated 2026-08-22 when the old vague HUAWEI_HYBRID/HUAWEI_ONGRID
// placeholders (no real specValue, PER_WATT) were retired in favor of
// real, specific, flat PER_PIECE-priced SKUs sourced from w11stop.com —
// see that day's catalog update in project memory for the full list.
const DEFAULT_INVERTER_CODE_BY_SERVICE_TYPE: Record<ServiceType, string> = {
  HYBRID_BATTERY: "GROWATT_10KW_HYBRID_1P",
  ONGRID_ZERO_EXPORT: "GOODWE_10KW_ONGRID",
};
const DEFAULT_BATTERY_CODE = "PYLONTECH_5KWH";
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
/** Panel Quantity Adjuster's ceiling (2026-08-24, explicit instruction)
 *  — the max DC array a selected inverter can take, expressed as a
 *  percentage of its own rated AC capacity. 115% is a standard, widely
 *  used DC:AC oversizing allowance (inverters routinely accept modest
 *  panel overpanling since an array rarely hits its full nameplate
 *  output at once) — previously this cap was a flat 100% (panels capped
 *  at exactly the inverter's own rated kW, zero headroom), which under-
 *  used a customer's inverter once they picked one larger than their
 *  bill-derived baseline. */
const PANEL_OVERSIZE_ALLOWANCE = 1.15;
/** Panel Quantity Adjuster's floor (2026-08-29, explicit instruction:
 *  "don't block user to lower the panels - lower they can go at any
 *  level") — a bare data-integrity minimum (can't have a system with 0
 *  or negative panels), NOT the bill-derived baselinePanelCount the
 *  adjuster used to floor at. Customers can now deliberately configure a
 *  system smaller than their bill technically calls for. This also fixes
 *  a real reported bug: once manual inverter "clubbing" (see
 *  resolveInverterQuantity) lets a customer shrink inverterQuantity well
 *  below what systemKw needs, maxPanelCount (inverter-capacity-derived)
 *  can end up SMALLER than baselinePanelCount (bill-derived) — flooring
 *  at baselinePanelCount in that case produced the nonsensical
 *  "min 525 · max 188" display; flooring at this constant instead keeps
 *  min ≤ max always. */
const PANEL_COUNT_ABSOLUTE_MINIMUM = 1;
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

// "Site Works" default quantities — Earthing/Lightning stay fully
// customer-adjustable (including down to 0); Civil Blocks has no default
// here anymore — it's always auto-computed from the real panel count
// (Math.ceil(panelCount × 1.5), see calculateSystemPricing), never
// customer-set.
const DEFAULT_EARTHING_BORE_QTY = 2;
const DEFAULT_LIGHTNING_ARRESTOR_QTY = 1;

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
 *  cables, breakers); pass the actual serviceType for INVERTER/BATTERY,
 *  whose defaults are chosen per service type. Falls back to
 *  `fallbackCode` (one of the DEFAULT_* constants above) if nothing is
 *  marked default yet, so pricing never breaks from an empty admin table
 *  before anyone has touched it. NOT used for MOUNTING_STRUCTURE — see
 *  getCheapestStructureCode() below for why that slot is the one
 *  exception. */
async function getDefaultCode(
  componentType: ComponentType,
  applicableServiceType: ServiceType | null,
  fallbackCode: string
): Promise<string> {
  const adminPrisma = await getAdminPrisma();
  // inStock: true — a guardrail, not just a filter: the admin-marked
  // default must never be an out-of-stock item (see EquipmentOption.
  // inStock's doc comment). If the sole isDefault row for this slot goes
  // out of stock, this returns null and falls to `fallbackCode` below —
  // no "pick the next-best in-stock alternative" logic here, that's what
  // the dedicated findSmallestFittingInStockInverter()/findSmallestFittingInStockBattery()
  // budget-tier helpers are for.
  const row = await adminPrisma.equipmentOption.findFirst({
    where: { componentType, applicableServiceType, isDefault: true, isActive: true, inStock: true },
    orderBy: { sortOrder: "asc" },
  });
  return row?.code ?? fallbackCode;
}

/** Mounting Structure's Recommended default (2026-08-27, explicit
 *  instruction: "by default we will be setting up the lowest ones") —
 *  the ONE component slot that ignores EquipmentOption.isDefault
 *  entirely. Every other slot lets the admin manually flag a "Recommended"
 *  row (see getDefaultCode above); Structure instead always resolves to
 *  whichever active, in-stock, real (non-"Other") structure type
 *  currently has the LOWEST Rs/W rate, recomputed fresh on every quote —
 *  so it stays correct automatically if an admin reprices later, not
 *  just at seed time. The /admin/pricing "Mounting Structure" tab hides
 *  its "Set Default" star for this exact reason (nothing for it to
 *  control). Falls back to DEFAULT_STRUCTURE_CODE if no active in-stock
 *  structure rate is on file at all (same "never break from an empty
 *  table" spirit as getDefaultCode). */
async function getCheapestStructureCode(): Promise<string> {
  const adminPrisma = await getAdminPrisma();
  const now = new Date();

  const options = await adminPrisma.equipmentOption.findMany({
    where: { componentType: "MOUNTING_STRUCTURE", isActive: true, inStock: true, isOtherOption: false },
    select: { code: true },
  });
  if (options.length === 0) return DEFAULT_STRUCTURE_CODE;

  const costs = await adminPrisma.rawVendorCost.findMany({
    where: {
      componentType: "MOUNTING_STRUCTURE",
      unit: "PER_WATT",
      itemName: { in: options.map((o) => o.code) },
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });

  // Most-recent active rate per code (costs is already effectiveFrom
  // desc, so the first hit per itemName wins) — same "first hit per key"
  // pattern listMaterialCatalog's costByKey uses. Then just the min.
  const seen = new Set<string>();
  let cheapestCode: string | null = null;
  let cheapestRs = Infinity;
  for (const cost of costs) {
    if (seen.has(cost.itemName)) continue;
    seen.add(cost.itemName);
    const rs = cost.unitCostRs.toNumber();
    if (rs < cheapestRs) {
      cheapestRs = rs;
      cheapestCode = cost.itemName;
    }
  }
  return cheapestCode ?? DEFAULT_STRUCTURE_CODE;
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
  selections?: EquipmentSelections,
  /** Target Budget tier (2026-08-20) — auto-selects inverter/battery
   *  defaults for this bracket instead of the admin-marked Recommended
   *  default; see the "Target Budget tiers" section above
   *  resolveBudgetTierInverterCode(). Does NOT change systemKw or how
   *  it's computed — the real daytime-offset formula is unchanged. An
   *  explicit `selections.inverterCode`/`batteryCode` still always wins
   *  (resolveSelection's normal `code ?? defaultCode` fallback chain).
   *  UNDEFINED ("no preference") is treated identically to "UNDER_1M"
   *  (2026-08-21) — the lowest-cost configuration is always the
   *  starting recommendation; price only rises once the customer
   *  explicitly picks a higher tier. The plain admin-marked
   *  isDefault=true equipment is no longer reachable as a Recommended-
   *  path default through this parameter at all. */
  targetBudgetTier?: BudgetTier
): Promise<SystemPricingResult> {
  const adminPrisma = await getAdminPrisma();
  const now = new Date();
  const watts = systemKw * 1000;
  const needsBattery = serviceType === "HYBRID_BATTERY";
  // "No preference" (targetBudgetTier omitted) now resolves the SAME as
  // UNDER_1M — smallest fitting inverter, no battery — rather than the
  // admin-marked Recommended default (2026-08-21, explicit instruction:
  // the default recommendation must be the lowest-cost one, so a first-
  // time visitor never sees a battery-inclusive price before they've
  // told us their budget; the price should only go UP as they pick a
  // higher Target Budget tier). Every other spot in this function that
  // used to branch on `targetBudgetTier` now uses this instead.
  //
  // Industrial (2026-08-29, explicit instruction): Target Budget isn't
  // offered at all for this sector — the tiers are Residential/
  // Commercial budget brackets that don't map to industrial-scale
  // pricing, and Industrial has no battery to opt in/out of either way
  // (locked On-Grid, needsBattery is always false above). Forced to
  // "UNDER_1M" here regardless of what's sent — never trust the client
  // for something pricing depends on, same reasoning as
  // resolveServiceType() force-locking serviceType for this sector.
  const effectiveBudgetTier: BudgetTier = sector === "INDUSTRIAL" ? "UNDER_1M" : (targetBudgetTier ?? "UNDER_1M");
  // See NONE_CODE's doc comment — an explicit customer opt-out, distinct
  // from "no preference." Forces batteryCode/batteryCapacityKwh to the
  // same null/0 shape ONGRID_ZERO_EXPORT already produces below, so every
  // downstream `needsBattery && batteryCode`/`needsBattery && battery`
  // check already skips battery correctly with no further branching.
  // The UNDER_1M budget tier ALSO forces this — "Force Battery to NONE"
  // per spec — but only when the customer hasn't explicitly picked a
  // battery of their own in Custom mode; an explicit pick (even a
  // different real battery) always overrides what a budget tier would
  // have auto-decided.
  const batteryOptedOut =
    needsBattery &&
    (selections?.batteryCode === NONE_CODE || (effectiveBudgetTier === "UNDER_1M" && selections?.batteryCode === undefined));

  // Target capacity (2026-08-22) — computed BEFORE the default-code
  // Promise.all below, not after: with batteries now real fixed-
  // capacity SKUs (see resolveBudgetTierBatteryCode's doc comment), the
  // DEFAULT code resolution itself needs this number to pick a battery
  // actually big enough, not just "the admin's marked default"
  // regardless of size. `selections?.batteryCapacityKwh` is no longer a
  // pricing multiplier — it's a TARGET the resolver searches for the
  // smallest real SKU covering. Real installed capacity ends up being
  // whichever SKU that resolves to (see resolvedEquipment.battery below).
  const batteryCapacityKwh =
    needsBattery && !batteryOptedOut ? (selections?.batteryCapacityKwh ?? systemKw * DEFAULT_BATTERY_KWH_PER_SYSTEM_KW) : 0;

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
  // MOUNTING_STRUCTURE is the one exception to all of this — it doesn't use
  // getDefaultCode/isDefault at all, see getCheapestStructureCode's own doc
  // comment for why.
  const [defaultPanelCode, defaultInverterCode, defaultCableCode, defaultBreakersCode, defaultStructureCode, defaultBatteryCode] =
    await Promise.all([
      getDefaultCode("SOLAR_PANEL", null, DEFAULT_PANEL_CODE),
      resolveBudgetTierInverterCode(effectiveBudgetTier, systemKw, serviceType),
      getDefaultCode("DC_CABLE", null, DEFAULT_CABLE_CODE),
      getDefaultCode("BREAKERS", null, DEFAULT_BREAKERS_CODE),
      getCheapestStructureCode(),
      // batteryOptedOut is already true whenever effectiveBudgetTier is
      // UNDER_1M (see above), so reaching here with needsBattery true
      // only happens for 1M_TO_1_5M/1_5M_PLUS — always the budget-tier
      // battery pick now, never the plain admin default (see this
      // function's doc comment on why "no preference" no longer means
      // "admin default"). Now capacity-aware — see
      // resolveBudgetTierBatteryCode's doc comment.
      needsBattery && !batteryOptedOut
        ? resolveBudgetTierBatteryCode(serviceType, batteryCapacityKwh)
        : Promise.resolve(DEFAULT_BATTERY_CODE),
    ]);

  const panelCode = resolveSelection(selections?.panelCode, defaultPanelCode);
  // let, not const (2026-08-27) — the out-of-stock auto-substitution
  // block below can reassign this to a fallback inverter's code. See
  // that block's own doc comment for why inverter specifically gets
  // this treatment while Panel/Battery still hard-fail.
  let inverterCode = resolveSelection(selections?.inverterCode, defaultInverterCode);
  const dcCableCode = resolveSelection(selections?.dcCableCode, defaultCableCode);
  const acCableCode = resolveSelection(selections?.acCableCode, defaultCableCode);
  const breakersCode = resolveSelection(selections?.breakersCode, defaultBreakersCode);
  const structureCode = resolveSelection(selections?.structureCode, defaultStructureCode);
  const batteryCode = needsBattery && !batteryOptedOut ? resolveSelection(selections?.batteryCode, defaultBatteryCode) : null;

  // "Site Works" quantities — Earthing/Lightning stay customer-set (see
  // resolveQty's doc comment below); Civil Blocks is computed further
  // down, once the actual resolved panel count is known (it's no longer
  // customer-set — see EquipmentSelections.civilBlockQty's doc comment).
  const earthingBoreQty = resolveQty(selections?.earthingBoreQty, DEFAULT_EARTHING_BORE_QTY);
  const lightningArrestorQty = resolveQty(selections?.lightningArrestorQty, DEFAULT_LIGHTNING_ARRESTOR_QTY);

  const [panel, inverterInitial, dcCable, acCable, breakers, structure, settings, battery, marginRule, panelOption, inverterOptionInitial, batteryOption] =
    await Promise.all([
      adminPrisma.rawVendorCost.findFirst({
        where: activeFilter("SOLAR_PANEL", "PER_WATT", panelCode),
        orderBy: { effectiveFrom: "desc" },
      }),
      adminPrisma.rawVendorCost.findFirst({
        // PER_PIECE, not PER_WATT (2026-08-22) — an inverter is one fixed
        // real product with its own flat price, not a rate that scales
        // with the customer's system size. See rawInverterPKR below.
        where: activeFilter("INVERTER", "PER_PIECE", inverterCode),
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
            // PER_PIECE, not PER_KWH (2026-08-22) — every battery is now
            // a real, specific product (brand + module capacity) with
            // its own fixed price, exactly like INVERTER's rework —
            // see rawBatteryPKR below for the matching no-longer-
            // scaled-by-capacity fix.
            where: activeFilter("BATTERY", "PER_PIECE", batteryCode),
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

  // Reassignable (2026-08-27) — see the out-of-stock auto-substitution
  // block below, right before outOfStock's own check.
  let inverter = inverterInitial;
  let inverterOption = inverterOptionInitial;

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

  // Inverter out-of-stock auto-substitution (2026-08-27, real reported
  // gap): if the admin marks the inverter this request names as out of
  // stock AFTER a customer already generated/saved a quote naming it (a
  // live re-preview, a re-approach on a saved link, a Checker
  // recalculate), that request would otherwise fall straight into
  // outOfStock's hard fail below with "quotation not available" — a
  // dead end for the customer even though the system is perfectly
  // priceable with a different in-stock inverter. Auto-substitutes the
  // same "smallest fitting in-stock" inverter the Recommended path's own
  // default already falls back to (findSmallestFittingInStockInverter)
  // rather than erroring. If NO in-stock inverter fits at all,
  // `inverterOption` below still reflects the original out-of-stock one
  // and outOfStock's own check catches that as a genuine last resort —
  // this block doesn't need its own separate "still failed" branch.
  //
  // Panel/Battery deliberately do NOT get this treatment yet — kept as
  // the original hard error (see outOfStock's own comment below): the
  // reported complaint was specifically about inverter, and Panel/
  // Battery substitution changes the customer's actual system sizing/
  // capacity in ways an inverter swap (a fixed-capacity product either
  // way) doesn't, which deserves its own deliberate decision rather than
  // riding along with this fix.
  if (inverterOption?.inStock === false) {
    // 2026-08-29: fall back to the largest available unit (re-clubbing)
    // when nothing single-unit-sized fits, same fallback
    // resolveBudgetTierInverterCode itself uses — without this, an
    // industrial-scale clubbed selection whose specific unit goes out
    // of stock would find no substitute at all and hard-fail below,
    // even though a different in-stock unit could still cover it.
    const fallbackInverterCode =
      (await findSmallestFittingInStockInverter(systemKw, serviceType)) ?? (await findLargestInStockInverter(serviceType));
    if (fallbackInverterCode && fallbackInverterCode !== inverterCode) {
      const [fallbackInverter, fallbackInverterOption] = await Promise.all([
        adminPrisma.rawVendorCost.findFirst({
          where: activeFilter("INVERTER", "PER_PIECE", fallbackInverterCode),
          orderBy: { effectiveFrom: "desc" },
        }),
        adminPrisma.equipmentOption.findFirst({ where: { componentType: "INVERTER", code: fallbackInverterCode } }),
      ]);
      if (fallbackInverter) {
        inverterCode = fallbackInverterCode;
        inverter = fallbackInverter;
        inverterOption = fallbackInverterOption;
      }
    }
  }

  // Inventory guardrail (2026-08-20), defense-in-depth — the Custom
  // Equipment Builder already disables selecting an out-of-stock item
  // client-side (greyed out, "Out of Stock" badge), so this only fires
  // for a bypassed/stale client request (or, for Inverter specifically,
  // a substitution attempt above that found no in-stock alternative at
  // all). Checked for Panel/Inverter/Battery only (the components this
  // function already fetches EquipmentOption metadata for) — Cable/
  // Breakers/Structure rely on the client-side block alone; see project
  // memory for why that scope line was drawn there. Panel/Battery stay a
  // hard error, not a silent substitution: silently swapping in a
  // DIFFERENT priced item for a request that named a specific one would
  // be a worse surprise than failing loudly — see the substitution
  // block's own comment above for why Inverter now gets different
  // treatment.
  const outOfStock = [
    panelOption?.inStock === false && `Panel "${panelCode}" is out of stock`,
    inverterOption?.inStock === false && `Inverter "${inverterCode}" is out of stock`,
    needsBattery && !batteryOptedOut && batteryOption?.inStock === false && `Battery "${batteryCode}" is out of stock`,
  ].filter(Boolean);
  if (outOfStock.length > 0) {
    throw new PricingConfigurationError(`Cannot price this configuration: ${outOfStock.join(", ")}.`);
  }

  // Panel Quantity Adjuster (2026-08-20) — baselinePanelCount is the same
  // Math.ceil(watts / panelWattage) the client has always derived for
  // display; it's now also computed here as the bill-derived REFERENCE
  // figure (no longer a hard floor — see PANEL_COUNT_ABSOLUTE_MINIMUM's
  // own doc comment, 2026-08-29 explicit instruction: "don't block user
  // to lower the panels"). maxPanelCount is the selected inverter's own
  // rated kW (specValue) × inverterQuantity, with PANEL_OVERSIZE_ALLOWANCE
  // (115%, 2026-08-24 — was a flat 100%/zero-headroom cap before)
  // applied, converted to a panel count — its ceiling; null (no cap)
  // when that inverter has no specValue on file, since "stuck at
  // baseline" would make the adjuster pointless for the many catalog
  // inverters missing this field (see EquipmentOption.specValue's doc
  // comment). effectivePanelCount is the actual, already-clamped count
  // this quote prices — panelQtyOverride can now go anywhere from
  // PANEL_COUNT_ABSOLUTE_MINIMUM up to the inverter's real (115%)
  // headroom, deliberately including below what the bill requires.
  // Inverter "clubbing" (2026-08-29) — see inverterQuantityFor's own doc
  // comment. 1 for every ordinary quote; >1 only once systemKw exceeds
  // even the largest single in-stock unit, in which case
  // resolveBudgetTierInverterCode already resolved inverterCode to that
  // largest unit and this just multiplies it out. Computed here (not
  // earlier) because it needs the FINAL inverterOption — post out-of-
  // stock substitution above — not the originally-resolved one.
  // resolveInverterQuantity (not the bare inverterQuantityFor) so a
  // manual override (selections.inverterQuantityOverride, Custom
  // Equipment Builder only) can take effect — Residential can only ever
  // raise this above the auto-computed minimum; Commercial/Industrial
  // get true manual control, including deliberately below it. See that
  // function's own doc comment.
  const inverterQuantity = resolveInverterQuantity(
    systemKw,
    inverterOption?.specValue?.toNumber() ?? null,
    selections?.inverterQuantityOverride,
    sector
  );
  const panelWattage = panelOption?.specValue?.toNumber() ?? FALLBACK_PANEL_WATTAGE_W;
  const baselinePanelCount = Math.ceil(watts / panelWattage);
  const maxPanelCount = inverterOption?.specValue
    ? Math.floor((inverterOption.specValue.toNumber() * inverterQuantity * 1000 * PANEL_OVERSIZE_ALLOWANCE) / panelWattage)
    : null;
  // Floor is Math.min(PANEL_COUNT_ABSOLUTE_MINIMUM, maxPanelCount) rather
  // than the bare constant, so min never ends up ABOVE max even in a
  // pathological edge case — the same defensive clamp that fixes the
  // reported "min 525 · max 188" bug also protects this from a
  // theoretical inverse of it.
  const effectivePanelCount = Math.min(
    Math.max(Math.round(selections?.panelQtyOverride ?? baselinePanelCount), Math.min(PANEL_COUNT_ABSOLUTE_MINIMUM, maxPanelCount ?? Infinity)),
    maxPanelCount ?? Infinity
  );
  // Civil Blocks (2026-08-20) — always auto-computed from the REAL,
  // already-clamped panel count, never customer-set (see
  // EquipmentSelections.civilBlockQty's doc comment on why the field
  // still exists but is ignored).
  const civilBlockQty = Math.ceil(effectivePanelCount * 1.5);

  // Only panelsPKR scales with the adjusted panel count — inverter/
  // cabling/structure/installation still price off the bill-derived
  // `watts` (systemKw × 1000), unchanged. A deliberate v1 simplification
  // (extra panels genuinely need marginally more cable/structure/labor
  // too, but this catalog has no per-panel breakdown to compute that
  // marginal cost from — only a blended $/W rate for the WHOLE bill-
  // derived system), not an oversight; flagged here so it's an easy
  // follow-up if a future spec wants every line to scale.
  const rawPanelPKR = panel!.unitCostRs.toNumber() * (effectivePanelCount * panelWattage);
  // Flat PER_PIECE (2026-08-22, explicit instruction) — NOT multiplied by
  // watts. Every inverter in the catalog is now a real, specific product
  // (brand + rated kW + phase) with its own fixed price; the customer's
  // system size only determines which SKUs are big enough to cover it
  // (see resolveInverterCodeForCapacity/the Custom Builder's Company ->
  // SKU picker), it doesn't scale the price of whichever one is chosen.
  // Multiplied by inverterQuantity (2026-08-29) — 1 for every ordinary
  // quote, >1 only for a "clubbed" industrial-scale system (see
  // inverterQuantityFor's own doc comment above).
  const rawInverterPKR = inverter!.unitCostRs.toNumber() * inverterQuantity;
  const rawDcCablePKR = dcCable!.unitCostRs.toNumber() * watts;
  const rawAcCablePKR = acCable!.unitCostRs.toNumber() * watts;
  const rawBreakersPKR = breakers!.unitCostRs.toNumber() * watts;
  const rawStructurePKR = structure!.unitCostRs.toNumber() * watts;
  const rawInstallationPKR = installationRateForSector(settings, sector) * watts;
  // Flat PER_PIECE (2026-08-22, matching the inverter rework) — NOT
  // multiplied by batteryCapacityKwh. That variable is now only a
  // TARGET used to resolve which real SKU to price (see its own doc
  // comment above) — the SKU's own flat price already reflects its
  // real capacity.
  const rawBatteryPKR = needsBattery && battery ? battery.unitCostRs.toNumber() : 0;
  const rawSiteWorksPKR =
    civilBlockQty * settings.civilWorkCostPerBlock +
    earthingBoreQty * settings.earthingCostPerBore +
    lightningArrestorQty * settings.lightningArrestorCostPerUnit;

  // "One-Time Panel Washing Visit" (2026-08-21) — only priced when
  // toggled on; uses the same tiered formula/panel count the standalone
  // washing inquiry flow uses. `panelWashingSelection` (the display-only
  // rate/floor info) flows straight into the return below.
  const panelWashingResult = selections?.includePanelWashing ? panelWashingRawCostPKR(effectivePanelCount, settings) : null;
  const rawPanelWashingPKR = panelWashingResult?.rawCostPKR ?? 0;

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
    // Site Works: same reasoning as installationPKR above — a flat admin
    // rate (GlobalPricingSettings), not a RawVendorCost row, so no
    // per-item override, just the sector default margin.
    siteWorksPKR: Math.round(markUp(rawSiteWorksPKR, sectorDefaultMarginPercent)),
    // Panel Washing is deliberately NOT marked up (2026-08-21, explicit
    // instruction reversing this file's earlier margin-on-everything
    // convention for this one line specifically) — the customer sees
    // exactly the admin-configured tiered rate, no percentage added.
    panelWashingPKR: panelWashingResult ? Math.round(rawPanelWashingPKR) : 0,
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
    breakdown.installationPKR +
    breakdown.siteWorksPKR +
    breakdown.panelWashingPKR;

  const resolvedEquipment: ResolvedEquipment = {
    panel: {
      code: panelCode,
      brand: panelOption?.brand ?? null,
      label: panelOption?.label ?? panelCode,
      specValue: panelOption?.specValue?.toNumber() ?? null,
      count: effectivePanelCount,
      baselineCount: baselinePanelCount,
      maxCount: maxPanelCount,
    },
    inverter: {
      code: inverterCode,
      brand: inverterOption?.brand ?? null,
      label: inverterOption?.label ?? inverterCode,
      specValue: inverterOption?.specValue?.toNumber() ?? null,
      quantity: inverterQuantity,
    },
    battery:
      needsBattery && batteryCode
        ? {
            code: batteryCode,
            brand: batteryOption?.brand ?? null,
            label: batteryOption?.label ?? batteryCode,
            specValue: batteryOption?.specValue?.toNumber() ?? null,
            // The RESOLVED SKU's real capacity, not the raw target that
            // was searched for (2026-08-22) — this is what's actually
            // being installed/priced. Falls back to the target only for
            // the OTHER/custom-requirement code (no real specValue on
            // file to report).
            capacityKwh: batteryOption?.specValue?.toNumber() ?? batteryCapacityKwh,
          }
        : null,
  };

  return {
    totalClientPricePKR,
    hasCustomRequirements,
    breakdown,
    resolvedEquipment,
    siteWorks: { civilBlockQty, earthingBoreQty, lightningArrestorQty },
    panelWashing: panelWashingResult
      ? { panelCount: effectivePanelCount, ratePerPanel: panelWashingResult.ratePerPanel, isMinimumFeeApplied: panelWashingResult.isMinimumFeeApplied }
      : null,
  };
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
   *  field existed.
   *
   *  Since 2026-08-22 (real fixed-capacity battery SKUs), this is a
   *  TARGET, not an exact number priced directly — calculateAdminBoqPricing
   *  resolves it to the smallest real, in-stock battery covering it (see
   *  resolveBudgetTierBatteryCode), which ALSO overrides whatever brand
   *  the customer originally picked pre-survey (this field winning is the
   *  whole point: the Field Engineer/Checker's on-site number is more
   *  trustworthy than a pre-survey guess). The Maker Survey form's
   *  "Battery Capacity (kWh)" input and the Checker dashboard's own
   *  recalculate field are UNCHANGED by this — both still just collect a
   *  plain kWh number; the SKU resolution happens entirely server-side. */
  finalBatteryCapacityKwh?: number | null;
  /** The Target Budget tier the customer's original quote was priced
   *  under (Quote.targetBudgetTier, 2026-08-21) — persisted as the
   *  EFFECTIVE tier at submission time, so "no preference" is already
   *  stored as "UNDER_1M" (see calculateSystemPricing's targetBudgetTier
   *  doc comment: the two are priced identically). Critical for the
   *  Checker to NOT silently re-add a battery the customer was never
   *  quoted for. Null/undefined (quotes created before this field
   *  existed) falls back to "UNDER_1M" here too — the one assumption
   *  that can never silently inflate a price. Ignored entirely once the
   *  customer made an explicit inverterCode/batteryCode pick in
   *  equipmentSelections — an explicit pick always wins, same
   *  precedence as calculateSystemPricing. */
  targetBudgetTier?: BudgetTier | null;
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
  /** Civil blocks + earthing/boring + lightning arrestor combined — see
   *  ItemizedBreakdown.siteWorksPKR's doc comment in calculateSystemPricing. */
  siteWorksPKR: number;
  /** See ItemizedBreakdown.panelWashingPKR's doc comment. */
  panelWashingPKR: number;
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
  /** The Site Works quantities actually priced — same resolution chain
   *  (equipmentSelections, then the DEFAULT_* constants) calculateSystemPricing
   *  uses, since there's no separate site-survey re-measurement step for
   *  these the way there is for cables/structure/battery capacity. */
  siteWorks: SiteWorksQuantities;
  /** See SystemPricingResult.panelWashing's doc comment. */
  panelWashing: PanelWashingSelection | null;
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
  const adminPrisma = await getAdminPrisma();
  const now = new Date();
  const { systemKw, sector, serviceType, dcCableMeters, acCableMeters, dataCableMeters, structureChoice, requiresDbUpgrade } =
    input;
  const needsBattery = serviceType === "HYBRID_BATTERY";
  const selections = input.equipmentSelections ?? undefined;
  // "No preference" was persisted as "UNDER_1M" at quote-creation time
  // (see AdminBoqPricingInput.targetBudgetTier's doc comment) — this is
  // the SAME effectiveBudgetTier normalization calculateSystemPricing
  // uses, so the two engines can't drift on which equipment a given
  // quote actually resolves to. Industrial forces "UNDER_1M" here too,
  // same as calculateSystemPricing — see that assignment's own doc
  // comment for why.
  const effectiveBudgetTier: BudgetTier = sector === "INDUSTRIAL" ? "UNDER_1M" : (input.targetBudgetTier ?? "UNDER_1M");
  // Same reserved opt-out value calculateSystemPricing honors above (see
  // NONE_CODE's doc comment), PLUS the UNDER_1M budget tier ALSO forcing
  // no battery — the Checker's exact BOQ must respect the customer's
  // original "no battery" outcome (whether from an explicit opt-out or
  // from the tier they were quoted under), never silently reintroduce
  // one at approval time. An explicit real batteryCode pick still always
  // overrides this, same precedence as calculateSystemPricing.
  const batteryOptedOut =
    needsBattery &&
    (selections?.batteryCode === NONE_CODE || (effectiveBudgetTier === "UNDER_1M" && selections?.batteryCode === undefined));
  // Checker's confirmed capacity wins over the pre-survey estimate when
  // provided — see AdminBoqPricingInput.finalBatteryCapacityKwh's doc comment.
  const hasFinalCapacity = needsBattery && !batteryOptedOut && input.finalBatteryCapacityKwh != null;

  // Target capacity, computed BEFORE code resolution (2026-08-22) — same
  // reordering and same reasoning as calculateSystemPricing's matching
  // comment: with real fixed-capacity battery SKUs, the CODE resolution
  // itself needs this number now, not just the final priced line.
  const batteryCapacityKwh =
    needsBattery && !batteryOptedOut
      ? hasFinalCapacity
        ? input.finalBatteryCapacityKwh!
        : (selections?.batteryCapacityKwh ?? systemKw * DEFAULT_BATTERY_KWH_PER_SYSTEM_KW)
      : 0;
  if (needsBattery && !batteryOptedOut && (!Number.isFinite(batteryCapacityKwh) || batteryCapacityKwh <= 0)) {
    throw new PricingConfigurationError(`Invalid battery capacity (${batteryCapacityKwh} kWh) for sector=${sector}.`);
  }

  // Resolve the ACTUAL equipment codes the customer's original quote
  // selected (falling back to the SAME budget-tier-aware default
  // calculateSystemPricing would have resolved for anything unset or
  // "OTHER" — not the plain admin-marked default, which would silently
  // re-introduce the "always resolves to a real battery" bug this field
  // exists to close) — Panel/Inverter/Breakers/Battery all price by
  // whichever specific catalog row this resolves to, not an arbitrary
  // "most recently created" row for the componentType. Structure is
  // deliberately NOT resolved this way — see AdminBoqPricingInput's doc
  // comment on structureChoice. DC_CABLE/AC_CABLE/CT_COIL/DB_UPGRADE are
  // exact-measurement, single-fixed-vendor items with no brand selection
  // at this stage, so there's no code to resolve for them either.
  const [panelCode, inverterCode, breakersCode, batteryCode] = await Promise.all([
    resolveEquipmentCode("SOLAR_PANEL", null, selections?.panelCode, DEFAULT_PANEL_CODE),
    resolveBudgetTierInverterCode(effectiveBudgetTier, systemKw, serviceType).then((defaultInverterCode) =>
      resolveEquipmentCode("INVERTER", serviceType, selections?.inverterCode, defaultInverterCode)
    ),
    resolveEquipmentCode("BREAKERS", null, selections?.breakersCode, DEFAULT_BREAKERS_CODE),
    // batteryOptedOut is already true whenever effectiveBudgetTier is
    // UNDER_1M (see above), so reaching here only happens for
    // 1M_TO_1_5M/1_5M_PLUS. Two sub-cases (2026-08-22, real fixed-
    // capacity SKUs): if the Field Engineer supplied a confirmed
    // on-site capacity (hasFinalCapacity), that OVERRIDES whatever
    // brand/SKU the customer pre-selected online — same "Checker's
    // confirmed capacity wins" precedence this field has always had,
    // just now expressed as "re-resolve to the smallest real SKU
    // covering the surveyed number" instead of "re-scale the price."
    // Otherwise, same as before: explicit customer pick wins, else the
    // budget-tier/capacity-resolved default.
    needsBattery && !batteryOptedOut
      ? hasFinalCapacity
        ? resolveBudgetTierBatteryCode(serviceType, batteryCapacityKwh)
        : resolveBudgetTierBatteryCode(serviceType, batteryCapacityKwh).then((defaultBatteryCode) =>
            resolveEquipmentCode("BATTERY", serviceType, selections?.batteryCode, defaultBatteryCode)
          )
      : Promise.resolve(null),
  ]);

  // Earthing/Lightning — same "no separate site-survey re-measurement,
  // just re-resolve from the original equipmentSelections" reasoning as
  // dcCableMeters/etc above. Civil Blocks is computed further down from
  // the real panel count instead (see EquipmentSelections.civilBlockQty's
  // doc comment on why it's no longer read from selections at all).
  const earthingBoreQty = resolveQty(selections?.earthingBoreQty, DEFAULT_EARTHING_BORE_QTY);
  const lightningArrestorQty = resolveQty(selections?.lightningArrestorQty, DEFAULT_LIGHTNING_ARRESTOR_QTY);

  const activeCostFilter = (componentType: ComponentType, itemName?: string) => ({
    componentType,
    ...(itemName !== undefined && { itemName }),
    isActive: true,
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
  });

  const [
    panel,
    inverter,
    breakers,
    battery,
    structure,
    settings,
    dcCable,
    acCable,
    dataCable,
    dbUpgrade,
    marginRule,
    panelOption,
    inverterOption,
    batteryOption,
  ] = await Promise.all([
      adminPrisma.rawVendorCost.findFirst({ where: activeCostFilter("SOLAR_PANEL", panelCode), orderBy: { effectiveFrom: "desc" } }),
      // PER_PIECE, not PER_WATT (2026-08-22) — matches
      // calculateSystemPricing's own inverter lookup exactly (this used
      // to be the one spot the two engines could disagree: this filter
      // had no unit check at all, calculateSystemPricing's did). See
      // rawInverterPKR below for the matching no-longer-scaled-by-watts fix.
      adminPrisma.rawVendorCost.findFirst({
        where: { ...activeCostFilter("INVERTER", inverterCode), unit: "PER_PIECE" },
        orderBy: { effectiveFrom: "desc" },
      }),
      adminPrisma.rawVendorCost.findFirst({ where: activeCostFilter("BREAKERS", breakersCode), orderBy: { effectiveFrom: "desc" } }),
      // unit: "PER_PIECE" (2026-08-22) — matches calculateSystemPricing's
      // own battery lookup exactly (this used to be the one spot the two
      // engines could disagree on battery, the same historical gap the
      // inverter rework already closed for INVERTER).
      needsBattery && batteryCode
        ? adminPrisma.rawVendorCost.findFirst({
            where: { ...activeCostFilter("BATTERY", batteryCode), unit: "PER_PIECE" },
            orderBy: { effectiveFrom: "desc" },
          })
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
    // Cost-free catalog metadata (specValue = panel wattage / inverter
    // rated kW) for the same Panel Quantity Adjuster / Civil Blocks math
    // calculateSystemPricing uses — a miss here just falls back to
    // FALLBACK_PANEL_WATTAGE_W / "no cap," same as there.
    adminPrisma.equipmentOption.findFirst({ where: { componentType: "SOLAR_PANEL", code: panelCode } }),
    adminPrisma.equipmentOption.findFirst({ where: { componentType: "INVERTER", code: inverterCode } }),
    // Real resolved battery capacity for the returned batteryCapacityKwh
    // field below (2026-08-22) — without this, that field would only
    // ever report the raw TARGET searched for, not what the resolved
    // SKU actually holds.
    needsBattery && batteryCode ? adminPrisma.equipmentOption.findFirst({ where: { componentType: "BATTERY", code: batteryCode } }) : null,
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
  // Same Panel Quantity Adjuster math/clamping as calculateSystemPricing
  // (including the 115% PANEL_OVERSIZE_ALLOWANCE, see that constant's
  // doc comment) — re-clamped here too (not just trusted from the
  // original quote's persisted panelQtyOverride) in case the resolved
  // inverter changed between the instant estimate and this exact-BOQ
  // pass. Civil Blocks derives from THIS real, re-clamped count, same
  // formula as the instant estimate.
  // Inverter "clubbing" (2026-08-29) — same as calculateSystemPricing's
  // matching inverterQuantity; see inverterQuantityFor's own doc
  // comment. Re-derived here too (not just trusted from the original
  // quote) for the same reason maxPanelCount below already is.
  // resolveInverterQuantity, not the bare inverterQuantityFor — same
  // manual-override support as calculateSystemPricing (including the
  // Commercial/Industrial "no floor" behavior), so a Checker recalculate
  // never drops a customer's confirmed manual quantity back down to the
  // auto-computed minimum.
  const inverterQuantity = resolveInverterQuantity(
    systemKw,
    inverterOption?.specValue?.toNumber() ?? null,
    selections?.inverterQuantityOverride,
    sector
  );
  const panelWattage = panelOption?.specValue?.toNumber() ?? FALLBACK_PANEL_WATTAGE_W;
  const baselinePanelCount = Math.ceil(watts / panelWattage);
  const maxPanelCount = inverterOption?.specValue
    ? Math.floor((inverterOption.specValue.toNumber() * inverterQuantity * 1000 * PANEL_OVERSIZE_ALLOWANCE) / panelWattage)
    : null;
  // Floor is Math.min(PANEL_COUNT_ABSOLUTE_MINIMUM, maxPanelCount), same
  // defensive clamp as calculateSystemPricing — see that one's own
  // comment and PANEL_COUNT_ABSOLUTE_MINIMUM's doc comment for why this
  // is no longer flooring at baselinePanelCount.
  const effectivePanelCount = Math.min(
    Math.max(Math.round(selections?.panelQtyOverride ?? baselinePanelCount), Math.min(PANEL_COUNT_ABSOLUTE_MINIMUM, maxPanelCount ?? Infinity)),
    maxPanelCount ?? Infinity
  );
  const civilBlockQty = Math.ceil(effectivePanelCount * 1.5);

  // RAW (pre-margin) costs — this breakdown stays the true underlying
  // cost, unaffected by margin, same as before this pass: it's what the
  // Checker uses to audit true spend vs. price (Business Rule #3), not
  // what a customer is quoted. See markedUpBreakdown below for that.
  const rawSiteWorksPKR = round2(
    civilBlockQty * settings.civilWorkCostPerBlock +
      earthingBoreQty * settings.earthingCostPerBore +
      lightningArrestorQty * settings.lightningArrestorCostPerUnit
  );
  // "One-Time Panel Washing Visit" — same toggle/formula as
  // calculateSystemPricing, re-resolved from the original
  // equipmentSelections (no separate site-survey step for this either).
  const panelWashingResult = selections?.includePanelWashing ? panelWashingRawCostPKR(effectivePanelCount, settings) : null;
  const rawPanelWashingPKR = panelWashingResult?.rawCostPKR ?? 0;

  const breakdown: AdminBoqPricingBreakdown = {
    // Only panelPKR scales with the adjusted count — same deliberate v1
    // simplification as calculateSystemPricing (see its comment).
    panelPKR: round2(p.unitCostRs.toNumber() * (effectivePanelCount * panelWattage)),
    // Flat PER_PIECE (2026-08-22) — see calculateSystemPricing's matching
    // rawInverterPKR comment; not scaled by watts. Multiplied by
    // inverterQuantity (2026-08-29) — 1 for every ordinary quote, see
    // that variable's own comment above.
    inverterPKR: round2(inv.unitCostRs.toNumber() * inverterQuantity),
    // Flat PER_PIECE (2026-08-22) — see calculateSystemPricing's matching
    // rawBatteryPKR comment; not scaled by batteryCapacityKwh (that's a
    // TARGET used to resolve which SKU to price, not a multiplier).
    batteryPKR: needsBattery && battery ? round2(battery.unitCostRs.toNumber()) : 0,
    breakersPKR: round2(brk.unitCostRs.toNumber() * watts),
    structurePKR: round2(struct.unitCostRs.toNumber() * watts),
    installationPKR: round2(installationRateForSector(settings, sector) * watts),
    dcCablePKR: round2(dc.unitCostRs.toNumber() * dcCableMeters),
    acCablePKR: round2(ac.unitCostRs.toNumber() * acCableMeters),
    dataCablePKR: round2(data.unitCostRs.toNumber() * dataCableMeters),
    dbUpgradePKR: requiresDbUpgrade && dbUpgrade ? round2(dbUpgrade.unitCostRs.toNumber()) : 0,
    siteWorksPKR: rawSiteWorksPKR,
    panelWashingPKR: rawPanelWashingPKR,
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
    // Flat admin rate (GlobalPricingSettings), not a RawVendorCost row —
    // no per-item override, just the sector default margin (same as
    // installationPKR above and calculateSystemPricing's siteWorksPKR).
    siteWorksPKR: round2(markUp(breakdown.siteWorksPKR, sectorDefaultMarginPercent)),
    // Panel Washing is deliberately NOT marked up — see the matching
    // comment on ItemizedBreakdown.panelWashingPKR in
    // calculateSystemPricing above; this exact-BOQ line must agree with
    // the instant estimate so the two never disagree on what the
    // customer sees for this line.
    panelWashingPKR: panelWashingResult ? round2(breakdown.panelWashingPKR) : 0,
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
    // The RESOLVED SKU's real capacity, not the raw target searched for
    // (2026-08-22) — same reasoning as calculateSystemPricing's matching
    // resolvedEquipment.battery.capacityKwh fix. Falls back to the
    // target only for the OTHER/custom-requirement code.
    batteryCapacityKwh: needsBattery && !batteryOptedOut ? (batteryOption?.specValue?.toNumber() ?? batteryCapacityKwh) : null,
    siteWorks: { civilBlockQty, earthingBoreQty, lightningArrestorQty },
    panelWashing: panelWashingResult
      ? { panelCount: effectivePanelCount, ratePerPanel: panelWashingResult.ratePerPanel, isMinimumFeeApplied: panelWashingResult.isMinimumFeeApplied }
      : null,
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
  /** Electrical phase (2026-08-22) — only ever set for INVERTER rows. */
  phase: InverterPhase | null;
  isDefault: boolean;
  isActive: boolean;
  /** Inventory guardrail — see its doc comment in schema.prisma. */
  inStock: boolean;
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
  /** Replaced the old single flat `installationCostPerWatt` — installation
   *  now varies by sector, see GlobalPricingSettings in schema.prisma and
   *  installationRateForSector() below. */
  installationCostPerWattResidential: number;
  installationCostPerWattCommercial: number;
  installationCostPerWattIndustrial: number;
  evChargerInstallationFee: number;
  /** Tiered "One-Time Visit" Panel Washing rates (2026-08-21) — replaced
   *  the old single flat washingCostPerPanel. See
   *  panelWashingRawCostPKR()'s doc comment for the exact bracket logic. */
  washingRateTier1PerPanel: number;
  washingRateTier2PerPanel: number;
  washingRateTier3PerPanel: number;
  washingRateTier4PerPanel: number;
  washingMinimumVisitFeePKR: number;
  /** "Site Works" add-on rates (2026-08-20) — see siteWorksPKR's doc
   *  comment below and GlobalPricingSettings in schema.prisma. */
  civilWorkCostPerBlock: number;
  earthingCostPerBore: number;
  lightningArrestorCostPerUnit: number;
  sectorMargins: Record<Sector, number>;
}

export interface GlobalPricingSettingsDTO {
  installationCostPerWattResidential: number;
  installationCostPerWattCommercial: number;
  installationCostPerWattIndustrial: number;
  evChargerInstallationFee: number;
  washingRateTier1PerPanel: number;
  washingRateTier2PerPanel: number;
  washingRateTier3PerPanel: number;
  washingRateTier4PerPanel: number;
  washingMinimumVisitFeePKR: number;
  civilWorkCostPerBlock: number;
  earthingCostPerBore: number;
  lightningArrestorCostPerUnit: number;
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
  washingRateTier1PerPanel: 200,
  washingRateTier2PerPanel: 150,
  washingRateTier3PerPanel: 125,
  washingRateTier4PerPanel: 100,
  washingMinimumVisitFeePKR: 2000,
  civilWorkCostPerBlock: 3000,
  earthingCostPerBore: 5000,
  lightningArrestorCostPerUnit: 8000,
};

/** The one GlobalPricingSettings row — see its doc comment in
 *  schema.prisma for why this is a plain singleton rather than another
 *  effective-dated RawVendorCost-style table. Exported so the `/rules`
 *  route can read current values without duplicating this fallback logic. */
export async function getGlobalPricingSettings(): Promise<GlobalPricingSettingsDTO> {
  const adminPrisma = await getAdminPrisma();
  const row = await adminPrisma.globalPricingSettings.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!row) return FALLBACK_GLOBAL_PRICING_SETTINGS;
  return {
    installationCostPerWattResidential: row.installationCostPerWattResidential.toNumber(),
    installationCostPerWattCommercial: row.installationCostPerWattCommercial.toNumber(),
    installationCostPerWattIndustrial: row.installationCostPerWattIndustrial.toNumber(),
    evChargerInstallationFee: row.evChargerInstallationFee.toNumber(),
    washingRateTier1PerPanel: row.washingRateTier1PerPanel.toNumber(),
    washingRateTier2PerPanel: row.washingRateTier2PerPanel.toNumber(),
    washingRateTier3PerPanel: row.washingRateTier3PerPanel.toNumber(),
    washingRateTier4PerPanel: row.washingRateTier4PerPanel.toNumber(),
    washingMinimumVisitFeePKR: row.washingMinimumVisitFeePKR.toNumber(),
    civilWorkCostPerBlock: row.civilWorkCostPerBlock.toNumber(),
    earthingCostPerBore: row.earthingCostPerBore.toNumber(),
    lightningArrestorCostPerUnit: row.lightningArrestorCostPerUnit.toNumber(),
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

/** "Site Works" quantity resolution — a customer-adjustable count, not a
 *  brand/model pick, so no OTHER_CODE/resolveSelection involved. Coerced
 *  to a non-negative integer defensively (Zod already enforces this at
 *  the API boundary, but calculateSystemPricing/calculateAdminBoqPricing
 *  are the sanctioned pricing boundary itself — see the module doc
 *  comment — so neither should trust an out-of-range caller either).
 *  Shared by both, same "can't drift" reasoning as installationRateForSector
 *  above. */
function resolveQty(qty: number | undefined, defaultQty: number): number {
  if (qty === undefined) return defaultQty;
  if (!Number.isFinite(qty) || qty < 0) return defaultQty;
  return Math.round(qty);
}

// ============================================================================
// Target Budget tiers (2026-08-20) — auto-selects the smallest/cheapest/
// oversized IN-STOCK inverter and battery for a given budget bracket,
// instead of the admin-marked Recommended default. Deliberately layered
// ON TOP of the real daytime-offset sizing model (systemKw is computed
// the same way it always has been, in calculateSystemSize() in
// app/api/quote/calculate/route.ts) — NOT a replacement sizing formula.
// An explicit Custom Builder pick (selections.inverterCode/batteryCode)
// still always wins over whatever a budget tier would have auto-picked;
// see calculateSystemPricing's resolveSelection/batteryOptedOut.
// ============================================================================

export type BudgetTier = "UNDER_1M" | "1M_TO_1_5M" | "1_5M_PLUS";
const BUDGET_TIERS: readonly BudgetTier[] = ["UNDER_1M", "1M_TO_1_5M", "1_5M_PLUS"];

/** Safely narrows Quote.targetBudgetTier (a plain `String?` column — see
 *  its doc comment in schema.prisma for why it isn't a Prisma enum: two
 *  of the three tier values start with a digit, which Prisma enum
 *  identifiers can't) back to `BudgetTier | null`. Same shape-check-not-
 *  full-validation spirit as parseEquipmentSelections/parseSpecs — an
 *  unrecognized/corrupted value degrades to null (treated as "UNDER_1M"
 *  by every caller, per the whole point of this field: never silently
 *  assume a battery was included). */
export function parseBudgetTier(value: string | null | undefined): BudgetTier | null {
  return value && (BUDGET_TIERS as readonly string[]).includes(value) ? (value as BudgetTier) : null;
}

/** Smallest in-stock inverter (for this service type) whose own rated
 *  capacity (specValue, kW) covers the required system size — "smallest
 *  that fits," not "cheapest" or "admin default." Inverters with no
 *  specValue on file are excluded (their capacity is unknown, so "fits"
 *  can't be evaluated — see EquipmentOption.specValue's doc comment on
 *  how common that gap still is in this catalog). Returns null if
 *  nothing in-stock actually covers the requirement — callers fall back
 *  to getDefaultCode(). */
async function findSmallestFittingInStockInverter(systemKw: number, serviceType: ServiceType): Promise<string | null> {
  const adminPrisma = await getAdminPrisma();
  const rows = await adminPrisma.equipmentOption.findMany({
    where: {
      componentType: "INVERTER",
      applicableServiceType: serviceType,
      isActive: true,
      inStock: true,
      isOtherOption: false,
      specValue: { gte: systemKw },
    },
    orderBy: { specValue: "asc" },
    take: 1,
  });
  return rows[0]?.code ?? null;
}

/** An oversized in-stock inverter, +3 to +5kW over the required system
 *  size (the "1.5M+" budget tier's future-proofing pick, per spec) —
 *  prefers the SMALLEST inverter that clears +3kW over systemKw (closest
 *  match to the "+3 to +5kW" band), not the biggest one in the catalog.
 *  Falls back to a plain "smallest that fits" pick if nothing in-stock
 *  reaches +3kW over (better an appropriately-sized inverter than none). */
async function findOversizedInStockInverter(systemKw: number, serviceType: ServiceType): Promise<string | null> {
  const adminPrisma = await getAdminPrisma();
  const rows = await adminPrisma.equipmentOption.findMany({
    where: {
      componentType: "INVERTER",
      applicableServiceType: serviceType,
      isActive: true,
      inStock: true,
      isOtherOption: false,
      specValue: { gte: systemKw + 3 },
    },
    orderBy: { specValue: "asc" },
    take: 1,
  });
  return rows[0]?.code ?? findSmallestFittingInStockInverter(systemKw, serviceType);
}

/** Largest in-stock inverter for this service type — the "clubbing"
 *  building block once systemKw exceeds what any single catalog unit
 *  can cover (e.g. a 140kW Industrial system → 2 × the largest 100kW
 *  unit, see inverterQuantityFor below). Mirrors the shape of
 *  findSmallestFittingInStockInverter/findOversizedInStockInverter
 *  above; sorted descending, no capacity filter at all — this is
 *  reached only once THOSE finders have already both failed (nothing
 *  single-unit-sized fits), so the goal here is simply "the biggest
 *  thing we can actually sell," not a fit check. Null only if nothing
 *  at all is in stock for this service type. */
async function findLargestInStockInverter(serviceType: ServiceType): Promise<string | null> {
  const adminPrisma = await getAdminPrisma();
  const rows = await adminPrisma.equipmentOption.findMany({
    where: {
      componentType: "INVERTER",
      applicableServiceType: serviceType,
      isActive: true,
      inStock: true,
      isOtherOption: false,
      specValue: { not: null },
    },
    orderBy: { specValue: "desc" },
    take: 1,
  });
  return rows[0]?.code ?? null;
}

/** How many of the resolved inverter SKU are actually needed to cover
 *  systemKw. 1 for the overwhelming majority of quotes — the resolved
 *  SKU's own rated kW already covers the whole system, same as always.
 *  >1 ("clubbing") only once systemKw exceeds every single in-stock
 *  unit's own rated capacity, in which case resolveBudgetTierInverterCode
 *  below has already resolved to the LARGEST available unit (via
 *  findLargestInStockInverter) — this just computes how many of THAT
 *  unit are needed to cover the load. Shared by calculateSystemPricing
 *  and calculateAdminBoqPricing so the two engines can never disagree
 *  on unit count for the same inputs (same convention as
 *  effectiveMarginPercent/markUp above). */
function inverterQuantityFor(systemKw: number, inverterSpecValueKw: number | null): number {
  if (!inverterSpecValueKw) return 1;
  return Math.max(1, Math.ceil(systemKw / inverterSpecValueKw));
}

/** Manual "future expansion" ceiling for EquipmentSelections.
 *  inverterQuantityOverride (2026-08-29) — a sanity cap against a
 *  fat-fingered or malicious quantity, not a real business constraint.
 *  Kept in sync with the matching Zod `.max()` on inverterQuantityOverride
 *  in app/api/quote/calculate/route.ts's equipmentSelectionsSchema (the
 *  actual API-boundary enforcement; this is defense in depth for the
 *  rare direct caller). */
const MAX_INVERTER_UNITS = 20;

/** Resolves the FINAL inverter quantity actually priced: the customer's
 *  manual override (EquipmentSelections.inverterQuantityOverride) if
 *  present, otherwise inverterQuantityFor's own auto-computed minimum.
 *
 *  Residential keeps the original (2026-08-29) safety floor: an override
 *  can only ever ADD headroom above the auto-computed minimum, never
 *  undersize the system below what systemKw actually requires. A request
 *  that names a downgrade there is a no-op, not an error.
 *
 *  Commercial/Industrial Custom Builder picks get TRUE manual control
 *  instead (2026-08-29, explicit instruction: "complete freedom over
 *  inverter choices and quantities" for C&I) — free to deliberately
 *  undersize (a phased installation, intentionally covering only part of
 *  the load, etc.) down to a bare minimum of 1 unit. Only reachable via
 *  an explicit Custom Builder pick in the first place (the Recommended
 *  path never sends equipmentSelections/an override at all), so this
 *  never affects the Recommended-path sizing math either sector gets.
 *  Still hard-capped at MAX_INVERTER_UNITS either way — a sanity ceiling,
 *  not a business rule. */
function resolveInverterQuantity(
  systemKw: number,
  inverterSpecValueKw: number | null,
  override: number | undefined,
  sector: Sector
): number {
  const autoQuantity = inverterQuantityFor(systemKw, inverterSpecValueKw);
  if (override === undefined || !Number.isFinite(override) || override > MAX_INVERTER_UNITS) {
    return autoQuantity;
  }
  const flooredOverride = Math.floor(override);
  if (sector !== "RESIDENTIAL") {
    return Math.max(1, flooredOverride);
  }
  return flooredOverride <= autoQuantity ? autoQuantity : flooredOverride;
}

/** Smallest in-stock battery (for this service type) whose own real
 *  capacity (specValue, kWh) covers the target — "smallest that fits,"
 *  the exact same principle as findSmallestFittingInStockInverter above
 *  (2026-08-22 rework: batteries are now real, specific products with a
 *  fixed kWh capacity each, not a blended Rs/kWh rate a customer could
 *  dial to any arbitrary number — see EquipmentOption catalog's BATTERY
 *  section in prisma/seed.ts for the real w11stop-sourced SKUs this
 *  resolves against). Batteries with no specValue on file are excluded.
 *  Returns null if nothing in-stock actually covers the target —
 *  callers fall back to getDefaultCode(). */
async function findSmallestFittingInStockBattery(targetKwh: number, serviceType: ServiceType): Promise<string | null> {
  const adminPrisma = await getAdminPrisma();
  const rows = await adminPrisma.equipmentOption.findMany({
    where: {
      componentType: "BATTERY",
      applicableServiceType: serviceType,
      isActive: true,
      inStock: true,
      isOtherOption: false,
      specValue: { gte: targetKwh },
    },
    orderBy: { specValue: "asc" },
    take: 1,
  });
  return rows[0]?.code ?? null;
}

/** Resolves the budget-tier-driven inverter default — smallest-fitting
 *  for UNDER_1M/1M_TO_1_5M, oversized for 1_5M_PLUS. If nothing
 *  single-unit-sized covers systemKw at all (Industrial-scale, beyond
 *  even the biggest catalog unit — see findLargestInStockInverter's own
 *  doc comment), clubs multiple of the largest available unit instead
 *  of falling straight to the admin default (2026-08-29 fix — that
 *  default is a small residential/commercial-sized unit, wildly
 *  undersized for a system this large; see inverterQuantityFor, called
 *  separately by both pricing engines once this code is resolved, for
 *  the actual unit-count math). Only falls back to the ordinary
 *  admin-configured Recommended default when NOTHING at all is in
 *  stock for this service type, so a thin/empty catalog never breaks
 *  pricing. */
async function resolveBudgetTierInverterCode(tier: BudgetTier, systemKw: number, serviceType: ServiceType): Promise<string> {
  const code =
    tier === "1_5M_PLUS"
      ? await findOversizedInStockInverter(systemKw, serviceType)
      : await findSmallestFittingInStockInverter(systemKw, serviceType);
  if (code) return code;
  const largest = await findLargestInStockInverter(serviceType);
  return largest ?? getDefaultCode("INVERTER", serviceType, DEFAULT_INVERTER_CODE_BY_SERVICE_TYPE[serviceType]);
}

/** Resolves the budget-tier-driven battery default — smallest REAL,
 *  in-stock SKU that covers `targetKwh` (2026-08-22: was "cheapest
 *  in-stock regardless of capacity," which stopped making sense once
 *  batteries became fixed-capacity products — the cheapest SKU overall
 *  is almost always the smallest one, which could be badly undersized
 *  for a Commercial/Industrial system). Used for both tiers that
 *  include a battery at all (UNDER_1M forces NONE_CODE instead, handled
 *  separately via batteryOptedOut). Falls back to the ordinary admin
 *  default when nothing in-stock actually covers the target. */
async function resolveBudgetTierBatteryCode(serviceType: ServiceType, targetKwh: number): Promise<string> {
  const code = await findSmallestFittingInStockBattery(targetKwh, serviceType);
  return code ?? getDefaultCode("BATTERY", serviceType, DEFAULT_BATTERY_CODE);
}

/** Mirrors app/page.tsx's FALLBACK_PANEL_WATTAGE_W — must stay
 *  numerically identical (a display-only client copy existed before this
 *  server-side one; both now feed real pricing/adjuster-limit math, not
 *  just display, so drift here is a real bug, not a cosmetic one). Only
 *  used when a resolved panel option is missing its specValue. */
const FALLBACK_PANEL_WATTAGE_W = 610;

export interface PanelWashingQuote {
  panelCount: number;
  rawCostPKR: number;
  clientPricePKR: number;
  /** The tier rate (Rs/panel) that actually applied — see
   *  panelWashingRawCostPKR's doc comment for the brackets. Lets callers
   *  render "50 Panels @ Rs 150/panel" without re-deriving which bracket
   *  panelCount fell into. */
  ratePerPanel: number;
  /** True when the Rs washingMinimumVisitFeePKR floor was the binding
   *  constraint (panelCount × ratePerPanel would otherwise have been
   *  less) — callers render "(Minimum Call-Out Fee)" instead of the
   *  "N Panels @ Rs X/panel" breakdown in that case. */
  isMinimumFeeApplied: boolean;
}

/** "One-Time Visit" Panel Washing tiered pricing (2026-08-21) — 4 volume
 *  brackets, each a flat Rs/panel rate, with a minimum call-out fee floor
 *  so a tiny job is never priced below what a visit actually costs to run:
 *    1-20 panels:   Rs washingRateTier1PerPanel/panel (floor applies here
 *                   in practice — the other 3 brackets' tiered cost always
 *                   exceeds the floor on its own)
 *    21-60 panels:  Rs washingRateTier2PerPanel/panel
 *    61-150 panels: Rs washingRateTier3PerPanel/panel
 *    151+ panels:   Rs washingRateTier4PerPanel/panel
 *  All 5 numbers are admin-editable via /admin/pricing's "Panel Washing
 *  Rates" card (POST /api/admin/pricing/rules) — GlobalPricingSettings,
 *  same flat-rate shape as installation/EV Charger/Site Works, not a
 *  RawVendorCost catalog row (no brand/model involved). Shared by BOTH
 *  the standalone "System Upgrades & Washing" inquiry flow
 *  (calculatePanelWashingQuote below) and the Custom Equipment Builder's
 *  toggleable washing option (calculateSystemPricing/
 *  calculateAdminBoqPricing) — one formula, can't drift between the two. */
function panelWashingRawCostPKR(
  panelCount: number,
  settings: GlobalPricingSettingsDTO
): { rawCostPKR: number; ratePerPanel: number; isMinimumFeeApplied: boolean } {
  const ratePerPanel =
    panelCount <= 20
      ? settings.washingRateTier1PerPanel
      : panelCount <= 60
        ? settings.washingRateTier2PerPanel
        : panelCount <= 150
          ? settings.washingRateTier3PerPanel
          : settings.washingRateTier4PerPanel;
  const tieredCostPKR = panelCount * ratePerPanel;
  const rawCostPKR = Math.max(settings.washingMinimumVisitFeePKR, tieredCostPKR);
  return { rawCostPKR: round2(rawCostPKR), ratePerPanel, isMinimumFeeApplied: rawCostPKR > tieredCostPKR };
}

/** Standalone add-on pricing for the "System Upgrades & Washing" inquiry
 *  flow — Panel Washing has no BOQ/system sizing of its own, just the
 *  tiered rate above. Deliberately NOT marked up by any margin
 *  (2026-08-21, explicit instruction) — `clientPricePKR` is exactly the
 *  admin-configured tiered rate card's number, no percentage added on
 *  top, so it can no longer vary by sector and takes no sector param. */
export async function calculatePanelWashingQuote(panelCount: number): Promise<PanelWashingQuote> {
  if (!Number.isFinite(panelCount) || panelCount <= 0) {
    throw new PricingConfigurationError(`Invalid panel count (${panelCount}) for a washing quote.`);
  }
  const settings = await getGlobalPricingSettings();
  const { rawCostPKR, ratePerPanel, isMinimumFeeApplied } = panelWashingRawCostPKR(panelCount, settings);
  const clientPricePKR = Math.round(rawCostPKR);
  return { panelCount, rawCostPKR, clientPricePKR, ratePerPanel, isMinimumFeeApplied };
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
/** Client-safe per-code pricing basis — the marked-up PKR price alongside
 *  which `CostUnit` it's priced against (PER_WATT/PER_KWH/PER_PIECE/…).
 *  `unit` is NOT sensitive (it reveals nothing about raw cost or margin,
 *  just "how this number should be read") but lives only on the
 *  confidential `RawVendorCost` row — this is the ONE sanctioned way for
 *  a public-facing surface (the Market Watch ticker, Custom Builder price
 *  labels) to know it, added 2026-08-22 after the ticker was found
 *  hardcoding every item as "/W" regardless of its real unit (a flat
 *  PER_PIECE inverter showed as "Rs 525,000/W" instead of "/pc"). */
export interface PublicUnitPrice {
  pricePKR: number;
  unit: CostUnit;
  /** Inventory guardrail — see EquipmentOption.inStock's doc comment in
   *  schema.prisma. Exposed here (2026-08-25) so a call site that only
   *  has this map in hand (no separate EquipmentOption query of its
   *  own — see handleEvChargerQuote in app/api/quote/calculate/route.ts)
   *  can still enforce the same "never price an out-of-stock item"
   *  guardrail calculateSystemPricing already does for Panel/Inverter/
   *  Battery. */
  inStock: boolean;
}

export async function getPublicUnitPricesPKR(sector: Sector): Promise<Record<string, PublicUnitPrice>> {
  const adminPrisma = await getAdminPrisma();
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

  const prices: Record<string, PublicUnitPrice> = {};
  for (const option of options) {
    const cost = costByKey.get(`${option.componentType}::${option.code}`);
    if (!cost) continue;
    prices[option.code] = {
      pricePKR: round2(markUp(cost.unitCostRs.toNumber(), effectiveMarginPercent(cost, sectorDefaultMarginPercent))),
      unit: cost.unit,
      inStock: option.inStock,
    };
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
  const adminPrisma = await getAdminPrisma();
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
  const adminPrisma = await getAdminPrisma();
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
      phase: opt.phase,
      isDefault: opt.isDefault,
      isActive: opt.isActive,
      inStock: opt.inStock,
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

  return {
    items,
    globalRules: {
      installationCostPerWattResidential: settings.installationCostPerWattResidential,
      installationCostPerWattCommercial: settings.installationCostPerWattCommercial,
      installationCostPerWattIndustrial: settings.installationCostPerWattIndustrial,
      evChargerInstallationFee: settings.evChargerInstallationFee,
      washingRateTier1PerPanel: settings.washingRateTier1PerPanel,
      washingRateTier2PerPanel: settings.washingRateTier2PerPanel,
      washingRateTier3PerPanel: settings.washingRateTier3PerPanel,
      washingRateTier4PerPanel: settings.washingRateTier4PerPanel,
      washingMinimumVisitFeePKR: settings.washingMinimumVisitFeePKR,
      civilWorkCostPerBlock: settings.civilWorkCostPerBlock,
      earthingCostPerBore: settings.earthingCostPerBore,
      lightningArrestorCostPerUnit: settings.lightningArrestorCostPerUnit,
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
  const adminPrisma = await getAdminPrisma();
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
    phase: InverterPhase | null;
    isDefault: boolean;
    isActive: boolean;
    inStock: boolean;
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
    phase: option.phase,
    isDefault: option.isDefault,
    isActive: option.isActive,
    inStock: option.inStock,
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
  /** Electrical phase (2026-08-22) — only meaningful for
   *  componentType=INVERTER; ignored/left null for everything else.
   *  Immutable after creation, same as specValue/applicableServiceType/
   *  unit — see UpdateMaterialInput's doc comment for why. */
  phase?: InverterPhase | null;
  unit: CostUnit;
  vendorCostRs: number;
  vendorName?: string | null;
  marginPercentOverride?: number | null;
  isDefault?: boolean;
  /** Inventory guardrail — see its doc comment in schema.prisma. Omitted
   *  defaults to true (matches the column's own DB default), same as
   *  every other new material — nothing starts out-of-stock by accident. */
  inStock?: boolean;
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
  const adminPrisma = await getAdminPrisma();
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
      phase: input.phase ?? null,
      isDefault: input.isDefault ?? false,
      sortOrder: 50,
      isActive: true,
      inStock: input.inStock ?? true,
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
  /** Inventory guardrail toggle — see its doc comment in schema.prisma. */
  inStock?: boolean;
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
  const adminPrisma = await getAdminPrisma();
  const option = await adminPrisma.equipmentOption.findUnique({ where: { id } });
  if (!option) {
    throw new PricingConfigurationError(`Material item ${id} not found.`);
  }

  if (input.isDefault === true) {
    await clearExistingDefault(option.componentType, option.applicableServiceType);
  }

  const needsOptionUpdate =
    input.isDefault !== undefined ||
    input.inStock !== undefined ||
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
          ...(input.inStock !== undefined && { inStock: input.inStock }),
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
  const adminPrisma = await getAdminPrisma();
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
  /** Partial — only the sectors present are changed. */
  sectorMargins?: Partial<Record<Sector, number>>;
  /** Super Admin's User.id — MarginRule.createdById is a required FK,
   *  only actually used if a sector has no existing margin row to update. */
  updatedById: string;
}

/** Updates one or more sectors' default margin — the KPI banner at the
 *  top of /admin/pricing. Used to also carry the structure per-watt base
 *  rate; that's gone (2026-08-27) — Mounting Structure is now a real,
 *  multi-item catalog tab like every other component (see the
 *  "Mounting Structure" TABS entry in app/admin/pricing/page.tsx and
 *  getCheapestStructureCode's doc comment above), each type's rate
 *  edited the same generic per-item way Panel/Inverter/etc. already are.
 *  Installation rates moved to updateGlobalPricingSettings() below
 *  (POST /api/admin/pricing/rules) since they're no longer one flat
 *  RawVendorCost row — this function's return still includes the full
 *  GlobalPricingRules shape (fetching current settings alongside) so
 *  every caller gets one complete, consistent object regardless of
 *  which endpoint they hit. */
export async function updateGlobalPricingRule(input: UpdateGlobalRulesInput): Promise<GlobalPricingRules> {
  const adminPrisma = await getAdminPrisma();
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
  const [sectorMargins, settings] = await Promise.all([getSectorDefaultMargins(now), getGlobalPricingSettings()]);

  return {
    installationCostPerWattResidential: settings.installationCostPerWattResidential,
    installationCostPerWattCommercial: settings.installationCostPerWattCommercial,
    installationCostPerWattIndustrial: settings.installationCostPerWattIndustrial,
    evChargerInstallationFee: settings.evChargerInstallationFee,
    washingRateTier1PerPanel: settings.washingRateTier1PerPanel,
    washingRateTier2PerPanel: settings.washingRateTier2PerPanel,
    washingRateTier3PerPanel: settings.washingRateTier3PerPanel,
    washingRateTier4PerPanel: settings.washingRateTier4PerPanel,
    washingMinimumVisitFeePKR: settings.washingMinimumVisitFeePKR,
    civilWorkCostPerBlock: settings.civilWorkCostPerBlock,
    earthingCostPerBore: settings.earthingCostPerBore,
    lightningArrestorCostPerUnit: settings.lightningArrestorCostPerUnit,
    sectorMargins: Object.fromEntries(ALL_SECTORS.map((s) => [s, sectorMargins.get(s) ?? 0])) as Record<Sector, number>,
  };
}

export interface UpdateGlobalPricingSettingsInput {
  installationCostPerWattResidential?: number;
  installationCostPerWattCommercial?: number;
  installationCostPerWattIndustrial?: number;
  evChargerInstallationFee?: number;
  washingRateTier1PerPanel?: number;
  washingRateTier2PerPanel?: number;
  washingRateTier3PerPanel?: number;
  washingRateTier4PerPanel?: number;
  washingMinimumVisitFeePKR?: number;
  civilWorkCostPerBlock?: number;
  earthingCostPerBore?: number;
  lightningArrestorCostPerUnit?: number;
  /** Super Admin's User.id — GlobalPricingSettings.updatedById is a
   *  required FK. */
  updatedById: string;
}

/** Updates the singleton GlobalPricingSettings row — creates it (from
 *  the same fallback defaults getGlobalPricingSettings() would return)
 *  if it doesn't exist yet, otherwise updates only the fields present
 *  in `input` in place. Backs `POST /api/admin/pricing/rules`. */
export async function updateGlobalPricingSettings(input: UpdateGlobalPricingSettingsInput): Promise<GlobalPricingRules> {
  const adminPrisma = await getAdminPrisma();
  const existing = await adminPrisma.globalPricingSettings.findFirst({ orderBy: { updatedAt: "desc" } });
  const current = existing
    ? {
        installationCostPerWattResidential: existing.installationCostPerWattResidential.toNumber(),
        installationCostPerWattCommercial: existing.installationCostPerWattCommercial.toNumber(),
        installationCostPerWattIndustrial: existing.installationCostPerWattIndustrial.toNumber(),
        evChargerInstallationFee: existing.evChargerInstallationFee.toNumber(),
        washingRateTier1PerPanel: existing.washingRateTier1PerPanel.toNumber(),
        washingRateTier2PerPanel: existing.washingRateTier2PerPanel.toNumber(),
        washingRateTier3PerPanel: existing.washingRateTier3PerPanel.toNumber(),
        washingRateTier4PerPanel: existing.washingRateTier4PerPanel.toNumber(),
        washingMinimumVisitFeePKR: existing.washingMinimumVisitFeePKR.toNumber(),
        civilWorkCostPerBlock: existing.civilWorkCostPerBlock.toNumber(),
        earthingCostPerBore: existing.earthingCostPerBore.toNumber(),
        lightningArrestorCostPerUnit: existing.lightningArrestorCostPerUnit.toNumber(),
      }
    : FALLBACK_GLOBAL_PRICING_SETTINGS;

  const merged = {
    installationCostPerWattResidential: input.installationCostPerWattResidential ?? current.installationCostPerWattResidential,
    installationCostPerWattCommercial: input.installationCostPerWattCommercial ?? current.installationCostPerWattCommercial,
    installationCostPerWattIndustrial: input.installationCostPerWattIndustrial ?? current.installationCostPerWattIndustrial,
    evChargerInstallationFee: input.evChargerInstallationFee ?? current.evChargerInstallationFee,
    washingRateTier1PerPanel: input.washingRateTier1PerPanel ?? current.washingRateTier1PerPanel,
    washingRateTier2PerPanel: input.washingRateTier2PerPanel ?? current.washingRateTier2PerPanel,
    washingRateTier3PerPanel: input.washingRateTier3PerPanel ?? current.washingRateTier3PerPanel,
    washingRateTier4PerPanel: input.washingRateTier4PerPanel ?? current.washingRateTier4PerPanel,
    washingMinimumVisitFeePKR: input.washingMinimumVisitFeePKR ?? current.washingMinimumVisitFeePKR,
    civilWorkCostPerBlock: input.civilWorkCostPerBlock ?? current.civilWorkCostPerBlock,
    earthingCostPerBore: input.earthingCostPerBore ?? current.earthingCostPerBore,
    lightningArrestorCostPerUnit: input.lightningArrestorCostPerUnit ?? current.lightningArrestorCostPerUnit,
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
  const sectorMargins = await getSectorDefaultMargins(now);

  return {
    ...merged,
    sectorMargins: Object.fromEntries(ALL_SECTORS.map((s) => [s, sectorMargins.get(s) ?? 0])) as Record<Sector, number>,
  };
}

// ============================================================================
// Market Price Scraper (2026-08-22) — daily w11stop.com price snapshots.
// ============================================================================
// Persistence-only boundary for lib/scraper/marketPriceJob.ts, same
// discipline as the rest of this file: the scraper module itself never
// imports `adminPrisma` directly, only these two functions. See
// MarketPriceSnapshot's doc comment in schema.prisma for why this lives
// in vendor_private (confidentiality) even though the source is a public
// website, and why it's a separate table rather than writing into
// RawVendorCost — this is reference data for a human to review, never
// auto-applied to live customer-facing pricing.
// ============================================================================

export interface MarketPriceSnapshotInput {
  componentType: ComponentType;
  searchBrand: string;
  brand: string | null;
  model: string | null;
  itemName: string;
  priceRs: number;
  oldPriceRs: number | null;
  sourceUrl: string;
}

/** Inserts one scrape run's worth of rows, all sharing a single
 *  `fetchedAt` timestamp generated here (not per-item) — that's what
 *  lets `listLatestMarketPriceSnapshots` below group "the most recent
 *  run" by a single exact timestamp match rather than a fuzzy time
 *  window. Returns the count actually written. */
export async function recordMarketPriceSnapshots(items: MarketPriceSnapshotInput[]): Promise<number> {
  const adminPrisma = await getAdminPrisma();
  if (items.length === 0) return 0;
  const fetchedAt = new Date();
  const result = await adminPrisma.marketPriceSnapshot.createMany({
    data: items.map((item) => ({ ...item, fetchedAt })),
  });
  return result.count;
}

export interface MarketPriceSnapshotDTO {
  id: string;
  componentType: ComponentType;
  searchBrand: string;
  brand: string | null;
  model: string | null;
  itemName: string;
  priceRs: number;
  oldPriceRs: number | null;
  sourceUrl: string;
  sourceSite: string;
  fetchedAt: string;
}

/** Every row from the single most recent scrape run only (matched by
 *  exact `fetchedAt`, see recordMarketPriceSnapshots above) — older runs
 *  stay in the table as history but aren't surfaced here. Returns `[]`
 *  on a fresh/never-scraped DB, same "no data yet" convention as every
 *  other list function in this file (never fabricates a row). */
export async function listLatestMarketPriceSnapshots(): Promise<MarketPriceSnapshotDTO[]> {
  const adminPrisma = await getAdminPrisma();
  const latest = await adminPrisma.marketPriceSnapshot.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });
  if (!latest) return [];

  const rows = await adminPrisma.marketPriceSnapshot.findMany({
    where: { fetchedAt: latest.fetchedAt },
    orderBy: [{ componentType: "asc" }, { searchBrand: "asc" }, { priceRs: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    componentType: row.componentType,
    searchBrand: row.searchBrand,
    brand: row.brand,
    model: row.model,
    itemName: row.itemName,
    priceRs: row.priceRs.toNumber(),
    oldPriceRs: row.oldPriceRs ? row.oldPriceRs.toNumber() : null,
    sourceUrl: row.sourceUrl,
    sourceSite: row.sourceSite,
    fetchedAt: row.fetchedAt.toISOString(),
  }));
}
