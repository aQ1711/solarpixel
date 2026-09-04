"use client";

import { Suspense, memo, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { trackWhatsAppClick } from "@/lib/analytics";
import { BrandMark } from "@/components/BrandMark";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WHATSAPP_BUSINESS_NUMBER, GENERAL_INQUIRY_WA_MESSAGE } from "@/lib/constants/contact";
import type { ApiJson } from "@/lib/internal/access";
import {
  Loader2,
  CheckCircle2,
  MessageCircle,
  Zap,
  Gauge,
  ArrowRight,
  ShieldCheck,
  Sun,
  Wrench,
  BadgeCheck,
  ChevronLeft,
  ChevronDown,
  Download,
  Wand2,
  Activity,
  Building2,
  Upload,
  FileText,
  X,
  SlidersHorizontal,
  PanelsTopLeft,
  AlertTriangle,
  Receipt,
  BatteryCharging,
  Calculator,
  TrendingDown,
  Clock,
  CalendarCheck,
} from "lucide-react";

// ============================================================================
// Types & constants
// ============================================================================

type Sector = "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL";
type ServiceType = "HYBRID_BATTERY" | "ONGRID_ZERO_EXPORT";
// Mirrors Prisma's CostUnit enum — which basis a catalog item's
// unitPricePKR is actually denominated in (see EquipmentOptionDTO.unit's
// doc comment). Used to label prices correctly (ticker, price hints)
// instead of always assuming "/W".
type CostUnit = "PER_WATT" | "PER_METER" | "PER_KWH" | "PER_UNIT" | "PER_PIECE" | "LUMP_SUM";
const UNIT_SUFFIX: Record<CostUnit, string> = {
  PER_WATT: "/W",
  PER_METER: "/m",
  PER_KWH: "/kWh",
  PER_UNIT: "/unit",
  PER_PIECE: "/pc",
  LUMP_SUM: " flat",
};
// Mirrors Prisma's InverterPhase enum (2026-08-22).
type InverterPhase = "SINGLE_PHASE" | "THREE_PHASE";
const PHASE_LABEL: Record<InverterPhase, string> = {
  SINGLE_PHASE: "Single Phase",
  THREE_PHASE: "Three Phase",
};
// RoofType/ROOF_TYPE_LABEL removed (2026-09-04) — the mobile "Refine
// your details" field they backed was replaced by a real Mounting
// Structure dropdown (equipmentOptions.MOUNTING_STRUCTURE, structureCode)
// per explicit feedback; see that field's own doc comment.
// Provenance of the bill amount — mirrors Prisma's BillSource enum.
type BillSource = "MANUAL" | "UPLOADED_PDF" | "UPLOADED_IMAGE";
type UploadState = "idle" | "uploading" | "success" | "error";
// Hidden 2026-08-27, explicit instruction ("hide the upload bill option -
// we will check and enable it again") — /api/bill-upload's OCR pipeline
// stays wired up (handleFileUpload, the upload dropzone JSX, BillDetailsPanel)
// so this is a one-line flip back on, not a re-implementation. Flip to
// true to restore the "Optional: Upload your recent electricity bill"
// dropzone under the bill amount field.
const BILL_UPLOAD_ENABLED = false;
// Master toggle at the top of the calculator — "Complete Solar System" is
// the full sizing/pricing flow below; the other two are lightweight
// WhatsApp inquiry forms with no backend persistence (no pricing/data
// model specified for either — same reasoning as the old AddOnInquiryForm
// this replaces).
type MasterService = "COMPLETE_SOLAR" | "EV_CHARGER" | "SYSTEM_UPGRADES";
type FormStatus = "idle" | "loading" | "success";

/** Mirrors app/api/bill-upload's UploadedBillDetails. */
interface UploadedBillDetails {
  source: "uploaded_pdf" | "uploaded_image";
  fileUrl: string | null;
  currentBillPKR: number;
  unitsConsumed: number | null;
  consumerId: string | null;
  consumerName: string | null;
  address: string | null;
  tariffCategory: string | null;
  sanctionedLoadKw: number | null;
  billingMonth: string | null;
  readingDate: string | null;
  issueDate: string | null;
  dueDate: string | null;
  arrearsPKR: number;
  totalPayablePKR: number | null;
  lpSurchargePKR: number | null;
  payableAfterDueDatePKR: number | null;
}

interface QuoteTier {
  systemKw: number;
  totalClientPricePKR: number;
  estimatedMonthlySavingsPKR: number;
  paybackYears: number | null;
  offsetPct: number;
}

/** Mirrors lib/db/admin.ts's ItemizedBreakdown — already-marked-up,
 *  client-facing PKR lines (never raw vendor cost) that sum to exactly
 *  `totalClientPricePKR`. */
interface ItemizedBreakdown {
  panelsPKR: number;
  inverterPKR: number;
  batteryPKR: number;
  cablingAndProtectionPKR: number;
  structurePKR: number;
  installationPKR: number;
  /** Civil blocks + earthing/boring + lightning arrestor combined — see
   *  SiteWorksQuantities and lib/db/admin.ts's siteWorksPKR doc comment. */
  siteWorksPKR: number;
  /** "One-Time Panel Washing Visit" — 0 unless toggled on. See
   *  PanelWashingSelection and lib/db/admin.ts's panelWashingPKR doc
   *  comment. */
  panelWashingPKR: number;
}

/** Mirrors lib/db/admin.ts's SiteWorksQuantities — the exact "Site Works"
 *  counts this quote actually priced, real backend-resolved values (same
 *  "let the client render this, never re-guess the default" reasoning as
 *  ResolvedEquipment below). */
interface SiteWorksQuantities {
  civilBlockQty: number;
  earthingBoreQty: number;
  lightningArrestorQty: number;
}

/** Mirrors lib/db/admin.ts's ResolvedEquipmentItem — the ACTUAL catalog
 *  item a slot priced against (post OTHER/omitted resolution), on both
 *  the Recommended and Custom paths. Cost-free (brand/label/spec only). */
interface ResolvedEquipmentItem {
  code: string;
  brand: string | null;
  label: string;
  /** Panel wattage / inverter kW rating / one battery module's kWh —
   *  often null, see EquipmentOption.specValue's doc comment. */
  specValue: number | null;
}

/** Mirrors lib/db/admin.ts's ResolvedEquipment — drives the BOQ table's
 *  dynamic rows (panel count/wattage, inverter brand+capacity, battery
 *  capacity) directly from what the backend actually priced, instead of
 *  the frontend re-guessing the Recommended default. */
interface ResolvedEquipment {
  /** count/baselineCount/maxCount added 2026-08-20 for the Panel
   *  Quantity Adjuster — `count` is the REAL, already-clamped panel
   *  count actually priced; render panel count from THIS, never
   *  re-derive it from systemKw (that guess breaks the instant the
   *  customer adjusts the count away from baseline). baselineCount is
   *  the bill-derived RECOMMENDED count — the adjuster's default/starting
   *  value, no longer its hard floor as of 2026-08-29 (the customer can
   *  go as low as 1; see PANEL_COUNT_ABSOLUTE_MINIMUM's doc comment in
   *  lib/db/admin.ts); maxCount is the selected inverter's own rated-kW
   *  ceiling, or null (unbounded) when that inverter has no specValue on
   *  file. */
  panel: ResolvedEquipmentItem & { count: number; baselineCount: number; maxCount: number | null };
  /** quantity added 2026-08-29 for the multi-inverter "clubbing" fix —
   *  the number of THIS resolved inverter SKU actually priced. 1 for the
   *  overwhelming majority of quotes; >1 once systemKw exceeds every
   *  single in-stock unit's own rated capacity (e.g. a 140kW industrial
   *  system clubbing 2 × the largest available unit). */
  inverter: ResolvedEquipmentItem & { quantity: number };
  /** null for ONGRID_ZERO_EXPORT. capacityKwh is the TOTAL capacity
   *  actually priced, distinct from specValue (a single module's rating). */
  battery: (ResolvedEquipmentItem & { capacityKwh: number }) | null;
}

interface QuoteResult {
  quoteId: string;
  systemKw: number;
  serviceType: ServiceType;
  totalClientPricePKR: number;
  estimatedMonthlySavingsPKR: number;
  paybackYears: number | null;
  offsetPct: number;
  daysToDeploy: number;
  billSource: BillSource;
  monthlyBillPKR: number;
  nearZeroBillTier: QuoteTier | null;
  breakdown: ItemizedBreakdown;
  equipment: ResolvedEquipment;
  siteWorks: SiteWorksQuantities;
  panelWashing: PanelWashingSelection | null;
  /** True when any Custom Builder selection was "Other / Specific
   *  Requirement" — the price uses a placeholder cost for that slot until
   *  engineering sources real pricing. See lib/db/admin.ts's OTHER_CODE. */
  hasCustomRequirements: boolean;
}

/** Response shape for `requestKind: "SOLAR_PREVIEW"` — the exact same
 *  pricing pipeline as a real SOLAR submission, minus everything tied to
 *  persisting a Lead/Quote (no quoteId, no billSource/monthlyBillPKR
 *  echo, no nearZeroBillTier). Powers the live "Estimated Turnkey Cost"
 *  dashboard as the bill amount / sector / equipment selections change —
 *  see the debounced effect in CalculatorCard. Never shown as, or
 *  treated like, a bookable quote. */
interface SolarPreviewResult {
  kind: "SOLAR_PREVIEW";
  systemKw: number;
  serviceType: ServiceType;
  totalClientPricePKR: number;
  estimatedMonthlySavingsPKR: number;
  paybackYears: number | null;
  daysToDeploy: number;
  breakdown: ItemizedBreakdown;
  equipment: ResolvedEquipment;
  siteWorks: SiteWorksQuantities;
  panelWashing: PanelWashingSelection | null;
  hasCustomRequirements: boolean;
}

// ----------------------------------------------------------------------
// Dual Customization Paths — Recommended vs Custom Equipment Builder
// ----------------------------------------------------------------------

type CustomizationPath = "RECOMMENDED" | "CUSTOM";

/** Mirrors Prisma's ComponentType enum — only the values the Custom
 *  Builder renders pickers for (or reads AC_CABLE costs by convention
 *  from the DC_CABLE picker, per prisma/seed.ts). */
type ComponentType =
  | "SOLAR_PANEL"
  | "INVERTER"
  | "BATTERY"
  | "DC_CABLE"
  | "AC_CABLE"
  | "BREAKERS"
  | "MOUNTING_STRUCTURE"
  | "EV_CHARGER";

/** Mirrors GET /api/equipment-options's per-row shape. Cost-free by
 *  design — this is the public catalog, never the confidential
 *  RawVendorCost rows. */
interface EquipmentOptionDTO {
  id: string;
  componentType: ComponentType;
  code: string;
  label: string;
  brand: string | null;
  specValue: number | null;
  applicableServiceType: ServiceType | null;
  isOtherOption: boolean;
  /** Google Drive brand-logo URL, already normalized (see
   *  formatGoogleDriveLink in lib/utils/googleDrive.ts) — null if the
   *  admin hasn't set one for this item yet. */
  logoUrl: string | null;
  /** Marked-up, client-safe unit price (see `unit` below for what basis
   *  it's actually in — NOT always PER_WATT) at the sector the catalog
   *  was fetched for — see getPublicUnitPricesPKR's doc comment in
   *  lib/db/admin.ts. Null for "Other / Specific Requirement" or the
   *  rare data-entry gap. */
  unitPricePKR: number | null;
  /** Which CostUnit `unitPricePKR` is denominated in — e.g. a flat
   *  PER_PIECE inverter must never be labeled "/W" the way every
   *  PER_WATT item is. Null in the same cases unitPricePKR is null. */
  unit: CostUnit | null;
  /** Electrical phase (2026-08-22) — only ever set for componentType
   *  INVERTER; null for everything else. */
  phase: InverterPhase | null;
  /** Inventory guardrail (2026-08-20) — false means the Custom Builder
   *  must grey this option out, disable its button, and show an "Out of
   *  Stock" badge; the app must never let a customer select it. See
   *  EquipmentOption.inStock's doc comment in schema.prisma. */
  inStock: boolean;
}

type EquipmentOptionsByType = Partial<Record<ComponentType, EquipmentOptionDTO[]>>;

/** Mirrors calculateSystemPricing's EquipmentSelections param in
 *  lib/db/admin.ts. Sent to the API only when the Custom path is active. */
interface EquipmentSelections {
  panelCode?: string;
  inverterCode?: string;
  /** A real BATTERY code, "OTHER", or NONE_CODE ("NONE") — the customer
   *  explicitly opted out of a battery. See NONE_CODE's doc comment. */
  batteryCode?: string;
  /** Never sent by this client since the 2026-08-22 battery rework — the
   *  Custom Builder now picks a specific real capacity SKU directly (via
   *  batteryCode), the same way it already picks a specific inverter
   *  model; there's no separate arbitrary-kWh input left to collect. Kept
   *  in this type only because the server (lib/db/admin.ts) still
   *  accepts it as a target for its own auto-sizing fallback. */
  batteryCapacityKwh?: number;
  dcCableCode?: string;
  acCableCode?: string;
  breakersCode?: string;
  structureCode?: string;
  /** Earthing/Lightning stay customer-adjustable counts (see
   *  DEFAULT_EARTHING_BORE_QTY/DEFAULT_LIGHTNING_ARRESTOR_QTY for the
   *  defaults applied when omitted). civilBlockQty is never sent by this
   *  client as of 2026-08-20 — civil block count is always auto-computed
   *  server-side as Math.ceil(panelCount × 1.5); see
   *  lib/db/admin.ts's calculateSystemPricing. */
  earthingBoreQty?: number;
  lightningArrestorQty?: number;
  /** Panel Quantity Adjuster (2026-08-20) — Custom Builder only. Clamped
   *  server-side to [1, maxPanelCount] regardless of what's sent here —
   *  NOT floored at the bill-derived baseline as of 2026-08-29 (explicit
   *  instruction: "don't block user to lower the panels - lower they can
   *  go at any level"; see livePreview.equipment.panel's doc comment for
   *  the exact limits). Omitted defaults to the bill-derived baseline
   *  count, unchanged behavior. */
  panelQtyOverride?: number;
  /** Manual inverter "clubbing" override (2026-08-29) — Custom Equipment
   *  Builder's Inverter row QuantityStepper. Residential is clamped
   *  server-side to never go below the auto-computed minimum for
   *  systemKw; Commercial/Industrial get true manual control, including
   *  deliberately below it (see lib/db/admin.ts's resolveInverterQuantity).
   *  Omitted = pure auto, unchanged behavior. */
  inverterQuantityOverride?: number;
  /** "One-Time Panel Washing Visit" (2026-08-21) — Custom Builder
   *  Services toggle. Omitted/false = not included, 0 cost. */
  includePanelWashing?: boolean;
}

/** Mirrors lib/db/admin.ts's PanelWashingSelection — null when
 *  includePanelWashing wasn't toggled on. Lets the client render the
 *  exact "N Panels @ Rs X/panel" / "(Minimum Call-Out Fee)" wording
 *  without re-deriving which tier/floor applied. */
interface PanelWashingSelection {
  panelCount: number;
  ratePerPanel: number;
  isMinimumFeeApplied: boolean;
}

/** Mirrors lib/db/admin.ts's BudgetTier — auto-selects inverter/battery
 *  for this bracket instead of the admin-marked Recommended default; see
 *  resolveBudgetTierInverterCode's doc comment there. Does NOT change how
 *  systemKw itself is sized. */
type BudgetTier = "UNDER_1M" | "1M_TO_1_5M" | "1_5M_PLUS";

// Reserved code for "Other / Specific Requirement" — must match OTHER_CODE
// in lib/db/admin.ts and prisma/seed.ts exactly.
const OTHER_CODE = "OTHER";
// Reserved code for "No Battery" (Custom Builder opt-out) — must match
// NONE_CODE in lib/db/admin.ts exactly. Only meaningful for batteryCode;
// prices/resolves exactly like an ONGRID_ZERO_EXPORT system's battery-free
// state, without changing the chosen ServiceType.
const NONE_CODE = "NONE";
// Mirrors lib/db/admin.ts's DEFAULT_EARTHING_BORE_QTY/
// DEFAULT_LIGHTNING_ARRESTOR_QTY — the Site Works row's initial stepper
// values before the customer touches them. Real pricing always comes from
// the live backend response either way (see livePreview.siteWorks). Civil
// Blocks has no client default — it's read-only, always server-computed.
const DEFAULT_EARTHING_BORE_QTY = 2;
const DEFAULT_LIGHTNING_ARRESTOR_QTY = 1;

// Custom Equipment Builder's 6 equipment slots — ALL are "Default & Swap"
// EquipmentSwapRows now (Cable/Breakers/Structure joined Panel/Inverter/
// Battery in that pattern — see Part 5's 2026-08-20 update), each
// tracking its own open/close via this same key so at most one row is
// expanded at a time.
type EquipmentSectionKey = "PANEL" | "INVERTER" | "BATTERY" | "CABLE" | "BREAKERS" | "STRUCTURE" | "SITE_WORKS";

// ----------------------------------------------------------------------
// Panel Washing & EV Charger — the two SYSTEM_UPGRADES/EV_CHARGER
// master-service flows, structured-input inquiries backed by real
// `/api/quote/calculate` calculations (see calculatePanelWashingQuote/
// getEvChargerInstallationFeePKR in lib/db/admin.ts), but still no
// Lead/Quote persistence — same boundary these two always had. Distinct
// from the Complete Solar QuoteResult type below; never mixed.
// ----------------------------------------------------------------------

interface PanelWashingResult {
  kind: "PANEL_WASHING";
  panelCount: number;
  sector: Sector;
  costPerPanelPKR: number;
  /** True when the minimum visit fee floor (not the tiered per-panel
   *  rate) was the binding price — see PanelWashingQuote's doc comment
   *  in lib/db/admin.ts. */
  isMinimumFeeApplied: boolean;
  /** Exactly the backend's tiered rate — no margin/percentage added on
   *  top (2026-08-21). Always a one-time visit now — the old "Monthly
   *  Subscription" option was removed. */
  oneTimePricePKR: number;
  totalClientPricePKR: number;
}

interface EvChargerResult {
  kind: "EV_CHARGER";
  evChargerCode: string;
  evChargerRatingKw: number | null;
  chargerUnitPricePKR: number;
  cableDistanceMeters: number;
  includedCableMeters: number;
  extraCableMeters: number;
  extraCablePKR: number;
  baseInstallationFeePKR: number;
  totalClientPricePKR: number;
}

type AddOnResult = PanelWashingResult | EvChargerResult;

const PANEL_COUNT_PRESETS = [10, 20, 30, 50] as const;

// Mirrors the placeholder rate in app/api/quote/calculate/route.ts —
// duplicated here (not imported, since this is a client component)
// purely so the live preview's copy text can say the actual number
// rather than a vague "+ extra fee". If that route's rate ever changes,
// this string needs a matching update — flagged in both places.
const EV_CHARGER_INCLUDED_CABLE_METERS = 10;
const EV_CHARGER_EXTRA_CABLE_RATE_PKR_PER_METER = 500;

// Large visual sector cards (top of the calculator) — illustration +
// label + short description. Order is display order; Residential is the
// default-active sector, matching DEFAULT_SECTOR below.
const SECTOR_CARDS: { value: Sector; label: string; description: string }[] = [
  { value: "RESIDENTIAL", label: "Residential", description: "For homes. Hybrid battery backup, 24/7 power security." },
  { value: "COMMERCIAL", label: "Commercial", description: "For offices & retail. Flexible Hybrid or On Grid." },
  { value: "INDUSTRIAL", label: "Industrial", description: "For factories & heavy load. High capacity On Grid." },
];
const DEFAULT_SECTOR: Sector = "RESIDENTIAL";
const SECTOR_LABEL: Record<Sector, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INDUSTRIAL: "Industrial",
};
// Mobile-only compact segmented control (2026-08-29, explicit
// instruction) — short micro-copy distinct from SECTOR_CARDS' own
// longer descriptions above (desktop keeps those unchanged); this is
// its own map rather than editing SECTOR_CARDS so desktop copy never
// drifts as a side effect of a mobile-only change.
const SECTOR_MICROCOPY: Record<Sector, string> = {
  RESIDENTIAL: "Homes",
  COMMERCIAL: "Offices, Plazas & Retail",
  INDUSTRIAL: "Factories & Heavy Load",
};
// Tapping "Commercial" on the mobile segmented control prefills the
// bill amount (only if still empty — never overwrites a real typed
// value) so a commercial visitor sees a realistic instant estimate
// immediately instead of a blank/zero state.
const COMMERCIAL_DEFAULT_BILL_PKR = 100_000;
// Mobile Home tab's hero estimator card (2026-09-03, LOCKED spec §2) —
// DISPLAY-ONLY starting position for the slider/big-Rs-figure while
// billAmountInput is still empty (fresh page load, Residential is
// DEFAULT_SECTOR). Deliberately NOT written into billAmountInput itself
// (unlike Commercial's fill-on-tap default above) — that state is
// shared with desktop's own text input, and this session's standing
// "mobile only" scope means desktop's existing empty-start behavior
// must stay untouched. The tradeoff: the "You need/You save" tiles show
// a placeholder until the customer's first real drag, rather than a
// fully-computed number on the very first frame like the design
// reference shows — the alternative (defaulting billAmountInput itself)
// would also change desktop's first-load state, which wasn't asked for.
const RESIDENTIAL_HERO_DEFAULT_BILL_PKR = 45_000;

const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  HYBRID_BATTERY: "Hybrid + Battery Backup",
  ONGRID_ZERO_EXPORT: "On Grid",
};
const SERVICE_TYPE_ICON: Record<ServiceType, typeof BatteryCharging> = {
  HYBRID_BATTERY: BatteryCharging,
  ONGRID_ZERO_EXPORT: Gauge,
};
const SERVICE_TYPE_DESCRIPTION: Record<ServiceType, string> = {
  HYBRID_BATTERY: "Get a turnkey solar + battery solution for 24/7 power security, even during an outage.",
  ONGRID_ZERO_EXPORT: "Lower upfront cost, no battery hardware. Zero WAPDA net metering paperwork either way.",
};

// Market-reality constraint (2026, revised): Industrial is locked to
// On-Grid exclusively — battery economics don't work at that load scale
// — enforced server-side too (resolveServiceType() in
// app/api/quote/calculate), never trust the client for that part.
// Residential/Commercial are genuinely the customer's choice; Residential
// just defaults to Hybrid and shows a warning if they opt into On-Grid
// instead (see RESIDENTIAL_ONGRID_WARNING below).
const LOCKED_SERVICE_TYPE_BY_SECTOR: Partial<Record<Sector, ServiceType>> = {
  INDUSTRIAL: "ONGRID_ZERO_EXPORT",
};

// Auto Sector & System Routing (2026-08-29, explicit instruction): a bill
// at/above this crosses into industrial-scale consumption, so it auto-
// switches Property Type to Industrial the moment it's crossed (see the
// debounced routing effect near chooseSector below). System Type needs no separate
// handling — LOCKED_SERVICE_TYPE_BY_SECTOR above already forces On-Grid
// the instant sector becomes "INDUSTRIAL", for free.
const INDUSTRIAL_SECTOR_THRESHOLD_PKR = 250_000;

// Manual inverter "clubbing" override's UI-side ceiling — kept in sync
// with lib/db/admin.ts's MAX_INVERTER_UNITS and the matching Zod
// `.max()` in app/api/quote/calculate/route.ts's equipmentSelectionsSchema.
const MAX_INVERTER_UNITS = 20;

// Panel Quantity Adjuster's floor (2026-08-29) — kept in sync with
// lib/db/admin.ts's PANEL_COUNT_ABSOLUTE_MINIMUM. See that constant's own
// doc comment: no longer flooring at the bill-derived baseline count
// (explicit instruction: "don't block user to lower the panels").
const PANEL_COUNT_ABSOLUTE_MINIMUM = 1;

const RESIDENTIAL_ONGRID_WARNING =
  "On Grid inverters shut down during power outages. For 24/7 uninterrupted power, a Hybrid System is strongly recommended.";

// Not collected in the form — sensible sector defaults for what share of
// consumption falls in daylight hours, since the sizing math needs it.
const DAYTIME_USAGE_PCT_BY_SECTOR: Record<Sector, number> = {
  RESIDENTIAL: 0.35,
  COMMERCIAL: 0.75,
  INDUSTRIAL: 0.85,
};

// Display-only mirrors of the REAL sizing constants in
// app/api/quote/calculate/route.ts (BLENDED_TARIFF_PKR_PER_UNIT,
// DAILY_GENERATION_FACTOR) — used ONLY to reconstruct the "Calculation
// Transparency" dropdown's arithmetic client-side from numbers already
// on hand (bill amount, sector daytime %, the live-previewed systemKw),
// with no second API round-trip. These must stay numerically identical
// to the server's real constants or the dropdown will show wrong math —
// if either constant ever changes server-side, update both here too.
const DISPLAY_BLENDED_TARIFF_PKR_PER_UNIT = 52;
const DISPLAY_DAILY_GENERATION_FACTOR = 4.1;

// Master toggle at the very top of the calculator (see MasterService).
// Icons are the custom "architectural sketch" set (Part 1) — a general
// component-type shape (not `typeof Sun`) since these aren't lucide icons.
const MASTER_SERVICES: { value: MasterService; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "COMPLETE_SOLAR", label: "Complete Solar System", icon: SolarPanelIcon },
  { value: "EV_CHARGER", label: "EV Charger", icon: EVChargerIcon },
  { value: "SYSTEM_UPGRADES", label: "Panel Washing & Servicing", icon: WaterDropIcon },
];
const MASTER_SERVICE_DESCRIPTION: Record<MasterService, string> = {
  COMPLETE_SOLAR: "Get a turnkey solar + battery solution. Sized instantly from your bill.",
  EV_CHARGER: "Tell us about your vehicle and charging needs. We'll follow up on WhatsApp with options and pricing.",
  SYSTEM_UPGRADES: "Panel washing, inverter servicing, capacity upgrades, and more. Describe what you need below.",
};

const pkr = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});
const formatPKR = (n: number) => pkr.format(n);
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

/** Rounds to `decimals` places and drops trailing zeros — "10.00" -> "10",
 *  "3.60" -> "3.6". Used for the BOQ's inverter/battery capacity figures,
 *  which are sometimes whole numbers (a systemKw fallback) and sometimes
 *  not (an explicit battery capacity like 3.6kWh). */
function formatTrim(n: number, decimals = 2): string {
  return Number(n.toFixed(decimals)).toString();
}

/** Pakistani-numbering ("Lac"/"Crore", not "Hundred Thousand"/"Million")
 *  readback of a bill amount as it's typed (2026-08-27) — the single
 *  most common real-world data-entry mistake on this field is an extra
 *  trailing zero (25000 fat-fingered as 250000), which a plain "Rs
 *  25,000" vs "Rs 250,000" comparator is easy to miss at a glance but
 *  "25 Thousand" vs "2.5 Lac" is not. Shown live under the field, purely
 *  a confirmation readback — never used for pricing, which always reads
 *  billAmountInput/resolvedBillPKR directly. */
function formatBillInWords(n: number): string {
  const trimDecimalWord = (v: number) => Number(v.toFixed(1)).toString();
  if (n >= 10_000_000) return `${trimDecimalWord(n / 10_000_000)} Crore`;
  if (n >= 100_000) return `${trimDecimalWord(n / 100_000)} Lac`;
  if (n >= 1_000) return `${trimDecimalWord(n / 1_000)} Thousand`;
  return String(n);
}

// ============================================================================
// Page
// ============================================================================

/** The entire interactive storefront — moved here from app/page.tsx
 *  (2026-08-22, SEO task) so app/page.tsx can be a plain Server
 *  Component again. Next.js doesn't allow a `metadata` export from a
 *  Client Component, and this whole file is "use client" (useState-
 *  heavy, interactive calculator) — the real fix is this exact split,
 *  not stuffing metadata into a client file where Next would silently
 *  ignore it. See app/page.tsx for the page-specific metadata this
 *  enables. Pure move, no behavior change — every component below is
 *  unchanged from when it lived in app/page.tsx. */
export default function HomePageContent() {
  return (
    <main className="min-h-dvh bg-stone-50">
      {/* Ticker + Header stick together as ONE unit — a single sticky
          wrapper around both (rather than each having its own `sticky
          top-0`) so they naturally stack in normal flow with zero manual
          pixel-offset math. Two independently-sticky siblings would both
          pin to the same y=0 and overlap once scrolled; this way the
          ticker's real rendered height is whatever pushes Header down,
          automatically, even if the ticker's height ever changes.

          will-change-transform + translateZ(0) (2026-08-26, scroll perf
          pass) promote this to its own GPU compositor layer — a sticky
          element containing a backdrop-blur (Header's pill) is one of
          the classic causes of scroll jank, since the browser would
          otherwise have to recompute the blur against newly-scrolled
          content on every frame instead of just repositioning an
          already-composited layer. */}
      <div className="sticky top-0 z-30 [transform:translateZ(0)] will-change-transform print:hidden">
        <MarketWatchTicker />
        <SiteHeader />
      </div>
      <Hero />
      <SiteFooter />
    </main>
  );
}

// ============================================================================
// Market Watch ticker — a decorative, stock-exchange-style strip above the
// navbar. UPDATE 2026-08-20: now fetches real, live, admin-configured
// rates instead of hardcoded placeholder copy — reported live as "editing
// pricing in /admin/pricing doesn't update the ticker" (it never had ANY
// wiring to real data before this). Reuses the SAME public
// GET /api/equipment-options endpoint the Custom Equipment Builder already
// calls, rather than a new route — it already returns exactly the
// client-safe shape needed (getPublicUnitPricesPKR's marked-up PKR/W,
// never raw vendor cost or margin %), so there's no reason for a second,
// parallel public pricing endpoint. Sector-agnostic on purpose — this is
// flavor content shown above the fold before a customer has picked a
// sector in the calculator below, so it always fetches Residential's
// margin (same default the route itself falls back to) regardless of
// what the calculator's own sector state is doing.
// ============================================================================

interface TickerItem {
  label: string;
  value: string;
}

/** Each row shows real unit prices in whatever CostUnit they're actually
 *  denominated in — PER_WATT for panels, PER_PIECE for inverters (see
 *  `unit`/UNIT_SUFFIX) — never a fabricated flat number the way the old
 *  hardcoded copy did. Drops "Other / Specific Requirement" (no real price
 *  to show) and any item with a null unitPricePKR (a real data-entry gap)
 *  — never shows a made-up number, same convention as everywhere else this
 *  DTO is used. */
function toTickerItems(options: EquipmentOptionDTO[] | undefined): TickerItem[] {
  return (options ?? [])
    .filter((o): o is EquipmentOptionDTO & { unitPricePKR: number } => !o.isOtherOption && o.unitPricePKR !== null)
    .map((o) => ({ label: o.label, value: `Rs ${Math.round(o.unitPricePKR)}${o.unit ? UNIT_SUFFIX[o.unit] : "/W"}` }));
}

/** Admin-editable Market Watch row visibility (2026-08-22) — see
 *  TickerSettings's doc comment in schema.prisma and the toggle UI on
 *  /admin/pricing. Mirrors the server DTO exactly. */
interface TickerVisibility {
  showSolarPanels: boolean;
  showOnGridInverters: boolean;
  showHybridInverters: boolean;
  showBatteries: boolean;
}
// Every row visible until the real settings load — matches
// TickerSettings' own DB-side default, so a slow/failed settings fetch
// never silently hides a row the admin actually wants shown.
const DEFAULT_TICKER_VISIBILITY: TickerVisibility = {
  showSolarPanels: true,
  showOnGridInverters: true,
  showHybridInverters: true,
  showBatteries: true,
};

// memo() (2026-08-26, scroll/render perf pass) — this component takes
// zero props and manages its own CSS-driven marquee animation + polling
// state entirely internally, so it never actually NEEDS to re-render
// just because some unrelated state elsewhere in HomePageContent
// changed (e.g. every keystroke in the bill amount field). Without
// this, React's default behavior re-renders every child on every
// parent render regardless of whether its props changed — for a
// zero-prop component that's pure overhead, and this one is expensive
// (3 independent ticker rows + animation classes).
const MarketWatchTicker = memo(function MarketWatchTicker() {
  const [panelItems, setPanelItems] = useState<TickerItem[] | null>(null);
  const [hybridInverterItems, setHybridInverterItems] = useState<TickerItem[] | null>(null);
  const [ongridInverterItems, setOngridInverterItems] = useState<TickerItem[] | null>(null);
  const [batteryItems, setBatteryItems] = useState<TickerItem[] | null>(null);
  const [visibility, setVisibility] = useState<TickerVisibility>(DEFAULT_TICKER_VISIBILITY);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/equipment-options?sector=RESIDENTIAL")
      .then((res) => res.json() as Promise<ApiJson<{ options?: EquipmentOptionsByType; tickerSettings?: TickerVisibility }>>)
      .then((data) => {
        if (cancelled) return;
        const options: EquipmentOptionsByType = data.options ?? {};
        setPanelItems(toTickerItems(options.SOLAR_PANEL));
        // Inverters now span two genuinely different product lines (Hybrid
        // w/ battery vs. On-Grid) with real, different SKUs each — a single
        // combined row was misleading (a Hybrid price could read next to an
        // On-Grid label with no way to tell which was which), so they get
        // their own rows, filtered by applicableServiceType.
        const allInverters = options.INVERTER ?? [];
        setHybridInverterItems(toTickerItems(allInverters.filter((o) => o.applicableServiceType === "HYBRID_BATTERY")));
        setOngridInverterItems(toTickerItems(allInverters.filter((o) => o.applicableServiceType === "ONGRID_ZERO_EXPORT")));
        setBatteryItems(toTickerItems(options.BATTERY));
        if (data.tickerSettings) setVisibility(data.tickerSettings);
      })
      // Purely decorative — a failed fetch just leaves the ticker empty
      // rather than ever falling back to stale/fabricated numbers.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const stillLoading = panelItems === null || hybridInverterItems === null || ongridInverterItems === null || batteryItems === null;

  // Only a row that's BOTH admin-enabled AND has at least one real,
  // priced item actually renders — an enabled row with zero items would
  // just be an empty animated strip, and a disabled row never shows
  // regardless of how much real data it has.
  const rows: { key: string; items: TickerItem[]; tag: string; direction: "left" | "right" }[] = [];
  if (visibility.showSolarPanels && panelItems?.length) rows.push({ key: "panels", items: panelItems, tag: "PANELS", direction: "left" });
  if (visibility.showHybridInverters && hybridInverterItems?.length)
    rows.push({ key: "hybrid", items: hybridInverterItems, tag: "HYBRID", direction: "right" });
  if (visibility.showOnGridInverters && ongridInverterItems?.length)
    rows.push({ key: "ongrid", items: ongridInverterItems, tag: "ON GRID", direction: "left" });
  if (visibility.showBatteries && batteryItems?.length) rows.push({ key: "batteries", items: batteryItems, tag: "BATTERIES", direction: "right" });

  // Every enabled row turned out empty (or every row is admin-hidden),
  // AND the fetch has actually finished — nothing real will ever show,
  // so don't render a black bar at all.
  if (!stillLoading && rows.length === 0) return null;

  // Dynamic height (2026-08-24) — the previous version (36cfb32) fixed
  // this wrapper's height at a flat 115px unconditionally, specifically
  // so the "Live Sync" loading state and the loaded ticker could
  // crossfade with a hard zero-shift guarantee. Real side effect,
  // reported live: `rows` was already correctly filtered down to just
  // the admin-enabled, non-empty categories (1-4 of them), but the
  // wrapper stayed 115px (sized for 4) regardless — so 1-2 active rows
  // left real dead black space at the bottom of the bar. Fixed
  // properly this time: no forced height anywhere, `flex flex-col` so
  // the bar's own height is just whatever its actual children add up
  // to — 1 active row is exactly 1 row tall, 4 is exactly 4. This
  // necessarily gives up the previous version's hard "never shifts by
  // even a pixel" guarantee (the loading indicator's own compact
  // height and the eventual N-row total aren't knowably the same
  // thing anymore — that WAS the source of the dead-space bug), in
  // favor of a real fade-in on the rows once they mount (the existing
  // `.animate-fade-up` utility, same one used elsewhere on this page)
  // rather than trying to preserve a now-actively-harmful fixed box.
  return (
    // Liquid glass (2026-09-04 feedback) — this bar is sticky at the top
    // of the page, on top of scrolled content, same "real overlap"
    // reasoning as the mobile floating bottom bar below.
    // bg-zinc-950/90 (was /70) — 2026-09-04 feedback: the lighter
    // translucency let the page's own dot-grid/orange glow bleed through
    // too strongly behind the moving price text, reading as muddy/hard
    // to read. Still glass (backdrop-blur-xl + hairline border), just
    // opaque enough that the ticker's own content stays legible.
    <div aria-hidden className="safe-top-thin flex w-full flex-col overflow-hidden border-b border-white/10 bg-zinc-950/90 font-mono text-xs backdrop-blur-xl">
      {stillLoading ? (
        <div className="flex items-center justify-center gap-2 py-3">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-xs uppercase tracking-widest text-white/70">Syncing live market prices...</span>
        </div>
      ) : (
        // Separate tagged rows per category (Panels/Hybrid/On-Grid/
        // Batteries) — shared by mobile and desktop, same as before the
        // single-row "MARKET WATCH" mobile variant (2026-09-04 feedback:
        // revert to this, the per-category breakdown is the useful part).
        rows.map((row, i) => (
          <TickerRow
            key={row.key}
            items={row.items}
            direction={row.direction}
            tag={row.tag}
            className={`animate-fade-up ${i > 0 ? "border-t border-zinc-800" : ""}`}
          />
        ))
      )}
    </div>
  );
});

/** One infinitely-scrolling row. The item list is rendered twice back to
 *  back and the CSS animation translates by exactly -50%/+50% — since
 *  that's always precisely one copy's width regardless of actual pixel
 *  width (font loading, viewport size, item count), the seam between the
 *  first and second copy is invisible and the loop never stutters or
 *  jumps, unlike a fixed-px translateX. `w-full overflow-hidden
 *  whitespace-nowrap` on this row's own wrapper (not just the outer
 *  MarketWatchTicker div) is belt-and-suspenders for mobile (< 768px):
 *  keeps the row from ever being allowed to affect document width/wrap
 *  even if a future change nests this component somewhere the outer
 *  div's overflow-hidden doesn't reach. */
/** Constant scroll SPEED, not a fixed duration per item (2026-09-04
 *  feedback: "speed needs to be normal, it's fast and unreadable,
 *  implement same as that of nasdaq"). Two earlier attempts
 *  (items.length × 32/3s, then × 5s, then × 2s) all guessed at a
 *  duration and kept missing — because "duration = item count ×
 *  constant" can never actually promise a real reading pace in the
 *  first place: a row of long inverter names and a row of short panel
 *  names hit the "same" duration at very different real px/s. A real
 *  ticker tape (NASDAQ tower, Bloomberg/CNBC strips) moves at one
 *  constant pixels-per-second rate regardless of what's on it — that's
 *  what actually reads as "normal," not a duration tuned by trial and
 *  error. Measured directly off the rendered track's own scrollWidth,
 *  not estimated from how many items there are. */
const TICKER_PIXELS_PER_SECOND = 55;
const TICKER_MIN_SECONDS = 6;

function TickerRow({
  items,
  direction,
  tag,
  tagClassName,
  className,
}: {
  items: TickerItem[];
  direction: "left" | "right";
  /** Short pinned label (e.g. "HYBRID" / "ON GRID") at the row's left
   *  edge, static and non-scrolling — the visual differentiator between
   *  the two inverter rows the ticker items themselves don't otherwise
   *  carry (their label text is just the product name). */
  tag?: string;
  /** Override the tag pill's own color — desktop's neutral zinc chip by
   *  default, the mobile combined row uses this for Main.html's solid
   *  orange "MARKET WATCH" badge instead. */
  tagClassName?: string;
  className?: string;
}) {
  const doubled = [...items, ...items];
  const trackRef = useRef<HTMLDivElement>(null);
  // Starting guess before the real width is measured (first paint) —
  // TICKER_MIN_SECONDS is a reasonable, harmless placeholder either way;
  // this is overwritten within one effect pass, before the animation has
  // meaningfully progressed.
  const [durationSeconds, setDurationSeconds] = useState(TICKER_MIN_SECONDS);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // scrollWidth spans BOTH doubled copies; one real copy (the
    // seamless repeat unit the -50% translate is built around — see
    // the doc comment on the trailing-spacer technique just below) is
    // exactly half of that.
    const oneCopyWidthPx = track.scrollWidth / 2;
    setDurationSeconds(Math.max(TICKER_MIN_SECONDS, oneCopyWidthPx / TICKER_PIXELS_PER_SECOND));
  }, [items]);

  return (
    // Label overlays the strip (2026-09-04 feedback, corrected mid-turn:
    // "not below — it should flow under the label") — one line again,
    // but the tag is now a solid floating badge (`absolute`, its own
    // z-index) sitting ON TOP of the scrolling track, which runs the
    // full width behind it. Items visibly emerge from under the badge's
    // right edge as they scroll — a real layered look, not just "starts
    // after the label" spacing. The badge's background must stay fully
    // opaque (no liquid-glass translucency here) or the scrolling text
    // would show through it instead of disappearing behind it.
    <div className={`relative w-full overflow-hidden py-1.5 ${className ?? ""}`}>
      {tag ? (
        <span
          className={`absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
            tagClassName ?? "bg-orange-600 text-white"
          }`}
        >
          {tag}
        </span>
      ) : null}
      {/* No `gap-*` on this row — flex `gap` only inserts spacing BETWEEN
          elements (n-1 gaps for n items), which is inherently asymmetric
          once you duplicate the list for the loop: two copies of 3 items
          share just ONE "seam" gap between them, not the two gaps a
          symmetric 50%/50% split needs, so `-50%` always lands short of
          the true repeat point (measured ~20px short live, not guessed —
          via getAnimations()/getBoundingClientRect() before fixing).
          Every item instead carries its OWN trailing spacer (pr-20 below,
          doubled from the old pr-10 to keep the same visible gap now that
          gap-10 is gone) — including the last item of each copy — so each
          copy is a fully self-contained, gap-free repeat unit and
          `scrollWidth / 2` is exactly one copy's width. Reported live as
          "lag when the ticker finishes."
          Full width now (no pl-4 reserving space for the tag — the tag
          floats on top instead), so the very first item genuinely starts
          underneath the badge, exactly like the rest of the loop does at
          the seam. */}
      <div
        ref={trackRef}
        className={`flex shrink-0 items-center whitespace-nowrap ${
          direction === "left" ? "animate-marquee-left" : "animate-marquee-right"
        }`}
        style={{ animationDuration: `${durationSeconds}s` }}
      >
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5 pr-20">
            <span className="text-zinc-500">{item.label}</span>
            <span className="font-semibold text-emerald-400">
              {item.value} <span aria-hidden>▼</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Header
// ============================================================================

/** Shared by the Header CTA and the new Hero CTA (Mobile-First Hero task,
 *  2026-08-22) — both just jump to the #calculator anchor already on the
 *  Custom/Recommended card below; scrolling, not a page navigation, so
 *  this works identically from either trigger. */
function scrollToCalculator() {
  document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// (The site header used to be defined here as a local `Header` component
// — moved to components/SiteHeader.tsx, 2026-09-05, "header should
// remain the same across the application" — see that file's own doc
// comment. Rendered below via <SiteHeader />.)

// ============================================================================
// Hero + Calculator
// ============================================================================

function Hero() {
  return (
    <section className="dot-grid relative px-5 pb-4 pt-3 sm:pt-5 md:pb-3 print:p-0">
      {/* Ambient glow, purely decorative — two soft, low-opacity washes
          instead of one saturated blob, for a calmer first impression. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-160px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-orange-200/20 blur-[130px] print:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-80px] top-[40px] h-[280px] w-[280px] rounded-full bg-emerald-200/15 blur-[110px] print:hidden"
      />

      {/* "International SaaS" Hero redesign (2026-08-24) — replaces the
          Mobile-First Hero (headline + subhead + CTA button + 3-step
          strip, 2026-08-22) with an Airbnb-style "no click needed"
          opener: a punchy one-line headline, a tiny muted subhead, and
          nothing else — the calculator immediately below (What do you
          need? → bill input) IS the next thing on the page, not gated
          behind a button anymore.

          Real deviation from the brief, and why: the brief additionally
          asked to move the Average Monthly Bill INPUT ITSELF out of its
          Energy Profile card and directly into this Hero section. That
          doesn't fit this app's actual structure — the very next thing
          on the page is the "What do you need?" Master Service picker
          (Complete Solar / EV Charger / Panel Washing), and only
          Complete Solar has a "monthly bill" as its first field at all;
          EV Charger and Panel Washing ask for completely different
          things (charger type, panel count). Putting a bill field
          ahead of that choice would show it to people it doesn't apply
          to, and duplicating the state to hide/show it conditionally
          would fight the calculator's own step order rather than
          simplify it. Cutting the button + 3-step strip below instead
          delivers the same real goal (zero clicks between landing and
          the calculator's real first input) without that structural
          conflict — the "What do you need?" fieldset is now the very
          next element on the page, exactly where the bill input READS
          as "step one" for the only flow that has one. */}
      <div className="relative mx-auto max-w-2xl text-center print:hidden">
        {/* Eyebrow + slider-flavored subhead (2026-09-04, Main.html
            baseline) — mobile only, since it specifically sets up the
            "slide in your bill" dark hero card right below, which only
            exists on mobile. Desktop's existing copy (no slider there)
            is untouched. */}
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.15em] text-[#AE4E1E] lg:hidden">
          Instant solar quotes · Punjab
        </p>
        <h1 className="text-balance text-[1.85rem] font-bold leading-[1.15] tracking-tight text-stone-900 sm:text-5xl sm:leading-[1.1]">
          Solar. <span className="text-orange-700">Priced Instantly.</span>
        </h1>
        <p className="mx-auto mt-1.5 max-w-xs text-balance text-xs text-stone-400 lg:hidden">
          Slide in your monthly bill and see the exact system and price. No sales calls to get a number.
        </p>
        <p className="mx-auto mt-1.5 hidden max-w-sm text-balance text-sm text-stone-400 lg:block">
          Live engineering. Zero hidden fees.
        </p>
      </div>

      <div id="calculator" className="relative mx-auto mt-4 w-full scroll-mt-24 sm:mt-4 md:mt-3 print:mt-0 print:max-w-none">
        {/* useSearchParams() (for the report-step/back-button sync — see
            CalculatorCard) requires a Suspense boundary so the rest of
            this static page isn't forced fully dynamic. */}
        <Suspense fallback={<CalculatorCardSkeleton />}>
          <CalculatorCard />
        </Suspense>
      </div>
    </section>
  );
}

function CalculatorCardSkeleton() {
  return (
    <div
      aria-hidden
      className="animate-pulse mx-auto w-full max-w-3xl rounded-3xl border border-stone-200/80 bg-white p-6 shadow-xl shadow-stone-200/50 md:p-10"
    >
      <div className="h-10 rounded-xl bg-stone-100" />
      <div className="mt-3 space-y-2.5">
        <div className="h-16 rounded-2xl bg-stone-100" />
        <div className="h-16 rounded-2xl bg-stone-100" />
        <div className="h-16 rounded-2xl bg-stone-100" />
      </div>
      <div className="mt-3 h-11 rounded-xl bg-stone-100" />
      <div className="mt-4 h-12 rounded-xl bg-stone-100" />
    </div>
  );
}

// ============================================================================
// Sector illustrations — minimal line-art (thin stroke, no fill) matching
// the corner-bracket/editorial style used across the page, rather than
// photographic images. Keeps the sector cards fully self-contained (no
// external image hosting/CDN dependency) and visually consistent with
// the rest of the site.
// ============================================================================

function SectorIllustration({ sector, className }: { sector: Sector; className?: string }) {
  const common = { viewBox: "0 0 64 48", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (sector === "RESIDENTIAL") {
    return (
      <svg {...common} className={className} aria-hidden>
        {/* Roof + solar panel */}
        <path d="M6 24 L32 6 L58 24" />
        <path d="M18 15.5 L30 7 L38 7 L26 15.5 Z" opacity={0.5} />
        {/* Walls */}
        <path d="M13 21 V41 H51 V21" />
        {/* Door */}
        <path d="M27 41 V29 H37 V41" />
        {/* Windows */}
        <rect x="18" y="26" width="6" height="6" rx="1" />
        <rect x="40" y="26" width="6" height="6" rx="1" />
      </svg>
    );
  }

  if (sector === "COMMERCIAL") {
    return (
      <svg {...common} className={className} aria-hidden>
        {/* Two-building plaza */}
        <path d="M7 42 V16 H26 V42" />
        <path d="M30 42 V8 H55 V42" />
        <path d="M7 42 H55" />
        {/* Window grids */}
        <path d="M11 21 H22 M11 27 H22 M11 33 H22 M11 39 H22" />
        <path d="M35 13 H51 M35 19 H51 M35 25 H51 M35 31 H51 M35 37 H51" />
      </svg>
    );
  }

  return (
    <svg {...common} className={className} aria-hidden>
      {/* Factory: sawtooth roof + chimney + panel array */}
      <path d="M6 42 V26 L14 18 L22 26 L30 18 L38 26 V42" />
      <path d="M42 42 V12 H50 V42" />
      <path d="M42 16 H50" />
      <path d="M6 42 H50" />
      {/* Ground-mount solar array */}
      <path d="M9 37 L16 33 L23 37 Z" opacity={0.5} />
      <path d="M25 37 L32 33 L39 37 Z" opacity={0.5} />
    </svg>
  );
}

// ============================================================================
// "Architectural sketch" icon set — one shared blueprint aesthetic for
// every equipment/service category on the page (fill="none",
// stroke="currentColor", strokeWidth 1.5, round caps/joins, viewBox
// 0 0 48 48 unless noted). Deliberately monoline + slightly organic
// (curved cable tails, an overlapping "sketch" ridge line, etc.) rather
// than pixel-perfect glyphs — matches SectorIllustration's existing House/
// Office/Factory icons above, which this set is designed to sit alongside.
// Every icon takes just `className` (same call shape as a lucide-react
// icon) so it drops into any spot currently holding one, including
// MASTER_SERVICES' `icon` field below.
// ============================================================================

const SKETCH_ICON_PROPS = {
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Solar Panel Grid — a tilted ridge line (suggesting the panel's angle
 *  on a roof) sitting atop a framed 3×3 cell grid. */
function SolarPanelIcon({ className }: { className?: string }) {
  return (
    <svg {...SKETCH_ICON_PROPS} className={className} aria-hidden>
      <path d="M5 15 L24 6 L43 15 L43 16 L24 7.5 L5 16 Z" opacity={0.55} />
      <rect x="5" y="15" width="38" height="25" rx="1" />
      <path d="M5 23.3 H43 M5 31.6 H43 M17.7 15 V40 M30.3 15 V40" />
    </svg>
  );
}

/** Wall-mounted Inverter Box — bracket line, a boxy body, a small display
 *  with a readout line, three status LEDs, and a cable stub. */
function InverterIcon({ className }: { className?: string }) {
  return (
    <svg {...SKETCH_ICON_PROPS} className={className} aria-hidden>
      <path d="M6 10 H42" opacity={0.5} />
      <rect x="11" y="10" width="26" height="30" rx="2" />
      <rect x="16" y="15" width="16" height="8" rx="1" />
      <path d="M19 19 H29" />
      <circle cx="18" cy="30" r="1.2" />
      <circle cx="24" cy="30" r="1.2" />
      <circle cx="30" cy="30" r="1.2" />
      <path d="M24 40 V45" />
    </svg>
  );
}

/** Lithium Battery Unit — a rack-module body split into three cell
 *  segments, a terminal nub on top, and a bolt overlay. */
function BatteryIcon({ className }: { className?: string }) {
  return (
    <svg {...SKETCH_ICON_PROPS} className={className} aria-hidden>
      <rect x="8" y="12" width="32" height="28" rx="2" />
      <path d="M19 12 V7 H29 V12" />
      <path d="M8 22 H40 M8 30.5 H40" opacity={0.5} />
      <path d="M26.5 15 L19 27 H24.5 L21.5 36 L30 23 H24.5 Z" />
    </svg>
  );
}

/** EV Charger / Plug — a rounded connector head with two round pins and a
 *  center ground pin, trailing a looping hand-drawn cable. */
function EVChargerIcon({ className }: { className?: string }) {
  return (
    <svg {...SKETCH_ICON_PROPS} className={className} aria-hidden>
      <path d="M14 16 H32 A6 6 0 0 1 38 22 V29 A6 6 0 0 1 32 35 H14 A6 6 0 0 1 8 29 V22 A6 6 0 0 1 14 16 Z" />
      <circle cx="17.5" cy="25.5" r="2" />
      <circle cx="28.5" cy="25.5" r="2" />
      <path d="M23 20 V31" opacity={0.6} />
      <path d="M8 25.5 C2 25.5 2 12 10 10 C16 8.5 16 4.5 12.5 3.5" opacity={0.7} />
    </svg>
  );
}

/** Water Drop / Sparkles — Panel Washing. A classic teardrop with an
 *  inner highlight arc, plus two small four-point sparkle marks. */
function WaterDropIcon({ className }: { className?: string }) {
  return (
    <svg {...SKETCH_ICON_PROPS} className={className} aria-hidden>
      <path d="M24 6 C24 6 34.5 20.5 34.5 28.5 A10.5 10.5 0 0 1 13.5 28.5 C13.5 20.5 24 6 24 6 Z" />
      <path d="M18.5 28.5 A5.5 5.5 0 0 0 24 34" opacity={0.5} />
      <path d="M38 11 L39.6 14.6 L43.2 16.2 L39.6 17.8 L38 21.4 L36.4 17.8 L32.8 16.2 L36.4 14.6 Z" opacity={0.7} />
      <path d="M9 33 L10 35.4 L12.4 36.4 L10 37.4 L9 39.8 L8 37.4 L5.6 36.4 L8 35.4 Z" opacity={0.5} />
    </svg>
  );
}

/** Shield / Wire — Electrical Protection (Cabling, DB &amp; safety
 *  equipment). A pointed-base shield outline with a bolt/wire zigzag
 *  running through its center. */
function ShieldWireIcon({ className }: { className?: string }) {
  return (
    <svg {...SKETCH_ICON_PROPS} className={className} aria-hidden>
      <path d="M24 5 L40 11 V22 C40 33 33 40 24 44 C15 40 8 33 8 22 V11 Z" />
      <path d="M27 14 L18.5 26 H24 L20.5 35 L31 21 H25 Z" />
    </svg>
  );
}

/** L-2 Standard Structure — a low-profile mounting rail: ground line,
 *  two short uniform legs, a connecting rail, and a barely-tilted panel
 *  edge sitting just above it. Deliberately low/flat next to
 *  ElevatedStructureIcon below, so the two read as visually distinct at
 *  a glance in the Mounting Structure swap picker (2026-08-27, explicit
 *  instruction: "add some icon or sketch for the structures so customer
 *  can check"). */
function StandardStructureIcon({ className }: { className?: string }) {
  return (
    <svg {...SKETCH_ICON_PROPS} className={className} aria-hidden>
      <path d="M4 40 H44" />
      <path d="M12 40 V31 M36 40 V29" />
      <path d="M12 31 L36 29" />
      <path d="M10 25.5 L38 22.5" opacity={0.6} />
    </svg>
  );
}

/** Elevated Customized Structure — a taller tilted A-frame: ground line,
 *  a short front leg and a tall back leg, a steeply-angled panel edge
 *  spanning between their tops, and a diagonal brace strut. Noticeably
 *  taller/steeper than StandardStructureIcon above — the visual cue for
 *  "elevated." */
function ElevatedStructureIcon({ className }: { className?: string }) {
  return (
    <svg {...SKETCH_ICON_PROPS} className={className} aria-hidden>
      <path d="M4 40 H44" />
      <path d="M12 40 V30 M36 40 V14" />
      <path d="M12 30 L36 14" />
      <path d="M12 40 L30 21" opacity={0.55} />
    </svg>
  );
}

/** Maps a MOUNTING_STRUCTURE EquipmentOption.code to its sketch icon in
 *  the Custom Builder's swap picker — undefined for "Other / Specific
 *  Requirement" (falls back to no icon, same as every other swap row's
 *  "Other" card) or any future code this map hasn't been updated for. */
const STRUCTURE_ICON_BY_CODE: Record<string, React.ComponentType<{ className?: string }>> = {
  STANDARD_L1_L2: StandardStructureIcon,
  CUSTOM_ELEVATED: ElevatedStructureIcon,
};

// ============================================================================
// Step indicators (Part 2) — a high-contrast "STEP N" pill + title above
// each of the dashboard's 3 major blocks, so the eye has an explicit
// checklist to follow instead of reading three visually-identical cards
// in a row. Paired at each call site with an alternating background tint
// (bg-white / bg-stone-50) on the block itself — see CalculatorCard.
// ============================================================================

function StepHeader({ step, title, icon: Icon }: { step: number; title: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-700 text-[11px] font-bold text-white">
        {step}
      </span>
      <p className="flex min-w-0 items-center gap-1.5 text-xs font-bold tracking-wide text-slate-800 uppercase">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-orange-600" />}
        <span className="truncate">{title}</span>
      </p>
    </div>
  );
}

function CalculatorCard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reportStep = searchParams.get("step") === "report";

  // Master toggle — "Complete Solar System" shows the full flow below;
  // the other two swap in a stripped description+contact form (see the
  // masterService !== "COMPLETE_SOLAR" branch further down). Not synced
  // to the URL — only the report step is (see the effect below), per the
  // back-button requirement being specifically about the report screen.
  const [masterService, setMasterService] = useState<MasterService>("COMPLETE_SOLAR");

  // Auto-scroll flow (2026-08-22, Desktop Hero Compaction task) — three
  // scroll stops down the Complete Solar path: the Master Service picker
  // itself, the Energy Profile (bill) card, and the Equipment
  // Configurator card. Property & System (StepHeader step 2) sits
  // between the latter two in the DOM but has no dedicated stop of its
  // own here — its Sector/ServiceType state always has a real default
  // (DEFAULT_SECTOR / HYBRID_BATTERY, see below), so jumping straight
  // from the bill card to the Configurator never leaves the form in an
  // incomplete state, just skips pausing there.
  //
  // Extended 2026-08-24 (International SaaS Hero Redesign task) with a
  // ref each for EV Charger and Panel Washing's own input sections —
  // selecting either of those Master Service cards used to just swap
  // the form in place with no scroll at all, unlike Complete Solar.
  // Same double-rAF-deferred pattern as Complete Solar's own trigger
  // below (see that onClick handler): whichever section isn't the
  // active masterService simply isn't in the DOM, so its ref stays
  // null and scrollToStep's optional chaining no-ops safely for it.
  const serviceSelectionRef = useRef<HTMLFieldSetElement>(null);
  const energyProfileRef = useRef<HTMLDivElement>(null);
  const configurationRef = useRef<HTMLDivElement>(null);
  const evChargerRef = useRef<HTMLDivElement>(null);
  const panelWashingRef = useRef<HTMLDivElement>(null);

  function scrollToStep(ref: React.RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const [addOnDescription, setAddOnDescription] = useState("");
  const [addOnError, setAddOnError] = useState<string | null>(null);
  // The final computed Panel Washing/EV Charger price, set right before
  // opening WhatsApp (see handleAddOnSubmit) — drives the AddOnResultSummary
  // screen the same way `result` drives ResultSummary for Complete Solar,
  // but kept as a completely separate state/type so nothing here can ever
  // leak into or get confused with the solar QuoteResult shape.
  const [addOnResult, setAddOnResult] = useState<AddOnResult | null>(null);

  // ---- Panel Washing (SYSTEM_UPGRADES) ----
  const [washPanelCount, setWashPanelCount] = useState("");
  const [washPreview, setWashPreview] = useState<PanelWashingResult | null>(null);
  const [washPreviewLoading, setWashPreviewLoading] = useState(false);
  const [washPreviewError, setWashPreviewError] = useState<string | null>(null);

  // ---- EV Charger ----
  // A real EquipmentOption.code (componentType=EV_CHARGER), fed from the
  // same equipmentOptions catalog fetch the Custom Equipment Builder
  // already uses (2026-08-25 — replaced the old fixed 7/11/22kW bucket
  // picker with a real brand+model+price catalog, same pattern as
  // Panel/Inverter/Battery). kW rating and price both come from the
  // picked option, never entered separately.
  const [evChargerCode, setEvChargerCode] = useState<string | null>(null);
  const [evCableDistanceMeters, setEvCableDistanceMeters] = useState(String(EV_CHARGER_INCLUDED_CABLE_METERS));
  const [evPreview, setEvPreview] = useState<EvChargerResult | null>(null);
  const [evPreviewLoading, setEvPreviewLoading] = useState(false);
  const [evPreviewError, setEvPreviewError] = useState<string | null>(null);

  const [sector, setSector] = useState<Sector>(DEFAULT_SECTOR);
  // Residential defaults to Hybrid (recommended); Commercial defaults to
  // On-Grid — both are genuinely interactive/customer choice now, only
  // Industrial stays hard-locked. See LOCKED_SERVICE_TYPE_BY_SECTOR.
  const [residentialServiceType, setResidentialServiceType] = useState<ServiceType>("HYBRID_BATTERY");
  // Auto-routing feedback (2026-09-04, explicit feedback pass) — see
  // industrialAutoRoutedRef and the debounced routing effect near
  // applyBillThresholdRouting for the full explanation. A brief, non-
  // blocking notice shown right after the bill-threshold routing effect
  // actually flips `sector` on its own — every auto-switch gets a real,
  // visible explanation instead of the card silently changing under the
  // customer. Cleared automatically after a few seconds and whenever the
  // customer manually picks a sector themselves.
  const [autoRouteNotice, setAutoRouteNotice] = useState<string | null>(null);
  // Distinguishes "sector === INDUSTRIAL because the customer tapped
  // Industrial themselves" from "...because a large bill auto-routed
  // them there." Only the second case should ever get auto-reverted by
  // a subsequent small bill — a real explicit choice (a genuine
  // seasonal/off-season factory bill, say) must never get silently
  // bounced back to Residential just because the number dropped. A ref,
  // not state: it's read only inside the debounced routing effect/
  // chooseSector below, never rendered, so a re-render on change would
  // be pure waste.
  const industrialAutoRoutedRef = useRef(false);
  /** Every explicit sector pick (segmented control, desktop Property
   *  Type cards, the mobile Services row's "Commercial & Industrial"
   *  button) should go through this instead of the raw setSector setter
   *  — it's the one place that clears industrialAutoRoutedRef, so a
   *  customer who deliberately taps a tab is never treated as if the
   *  bill-threshold effect chose it for them. */
  function chooseSector(value: Sector) {
    industrialAutoRoutedRef.current = false;
    setAutoRouteNotice(null);
    setSector(value);
  }
  const [commercialServiceType, setCommercialServiceType] = useState<ServiceType>("ONGRID_ZERO_EXPORT");

  const [billAmountInput, setBillAmountInput] = useState("");
  // Target Budget tier (2026-08-20) — null = no preference, ordinary
  // admin-configured Recommended default resolves the inverter/battery.
  // Sits alongside the bill amount, not inside equipmentSelections — it's
  // a top-level sizing/strategy input, not a per-component brand pick.
  const [targetBudgetTier, setTargetBudgetTier] = useState<BudgetTier | null>(null);
  const [billSource, setBillSource] = useState<BillSource>("MANUAL");
  const [billFileUrl, setBillFileUrl] = useState<string | null>(null);
  const [billDetails, setBillDetails] = useState<UploadedBillDetails | null>(null);

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  // Enterprise Proposal card (2026-08-29, explicit instruction, mobile
  // only) — Connection Type has no backend concept anywhere (not in
  // EquipmentSelections, the pricing engine, or the schema); it's a
  // plain capture-only field folded straight into the WhatsApp inquiry
  // message below, never sent to /api/quote/calculate. (Sanctioned Load
  // was the same kind of field here too — removed 2026-09-04, explicit
  // feedback: the Enterprise card should drive off the same real
  // Average Monthly Bill the pricing engine actually uses, matching
  // desktop's tested Industrial flow, not a number with no calc behind
  // it. See the card's own render for the bill field that replaced it.)
  const [connectionType, setConnectionType] = useState<"HT" | "LT" | null>(null);
  // "Refine your details" (2026-09-04, mobile Live Estimate panel, LOCKED
  // spec's Quote-screen note) — capture-only, no pricing engine change,
  // no EquipmentSelections field, just folded into the WhatsApp message
  // ResultSummary already builds on submit. (Its Mounting Structure
  // sibling field uses the real structureCode state instead — see that
  // field's own doc comment.)
  const [connectionPhase, setConnectionPhase] = useState<InverterPhase | null>(null);
  // Contact.html baseline (2026-09-04) — same capture-only pattern again:
  // Contact.html's "Installation area" field, folded into the WhatsApp
  // message on submit, no pricing/backend effect.
  const [installationArea, setInstallationArea] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteResult | null>(null);

  // Browser Back (or Forward) changing the URL is the source of truth for
  // whether the report should be showing — this effect just reconciles
  // local `status` to match whenever ?step=report disappears (hardware
  // Back) or reappears (Forward). Pushing/removing the param itself
  // happens in handleSolarSubmit / handleEditInputs below. This is
  // exactly the "subscribe to an external system" case the
  // set-state-in-effect rule carves out (browser history isn't
  // React-owned state) — `status` has to stay a separate, synchronous
  // local value rather than a pure derivation of searchParams, or a
  // successful submit would flash the form again for one frame while
  // waiting on router.push to actually update the URL.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- syncing to the
       browser's own history/searchParams, not deriving from React state;
       see the comment block above. */
    if (!reportStep && status === "success") {
      setStatus("idle");
    } else if (reportStep && status === "idle" && (result || addOnResult)) {
      setStatus("success");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [reportStep, status, result, addOnResult]);

  // Scroll to the top of the final quotation (2026-09-04 feedback: "on
  // the page where we're displaying the final quotation, the view
  // should be from the top") — ResultSummary/AddOnResultSummary replace
  // this entire component's output the instant status flips to
  // "success", but the page itself was still scrolled wherever the
  // customer left it (typically deep in the form, having just submitted
  // from the sticky Live Estimate panel), so the quotation's own header
  // could render off-screen above the fold. Fires on every "success"
  // transition, not just the first submit — covers the back-button/
  // reportStep restore path above too.
  useEffect(() => {
    if (status === "success") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [status]);

  // "Calculation Transparency" dropdown under the Recommended System
  // badge — collapsed by default, no persistence needed (just a reveal).
  const [showCalcDetails, setShowCalcDetails] = useState(false);

  // ---- Dual Customization Paths ----
  const [customizationPath, setCustomizationPath] = useState<CustomizationPath>("RECOMMENDED");
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOptionsByType | null>(null);
  const [equipmentOptionsError, setEquipmentOptionsError] = useState<string | null>(null);
  // Loading is derived, not tracked separately: it's true exactly while
  // we're on the Custom path with neither a result nor an error yet.
  const equipmentOptionsLoading = customizationPath === "CUSTOM" && !equipmentOptions && !equipmentOptionsError;

  // Which Custom Equipment Builder accordion section is expanded — true
  // accordion (at most one open at a time), starting on Solar Panels.
  // Null means every section is collapsed (the user closed the open one).
  const [openEquipmentSection, setOpenEquipmentSection] = useState<EquipmentSectionKey | null>("PANEL");

  // Raw state holds only the user's explicit picks (null = "no override
  // yet"). The Recommended-default fallback is computed during render
  // below (effective*Code) rather than written back via an effect, so a
  // switch to Custom or a serviceType change never needs a setState-in-effect.
  const [panelCode, setPanelCode] = useState<string | null>(null);
  const [inverterCode, setInverterCode] = useState<string | null>(null);
  const [batteryCode, setBatteryCode] = useState<string | null>(null);
  const [cableCode, setCableCode] = useState<string | null>(null);
  const [breakersCode, setBreakersCode] = useState<string | null>(null);
  const [structureCode, setStructureCode] = useState<string | null>(null);
  // Site Works quantities — unlike every other slot above, these ARE the
  // real value directly (no "null = no override yet, fall back at
  // render" indirection needed): a quantity picker's own displayed value
  // IS the selection, there's no separate "Recommended default" catalog
  // row to fall back to. Civil Blocks has no state of its own as of
  // 2026-08-20 — it's always auto-computed server-side from the real
  // panel count (see the read-only display in the Site Works row below).
  const [earthingBoreQty, setEarthingBoreQty] = useState(DEFAULT_EARTHING_BORE_QTY);
  const [lightningArrestorQty, setLightningArrestorQty] = useState(DEFAULT_LIGHTNING_ARRESTOR_QTY);
  // Panel Quantity Adjuster (2026-08-20) — null = no override yet, same
  // "fall back to the backend's own baseline at render" pattern as
  // panelCode/inverterCode above (NOT the Site Works quantities' "value
  // IS the selection" pattern), since the true baseline/max come from
  // the live backend response, not a client-known constant.
  const [panelQtyOverride, setPanelQtyOverride] = useState<number | null>(null);
  // Manual inverter "clubbing" override (2026-08-29) — same "null = no
  // override yet" pattern as panelQtyOverride above. Only meaningful once
  // a live preview exists (there's no client-known "auto quantity" to
  // compare against before that) — see the Custom Equipment Builder's
  // Inverter row for where this actually renders a QuantityStepper. Reset
  // to null by handleInverterCodeChange whenever the customer swaps to a
  // different inverter model — a leftover "×3" from a smaller unit makes
  // no sense once they've switched to a bigger one.
  const [inverterQuantityOverride, setInverterQuantityOverride] = useState<number | null>(null);
  // "One-Time Panel Washing Visit" (2026-08-21) — Services section toggle.
  const [includePanelWashing, setIncludePanelWashing] = useState(false);

  const serviceType: ServiceType =
    LOCKED_SERVICE_TYPE_BY_SECTOR[sector] ?? (sector === "RESIDENTIAL" ? residentialServiceType : commercialServiceType);
  const resolvedBillPKR = billAmountInput.trim() === "" ? null : Number(billAmountInput);

  // Fetch the equipment catalog once Complete Solar is active (mirrors
  // whatever sector/masterService is already selected — no separate
  // gate), and RE-fetch whenever sector changes — the per-item
  // unitPricePKR each option now carries is margin-adjusted per sector
  // (see getPublicUnitPricesPKR), so a stale catalog would show stale
  // prices on the pills after a sector switch. Every setState call here
  // lives inside a promise callback, not synchronously in the effect
  // body — "loading" is derived above instead.
  //
  // Broadened from "only once Custom is opened" (2026-09-04) — the
  // mobile "Refine your details" panel's Mounting Structure dropdown
  // (real admin-configured catalog, not a capture-only label list) now
  // needs this catalog on the Recommended path too, since that panel
  // shows regardless of customizationPath.
  //
  // Also fires for masterService === "EV_CHARGER" (2026-08-25) — that
  // flow reuses this same EquipmentOptionsByType state for its own real
  // brand+model+price picker, same catalog fetch, no second endpoint.
  useEffect(() => {
    if (masterService !== "COMPLETE_SOLAR" && masterService !== "EV_CHARGER") return;
    let cancelled = false;
    fetch(`/api/equipment-options?sector=${sector}`)
      .then(async (res) => {
        const data = (await res.json()) as ApiJson<{ options?: EquipmentOptionsByType }>;
        if (!res.ok) throw new Error(data?.error ?? "Failed to load equipment options");
        if (!cancelled) {
          setEquipmentOptions(data.options ?? {});
          setEquipmentOptionsError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setEquipmentOptionsError("Couldn't load equipment options. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [masterService, sector]);

  /** Client mirror of lib/db/admin.ts's inverterQuantityFor (2026-08-29)
   *  — the auto-computed MINIMUM number of the resolved inverter SKU
   *  needed to cover systemKw, no manual override applied. Only used as
   *  the Custom Equipment Builder's inverter QuantityStepper's floor
   *  (`min`, Residential only — see resolveInverterQuantity's own doc
   *  comment for why Commercial/Industrial skip this floor entirely) —
   *  the server independently re-derives and
   *  clamps this too (see resolveInverterQuantity), this is purely a
   *  same-tick UI bound, not the pricing source of truth. */
  function clientInverterQuantityFor(systemKw: number, specValueKw: number | null): number {
    if (!specValueKw) return 1;
    return Math.max(1, Math.ceil(systemKw / specValueKw));
  }

  function firstNonOther(list?: EquipmentOptionDTO[]): string | null {
    return list?.find((o) => !o.isOtherOption)?.code ?? null;
  }

  /** Same "no explicit pick yet" fallback as firstNonOther, but by
   *  lowest unitPricePKR instead of catalog sortOrder — Mounting
   *  Structure's own pre-selection (2026-08-27, explicit instruction:
   *  "by default we will be setting up the lowest ones"). Mirrors
   *  getCheapestStructureCode's server-side logic in lib/db/admin.ts so
   *  the Custom Builder's own initial highlight can never disagree with
   *  what the backend actually prices when structureCode is omitted. */
  function cheapestNonOther(list?: EquipmentOptionDTO[]): string | null {
    const real = (list ?? []).filter((o) => !o.isOtherOption && o.inStock && o.unitPricePKR !== null);
    if (real.length === 0) return firstNonOther(list);
    return real.reduce((min, o) => (o.unitPricePKR! < min.unitPricePKR! ? o : min)).code;
  }

  // Moved up from its original spot next to the live-preview useEffect
  // (2026-08-29) so effectiveInverterCode below can consult it — see that
  // computation's own doc comment for why. Declared unconditionally at
  // the top level either way, so this move doesn't affect hook order.
  const [livePreview, setLivePreview] = useState<SolarPreviewResult | null>(null);
  const [livePreviewLoading, setLivePreviewLoading] = useState(false);
  const [livePreviewError, setLivePreviewError] = useState<string | null>(null);

  // Inverter options are filtered by serviceType (On-Grid vs Hybrid).
  const inverterOptionsForServiceType = (equipmentOptions?.INVERTER ?? []).filter(
    (o) => o.isOtherOption || o.applicableServiceType === serviceType,
  );
  const batteryOptions = equipmentOptions?.BATTERY ?? [];
  // EV Charger's own catalog (2026-08-25) — no serviceType filtering, no
  // Recommended-default auto-selection; the customer always picks
  // explicitly (see prisma/seed.ts's EV_CHARGER block doc comment).
  const evChargerOptions = equipmentOptions?.EV_CHARGER ?? [];
  const selectedEvChargerOption = evChargerOptions.find((o) => o.code === evChargerCode) ?? null;

  // Effective selection = the user's explicit pick, if still valid for the
  // current serviceType — otherwise the Recommended default for that slot.
  const effectivePanelCode = panelCode ?? firstNonOther(equipmentOptions?.SOLAR_PANEL);
  // Inverter's "no explicit pick yet" default is NOT a fixed admin
  // isDefault row the way Panel/Cable/Breakers are — the server always
  // resolves it through resolveBudgetTierInverterCode, which depends on
  // systemKw (and, since 2026-08-29, can pick a genuinely different SKU
  // once clubbing kicks in for a large industrial system). firstNonOther
  // is only a same-serviceType catalog-order GUESS and can name a wildly
  // wrong/undersized unit for a large system — so prefer the real
  // server-resolved code from livePreview (source of truth) whenever one
  // is available and still valid for this serviceType, falling back to
  // the old heuristic only before the first live preview resolves.
  const effectiveInverterCode =
    inverterCode && inverterOptionsForServiceType.some((o) => o.code === inverterCode)
      ? inverterCode
      : livePreview && inverterOptionsForServiceType.some((o) => o.code === livePreview.equipment.inverter.code)
        ? livePreview.equipment.inverter.code
        : firstNonOther(inverterOptionsForServiceType);
  // Default = "No Battery" (NONE_CODE), not the first real catalog row —
  // the Custom Equipment Builder never pre-selects a battery cost on the
  // customer's behalf; they must explicitly pick one from the row below
  // to add it (2026-08-21, explicit instruction). Only an explicit,
  // still-valid pick from batteryCode overrides that.
  const effectiveBatteryCode =
    serviceType !== "HYBRID_BATTERY"
      ? null
      : batteryCode && batteryOptions.some((o) => o.code === batteryCode)
        ? batteryCode
        : NONE_CODE;
  const effectiveCableCode = cableCode ?? firstNonOther(equipmentOptions?.DC_CABLE);
  const effectiveBreakersCode = breakersCode ?? firstNonOther(equipmentOptions?.BREAKERS);
  const effectiveStructureCode = structureCode ?? cheapestNonOther(equipmentOptions?.MOUNTING_STRUCTURE);

  const currentPanelOption = equipmentOptions?.SOLAR_PANEL?.find((o) => o.code === effectivePanelCode) ?? null;

  // Solar Panel — Company then Wattage cascading picker (2026-08-22),
  // matching Battery's brand-then-capacity two-step UX. Unlike Battery
  // (where capacity is a genuinely separate multiplier on top of
  // brand), every real catalog SKU here already IS one specific
  // brand+wattage combination — picking a "wattage" card just resolves
  // directly to that one SKU's code, there's no second independent
  // dimension being combined.
  const realPanelOptions = (equipmentOptions?.SOLAR_PANEL ?? []).filter((o) => !o.isOtherOption);
  const otherPanelOption = equipmentOptions?.SOLAR_PANEL?.find((o) => o.isOtherOption) ?? null;
  const panelBrands = Array.from(new Set(realPanelOptions.map((o) => o.brand ?? o.label)));
  function panelSkusForBrand(brand: string): EquipmentOptionDTO[] {
    return realPanelOptions.filter((o) => (o.brand ?? o.label) === brand).sort((a, b) => (a.specValue ?? 0) - (b.specValue ?? 0));
  }
  /** The cheapest in-stock SKU for a brand — what a brand card resolves
   *  to when clicked, and what its own price delta previews. Falls back
   *  to the first SKU (even if out of stock) only when NOTHING in that
   *  brand is in stock, so clicking a brand always selects something. */
  function defaultPanelSkuForBrand(brand: string): EquipmentOptionDTO | null {
    const skus = panelSkusForBrand(brand);
    const inStockSkus = skus.filter((o) => o.inStock);
    if (inStockSkus.length === 0) return skus[0] ?? null;
    return inStockSkus.reduce((cheapest, o) => ((o.unitPricePKR ?? Infinity) < (cheapest.unitPricePKR ?? Infinity) ? o : cheapest));
  }
  const currentPanelBrand =
    effectivePanelCode !== OTHER_CODE ? (currentPanelOption?.brand ?? currentPanelOption?.label ?? null) : null;
  const currentInverterOption = inverterOptionsForServiceType.find((o) => o.code === effectiveInverterCode) ?? null;

  // Inverter — Company then Model cascading picker (2026-08-22), same
  // two-step pattern as Solar Panel's Company -> Wattage picker (see its
  // doc comment above). Every real inverter is now a specific, flat
  // PER_PIECE-priced product (brand + rated kW + phase — see
  // lib/db/admin.ts's rawInverterPKR comment for why it's no longer
  // scaled by system watts), so "pick a model" resolves directly to one
  // real SKU, exactly like the panel picker.
  const realInverterOptions = inverterOptionsForServiceType.filter((o) => !o.isOtherOption);
  const otherInverterOption = inverterOptionsForServiceType.find((o) => o.isOtherOption) ?? null;
  const inverterBrands = Array.from(new Set(realInverterOptions.map((o) => o.brand ?? o.label)));
  function inverterSkusForBrand(brand: string): EquipmentOptionDTO[] {
    return realInverterOptions.filter((o) => (o.brand ?? o.label) === brand).sort((a, b) => (a.specValue ?? 0) - (b.specValue ?? 0));
  }
  function defaultInverterSkuForBrand(brand: string): EquipmentOptionDTO | null {
    const skus = inverterSkusForBrand(brand);
    const inStockSkus = skus.filter((o) => o.inStock);
    if (inStockSkus.length === 0) return skus[0] ?? null;
    return inStockSkus.reduce((cheapest, o) => ((o.unitPricePKR ?? Infinity) < (cheapest.unitPricePKR ?? Infinity) ? o : cheapest));
  }
  const currentInverterBrand =
    effectiveInverterCode !== OTHER_CODE ? (currentInverterOption?.brand ?? currentInverterOption?.label ?? null) : null;
  const currentBatteryOption = batteryOptions.find((o) => o.code === effectiveBatteryCode) ?? null;
  // The active battery slot's unit price, for swapDeltaLabel's diff math
  // in the Battery row below (Optional Battery, 2026-08-20). "No Battery"
  // isn't a real catalog row, so currentBatteryOption is null while it's
  // active — treat that as a real Rs 0 baseline (not "no baseline, hide
  // pricing"), so every other card in the row correctly shows the full
  // "+ Rs X" cost of adding that battery back, instead of a generic
  // "Enter your bill to see pricing" placeholder.
  const currentBatteryUnitPricePKR = effectiveBatteryCode === NONE_CODE ? 0 : (currentBatteryOption?.unitPricePKR ?? null);

  // Battery — Company then Capacity cascading picker (2026-08-22), same
  // two-step pattern as Inverter's Company -> Model picker (see its doc
  // comment above). Every real battery is now a specific, flat
  // PER_PIECE-priced product (brand + real module kWh — see
  // lib/db/admin.ts's rawBatteryPKR comment for why it's no longer a
  // Rs/kWh rate a customer could dial to an arbitrary number), so
  // "pick a capacity" resolves directly to one real SKU, exactly like
  // the inverter picker. Unlike Inverter, "No Battery" (NONE_CODE) is
  // its own top-level choice alongside the brand cards, not nested
  // inside — see the JSX below.
  const realBatteryOptions = batteryOptions.filter((o) => !o.isOtherOption);
  const otherBatteryOption = batteryOptions.find((o) => o.isOtherOption) ?? null;
  const batteryBrands = Array.from(new Set(realBatteryOptions.map((o) => o.brand ?? o.label)));
  function batterySkusForBrand(brand: string): EquipmentOptionDTO[] {
    return realBatteryOptions.filter((o) => (o.brand ?? o.label) === brand).sort((a, b) => (a.specValue ?? 0) - (b.specValue ?? 0));
  }
  function defaultBatterySkuForBrand(brand: string): EquipmentOptionDTO | null {
    const skus = batterySkusForBrand(brand);
    const inStockSkus = skus.filter((o) => o.inStock);
    if (inStockSkus.length === 0) return skus[0] ?? null;
    return inStockSkus.reduce((cheapest, o) => ((o.unitPricePKR ?? Infinity) < (cheapest.unitPricePKR ?? Infinity) ? o : cheapest));
  }
  const currentBatteryBrand =
    effectiveBatteryCode !== OTHER_CODE && effectiveBatteryCode !== NONE_CODE
      ? (currentBatteryOption?.brand ?? currentBatteryOption?.label ?? null)
      : null;

  // Cable/Breakers/Structure Default & Swap rows (Part 5) — same
  // "resolve the actual active catalog row" pattern as Panel/Inverter/
  // Battery above.
  const currentCableOption = equipmentOptions?.DC_CABLE?.find((o) => o.code === effectiveCableCode) ?? null;
  const currentBreakersOption = equipmentOptions?.BREAKERS?.find((o) => o.code === effectiveBreakersCode) ?? null;
  const currentStructureOption = equipmentOptions?.MOUNTING_STRUCTURE?.find((o) => o.code === effectiveStructureCode) ?? null;

  const hasCustomSelection =
    customizationPath === "CUSTOM" &&
    [
      effectivePanelCode,
      effectiveInverterCode,
      effectiveBatteryCode,
      effectiveCableCode,
      effectiveBreakersCode,
      effectiveStructureCode,
    ].includes(OTHER_CODE);

  const equipmentSelections: EquipmentSelections | undefined =
    customizationPath === "CUSTOM"
      ? {
          panelCode: effectivePanelCode ?? undefined,
          inverterCode: effectiveInverterCode ?? undefined,
          // Manual inverter "clubbing" override (2026-08-29) — see the
          // inverterQuantityOverride state's own doc comment. Clamped
          // server-side to never go below the auto-computed minimum, same
          // "send the raw override, let the server clamp it" convention
          // panelQtyOverride below already uses.
          inverterQuantityOverride: inverterQuantityOverride ?? undefined,
          // batteryCode alone is enough now (2026-08-22) — it's always a
          // specific real capacity SKU (or NONE_CODE/OTHER), never a
          // brand needing a separate capacity number to go with it.
          batteryCode: effectiveBatteryCode ?? undefined,
          dcCableCode: effectiveCableCode ?? undefined,
          acCableCode: effectiveCableCode ?? undefined,
          breakersCode: effectiveBreakersCode ?? undefined,
          structureCode: effectiveStructureCode ?? undefined,
          earthingBoreQty,
          lightningArrestorQty,
          panelQtyOverride: panelQtyOverride ?? undefined,
          includePanelWashing,
        }
      : undefined;


  // ---- Live preview (dashboard right column) ----
  // Debounced ~250ms (was 500ms — 2026-09-04 feedback: "runtime
  // calculations are slow." The real bottleneck is server-side —
  // measured 1.5-5s per /api/quote/calculate call, traced to database
  // round-trip time, not this debounce or the pricing logic itself; see
  // that investigation for the fuller fix. Shortening the debounce is a
  // quick, low-risk mitigation in the meantime: it shaves the client-side
  // half of the wait so the UI feels more responsive while the slower
  // server-side half gets addressed separately), same pattern as Panel
  // Washing/EV Charger's own live previews — calls the SOLAR_PREVIEW
  // request kind (same pricing pipeline as a real submission, but never
  // persists a Lead/Quote; see the doc comment on SolarPreviewResult and
  // the route's `isPreview` branch). Fires on every bill/sector/service-
  // type/equipment change so the right-column summary and the per-pill
  // price hints both stay live. (State declarations for this now live
  // above, next to effectiveInverterCode — see that computation's own
  // doc comment.)
  useEffect(() => {
    if (masterService !== "COMPLETE_SOLAR") return;
    if (resolvedBillPKR === null || Number.isNaN(resolvedBillPKR) || resolvedBillPKR <= 0) return;

    const timeoutId = setTimeout(async () => {
      setLivePreviewLoading(true);
      setLivePreviewError(null);
      try {
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestKind: "SOLAR_PREVIEW",
            monthlyBillPKR: resolvedBillPKR,
            sector,
            serviceType: sector === "INDUSTRIAL" ? undefined : serviceType,
            daytimeUsagePct: DAYTIME_USAGE_PCT_BY_SECTOR[sector],
            equipmentSelections,
            // Target Budget isn't offered for Industrial at all (see the
            // Property & System section's UI gate) — omit rather than
            // send a stale value from before the customer switched
            // sectors, mirroring serviceType's own "server-forced
            // regardless, omit it" convention above.
            targetBudgetTier: sector === "INDUSTRIAL" ? undefined : targetBudgetTier ?? undefined,
          }),
        });
        const data = (await res.json()) as ApiJson<SolarPreviewResult>;
        if (!res.ok) {
          setLivePreviewError(data?.error ?? "Could not calculate an estimate.");
          return;
        }
        setLivePreview(data);
      } catch {
        setLivePreviewError("Network error. Please try again.");
      } finally {
        setLivePreviewLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeoutId);
    // equipmentSelections is a freshly-built object every render — depend
    // on its underlying primitives instead so the debounce timer isn't
    // reset every render regardless of whether anything actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    masterService,
    resolvedBillPKR,
    sector,
    serviceType,
    customizationPath,
    effectivePanelCode,
    effectiveInverterCode,
    inverterQuantityOverride,
    effectiveBatteryCode,
    effectiveCableCode,
    effectiveBreakersCode,
    effectiveStructureCode,
    earthingBoreQty,
    lightningArrestorQty,
    panelQtyOverride,
    targetBudgetTier,
    includePanelWashing,
  ]);

  // "Starting from" baseline (2026-08-20) — a SEPARATE, independent
  // preview call from the main livePreview above, deliberately ignoring
  // whatever the customer has actually selected (Target Budget tier,
  // Custom Builder brand picks, panel qty override) — per spec this
  // figure is ALWAYS the cheapest possible configuration (required
  // panels + smallest in-stock hybrid inverter + no battery), a stable
  // reference point the customer can compare their actual live total
  // against, not something that should move around as they customize.
  const [baselinePreview, setBaselinePreview] = useState<SolarPreviewResult | null>(null);

  useEffect(() => {
    if (masterService !== "COMPLETE_SOLAR") return;
    if (resolvedBillPKR === null || Number.isNaN(resolvedBillPKR) || resolvedBillPKR <= 0) return;

    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestKind: "SOLAR_PREVIEW",
            monthlyBillPKR: resolvedBillPKR,
            sector,
            serviceType: sector === "INDUSTRIAL" ? undefined : serviceType,
            daytimeUsagePct: DAYTIME_USAGE_PCT_BY_SECTOR[sector],
            targetBudgetTier: "UNDER_1M",
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as ApiJson<SolarPreviewResult>;
        setBaselinePreview(data);
      } catch {
        // Purely a supplementary reference figure — a failed fetch just
        // leaves the "Starting from" line hidden, never blocks or errors
        // the main live estimate.
      }
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [masterService, resolvedBillPKR, sector, serviceType]);

  // Auto Sector & System Routing (2026-08-29, explicit instruction).
  // Debounced (2026-09-04, real reported bug) — this used to run
  // SYNCHRONOUSLY on every keystroke from handleBillAmountChange, so
  // correcting a typo (backspacing a large number down before retyping
  // it) could visibly bounce the sector back and forth mid-edit before
  // the customer finished typing their real number ("bit annoying in
  // the experience," their words). Now a standalone effect, same 250ms
  // debounce pattern as the live-preview calls above, keyed on
  // resolvedBillPKR — it only evaluates once typing actually settles.
  //
  // Fires on CROSSING the threshold, not on every settle while already
  // on one side of it — prevBillForRoutingRef holds the bill value the
  // LAST evaluation actually settled on, so a customer who manually
  // picks Commercial while above Rs 2.5 Lac isn't stomped back to
  // Industrial by an unrelated bill tweak that never actually
  // re-crosses.
  const prevBillForRoutingRef = useRef<number | null>(null);
  useEffect(() => {
    if (resolvedBillPKR === null) return;
    const timeoutId = setTimeout(() => {
      const oldAmount = prevBillForRoutingRef.current;
      const newAmount = resolvedBillPKR;
      prevBillForRoutingRef.current = newAmount;
      const wasIndustrialRange = oldAmount !== null && oldAmount >= INDUSTRIAL_SECTOR_THRESHOLD_PKR;
      const isIndustrialRange = newAmount >= INDUSTRIAL_SECTOR_THRESHOLD_PKR;
      if (isIndustrialRange === wasIndustrialRange) return;

      if (isIndustrialRange && sector !== "INDUSTRIAL") {
        // Crossing UP into industrial-scale consumption — only when this
        // actually CHANGES the sector. Guarding on `sector !== "INDUSTRIAL"`
        // (not just "isIndustrialRange") matters: without it, a customer
        // who explicitly chose Industrial (chooseSector, industrialAutoRoutedRef
        // already false) and then typed a bill that happens to cross the
        // threshold on its way to a real number would have this branch
        // fire anyway (nothing stops it — they're still "crossing up"),
        // stomping their explicit-choice protection back to true and
        // reopening the exact bug chooseSector exists to prevent. System
        // Type needs no separate call — LOCKED_SERVICE_TYPE_BY_SECTOR
        // forces On-Grid the instant sector becomes "INDUSTRIAL" (see that
        // map's own doc comment), and the Hybrid/Battery UI already hides
        // itself for Industrial (Property & System's "Locked for
        // Industrial" branch).
        setSector("INDUSTRIAL");
        industrialAutoRoutedRef.current = true;
        setAutoRouteNotice("Switched to Industrial — this looks like an industrial-scale bill.");
      } else if (!isIndustrialRange && sector === "INDUSTRIAL" && industrialAutoRoutedRef.current) {
        // Crossing back DOWN — only acts if THIS routing (not an
        // explicit chooseSector tap) put the customer on Industrial in
        // the first place. Someone who deliberately chose Industrial for
        // a genuinely small bill (a seasonal factory, off-season) is
        // never force-switched back just because the number dropped —
        // see chooseSector's own doc comment for the other half of this.
        setSector("RESIDENTIAL");
        setResidentialServiceType("HYBRID_BATTERY");
        industrialAutoRoutedRef.current = false;
        setAutoRouteNotice("Switched back to Residential — this bill isn't industrial-scale.");
      }
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [resolvedBillPKR, sector]);

  // Auto-dismiss the routing notice — a few seconds is enough to read
  // one sentence without needing an explicit close button, and
  // chooseSector already clears it immediately on any manual pick.
  useEffect(() => {
    if (!autoRouteNotice) return;
    const timeoutId = setTimeout(() => setAutoRouteNotice(null), 5000);
    return () => clearTimeout(timeoutId);
  }, [autoRouteNotice]);

  function handleBillAmountChange(raw: string) {
    setBillAmountInput(raw);
    // Editing the amount by hand after an upload means we can no longer
    // vouch for it being exactly what the document said.
    if (billSource !== "MANUAL") {
      setBillSource("MANUAL");
      setBillDetails(null);
    }
  }

  // Wraps every explicit inverter pick (Custom Equipment Builder) so a
  // manual quantity override from a PREVIOUS model selection
  // never silently carries over onto a newly-picked one (2026-08-29) — a
  // leftover "×3" from a smaller unit makes no sense once the customer
  // has switched to a bigger one; the new model's own auto quantity (or
  // no override at all) is the only sane starting point.
  function handleInverterCodeChange(code: string) {
    setInverterCode(code);
    setInverterQuantityOverride(null);
  }

  // Auto-scroll trigger 2 (2026-08-22) — fires on blur (tabbing/clicking
  // away) or Enter, once a real positive amount has actually been
  // entered. Deliberately NOT on every keystroke via onChange — that
  // would yank the page out from under someone still mid-typing.
  // resolvedBillPKR is a plain synchronous value derived straight from
  // billAmountInput (no effect/async step in between), so it's already
  // current by the time either event fires.
  function handleBillAmountCommit() {
    if (resolvedBillPKR !== null && resolvedBillPKR > 0) {
      scrollToStep(configurationRef);
    }
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setUploadState("uploading");
    setUploadError(null);
    setUploadFileName(file.name);

    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/bill-upload", { method: "POST", body: formData });
      const data = (await res.json()) as ApiJson<UploadedBillDetails>;

      if (!res.ok) {
        setUploadState("error");
        setUploadError(data?.error ?? "Couldn't read that file. Enter your bill amount manually.");
        return;
      }

      const details = data;
      // No manual routing call needed here (2026-09-04) — setBillAmountInput
      // below updates resolvedBillPKR, which the debounced routing effect
      // near chooseSector already watches; it picks this up on its own.
      setBillDetails(details);
      setBillAmountInput(String(details.currentBillPKR));
      setBillSource(details.source === "uploaded_pdf" ? "UPLOADED_PDF" : "UPLOADED_IMAGE");
      setBillFileUrl(details.fileUrl);
      setUploadState("success");
    } catch {
      setUploadState("error");
      setUploadError("Network error while uploading. Enter your bill amount manually.");
    }
  }

  function clearUpload() {
    setUploadState("idle");
    setUploadError(null);
    setUploadFileName(null);
    setBillDetails(null);
    setBillSource("MANUAL");
    setBillFileUrl(null);
  }

  // ---- Panel Washing live preview ----
  // Debounced ~500ms, same pattern as /admin/checker's battery-capacity
  // recalculate effect: every setState call lives inside the timeout
  // callback, never synchronously in the effect body, so an invalid/empty
  // panelCount just skips scheduling a new fetch — the last valid preview
  // stays on screen rather than being cleared out from the effect body.
  useEffect(() => {
    if (masterService !== "SYSTEM_UPGRADES") return;
    const count = Number(washPanelCount);
    if (!Number.isFinite(count) || count <= 0) return;
    if (washPreview && count === washPreview.panelCount) return;

    const timeoutId = setTimeout(async () => {
      setWashPreviewLoading(true);
      setWashPreviewError(null);
      try {
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestKind: "PANEL_WASHING", panelCount: count, sector }),
        });
        const data = (await res.json()) as ApiJson<PanelWashingResult>;
        if (!res.ok) {
          setWashPreviewError(data?.error ?? "Could not calculate an estimate.");
          return;
        }
        setWashPreview(data);
      } catch {
        setWashPreviewError("Network error. Please try again.");
      } finally {
        setWashPreviewLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [masterService, washPanelCount, sector, washPreview]);

  // ---- EV Charger live preview ---- (same pattern as above)
  useEffect(() => {
    if (masterService !== "EV_CHARGER" || evChargerCode === null) return;
    const distance = Number(evCableDistanceMeters);
    if (!Number.isFinite(distance) || distance <= 0) return;
    if (evPreview && evChargerCode === evPreview.evChargerCode && distance === evPreview.cableDistanceMeters) return;

    const timeoutId = setTimeout(async () => {
      setEvPreviewLoading(true);
      setEvPreviewError(null);
      try {
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestKind: "EV_CHARGER",
            evChargerCode,
            evChargerRatingKw: selectedEvChargerOption?.specValue ?? undefined,
            evChargerCableDistanceMeters: distance,
          }),
        });
        const data = (await res.json()) as ApiJson<EvChargerResult>;
        if (!res.ok) {
          setEvPreviewError(data?.error ?? "Could not calculate an estimate.");
          return;
        }
        setEvPreview(data);
      } catch {
        setEvPreviewError("Network error. Please try again.");
      } finally {
        setEvPreviewLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [masterService, evChargerCode, evCableDistanceMeters, evPreview, selectedEvChargerOption]);

  async function handleSolarSubmit() {
    setErrorMessage(null);

    if (resolvedBillPKR === null || Number.isNaN(resolvedBillPKR) || resolvedBillPKR <= 0) {
      setErrorMessage("Enter your monthly electricity bill amount.");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/quote/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyBillPKR: resolvedBillPKR,
          sector,
          // Industrial is server-forced regardless — omit rather than send
          // a value that would just be ignored. See resolveServiceType().
          serviceType: sector === "INDUSTRIAL" ? undefined : serviceType,
          daytimeUsagePct: DAYTIME_USAGE_PCT_BY_SECTOR[sector],
          fullName,
          whatsappPhone,
          billSource,
          billFileUrl: billFileUrl ?? undefined,
          equipmentSelections,
          // Same "not offered for Industrial, omit a stale value" rule
          // as the live-preview call above.
          targetBudgetTier: sector === "INDUSTRIAL" ? undefined : targetBudgetTier ?? undefined,
        }),
      });

      const data = (await res.json()) as ApiJson<QuoteResult>;

      if (!res.ok) {
        setErrorMessage(data?.error ?? "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }

      setResult(data);
      setStatus("success");
      // Push a real history entry so the hardware Back button has
      // something to land on — the effect above reconciles `status` back
      // to "idle" the moment this param disappears from the URL.
      router.push(`${pathname}?step=report`, { scroll: false });
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.");
      setStatus("idle");
    }
  }

  function handleEditInputs() {
    setStatus("idle");
    router.push(pathname, { scroll: false });
  }

  async function handleAddOnSubmit() {
    setAddOnError(null);
    if (!fullName.trim() || !whatsappPhone.trim()) {
      setAddOnError("Enter your name and WhatsApp number.");
      return;
    }

    const serviceLabel = MASTER_SERVICES.find((s) => s.value === masterService)?.label ?? "";
    const detailsLine = addOnDescription.trim() ? ` Details: ${addOnDescription.trim()}` : "";

    // Panel Washing / EV Charger have real structured inputs now — get
    // the AUTHORITATIVE final price from the server (never just trust
    // the last debounced preview, same "server independently recomputes"
    // principle as everywhere else pricing is confirmed in this app)
    // before building the WhatsApp message and showing the summary
    // screen. Neither call persists a Lead/Quote — see the route's doc
    // comment on why.
    if (masterService === "SYSTEM_UPGRADES") {
      const count = Number(washPanelCount);
      if (!Number.isFinite(count) || count <= 0) {
        setAddOnError("Select or enter how many panels need washing.");
        return;
      }
      setStatus("loading");
      try {
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestKind: "PANEL_WASHING", panelCount: count, sector }),
        });
        const data = (await res.json()) as ApiJson<PanelWashingResult>;
        if (!res.ok) {
          setAddOnError(data?.error ?? "Could not calculate your quote. Please try again.");
          setStatus("idle");
          return;
        }
        const priced = data;
        const priceLine = `${formatPKR(priced.oneTimePricePKR)} one-time (${priced.panelCount} panels)`;
        const message = `Hi Solar Pixel! I'm ${fullName} and I'd like to request: ${serviceLabel}. Quote: ${priceLine}.${detailsLine}`;
        trackWhatsAppClick("panel_washing_inquiry");
        window.open(`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        setAddOnResult(priced);
        setStatus("success");
        router.push(`${pathname}?step=report`, { scroll: false });
      } catch {
        setAddOnError("Network error. Please check your connection and try again.");
        setStatus("idle");
      }
      return;
    }

    if (masterService === "EV_CHARGER") {
      if (evChargerCode === null) {
        setAddOnError("Select a charger model.");
        return;
      }
      setStatus("loading");
      try {
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestKind: "EV_CHARGER",
            evChargerCode,
            evChargerRatingKw: selectedEvChargerOption?.specValue ?? undefined,
            evChargerCableDistanceMeters: Number(evCableDistanceMeters) || EV_CHARGER_INCLUDED_CABLE_METERS,
          }),
        });
        const data = (await res.json()) as ApiJson<EvChargerResult>;
        if (!res.ok) {
          setAddOnError(data?.error ?? "Could not calculate your quote. Please try again.");
          setStatus("idle");
          return;
        }
        const priced = data;
        // "Other / Specific Requirement" has no real label/kW to quote —
        // same fallback convention as every other "Other" catalog slot.
        const chargerDescription =
          selectedEvChargerOption && !selectedEvChargerOption.isOtherOption
            ? `${selectedEvChargerOption.label}${priced.evChargerRatingKw ? ` (${priced.evChargerRatingKw} kW)` : ""}`
            : "a specific charger (details to follow)";
        const message = `Hi Solar Pixel! I'm ${fullName} and I'd like to request: ${serviceLabel} - ${chargerDescription}. Quote: ${formatPKR(priced.totalClientPricePKR)} turnkey.${detailsLine}`;
        trackWhatsAppClick("ev_charger_inquiry");
        window.open(`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        setAddOnResult(priced);
        setStatus("success");
        router.push(`${pathname}?step=report`, { scroll: false });
      } catch {
        setAddOnError("Network error. Please check your connection and try again.");
        setStatus("idle");
      }
      return;
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (masterService === "COMPLETE_SOLAR") {
      void handleSolarSubmit();
    } else {
      void handleAddOnSubmit();
    }
  }

  if (status === "success" && result) {
    return (
      <ResultSummary
        result={result}
        onEdit={handleEditInputs}
        connectionPhase={connectionPhase}
        installationArea={installationArea}
        customerName={fullName}
      />
    );
  }
  if (status === "success" && addOnResult) {
    return <AddOnResultSummary result={addOnResult} onEdit={handleEditInputs} />;
  }

  // Derived scale input for the Custom Equipment Builder's per-pill price
  // hints (see pillPriceHint's doc comment) — Panel scales by the
  // live-previewed system's total watts; reads 0 gracefully before a
  // bill is entered (pillPriceHint falls back to a flat per-unit rate in
  // that case). Battery no longer needs its own scale (2026-08-22) — the
  // same flat scale=1 Inverter's swapDeltaLabel calls already use, since
  // every battery card is now one specific real capacity SKU with its
  // own flat price, not a rate to multiply.
  const systemWatts = (livePreview?.systemKw ?? 0) * 1000;
  // The active battery's real capacity, straight off the resolved
  // catalog row — for the Battery row's "5.12kWh" display label only.
  const activeBatteryCapacityKwh = currentBatteryOption?.specValue ?? 0;

  return (
    <>
    <form
      onSubmit={handleSubmit}
      // pb-24 on mobile only, and only while the floating bar can be
      // showing (Complete Solar) — clears space at the bottom of the
      // form so the fixed bar never covers the very fields "Get Quotation"
      // scrolls the user to (Part 3). lg: cancels it out entirely since
      // the bar itself is lg:hidden.
      className={`animate-fade-up mx-auto mb-8 w-full max-w-6xl rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-xl backdrop-blur-xl md:p-8 print:hidden ${
        masterService === "COMPLETE_SOLAR" ? "pb-24 lg:pb-8" : ""
      }`}
    >
      {/* Master Service — rich cards, icon + subtitle each so this never
          reads as three empty little boxes in a lot of white space.
          hidden lg:block (2026-09-04, Main.html baseline): on mobile the
          dark estimator card is now the first interactive element below
          Hero, matching the reference exactly — this picker becomes
          desktop-only. Desktop still needs it: it's the only place that
          can switch to EV Charger/Panel Washing there. Mobile keeps a
          real (if indirect) way back to it via the "More We Do" services
          row further down the page, which drives the exact same
          setMasterService/setSector state. */}
      <fieldset ref={serviceSelectionRef} className="hidden lg:block">
        <legend className="mb-3 text-sm font-semibold text-slate-700">What do you need?</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {MASTER_SERVICES.map(({ value, label, icon: Icon }) => {
            const active = masterService === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMasterService(value);
                  // Each service's own input section only exists in the
                  // DOM for that branch — switching INTO one from a
                  // different service means its ref isn't attached yet
                  // at the moment this handler runs, so the scroll has
                  // to wait for React to actually commit that new DOM
                  // before it can find something to scroll to. Double
                  // rAF (not a fixed setTimeout) is the standard "wait
                  // for the next real paint" pattern — one rAF alone can
                  // still fire before layout has settled.
                  const targetRef =
                    value === "COMPLETE_SOLAR" ? energyProfileRef : value === "EV_CHARGER" ? evChargerRef : panelWashingRef;
                  requestAnimationFrame(() => requestAnimationFrame(() => scrollToStep(targetRef)));
                }}
                aria-pressed={active}
                className={`relative flex min-w-0 items-start gap-3 rounded-2xl p-4 text-left transition-all duration-200 ${
                  active
                    ? "border-2 border-orange-700 bg-orange-50"
                    : "border border-slate-200 bg-slate-50 hover:border-orange-400 hover:shadow-md"
                }`}
              >
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${
                    active ? "border-orange-300 bg-white text-orange-700" : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  <Icon className="h-9 w-9" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${active ? "text-orange-900" : "text-slate-900"}`}>{label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-slate-500">{MASTER_SERVICE_DESCRIPTION[value]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {masterService === "COMPLETE_SOLAR" ? (
        // ============ Tesla-style split dashboard ============
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
          {/* ---- LEFT COLUMN: inputs ---- */}
          <div className="space-y-5">
            {/* Mobile Home Tab — LOCKED SPEC (2026-09-03, design kit
                handoff at /Users/tempuser/Downloads/solarpixel-design-kit/
                BUILD_SPEC.md). Dark "hero" instant-estimator card
                (Residential/Commercial) OR the Executive B2B Enterprise
                Proposal card (Industrial) — swapped on `sector`, same
                state/handlers the desktop cards below already use, no
                parallel pricing path. lg:hidden — desktop keeps its
                existing separate Energy Profile / Property & System
                cards just below, completely untouched. */}
            {masterService === "COMPLETE_SOLAR" && (
              <div className="lg:hidden">
                <div
                  className={`rounded-[22px] p-5 ${
                    sector === "INDUSTRIAL" ? "bg-[#0B132B]" : "bg-[#0F172A] shadow-[0_24px_50px_-26px_rgba(15,23,42,0.6)]"
                  }`}
                >
                  {/* Segmented control — shared across BOTH card states
                      (2026-09-04, real reported bug: it only lived inside
                      the Residential/Commercial branch, so once a
                      customer landed on Industrial — tab tap or the
                      bill-threshold auto-routing — there was no way to
                      see which tab was active or switch back). Rendered
                      once, outside the ternary below, same `sector`
                      state/click handlers either way. */}
                  <div className="flex gap-1 rounded-xl bg-[#1E2A3C] p-1">
                    {SECTOR_CARDS.map(({ value, label }) => {
                      const active = sector === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            chooseSector(value);
                            if (value === "COMMERCIAL" && billAmountInput.trim() === "") {
                              handleBillAmountChange(String(COMMERCIAL_DEFAULT_BILL_PKR));
                            }
                          }}
                          aria-pressed={active}
                          className={`flex-1 rounded-lg py-2.5 text-center text-xs font-bold transition-colors duration-200 ${
                            active ? "bg-white text-[#0F172A]" : "text-[#9FB0C2] hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {/* Sector micro-copy (LOCKED spec §2: "Commercial starts
                      at Rs 100,000 with micro-copy 'Offices, Plazas &
                      Retail'") — reference art keeps the segmented
                      control's own tabs plain-label-only, so this
                      renders as a short caption for whichever sector is
                      active instead of crowding the tabs. Now shared
                      (shows for Industrial too, same reason as the
                      segmented control above). */}
                  <p className="mt-2 text-center text-[11px] font-medium text-[#8FA0B4]">{SECTOR_MICROCOPY[sector]}</p>
                  {/* Auto-route notice (2026-09-04 feedback: "we should
                      ask user or inform user" whenever the bill amount
                      auto-switches their sector) — set by the debounced
                      routing effect above, shared here so it's visible
                      regardless of which branch below is currently
                      showing. */}
                  {autoRouteNotice && (
                    <p className="mt-2 text-center text-[11px] font-medium text-orange-300">{autoRouteNotice}</p>
                  )}
                  {sector === "INDUSTRIAL" ? (
                    <>
                      <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-[#D4AF37]">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        Enterprise Proposal
                      </p>
                      <p className="mt-1.5 text-sm text-[#9FB0C2]">
                        A few more details help our industrial team size this accurately.
                      </p>

                      {/* Average Monthly Bill (2026-09-04 feedback: "keep
                          the maths of web in mobile — web uses bill
                          amount, not sanctioned load") — this card
                          previously asked for Sanctioned Load as its
                          primary/only numeric field, which has NO real
                          calc behind it (capture-only, folds into the
                          WhatsApp text, never touches livePreview/
                          pricing) — meaning an Industrial mobile visitor
                          had no way to actually enter the ONE number that
                          drives the real, tested sizing engine (same
                          resolvedBillPKR/billAmountInput desktop's
                          Industrial "Energy Profile" card already uses,
                          unconditionally, for every sector). Plain input,
                          no slider/cap here on purpose — the
                          Residential/Commercial RangeSlider is capped at
                          Rs 250,000, a real ceiling for genuinely
                          industrial-scale bills; matches desktop's own
                          Industrial input, which is also a plain,
                          uncapped field. */}
                      <div className="mt-4">
                        <label htmlFor="industrialBillAmount" className="mb-1.5 block text-xs font-semibold text-[#D4AF37]">
                          Average Monthly Bill (PKR)
                        </label>
                        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-3 focus-within:border-[#D4AF37] focus-within:ring-2 focus-within:ring-[#D4AF37]/25">
                          <span className="font-mono text-sm font-semibold text-[#E59166]">Rs</span>
                          <input
                            id="industrialBillAmount"
                            type="text"
                            inputMode="numeric"
                            value={billAmountInput}
                            onChange={(e) => handleBillAmountChange(e.target.value.replace(/[^\d]/g, ""))}
                            placeholder="e.g. 500000"
                            className="w-full bg-transparent font-mono text-sm font-medium text-white placeholder:text-[#5E6E82] outline-none"
                          />
                        </div>
                        {/* Lac/Crore readback — same as the hero card's
                            own field, see that one's doc comment. */}
                        {resolvedBillPKR !== null && resolvedBillPKR > 0 && (
                          <p className="mt-1 text-[11px] font-medium text-[#8FA0B4]">= {formatBillInWords(resolvedBillPKR)}</p>
                        )}
                        {/* Reassurance copy (2026-09-04 feedback: "in
                            industrial, user is not sure about the
                            amount" — industrial accounts often don't have
                            an exact figure on hand the way a residential
                            customer glancing at one bill does). Same
                            exact field/state either way — this doesn't
                            relax what's required, just sets the right
                            expectation for a premium-tier customer who's
                            estimating. */}
                        <p className="mt-1.5 text-[11px] leading-relaxed text-[#8FA0B4]">
                          A rough figure is fine. Our engineer confirms exact pricing on site.
                        </p>
                      </div>

                      {/* Same real "You need/You save" tiles as
                          Residential/Commercial — same livePreview,
                          nothing sector-specific about the math itself. */}
                      <div className="mt-3 grid grid-cols-2 gap-2.5">
                        <div className="rounded-[14px] border border-white/[0.09] bg-white/[0.06] p-3">
                          <p className="font-mono text-[9.5px] uppercase tracking-wider text-[#8FA0B4]">You need</p>
                          <p className="mt-0.5 font-mono text-[17px] font-semibold text-white">
                            {livePreview ? `~${livePreview.systemKw} kW` : "—"}
                          </p>
                        </div>
                        <div className="rounded-[14px] border border-emerald-400/25 bg-emerald-400/10 p-3">
                          <p className="font-mono text-[9.5px] uppercase tracking-wider text-emerald-200/80">You save / mo</p>
                          <p className="mt-0.5 font-mono text-[17px] font-semibold text-emerald-400">
                            {livePreview ? `~${formatPKR(livePreview.estimatedMonthlySavingsPKR)}` : "—"}
                          </p>
                        </div>
                      </div>

                      {/* Small-bill-on-Industrial soft prompt (2026-09-04
                          feedback: "if user in industrial section try to
                          generate a solution for 10kw we should stop
                          it") — a residential/commercial-scale bill under
                          an Enterprise Proposal banner reads as nonsense
                          ("~10 kW industrial system"). Soft prompt only,
                          per explicit answer — never blocks; a real
                          seasonal/off-season factory bill can genuinely
                          be this small, so this only suggests, exactly
                          like the mirror-image warning on the
                          Residential/Commercial card below. */}
                      {resolvedBillPKR !== null && resolvedBillPKR < INDUSTRIAL_SECTOR_THRESHOLD_PKR && (
                        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                          <p className="text-xs leading-relaxed text-amber-200">
                            That&apos;s a residential/commercial-scale bill. If this is right, we&apos;ll size a smaller
                            industrial system — otherwise, switch tabs above.
                          </p>
                        </div>
                      )}

                      <div className="mt-3">
                        <p className="mb-1.5 block text-xs font-semibold text-[#D4AF37]">Connection Type</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(["HT", "LT"] as const).map((ct) => (
                            <button
                              key={ct}
                              type="button"
                              onClick={() => setConnectionType(ct)}
                              aria-pressed={connectionType === ct}
                              className={`flex min-h-[48px] items-center justify-center rounded-xl border-2 text-sm font-bold transition-all duration-200 ${
                                connectionType === ct
                                  ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]"
                                  : "border-white/10 bg-white/[0.04] text-[#9FB0C2] hover:border-white/20"
                              }`}
                            >
                              {ct}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* "What a custom proposal covers" (2026-09-04,
                          Industrial.html baseline) — real scope items an
                          industrial site visit/engineering pass actually
                          produces, not statistics or a specific promise.
                          Industrial.html's own third line ("financing
                          options") is dropped: nothing in this app
                          confirms Solar Pixel offers financing, and this
                          list must never promise something unconfirmed. */}
                      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
                        <p className="text-xs font-bold text-white">What a custom proposal covers</p>
                        <ul className="mt-2 space-y-1.5">
                          {["On site load study & shadow analysis", "Engineered single line diagram & BOQ", "O&M support & maintenance options"].map(
                            (item) => (
                              <li key={item} className="flex items-start gap-2 text-xs text-[#C7D0DC]">
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#10B981]" />
                                {item}
                              </li>
                            )
                          )}
                        </ul>
                      </div>

                      {(() => {
                        const enterpriseInquiryMessage = `Hi Solar Pixel! I'm ${
                          fullName.trim() || "an industrial customer"
                        } interested in an Industrial solar system.${
                          resolvedBillPKR ? ` Average Monthly Bill: ${formatPKR(resolvedBillPKR)}.` : ""
                        }${livePreview ? ` Estimated System: ${livePreview.systemKw} kW.` : ""}${
                          connectionType ? ` Connection Type: ${connectionType}.` : ""
                        } Please connect me with a senior industrial engineer.`;
                        return (
                          <div className="mt-4 flex flex-col gap-2">
                            <a
                              href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(enterpriseInquiryMessage)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => trackWhatsAppClick("enterprise_proposal_inquiry")}
                              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 text-sm font-bold text-white transition-colors duration-200 hover:bg-emerald-500"
                            >
                              <MessageCircle className="h-4.5 w-4.5 shrink-0" />
                              Speak with Senior Industrial Engineer
                            </a>
                            {/* "Call Direct Line" removed (2026-09-04
                                feedback: "on the industrial, call direct
                                line not available, only WhatsApp and our
                                team will contact shortly") — that phone
                                CTA isn't actually staffed; WhatsApp is
                                the one real channel here. */}
                            <p className="text-center text-xs text-[#8FA0B4]">Our team will contact you shortly.</p>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <div className="mt-3 flex items-center justify-between">
                        <label htmlFor="heroBillAmount" className="font-mono text-[10px] font-semibold uppercase tracking-widest text-[#8FA0B4]">
                          Your Monthly Bill
                        </label>
                        <span className="font-mono text-[10px] text-[#5E6E82]">type or drag</span>
                      </div>
                      {/* Editable (2026-09-04 feedback: "user can also
                          write their own bill amount") — was a plain
                          <span>, slider-only. Real <input> now, same
                          handleBillAmountChange the slider already calls
                          (same billAmountInput state, same threshold
                          routing, same MANUAL bill-source reset), so
                          typing and dragging always agree — whichever one
                          the customer touches last just wins, no separate
                          state to fall out of sync. */}
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="font-mono text-[22px] font-semibold text-[#E59166]">Rs</span>
                        <input
                          id="heroBillAmount"
                          type="text"
                          inputMode="numeric"
                          value={resolvedBillPKR ?? RESIDENTIAL_HERO_DEFAULT_BILL_PKR}
                          onChange={(e) => handleBillAmountChange(e.target.value.replace(/[^\d]/g, ""))}
                          className="w-full min-w-0 bg-transparent font-mono text-[40px] font-semibold leading-none tracking-tight text-white caret-orange-400 outline-none"
                        />
                      </div>
                      {/* Lac/Crore readback (2026-09-04 feedback: "user is
                          unable to figure out the amount it enters —
                          need to calculate zeros") — reuses
                          formatBillInWords, already built and proven on
                          desktop's own bill field for exactly this
                          (catching a fat-fingered extra zero: "25
                          Thousand" vs "2.5 Lac" reads instantly where
                          "25,000" vs "250,000" doesn't), just never wired
                          up on mobile's two newer bill inputs. */}
                      {resolvedBillPKR !== null && resolvedBillPKR > 0 && (
                        <p className="mt-1 text-[11px] font-medium text-[#8FA0B4]">= {formatBillInWords(resolvedBillPKR)}</p>
                      )}
                      <div className="mt-2">
                        <RangeSlider
                          value={resolvedBillPKR ?? RESIDENTIAL_HERO_DEFAULT_BILL_PKR}
                          min={5000}
                          max={250000}
                          step={5000}
                          onChange={(v) => handleBillAmountChange(String(v))}
                          ariaLabel="Average Monthly Bill"
                        />
                      </div>
                      {/* Recheck prompt (2026-09-04 feedback: "switching
                          from industry to residential with 100kw is
                          tricky — should prompt user to recheck amount
                          again") — billAmountInput is shared across all
                          three sector tabs, so an Industrial-scale bill
                          (already ≥ this app's own real
                          INDUSTRIAL_SECTOR_THRESHOLD_PKR — the exact same
                          number the debounced routing effect uses to route
                          the OTHER way, into Industrial) silently carries
                          over if the customer then taps back to
                          Residential/Commercial, producing a nonsense
                          "~100 kW home" result with no explanation.
                          Derived from current state (not a one-time flag
                          set at the moment of switching), so it shows
                          correctly no matter how that state was reached,
                          and clears itself the instant the amount is
                          edited down. */}
                      {resolvedBillPKR !== null && resolvedBillPKR >= INDUSTRIAL_SECTOR_THRESHOLD_PKR && (
                        <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                          <p className="text-xs leading-relaxed text-amber-200">
                            That&apos;s an industrial-scale bill for {SECTOR_LABEL[sector]}. Please double-check the
                            amount, or switch to the Industrial tab above.
                          </p>
                        </div>
                      )}
                      <div className="mt-2 grid grid-cols-2 gap-2.5">
                        <div className="rounded-[14px] border border-white/[0.09] bg-white/[0.06] p-3">
                          <p className="font-mono text-[9.5px] uppercase tracking-wider text-[#8FA0B4]">You need</p>
                          <p className="mt-0.5 font-mono text-[17px] font-semibold text-white">
                            {/* Main.html baseline (2026-09-04): a live
                                figure the instant a bill is set, never a
                                bare "—" — "~10 kW" is Main.html's own
                                reference value for its 45,000 default,
                                shown only until the real debounced
                                livePreview call resolves (same default
                                bill this card already starts from). */}
                            {livePreview ? `~${livePreview.systemKw} kW` : "~10 kW"}
                          </p>
                        </div>
                        <div className="rounded-[14px] border border-emerald-400/25 bg-emerald-400/10 p-3">
                          <p className="font-mono text-[9.5px] uppercase tracking-wider text-emerald-200/80">You save / mo</p>
                          <p className="mt-0.5 font-mono text-[17px] font-semibold text-emerald-400">
                            {livePreview ? `~${formatPKR(livePreview.estimatedMonthlySavingsPKR)}` : "~Rs 43,000"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          document.getElementById("contact-and-submit")?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                        className="mt-4 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-orange-700 text-base font-bold text-white transition-colors duration-200 hover:bg-orange-800"
                      >
                        Get my full quote
                        <ArrowRight className="h-4.5 w-4.5 shrink-0" />
                      </button>
                      <p className="mt-2 text-center font-mono text-[10px] text-[#5E6E82]">
                        Instant pricing up to ~50 kW · larger HT loads use the Industrial tab
                      </p>
                    </>
                  )}
                </div>
                {/* "Build Your Own System" hero banner REMOVED (2026-09-04
                    feedback: "build your own - two times"). It set
                    customizationPath to CUSTOM and scrolled straight to
                    the Equipment Configurator's PathToggle — which then
                    immediately showed its own, identically-labeled
                    "Build Your Own" tab, now active, right there: two
                    "Build your own" labels back to back in the same
                    flow. The PathToggle is the one real control (it's
                    what actually switches Recommended/Custom); the
                    Equipment Configurator sits right below this card
                    already, so the shortcut wasn't earning its keep. */}
              </div>
            )}

            {/* 1. Average Monthly Bill — top, auto-calculates recommended
                kW (via the live-preview effect above). Upload dropzone
                folded in here too — same conceptual step as before.
                bg-white (vs. Step 2/3's bg-stone-50) breaks up the "wall
                of identical cards" look (Part 2) — see StepHeader. */}
            <div ref={energyProfileRef} className="hidden rounded-2xl border border-slate-200 bg-white p-4 lg:block">
              <StepHeader step={1} title="Energy Profile" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="billAmount" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Average Monthly Bill (PKR)
                  </label>
                  <div className="relative">
                    <input
                      id="billAmount"
                      type="text"
                      inputMode="numeric"
                      required
                      value={billAmountInput}
                      onChange={(e) => handleBillAmountChange(e.target.value.replace(/[^\d]/g, ""))}
                      onBlur={handleBillAmountCommit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleBillAmountCommit();
                        }
                      }}
                      placeholder="e.g. 25000"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 pr-11 text-base font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
                    />
                    {billSource !== "MANUAL" && (
                      <BadgeCheck className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                    )}
                  </div>
                  {resolvedBillPKR !== null && resolvedBillPKR > 0 && (
                    <p className="mt-1.5 text-xs font-medium text-slate-500">= {formatBillInWords(resolvedBillPKR)}</p>
                  )}
                </div>
                <div>
                  {/* Target Budget (2026-08-20) — auto-selects the
                      inverter/battery strategy (see the Calculation
                      Transparency dropdown below for what each tier
                      actually does); does NOT change system size itself.
                      "No preference" keeps the ordinary admin-configured
                      Recommended default, unchanged from before this
                      feature.

                      Not offered for Industrial (2026-08-29, explicit
                      instruction) — the tiers (Under 1M / 1M-1.5M /
                      1.5M+) are Residential/Commercial budget brackets
                      that don't map to industrial-scale pricing, and
                      Industrial has no battery to opt in/out of either
                      way (locked On-Grid). The raw targetBudgetTier
                      state is left untouched while hidden (not reset) —
                      a customer bouncing Commercial → Industrial →
                      Commercial gets their prior pick back, same
                      "remember per context" convention residentialServiceType/
                      commercialServiceType already use. The payload
                      builders above independently omit this for
                      Industrial too (defense in depth, not just a UI
                      hide) — see their own "not offered for Industrial"
                      comments. */}
                  <label htmlFor="targetBudgetTier" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Target Budget
                  </label>
                  {sector === "INDUSTRIAL" ? (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3.5">
                      <Gauge className="h-4 w-4 shrink-0 text-orange-600" />
                      <span className="text-xs font-medium text-slate-700">Sized to your bill</span>
                      <span className="ml-auto shrink-0 text-[10px] font-medium text-slate-500">
                        Not applicable for Industrial
                      </span>
                    </div>
                  ) : (
                    <select
                      id="targetBudgetTier"
                      value={targetBudgetTier ?? ""}
                      onChange={(e) => setTargetBudgetTier((e.target.value || null) as BudgetTier | null)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base font-medium text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
                    >
                      <option value="">No preference</option>
                      <option value="UNDER_1M">Under Rs 1 Million</option>
                      <option value="1M_TO_1_5M">Rs 1 Million - Rs 1.5 Million</option>
                      <option value="1_5M_PLUS">Rs 1.5 Million+</option>
                    </select>
                  )}
                </div>
              </div>

              {resolvedBillPKR !== null && resolvedBillPKR > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-orange-700">
                  <Zap className="h-4 w-4 shrink-0" />
                  {livePreview ? (
                    <>Recommended System: {livePreview.systemKw} kW</>
                  ) : (
                    <>Calculating recommended system size…</>
                  )}
                  {livePreviewLoading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                </p>
              )}

              {/* Recheck prompt (2026-09-04 feedback: "switching from
                  industry to residential with 100kw is tricky — should
                  prompt user to recheck amount again") — same real bug
                  and same fix as the mobile hero card's own copy of this
                  warning: switching Property Type below only calls
                  setSector, it never re-checks billAmountInput, so an
                  Industrial-scale bill silently carries over and
                  produces a nonsense "Recommended System: 100 kW" for a
                  Residential/Commercial property. */}
              {sector !== "INDUSTRIAL" && resolvedBillPKR !== null && resolvedBillPKR >= INDUSTRIAL_SECTOR_THRESHOLD_PKR && (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <p className="text-xs leading-relaxed text-amber-800">
                    That&apos;s an industrial-scale bill for {SECTOR_LABEL[sector]}. Please double-check the amount, or
                    select Industrial below.
                  </p>
                </div>
              )}

              {/* "Starting from" baseline (2026-08-20) — ALWAYS the
                  cheapest possible configuration (required panels +
                  smallest in-stock hybrid inverter + no battery),
                  regardless of whichever Target Budget tier is actually
                  selected above — see the dedicated baselinePreview
                  effect, a separate live-preview call that always forces
                  targetBudgetTier: "UNDER_1M". */}
              {resolvedBillPKR !== null && resolvedBillPKR > 0 && baselinePreview && (
                <p className="mt-1.5 text-sm text-slate-500">
                  Starting from: <span className="font-semibold text-slate-700">{formatPKR(baselinePreview.totalClientPricePKR)}</span>{" "}
                  (panels + inverter only, no battery)
                </p>
              )}

              {/* Calculation Transparency — collapsed by default, explains
                  the REAL sizing math already driving the number above
                  (daytime-offset %, blended tariff, generation factor),
                  not a simplified "size for the full bill" claim — this
                  app deliberately sizes for daytime usage only (the "no
                  grid export" business model), so the dropdown says so
                  honestly rather than promising 100% bill offset. */}
              {resolvedBillPKR !== null && resolvedBillPKR > 0 && livePreview && (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => setShowCalcDetails((s) => !s)}
                    aria-expanded={showCalcDetails}
                    className="flex items-center gap-1 text-sm text-orange-700 transition-colors duration-200 hover:text-orange-800"
                  >
                    <Calculator className="h-3.5 w-3.5 shrink-0" />
                    View calculation details
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${showCalcDetails ? "rotate-180" : ""}`} />
                  </button>

                  {showCalcDetails &&
                    (() => {
                      const daytimeUsagePct = DAYTIME_USAGE_PCT_BY_SECTOR[sector];
                      const monthlyUnits = resolvedBillPKR / DISPLAY_BLENDED_TARIFF_PKR_PER_UNIT;
                      const dailyDaytimeKwh = (monthlyUnits / 30) * daytimeUsagePct;
                      const dailySolarOutputKwh = livePreview.systemKw * DISPLAY_DAILY_GENERATION_FACTOR;
                      const offsetPct = Math.round(daytimeUsagePct * 100);
                      return (
                        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          <p>
                            <span className="font-semibold text-slate-900">1. Monthly Consumption:</span> ~{Math.round(monthlyUnits)} units
                            (based on Rs {DISPLAY_BLENDED_TARIFF_PKR_PER_UNIT}/unit blended grid tariff)
                          </p>
                          <p>
                            <span className="font-semibold text-slate-900">2. Daytime Demand:</span> ~{dailyDaytimeKwh.toFixed(1)} kWh/day
                            ({offsetPct}% of {SECTOR_LABEL[sector].toLowerCase()} usage typically falls during daylight hours)
                          </p>
                          <p>
                            <span className="font-semibold text-slate-900">3. Solar Output:</span> A {livePreview.systemKw} kW system
                            produces ~{dailySolarOutputKwh.toFixed(1)} kWh/day in your area, sized to cover that daytime demand.
                          </p>
                          {serviceType === "HYBRID_BATTERY" && (
                            <p>
                              <span className="font-semibold text-slate-900">4. Battery Offset:</span> Surplus daytime generation
                              charges your battery to cover essential loads after dark.
                            </p>
                          )}
                          {/* sector check (2026-08-29): targetBudgetTier's
                              raw state is deliberately left unreset while
                              hidden for Industrial (see the Target Budget
                              field's own doc comment) — this condition
                              stops this line from describing a strategy
                              that isn't actually being applied/sent. */}
                          {sector !== "INDUSTRIAL" && targetBudgetTier && (
                            <p>
                              <span className="font-semibold text-slate-900">5. Budget Strategy:</span>{" "}
                              {targetBudgetTier === "UNDER_1M" &&
                                "Smallest in stock hybrid inverter that fits your system, no battery, for the lowest upfront cost."}
                              {targetBudgetTier === "1M_TO_1_5M" &&
                                "Smallest in stock hybrid inverter that fits your system, plus our cheapest in stock battery."}
                              {targetBudgetTier === "1_5M_PLUS" &&
                                `Oversized ${formatTrim(livePreview.equipment.inverter.specValue ?? livePreview.systemKw)}kW inverter selected to leave room for future panels without requiring an upgrade, plus battery.`}
                            </p>
                          )}
                          <p className="border-t border-slate-200 pt-2 font-semibold text-orange-700">
                            Result: Sized to offset ~{offsetPct}% of your bill, the portion used during daylight hours, without
                            exporting anything back to the grid.
                          </p>
                        </div>
                      );
                    })()}
                </div>
              )}

              {BILL_UPLOAD_ENABLED && (
                <>
                  <div className="mt-2">
                    {uploadState === "uploading" ? (
                      <div className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-xs text-slate-500">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-orange-600" />
                        Reading {uploadFileName}…
                      </div>
                    ) : uploadState === "success" && billDetails ? (
                      <div className="flex items-center justify-between rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50 px-4 py-3.5">
                        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{uploadFileName}</span>
                        </span>
                        <button
                          type="button"
                          onClick={clearUpload}
                          className="-mr-1.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center text-emerald-700/70 transition-colors duration-200 hover:text-emerald-900"
                          aria-label="Remove uploaded file"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-center transition-colors duration-200 hover:border-orange-400 hover:bg-orange-50/40">
                        <Upload className="h-5 w-5 text-slate-400" />
                        <span className="text-xs font-medium leading-relaxed text-slate-600">
                          Optional: Upload your recent electricity bill (PDF or Image) for a 100% accurate engineering audit.
                        </span>
                        <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleFileUpload} />
                      </label>
                    )}
                    {uploadState === "error" && uploadError && (
                      <p role="alert" className="mt-1.5 text-xs text-red-500">
                        {uploadError}
                      </p>
                    )}
                  </div>

                  {billDetails && billSource !== "MANUAL" && <BillDetailsPanel details={billDetails} source={billSource} />}
                </>
              )}
            </div>

            {/* 2. Service Type — Property Type + Hybrid/On-Grid, both as
                rich cards (icon + subtitle) so this section never looks
                like an empty box. @container: this section lives in the
                dashboard's narrower LEFT column (not full page width), so
                a viewport breakpoint (md:/lg:) would trigger 3 columns
                based on the BROWSER being wide even when this column's
                own rendered width is still cramped — exactly the
                clipping bug being fixed. Sizing off the container's own
                width instead is the correct fix (Tailwind v4 native
                container queries, no plugin needed). */}
            {/* Desktop only (2026-09-03) — mobile's Property Type pick
                now lives in the dark hero card above (LOCKED spec §1),
                and System Type isn't shown on mobile Home at all
                (BUILD_SPEC.md: "Home is strictly load calculation +
                entry-path selection"; System Type refinement moves to
                the Quote screen in a later pass). Same `sector`/
                `serviceType` state either way — nothing here changes
                what actually prices, only where it's picked. */}
            <div className="hidden @container rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:block">
              <StepHeader step={2} title="Property & System" />
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-slate-700">Property Type</legend>
                <div className="grid grid-cols-3 gap-4">
                  {SECTOR_CARDS.map(({ value, label, description }) => {
                    const active = sector === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => chooseSector(value)}
                        aria-pressed={active}
                        className={`relative flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-2xl p-2.5 text-left transition-all duration-200 ${
                          active
                            ? "border-2 border-orange-700 bg-orange-50 text-orange-900"
                            : "border border-slate-200 bg-white text-slate-700 hover:border-orange-400 hover:shadow-md"
                        }`}
                      >
                        <span
                          className={`flex h-14 w-16 shrink-0 items-center justify-center rounded-xl border sm:h-16 sm:w-20 ${
                            active ? "border-orange-300 bg-white text-orange-700" : "border-slate-200 bg-white text-slate-400"
                          }`}
                        >
                          <SectorIllustration sector={value} className="h-9 w-12 sm:h-10 sm:w-14" />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${active ? "text-orange-900" : "text-slate-900"}`}>
                            {label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-slate-500">{description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">System Type</p>
                {sector === "INDUSTRIAL" ? (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                    <Sun className="h-4 w-4 shrink-0 text-orange-600" />
                    <span className="text-xs font-medium text-slate-700">{SERVICE_TYPE_LABEL[serviceType]}</span>
                    <span className="ml-auto shrink-0 text-[10px] font-medium text-slate-500">
                      Locked for {SECTOR_LABEL[sector]}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
                      {(["HYBRID_BATTERY", "ONGRID_ZERO_EXPORT"] as ServiceType[]).map((st) => {
                        const active = serviceType === st;
                        const onSelect = sector === "RESIDENTIAL" ? setResidentialServiceType : setCommercialServiceType;
                        const Icon = SERVICE_TYPE_ICON[st];
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => onSelect(st)}
                            aria-pressed={active}
                            className={`relative flex min-w-0 items-start gap-2.5 rounded-2xl p-3 text-left transition-all duration-200 ${
                              active
                                ? "border-2 border-orange-700 bg-orange-50 text-orange-900"
                                : "border border-slate-200 bg-white text-slate-700 hover:border-orange-400 hover:shadow-md"
                            }`}
                          >
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                active ? "bg-orange-700 text-white" : "border border-slate-200 bg-white text-orange-600"
                              }`}
                            >
                              <Icon className="h-4.5 w-4.5" />
                            </span>
                            <span className="min-w-0">
                              <span className={`block text-xs font-semibold ${active ? "text-orange-900" : "text-slate-900"}`}>
                                {SERVICE_TYPE_LABEL[st]}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                                {SERVICE_TYPE_DESCRIPTION[st]}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {sector === "RESIDENTIAL" && serviceType === "ONGRID_ZERO_EXPORT" && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <p>
                          <span className="font-semibold">Note for Residential:</span> {RESIDENTIAL_ONGRID_WARNING}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 3. Custom Equipment Builder — Default & Swap, with a price
                delta shown directly on each alternative card. @container:
                every grid inside sizes off THIS wrapper's real width, not
                the viewport — see the Property Type section's comment
                above for why that matters inside the dashboard's narrower
                left column. bg-white (alternating back from Step 2's
                bg-slate-50) — see StepHeader/Part 2. */}
            <div ref={configurationRef} className="@container rounded-2xl border border-slate-200 bg-white p-4">
              <StepHeader step={3} title="Equipment Configurator" />
              <PathToggle path={customizationPath} onChange={setCustomizationPath} />

              {customizationPath === "CUSTOM" && (
                <div className="mt-3">
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-orange-950">
                    <PanelsTopLeft className="h-3.5 w-3.5 text-orange-600" />
                    Build Your Own System
                  </p>

                  {equipmentOptionsLoading && (
                    <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-600" />
                      Loading equipment options…
                    </div>
                  )}
                  {equipmentOptionsError && (
                    <p role="alert" className="text-xs text-red-500">
                      {equipmentOptionsError}
                    </p>
                  )}

                  {equipmentOptions && (
                    <>
                    {/* Desktop: the existing, fuller accordion (Default &
                        Swap rows for every slot, brand + wattage/model
                        variants, Cabling/Protection/Mounting/Site Works,
                        add-on services) — completely unchanged. */}
                    <div className="hidden space-y-3 lg:block">
                      {/* 1. Solar Panels — Default & Swap, plus the Panel
                          Quantity Adjuster (2026-08-20). Max comes from
                          the live backend response (the currently
                          selected inverter's own rated-kW ceiling, null =
                          unbounded when that inverter has no specValue on
                          file); the floor is PANEL_COUNT_ABSOLUTE_MINIMUM
                          (2026-08-29 — no longer baselineCount, see that
                          constant's doc comment). Never computed purely
                          client-side beyond that shared constant, so the
                          adjuster's limits can never drift from what the
                          server will actually accept. */}
                      <EquipmentSwapRow
                        title="Solar Panels"
                        icon={SolarPanelIcon}
                        currentLabel={
                          currentPanelOption
                            ? `${currentPanelOption.label} × ${livePreview?.equipment.panel.count ?? "—"}`
                            : "Select a panel"
                        }
                        currentPriceLabel={livePreview ? formatPKR(livePreview.breakdown.panelsPKR) : null}
                        isOpen={openEquipmentSection === "PANEL"}
                        onToggleOpen={() => setOpenEquipmentSection((s) => (s === "PANEL" ? null : "PANEL"))}
                      >
                        {/* Step 1: Company — one card per distinct panel
                            brand, plus "Other". Clicking a brand resolves
                            to its cheapest in-stock wattage (below lets
                            the customer refine that pick). */}
                        <div className="grid grid-cols-1 gap-2.5 @sm:grid-cols-2">
                          {panelBrands.map((brand) => {
                            const defaultSku = defaultPanelSkuForBrand(brand);
                            const active = currentPanelBrand === brand;
                            return (
                              <SwapOptionCard
                                key={brand}
                                label={brand}
                                imageUrl={defaultSku?.logoUrl ?? null}
                                active={active}
                                inStock={panelSkusForBrand(brand).some((o) => o.inStock)}
                                onClick={() => {
                                  if (defaultSku) setPanelCode(defaultSku.code);
                                }}
                                deltaLabel={swapDeltaLabel(
                                  defaultSku?.unitPricePKR ?? null,
                                  currentPanelOption?.unitPricePKR ?? null,
                                  systemWatts,
                                  active
                                )}
                              />
                            );
                          })}
                          {otherPanelOption && (
                            <SwapOptionCard
                              key={otherPanelOption.code}
                              label="Other / Specific Requirement"
                              imageUrl={null}
                              active={effectivePanelCode === OTHER_CODE}
                              inStock={otherPanelOption.inStock}
                              onClick={() => setPanelCode(OTHER_CODE)}
                              deltaLabel={swapDeltaLabel(
                                otherPanelOption.unitPricePKR,
                                currentPanelOption?.unitPricePKR ?? null,
                                systemWatts,
                                effectivePanelCode === OTHER_CODE
                              )}
                            />
                          )}
                        </div>

                        {/* Step 2: Wattage — only shown once a real
                            company is selected and it actually has more
                            than one wattage on file; same SpecCard preset
                            style as Battery Capacity. Each card IS a real
                            distinct catalog SKU (unlike Battery Capacity,
                            which layers an independent multiplier on top
                            of whichever brand is selected). */}
                        {currentPanelBrand && panelSkusForBrand(currentPanelBrand).length > 1 && (
                          <div className="mt-3">
                            <p className="mb-1.5 block text-xs font-medium text-slate-600">Wattage</p>
                            <div className="grid grid-cols-2 gap-3 @sm:grid-cols-4">
                              {panelSkusForBrand(currentPanelBrand).map((o) => (
                                <SpecCard
                                  key={o.code}
                                  title={o.specValue !== null ? `${o.specValue}W` : o.label}
                                  description={o.label}
                                  active={effectivePanelCode === o.code}
                                  onClick={() => setPanelCode(o.code)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        {livePreview &&
                          (() => {
                            // Floor is no longer baselineCount (2026-08-29,
                            // explicit instruction: "don't block user to
                            // lower the panels - lower they can go at any
                            // level") — Math.min against maxCount guards
                            // against the exact bug reported ("min 525 ·
                            // max 188"): once a manually-shrunk inverter
                            // quantity drops maxCount below the bill-
                            // derived baseline, flooring at the baseline
                            // produced a contradictory min > max range.
                            // Flooring at this instead keeps min ≤ max
                            // always. See PANEL_COUNT_ABSOLUTE_MINIMUM and
                            // lib/db/admin.ts's matching constant.
                            const panelFloor = Math.min(PANEL_COUNT_ABSOLUTE_MINIMUM, livePreview.equipment.panel.maxCount ?? Infinity);
                            return (
                              <div>
                                <p className="mb-1.5 block text-xs font-medium text-slate-600">
                                  Number of Panels
                                  <span className="ml-1.5 font-normal text-slate-400">
                                    (min {panelFloor}
                                    {livePreview.equipment.panel.maxCount !== null && ` · max ${livePreview.equipment.panel.maxCount}`})
                                  </span>
                                </p>
                                <QuantityStepper
                                  label="Panels"
                                  // Optimistic display value (2026-08-24) — was
                                  // livePreview.equipment.panel.count directly,
                                  // which only updates once the debounced
                                  // (500ms) live-preview fetch actually
                                  // resolves, so the stepper visually froze for
                                  // however long that round trip took after
                                  // every click. panelQtyOverride is set
                                  // synchronously by onChange below, so using
                                  // it here (clamped the same way the server
                                  // clamps it) makes the number move the
                                  // instant you click, with the real server
                                  // value simply confirming/correcting it a
                                  // moment later. Falls back to the server
                                  // value only before any override has been
                                  // set (panelQtyOverride === null).
                                  value={
                                    panelQtyOverride !== null
                                      ? Math.min(Math.max(panelQtyOverride, panelFloor), livePreview.equipment.panel.maxCount ?? Infinity)
                                      : livePreview.equipment.panel.count
                                  }
                                  onChange={(v) => setPanelQtyOverride(v)}
                                  min={panelFloor}
                                  max={livePreview.equipment.panel.maxCount ?? undefined}
                                />
                              </div>
                            );
                          })()}
                      </EquipmentSwapRow>

                      {/* 2. Inverter — Default & Swap */}
                      <EquipmentSwapRow
                        title={`Inverter: ${SERVICE_TYPE_LABEL[serviceType]}`}
                        icon={InverterIcon}
                        currentLabel={
                          currentInverterOption
                            ? livePreview && livePreview.equipment.inverter.quantity > 1
                              ? `${currentInverterOption.label} × ${livePreview.equipment.inverter.quantity}`
                              : currentInverterOption.label
                            : "Select an inverter"
                        }
                        currentPriceLabel={livePreview ? formatPKR(livePreview.breakdown.inverterPKR) : null}
                        isOpen={openEquipmentSection === "INVERTER"}
                        onToggleOpen={() => setOpenEquipmentSection((s) => (s === "INVERTER" ? null : "INVERTER"))}
                      >
                        {/* Step 1: Company — one card per distinct
                            inverter brand, plus "Other". Every real
                            inverter is now flat PER_PIECE-priced (see
                            lib/db/admin.ts's rawInverterPKR comment), so
                            deltas below are plain price differences, NOT
                            scaled by systemWatts the way Panel/Cable/
                            Structure deltas still are. */}
                        <div className="grid grid-cols-1 gap-2.5 @sm:grid-cols-2">
                          {inverterBrands.map((brand) => {
                            const defaultSku = defaultInverterSkuForBrand(brand);
                            const active = currentInverterBrand === brand;
                            return (
                              <SwapOptionCard
                                key={brand}
                                label={brand}
                                imageUrl={defaultSku?.logoUrl ?? null}
                                active={active}
                                inStock={inverterSkusForBrand(brand).some((o) => o.inStock)}
                                onClick={() => {
                                  if (defaultSku) handleInverterCodeChange(defaultSku.code);
                                }}
                                deltaLabel={swapDeltaLabel(defaultSku?.unitPricePKR ?? null, currentInverterOption?.unitPricePKR ?? null, 1, active)}
                              />
                            );
                          })}
                          {otherInverterOption && (
                            <SwapOptionCard
                              key={otherInverterOption.code}
                              label="Other / Specific Requirement"
                              imageUrl={null}
                              active={effectiveInverterCode === OTHER_CODE}
                              inStock={otherInverterOption.inStock}
                              onClick={() => handleInverterCodeChange(OTHER_CODE)}
                              deltaLabel={swapDeltaLabel(
                                otherInverterOption.unitPricePKR,
                                currentInverterOption?.unitPricePKR ?? null,
                                1,
                                effectiveInverterCode === OTHER_CODE
                              )}
                            />
                          )}
                        </div>

                        {/* Step 2: Model — only shown once a real company
                            is selected and it has more than one model on
                            file. Each card IS a real distinct SKU (brand +
                            rated kW + phase), same pattern as Panel's
                            Wattage step. */}
                        {currentInverterBrand && inverterSkusForBrand(currentInverterBrand).length > 1 && (
                          <div className="mt-3">
                            <p className="mb-1.5 block text-xs font-medium text-slate-600">Model</p>
                            <div className="grid grid-cols-2 gap-3 @sm:grid-cols-4">
                              {inverterSkusForBrand(currentInverterBrand).map((o) => (
                                <SpecCard
                                  key={o.code}
                                  title={o.specValue !== null ? `${o.specValue}kW` : o.label}
                                  description={o.phase ? PHASE_LABEL[o.phase] : o.label}
                                  active={effectiveInverterCode === o.code}
                                  inStock={o.inStock}
                                  onClick={() => handleInverterCodeChange(o.code)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Step 3: Quantity — manual inverter "clubbing"
                            (2026-08-29). Residential keeps the original
                            safety floor (an override can only ever ADD
                            headroom above the auto-computed minimum, never
                            undersize below what systemKw needs).
                            Commercial/Industrial get TRUE manual control
                            instead — free to pick any quantity from 1 up,
                            completely decoupled from systemKw sizing (see
                            resolveInverterQuantity in lib/db/admin.ts for
                            the matching server-side logic — this is a
                            display/UX mirror of it, the server is still
                            the actual source of truth). */}
                        {livePreview &&
                          (sector !== "RESIDENTIAL" || livePreview.equipment.inverter.quantity > 1) &&
                          (() => {
                            const autoQuantity = clientInverterQuantityFor(
                              livePreview.systemKw,
                              livePreview.equipment.inverter.specValue
                            );
                            const isFullyManual = sector !== "RESIDENTIAL";
                            // Optimistic display value (same pattern as the
                            // Panel Quantity Adjuster) — inverterQuantityOverride
                            // is set synchronously by onChange, so the
                            // stepper moves the instant you click; the real
                            // server value simply confirms/corrects it once
                            // the debounced live-preview fetch resolves.
                            const displayQuantity =
                              inverterQuantityOverride !== null
                                ? isFullyManual
                                  ? Math.max(1, inverterQuantityOverride)
                                  : Math.max(inverterQuantityOverride, autoQuantity)
                                : livePreview.equipment.inverter.quantity;
                            const specKw = currentInverterOption?.specValue ?? livePreview.equipment.inverter.specValue ?? 0;
                            const totalCapacityKw = specKw * displayQuantity;
                            return (
                              <div className="mt-3">
                                <p className="mb-1.5 block text-xs font-medium text-slate-600">
                                  Number of Units
                                  <span className="ml-1.5 font-normal text-slate-400">
                                    {isFullyManual ? "fully manual for Commercial/Industrial" : `min ${autoQuantity}`}
                                  </span>
                                </p>
                                <QuantityStepper
                                  label={`${currentInverterOption?.label ?? livePreview.equipment.inverter.label} units`}
                                  value={displayQuantity}
                                  onChange={(v) => setInverterQuantityOverride(v)}
                                  min={isFullyManual ? 1 : autoQuantity}
                                  max={MAX_INVERTER_UNITS}
                                />
                                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                                  Total inverter capacity:{" "}
                                  <span className="font-semibold text-slate-700">{formatTrim(totalCapacityKw)} kW</span>
                                  {isFullyManual
                                    ? " — set any quantity independent of your bill's calculated system size."
                                    : " Add extra units now to leave headroom for a planned future expansion, without a later hardware swap."}
                                </p>
                              </div>
                            );
                          })()}
                      </EquipmentSwapRow>

                      {/* 3. Lithium Battery — Company then Capacity,
                          same two-step Default & Swap pattern as
                          Inverter (see its doc comment above). "No
                          Battery" is its own top-level card alongside
                          the brand cards, not nested — opting out is a
                          same-level choice as picking a brand, not a
                          sub-choice under one. */}
                      {serviceType === "HYBRID_BATTERY" && (
                        <EquipmentSwapRow
                          title="Lithium Battery"
                          icon={BatteryIcon}
                          currentLabel={
                            effectiveBatteryCode === NONE_CODE
                              ? "No Battery Selected"
                              : currentBatteryOption
                                ? currentBatteryOption.isOtherOption
                                  ? currentBatteryOption.label
                                  : `${currentBatteryOption.label} (${formatTrim(activeBatteryCapacityKwh)}kWh)`
                                : "Select a battery"
                          }
                          currentPriceLabel={
                            effectiveBatteryCode === NONE_CODE
                              ? null
                              : livePreview
                                ? formatPKR(livePreview.breakdown.batteryPKR)
                                : null
                          }
                          isOpen={openEquipmentSection === "BATTERY"}
                          onToggleOpen={() => setOpenEquipmentSection((s) => (s === "BATTERY" ? null : "BATTERY"))}
                        >
                          {/* Step 1: Company — one card per distinct
                              battery brand, plus "No Battery" and
                              "Other". Every real battery is now flat
                              PER_PIECE-priced (see lib/db/admin.ts's
                              rawBatteryPKR comment), so deltas below are
                              plain price differences (scale=1), same as
                              Inverter's Company cards. */}
                          <div className="grid grid-cols-1 gap-2.5 @sm:grid-cols-2">
                            {batteryBrands.map((brand) => {
                              const defaultSku = defaultBatterySkuForBrand(brand);
                              const active = currentBatteryBrand === brand;
                              return (
                                <SwapOptionCard
                                  key={brand}
                                  label={brand}
                                  imageUrl={defaultSku?.logoUrl ?? null}
                                  active={active}
                                  inStock={batterySkusForBrand(brand).some((o) => o.inStock)}
                                  onClick={() => {
                                    if (defaultSku) setBatteryCode(defaultSku.code);
                                  }}
                                  deltaLabel={swapDeltaLabel(defaultSku?.unitPricePKR ?? null, currentBatteryUnitPricePKR, 1, active)}
                                />
                              );
                            })}
                            {/* "No Battery" opt-out (Optional Battery, 2026-08-20) —
                                candidateUnitPricePKR of 0 makes swapDeltaLabel compute
                                the FULL battery cost as a negative delta ("− Rs X"),
                                exactly the "how much this removes" figure asked for. */}
                            <SwapOptionCard
                              label="No Battery"
                              imageUrl={null}
                              active={effectiveBatteryCode === NONE_CODE}
                              onClick={() => setBatteryCode(NONE_CODE)}
                              deltaLabel={swapDeltaLabel(0, currentBatteryUnitPricePKR, 1, effectiveBatteryCode === NONE_CODE)}
                            />
                            {otherBatteryOption && (
                              <SwapOptionCard
                                key={otherBatteryOption.code}
                                label="Other / Specific Requirement"
                                imageUrl={null}
                                active={effectiveBatteryCode === OTHER_CODE}
                                inStock={otherBatteryOption.inStock}
                                onClick={() => setBatteryCode(OTHER_CODE)}
                                deltaLabel={swapDeltaLabel(
                                  otherBatteryOption.unitPricePKR,
                                  currentBatteryUnitPricePKR,
                                  1,
                                  effectiveBatteryCode === OTHER_CODE
                                )}
                              />
                            )}
                          </div>

                          {/* Step 2: Capacity — only shown once a real
                              company is selected and it has more than
                              one module size on file. Each card IS a
                              real distinct SKU (brand + kWh), same
                              pattern as Inverter's Model step. */}
                          {currentBatteryBrand && batterySkusForBrand(currentBatteryBrand).length > 1 && (
                            <div className="mt-3">
                              <p className="mb-1.5 block text-xs font-medium text-slate-600">Capacity</p>
                              <div className="grid grid-cols-2 gap-3 @sm:grid-cols-4">
                                {batterySkusForBrand(currentBatteryBrand).map((o) => (
                                  <SpecCard
                                    key={o.code}
                                    title={o.specValue !== null ? `${formatTrim(o.specValue)}kWh` : o.label}
                                    description={o.label}
                                    active={effectiveBatteryCode === o.code}
                                    inStock={o.inStock}
                                    onClick={() => setBatteryCode(o.code)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </EquipmentSwapRow>
                      )}

                      {/* Cabling & Protection, and Mounting Structure —
                          Default & Swap rows (Part 5, 2026-08-20), matching
                          Panel/Inverter/Battery exactly instead of the old
                          numbered "4. Cables, Protection, and Mounting"
                          accordion (dropped the "4." — none of the other
                          rows are numbered, so it never matched the rest
                          of the flow). Cable/Breakers have no individually
                          split breakdown field (the backend combines them
                          into one `cablingAndProtectionPKR` line), so
                          their current-price label uses the same
                          unitPricePKR × systemWatts math the alternative
                          cards' deltaLabel already computes — the exact
                          per-line figure the backend itself derives from
                          before summing the two together. Structure DOES
                          have its own dedicated `structurePKR` breakdown
                          field, so that one uses the real backend total
                          directly, same as Panel/Inverter/Battery. */}
                      <EquipmentSwapRow
                        title="DC/AC Cabling"
                        icon={ShieldWireIcon}
                        currentLabel={currentCableOption?.label ?? "Select a cable"}
                        currentPriceLabel={equipmentUnitCostLabel(currentCableOption?.unitPricePKR ?? null, systemWatts)}
                        isOpen={openEquipmentSection === "CABLE"}
                        onToggleOpen={() => setOpenEquipmentSection((s) => (s === "CABLE" ? null : "CABLE"))}
                      >
                        <div className="grid grid-cols-1 gap-2.5 @sm:grid-cols-2">
                          {(equipmentOptions.DC_CABLE ?? []).map((o) => (
                            <SwapOptionCard
                              key={o.code}
                              label={o.isOtherOption ? "Other / Specific Requirement" : o.label}
                              imageUrl={o.logoUrl}
                              active={effectiveCableCode === o.code}
                              inStock={o.inStock}
                              onClick={() => setCableCode(o.code)}
                              deltaLabel={swapDeltaLabel(
                                o.unitPricePKR,
                                currentCableOption?.unitPricePKR ?? null,
                                systemWatts,
                                effectiveCableCode === o.code
                              )}
                            />
                          ))}
                        </div>
                      </EquipmentSwapRow>

                      <EquipmentSwapRow
                        title="Protection & Breakers"
                        icon={ShieldWireIcon}
                        currentLabel={currentBreakersOption?.label ?? "Select protection"}
                        currentPriceLabel={equipmentUnitCostLabel(currentBreakersOption?.unitPricePKR ?? null, systemWatts)}
                        isOpen={openEquipmentSection === "BREAKERS"}
                        onToggleOpen={() => setOpenEquipmentSection((s) => (s === "BREAKERS" ? null : "BREAKERS"))}
                      >
                        <div className="grid grid-cols-1 gap-2.5 @sm:grid-cols-2">
                          {(equipmentOptions.BREAKERS ?? []).map((o) => (
                            <SwapOptionCard
                              key={o.code}
                              label={o.isOtherOption ? "Other / Specific Requirement" : o.label}
                              imageUrl={o.logoUrl}
                              active={effectiveBreakersCode === o.code}
                              inStock={o.inStock}
                              onClick={() => setBreakersCode(o.code)}
                              deltaLabel={swapDeltaLabel(
                                o.unitPricePKR,
                                currentBreakersOption?.unitPricePKR ?? null,
                                systemWatts,
                                effectiveBreakersCode === o.code
                              )}
                            />
                          ))}
                        </div>
                      </EquipmentSwapRow>

                      <EquipmentSwapRow
                        title="Mounting Structure"
                        icon={ShieldWireIcon}
                        currentLabel={currentStructureOption?.label ?? "Select a structure"}
                        currentPriceLabel={livePreview ? formatPKR(livePreview.breakdown.structurePKR) : null}
                        isOpen={openEquipmentSection === "STRUCTURE"}
                        onToggleOpen={() => setOpenEquipmentSection((s) => (s === "STRUCTURE" ? null : "STRUCTURE"))}
                      >
                        <div className="grid grid-cols-1 gap-2.5 @sm:grid-cols-2">
                          {(equipmentOptions.MOUNTING_STRUCTURE ?? []).map((o) => (
                            <SwapOptionCard
                              key={o.code}
                              label={o.isOtherOption ? "Other / Specific Requirement" : o.label}
                              imageUrl={o.logoUrl}
                              icon={STRUCTURE_ICON_BY_CODE[o.code]}
                              active={effectiveStructureCode === o.code}
                              inStock={o.inStock}
                              onClick={() => setStructureCode(o.code)}
                              deltaLabel={swapDeltaLabel(
                                o.unitPricePKR,
                                currentStructureOption?.unitPricePKR ?? null,
                                systemWatts,
                                effectiveStructureCode === o.code
                              )}
                            />
                          ))}
                        </div>
                      </EquipmentSwapRow>

                      {/* Site Works (2026-08-20) — civil blocks, earthing
                          & boring, and lightning arrestor. Not a
                          brand/model swap like every row above: Earthing/
                          Lightning are customer-adjustable counts against
                          a flat admin rate (GlobalPricingSettings);
                          Civil Blocks is READ-ONLY as of this update —
                          always auto-computed server-side as
                          Math.ceil(panelCount × 1.5), never customer-set
                          (see EquipmentSelections.civilBlockQty's doc
                          comment). Collapsed by default (not important
                          for the client to fuss over, but the option's
                          here) — same EquipmentSwapRow shell as every
                          other row for visual consistency. */}
                      <EquipmentSwapRow
                        title="Site Works"
                        icon={Wrench}
                        currentLabel={(() => {
                          const civilBlockQty = livePreview?.siteWorks.civilBlockQty ?? 0;
                          const total = civilBlockQty + earthingBoreQty + lightningArrestorQty;
                          return total > 0 ? `${total} item${total === 1 ? "" : "s"} selected` : "No site works selected";
                        })()}
                        currentPriceLabel={livePreview ? formatPKR(livePreview.breakdown.siteWorksPKR) : null}
                        isOpen={openEquipmentSection === "SITE_WORKS"}
                        onToggleOpen={() => setOpenEquipmentSection((s) => (s === "SITE_WORKS" ? null : "SITE_WORKS"))}
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Civil Blocks</p>
                              <p className="text-[11px] text-slate-500">Auto-calculated: {formatTrim(1.5)}× your panel count</p>
                            </div>
                            <span className="text-sm font-bold text-slate-900">{livePreview?.siteWorks.civilBlockQty ?? "—"}</span>
                          </div>
                          <QuantityStepper label="Earthing & Boring" value={earthingBoreQty} onChange={setEarthingBoreQty} />
                          <QuantityStepper
                            label="Lightning Arrestor"
                            value={lightningArrestorQty}
                            onChange={setLightningArrestorQty}
                          />
                        </div>
                      </EquipmentSwapRow>

                      {/* Services (2026-08-21) — a toggleable add-on, not
                          a brand/model pick or a quantity, so a plain
                          on/off switch rather than EquipmentSwapRow's
                          expand-to-swap or QuantityStepper's +/- shell.
                          Dynamically recalculates with the Panel Quantity
                          Adjuster above — same effectivePanelCount the
                          backend already resolved for Civil Blocks. */}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Services</p>
                        <ServiceToggleCard
                          title="One Time Panel Washing Visit"
                          icon={WaterDropIcon}
                          description="A single professional cleaning visit after installation, not a recurring plan."
                          active={includePanelWashing}
                          onToggle={() => setIncludePanelWashing((s) => !s)}
                          priceLabel={livePreview?.panelWashing ? formatPKR(livePreview.breakdown.panelWashingPKR) : null}
                        />
                      </div>
                    </div>

                    {/* Mobile: Build.html's simpler 3-card layout
                        (2026-09-04, design kit handoff — explicit
                        instruction to fully re-theme mobile to this
                        layout, accepting the loss of the wattage/model
                        variant step and the Cabling/Protection/Mounting/
                        Site Works rows on mobile only; all of that stays
                        exactly as-is on desktop above). Real catalog
                        brands/prices/state throughout — no invented
                        SKUs, no new pricing path. Panels/Inverter reuse
                        the exact same handlers as the desktop accordion
                        (setPanelCode, handleInverterCodeChange,
                        panelQtyOverride); the Inverter "current pick" row
                        is a real <select> bound to effectiveInverterCode
                        (never a newly-invented default) rather than a
                        second bespoke picker UI. */}
                    <div className="space-y-3 lg:hidden">
                      {/* Panels */}
                      <div className="rounded-[18px] border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-extrabold text-slate-900">Panels</span>
                          <span className="font-mono text-xs font-semibold text-emerald-700">
                            {livePreview ? formatPKR(livePreview.breakdown.panelsPKR) : "—"}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {panelBrands.map((brand) => {
                            const defaultSku = defaultPanelSkuForBrand(brand);
                            const active = currentPanelBrand === brand;
                            return (
                              <button
                                key={brand}
                                type="button"
                                onClick={() => defaultSku && setPanelCode(defaultSku.code)}
                                aria-pressed={active}
                                className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${
                                  active
                                    ? "bg-orange-600 text-white"
                                    : "border border-slate-200 bg-white text-slate-900 hover:border-orange-300"
                                }`}
                              >
                                {brand}
                              </button>
                            );
                          })}
                        </div>
                        {livePreview &&
                          (() => {
                            const panelFloor = Math.min(PANEL_COUNT_ABSOLUTE_MINIMUM, livePreview.equipment.panel.maxCount ?? Infinity);
                            const panelQty =
                              panelQtyOverride !== null
                                ? Math.min(Math.max(panelQtyOverride, panelFloor), livePreview.equipment.panel.maxCount ?? Infinity)
                                : livePreview.equipment.panel.count;
                            const panelMax = livePreview.equipment.panel.maxCount ?? Infinity;
                            return (
                              // gap-2 (was 2.5) + items-start (2026-09-04
                              // feedback: "padding not good, white spacing
                              // issues") — the stepper pill was self-end
                              // (right-aligned) while stacked under the
                              // left-aligned spec text, leaving an
                              // awkward diagonal gap of empty space
                              // between them. self-start keeps it flush
                              // under the text instead; still slides
                              // inline to the right on a wide-enough
                              // container (@xs:justify-between).
                              <div className="mt-3 flex flex-col gap-2 @xs:flex-row @xs:items-center @xs:justify-between">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {currentPanelOption?.specValue ? `${currentPanelOption.specValue} W` : currentPanelOption?.label}
                                    {currentPanelOption?.specValue ? " · " : ""}
                                    {currentPanelOption?.brand ?? ""}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {currentPanelOption?.unitPricePKR ? `Rs ${Math.round(currentPanelOption.unitPricePKR)} / watt` : ""}
                                  </p>
                                </div>
                                {/* Compact stepper (Build.html's own pill
                                    shape) instead of the desktop
                                    accordion's full QuantityStepper — that
                                    component's own label+bordered-card
                                    shell was too wide to sit beside the
                                    spec text on a 390px card without
                                    squeezing it to nothing. */}
                                <div className="flex shrink-0 items-center gap-3.5 self-start rounded-xl bg-[#F5F1EB] px-2 py-1.5 @xs:self-auto">
                                  <button
                                    type="button"
                                    onClick={() => setPanelQtyOverride(Math.max(panelFloor, panelQty - 1))}
                                    disabled={panelQty <= panelFloor}
                                    aria-label="Decrease panels"
                                    className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-slate-200 bg-white text-base font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    −
                                  </button>
                                  <span className="min-w-[22px] text-center font-mono text-base font-semibold text-slate-900">
                                    {panelQty}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setPanelQtyOverride(Math.min(panelMax, panelQty + 1))}
                                    disabled={panelQty >= panelMax}
                                    aria-label="Increase panels"
                                    className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[#0F172A] text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                      </div>

                      {/* Inverter */}
                      <div className="rounded-[18px] border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-extrabold text-slate-900">Inverter</span>
                          <span className="font-mono text-xs font-semibold text-emerald-700">
                            {livePreview ? formatPKR(livePreview.breakdown.inverterPKR) : "—"}
                          </span>
                        </div>
                        {sector === "INDUSTRIAL" ? (
                          <p className="mt-3 text-xs font-medium text-slate-500">
                            {SERVICE_TYPE_LABEL[serviceType]} · locked for {SECTOR_LABEL[sector]}
                          </p>
                        ) : (
                          <div className="mt-3 flex gap-2">
                            {(["HYBRID_BATTERY", "ONGRID_ZERO_EXPORT"] as ServiceType[]).map((st) => {
                              const active = serviceType === st;
                              const onSelect = sector === "RESIDENTIAL" ? setResidentialServiceType : setCommercialServiceType;
                              return (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => onSelect(st)}
                                  aria-pressed={active}
                                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${
                                    active
                                      ? "bg-orange-600 text-white"
                                      : "border border-slate-200 bg-white text-slate-900 hover:border-orange-300"
                                  }`}
                                >
                                  {st === "HYBRID_BATTERY" ? "Hybrid" : "On grid"}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {/* Current pick — a real <select> bound to the same
                            effectiveInverterCode the desktop accordion
                            uses, never a newly-invented default. */}
                        <div className="relative mt-3">
                          <select
                            value={effectiveInverterCode ?? ""}
                            onChange={(e) => handleInverterCodeChange(e.target.value)}
                            className="w-full appearance-none rounded-xl border border-slate-200 bg-[#F5F1EB] px-3.5 py-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
                          >
                            {inverterOptionsForServiceType.map((o) => (
                              <option key={o.code} value={o.code}>
                                {o.isOtherOption ? "Other / Specific Requirement" : `${o.specValue ?? ""}${o.specValue ? "kW · " : ""}${o.label}`}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>

                      {/* Battery */}
                      {serviceType === "HYBRID_BATTERY" && (
                        <div className="rounded-[18px] border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-extrabold text-slate-900">Battery</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (effectiveBatteryCode === NONE_CODE) {
                                  const fallbackBrand = currentBatteryBrand ?? batteryBrands[0];
                                  const sku = fallbackBrand ? defaultBatterySkuForBrand(fallbackBrand) : null;
                                  if (sku) setBatteryCode(sku.code);
                                } else {
                                  setBatteryCode(NONE_CODE);
                                }
                              }}
                              aria-pressed={effectiveBatteryCode !== NONE_CODE}
                              aria-label="Include a battery"
                              className={`relative h-[27px] w-[46px] shrink-0 rounded-full transition-colors duration-200 ${
                                effectiveBatteryCode !== NONE_CODE ? "bg-orange-600" : "bg-slate-200"
                              }`}
                            >
                              <span
                                className={`absolute top-[3px] h-[21px] w-[21px] rounded-full bg-white transition-all duration-200 ${
                                  effectiveBatteryCode !== NONE_CODE ? "right-[3px]" : "left-[3px]"
                                }`}
                              />
                            </button>
                          </div>
                          {effectiveBatteryCode !== NONE_CODE && (
                            <>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {batteryBrands.map((brand) => {
                                  const defaultSku = defaultBatterySkuForBrand(brand);
                                  const active = currentBatteryBrand === brand;
                                  return (
                                    <button
                                      key={brand}
                                      type="button"
                                      onClick={() => defaultSku && setBatteryCode(defaultSku.code)}
                                      aria-pressed={active}
                                      className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${
                                        active
                                          ? "bg-orange-600 text-white"
                                          : "border border-slate-200 bg-white text-slate-900 hover:border-orange-300"
                                      }`}
                                    >
                                      {brand}
                                    </button>
                                  );
                                })}
                              </div>
                              {currentBatteryBrand && batterySkusForBrand(currentBatteryBrand).length > 1 && (
                                <div className="mt-2.5 flex flex-wrap gap-2">
                                  {batterySkusForBrand(currentBatteryBrand).map((o) => (
                                    <button
                                      key={o.code}
                                      type="button"
                                      onClick={() => setBatteryCode(o.code)}
                                      aria-pressed={effectiveBatteryCode === o.code}
                                      className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${
                                        effectiveBatteryCode === o.code
                                          ? "bg-orange-600 text-white"
                                          : "border border-slate-200 bg-white text-slate-900 hover:border-orange-300"
                                      }`}
                                    >
                                      {o.specValue !== null ? `${formatTrim(o.specValue)} kWh` : o.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {currentBatteryOption && (
                                <p className="mt-3 text-xs text-slate-500">{currentBatteryOption.label}</p>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Total + CTA — Build.html's sticky total bar,
                          rendered inline (not fixed) since Complete
                          Solar's mobile floating bottom bar already
                          covers that "always-visible running total" job
                          elsewhere on the page; a second fixed bar would
                          duplicate it. Real full installed total
                          (livePreview.totalClientPricePKR), not just
                          panels+inverter+battery — showing only those
                          three here would understate the actual price
                          the customer is quoted. */}
                      {/* flex-col, not a side-by-side row (2026-09-04
                          feedback: "review build button overlapping
                          text, can't read what's underneath") — the
                          label ("5.5 kW system · total") could wrap to 2
                          lines on a narrow card while the button stayed
                          vertically centered beside it, so the button
                          visually sat on top of the price. Stacking
                          removes any way for that to happen: the price
                          block and the button never share a row, full
                          width each. */}
                      <div className="rounded-[18px] bg-[#0F172A] p-4">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-[#8FA0B4]">
                          {livePreview ? `${formatTrim(livePreview.systemKw, 1)} kW system · total` : "System total"}
                        </p>
                        <p className="mt-0.5 font-mono text-xl font-semibold text-white">
                          {livePreview ? formatPKR(livePreview.totalClientPricePKR) : "—"}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            document.getElementById("contact-and-submit")?.scrollIntoView({ behavior: "smooth", block: "start" })
                          }
                          className="mt-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-orange-600 text-sm font-bold text-white transition-colors duration-200 hover:bg-orange-700"
                        >
                          Review build
                          <ArrowRight className="h-4 w-4 shrink-0" />
                        </button>
                      </div>
                    </div>
                    </>
                  )}

                  {hasCustomSelection && (
                    <div className="mt-3">
                      <CustomRequirementNotice />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ---- RIGHT COLUMN: sticky live summary ---- */}
          {/* id targeted by the mobile floating bar's "Get Quotation →"
              button (Part 3) — scrolls straight to the Name/WhatsApp/Submit
              fields, which is what "Get Quotation" actually leads to.
              lg:top-32 (was lg:top-24) — the sticky ticker+header stack
              is taller than 96px (top-24), so the card was clipping
              behind it a few pixels on scroll; 128px clears it with
              room to spare. Matches the identical wrapper below. */}
          <div id="contact-and-submit" className="lg:sticky lg:top-32 lg:z-30 lg:self-start">
            <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-lg shadow-orange-100/60">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700">
                {/* Activity (2026-08-29) — was Sparkles, same icon
                    "Solar Pixel Recommended" used, which read as
                    repetitive/generic. Activity's pulse/heartbeat shape
                    reads as "this number is live," matching what this
                    panel actually is. */}
                <Activity className="h-3.5 w-3.5" /> Live Estimate
              </p>

              {livePreview ? (
                <>
                  <p className="mt-1.5 text-3xl font-bold text-slate-900">{formatPKR(livePreview.totalClientPricePKR)}</p>
                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                    Estimated Turnkey Cost
                    {livePreviewLoading && <Loader2 className="h-3 w-3 animate-spin text-orange-400" />}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                    <div>
                      <p className="text-[10px] text-slate-500">System</p>
                      {/* Was a flat livePreview.systemKw — that figure is
                          purely bill-derived (see calculateSystemSize in
                          the API route) and never moves no matter what
                          equipment gets picked, so swapping to a bigger
                          inverter (or raising the Panel Quantity Adjuster,
                          now that it can go up to 115% of the inverter's
                          rating — see PANEL_OVERSIZE_ALLOWANCE) left this
                          number stuck showing the original small estimate
                          even once the customer had genuinely configured a
                          bigger system. Now derived from the REAL
                          resolved panel array (count × each panel's own
                          wattage) whenever that data's available, so this
                          reflects what's actually configured; falls back
                          to the bill-derived figure only if panel spec
                          data is somehow missing. Underlying pricing
                          (cabling/installation/structure) is untouched —
                          this is a display-only fix. */}
                      <p className="text-sm font-bold text-slate-900">
                        {formatTrim(
                          livePreview.equipment.panel.specValue
                            ? (livePreview.equipment.panel.count * livePreview.equipment.panel.specValue) / 1000
                            : livePreview.systemKw,
                          1
                        )}{" "}
                        kW
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Savings/mo</p>
                      <p className="text-sm font-bold text-emerald-600">{formatPKR(livePreview.estimatedMonthlySavingsPKR)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Payback</p>
                      <p className="text-sm font-bold text-slate-900">
                        {livePreview.paybackYears !== null ? `${livePreview.paybackYears} yrs` : "—"}
                      </p>
                    </div>
                  </div>

                  {/* "What's included" (2026-09-04, LOCKED spec's Quote
                      screen, mobile only) — ONLY real, already-priced
                      items: the actual resolved panel/inverter/battery
                      (not fabricated), plus one line that maps directly
                      to structurePKR/cablingAndProtectionPKR/
                      installationPKR (all real breakdown lines this
                      quote already includes). Deliberately does NOT
                      list Quote.png's "Online monitoring & app setup" —
                      nothing in this codebase confirms that's an actual
                      deliverable, and this list must never promise a
                      feature that isn't actually provided/priced. */}
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3.5 lg:hidden">
                    <p className="text-xs font-semibold text-slate-700">What&apos;s included</p>
                    <ul className="mt-1.5 space-y-1">
                      {[
                        `${livePreview.equipment.panel.count} × ${livePreview.equipment.panel.label}`,
                        livePreview.equipment.inverter.label,
                        ...(livePreview.equipment.battery ? [livePreview.equipment.battery.label] : []),
                        "Structure, wiring & installation",
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-1.5 text-xs text-slate-600">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* "Refine your details" (2026-09-04, LOCKED spec's
                      Quote screen — explicitly deferred here from Home
                      tab: "Roof/phase refinement belongs later, on the
                      Quote screen"). Connection stays capture-only, same
                      pattern as Sanctioned Load/Connection Type on the
                      Enterprise card above (no pricing effect, folded
                      into the WhatsApp message on submit — see
                      ResultSummary's waMessage); connectionPhase reuses
                      the real InverterPhase type/labels already in this
                      file.
                      Mounting Structure (2026-09-04 feedback: "shouldn't
                      be roof type — it should be structure, populate
                      from the admin side") replaces the old roofType
                      capture-only field — real admin-configured catalog
                      (equipmentOptions.MOUNTING_STRUCTURE, structureCode/
                      setStructureCode), the SAME state the desktop
                      accordion's own Mounting Structure row drives, so
                      this is a real, live-priced pick (updates
                      livePreview.breakdown.structurePKR immediately),
                      not just a label folded into the message text. */}
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5 lg:hidden">
                    <p className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      Refine your details
                      <span className="font-normal text-slate-400">updates your quote</span>
                    </p>
                    <p className="mt-2 mb-1 text-[11px] font-medium text-slate-600">Connection</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(["THREE_PHASE", "SINGLE_PHASE"] as const).map((phase) => (
                        <button
                          key={phase}
                          type="button"
                          onClick={() => setConnectionPhase(phase)}
                          aria-pressed={connectionPhase === phase}
                          className={`flex min-h-[44px] items-center justify-center rounded-lg border-2 text-xs font-bold transition-all duration-200 ${
                            connectionPhase === phase
                              ? "border-orange-700 bg-orange-50 text-orange-900"
                              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          {PHASE_LABEL[phase]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2.5 mb-1 block text-[11px] font-medium text-slate-600">Mounting Structure</p>
                    {/* Pill buttons, not a native <select> (2026-09-04
                        feedback: "structure dropdown should be
                        aesthetically pleasing, not like the typical
                        one") — same chip style Connection above and the
                        brand/battery pickers elsewhere on this card
                        already use, instead of a plain OS-styled
                        dropdown. Real catalog options/state either way
                        (equipmentOptions.MOUNTING_STRUCTURE,
                        structureCode) — this is a visual swap only. */}
                    {equipmentOptions?.MOUNTING_STRUCTURE?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {equipmentOptions.MOUNTING_STRUCTURE.map((o) => (
                          <button
                            key={o.code}
                            type="button"
                            onClick={() => setStructureCode(o.code)}
                            aria-pressed={effectiveStructureCode === o.code}
                            className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${
                              effectiveStructureCode === o.code
                                ? "bg-orange-600 text-white"
                                : "border border-slate-200 bg-white text-slate-900 hover:border-orange-300"
                            }`}
                          >
                            {o.isOtherOption ? "Other / Specific Requirement" : o.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">Loading structures…</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Enter your monthly bill on the left to see your live system size and price here.
                </p>
              )}
              {livePreviewError && <p className="mt-2 text-xs text-red-500">{livePreviewError}</p>}

              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <div>
                  <label htmlFor="fullName" className="mb-1 block text-xs font-medium text-slate-600">
                    Full Name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ahmed Khan"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
                  />
                </div>
                <div>
                  <label htmlFor="whatsappPhone" className="mb-1 block text-xs font-medium text-slate-600">
                    WhatsApp Number
                  </label>
                  <input
                    id="whatsappPhone"
                    type="tel"
                    required
                    pattern="^\+?[0-9]{10,15}$"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="+92 3XX XXXXXXX"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
                  />
                </div>
                {/* Installation area (2026-09-04, Contact.html baseline,
                    mobile only) — capture-only, same pattern as every
                    other "Refine your details" field: folded into the
                    WhatsApp message (installationAreaNote), no pricing/
                    backend effect. */}
                <div className="lg:hidden">
                  <label htmlFor="installationArea" className="mb-1 block text-xs font-medium text-slate-600">
                    Installation Area
                  </label>
                  <input
                    id="installationArea"
                    type="text"
                    value={installationArea}
                    onChange={(e) => setInstallationArea(e.target.value)}
                    placeholder="e.g. Your neighborhood, city"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
                  />
                </div>
              </div>

              {/* Reassurance banner (2026-09-04, Contact.html baseline,
                  mobile only) — Contact.html's own wording is a fixed
                  "go live in 48 hours" claim, already declined earlier
                  this session (install time varies by job); generic
                  wording instead, same reassurance without the specific
                  time claim. */}
              <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 lg:hidden">
                <Zap className="h-5 w-5 shrink-0 text-orange-600" />
                <p className="text-xs leading-relaxed text-slate-600">
                  Approved sites <span className="font-semibold text-slate-900">go live fast</span>. No hidden fees, ever.
                </p>
              </div>

              {errorMessage && (
                <p role="alert" className="mt-2 text-xs text-red-500">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="glow-cta-teal mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand-teal py-3.5 text-sm font-semibold text-brand-teal-ink transition-all duration-200 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Generate Official Quotation (PDF)
                  </>
                )}
              </button>
              <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5" />
                No WAPDA net-metering paperwork. Ever.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {masterService !== "COMPLETE_SOLAR" && (
        // ============ EV Charger / System Upgrades — same 2-column split
        // as the Solar dashboard, for a consistent layout across every
        // service. LEFT = their specific inputs; RIGHT = sticky live
        // total/pricing + contact + submit, mirroring the Solar right
        // column's shape and classes exactly. ============
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
          {/* ---- LEFT COLUMN: inputs ---- */}
          <div className="space-y-5">
            {masterService === "SYSTEM_UPGRADES" && (
              <div ref={panelWashingRef} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-orange-700">
                    <WaterDropIcon className="h-8 w-8" />
                  </span>
                  <p className="text-sm font-semibold text-slate-800">Panel Washing &amp; Servicing</p>
                </div>
                <p className="mb-1.5 block text-xs font-medium text-slate-600">How Many Panels?</p>
                <div className="flex flex-wrap gap-2">
                  {PANEL_COUNT_PRESETS.map((count) => (
                    <ModelPill
                      key={count}
                      label={`${count} panels`}
                      active={washPanelCount === String(count)}
                      onClick={() => setWashPanelCount(String(count))}
                    />
                  ))}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={washPanelCount}
                  onChange={(e) => setWashPanelCount(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Or enter an exact count"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
                />
              </div>
            )}

            {masterService === "EV_CHARGER" && (
              <div ref={evChargerRef} className="@container rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-orange-700">
                    <EVChargerIcon className="h-8 w-8" />
                  </span>
                  <p className="text-sm font-semibold text-slate-800">EV Charger Installation</p>
                </div>
                <p className="mb-1.5 block text-xs font-medium text-slate-600">Charger Model</p>
                {!equipmentOptions && !equipmentOptionsError && (
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading charger models...
                  </p>
                )}
                {equipmentOptionsError && <p className="text-xs text-red-500">{equipmentOptionsError}</p>}
                {equipmentOptions && (
                  <div className="grid grid-cols-1 gap-3 @sm:grid-cols-3">
                    {evChargerOptions.map((option) => (
                      <SpecCard
                        key={option.code}
                        title={option.isOtherOption ? "Other" : option.label}
                        description={
                          option.isOtherOption
                            ? "Specific requirement"
                            : `${option.specValue}kW${option.unitPricePKR != null ? ` • ${formatPKR(option.unitPricePKR)}` : ""}`
                        }
                        active={evChargerCode === option.code}
                        onClick={() => setEvChargerCode(option.code)}
                        inStock={option.inStock}
                      />
                    ))}
                  </div>
                )}

                <label htmlFor="evCableDistance" className="mb-1.5 mt-4 block text-xs font-medium text-slate-600">
                  Cable Distance (meters)
                </label>
                <input
                  id="evCableDistance"
                  type="text"
                  inputMode="numeric"
                  value={evCableDistanceMeters}
                  onChange={(e) => setEvCableDistanceMeters(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder={String(EV_CHARGER_INCLUDED_CABLE_METERS)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Standard {EV_CHARGER_INCLUDED_CABLE_METERS}m included, +{formatPKR(EV_CHARGER_EXTRA_CABLE_RATE_PKR_PER_METER)}/meter beyond that.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label htmlFor="addOnDescription" className="mb-1.5 block text-sm font-medium text-slate-600">
                Additional Notes <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="addOnDescription"
                rows={2}
                value={addOnDescription}
                onChange={(e) => setAddOnDescription(e.target.value)}
                placeholder={
                  masterService === "SYSTEM_UPGRADES"
                    ? "e.g. Access constraints, existing system details…"
                    : "e.g. Vehicle model, home or office install…"
                }
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
              />
            </div>
          </div>

          {/* ---- RIGHT COLUMN: sticky live total/pricing + contact + submit,
              same wrapper classes as the Solar dashboard's right column ---- */}
          <div className="lg:sticky lg:top-32 lg:z-30 lg:self-start">
            <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-lg shadow-orange-100/60">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700">
                {/* Activity, not Sparkles — see the matching Solar
                    dashboard "Live Estimate" panel's own comment. */}
                <Activity className="h-3.5 w-3.5" /> {masterService === "EV_CHARGER" ? "Live Total" : "Estimate"}
              </p>

              {masterService === "SYSTEM_UPGRADES" &&
                (washPreview ? (
                  <>
                    <p className="mt-1.5 text-2xl font-bold text-slate-900">
                      {formatPKR(washPreview.oneTimePricePKR)}
                      {washPreviewLoading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-orange-400" />}
                    </p>
                    <p className="text-xs text-slate-500">
                      {washPreview.isMinimumFeeApplied
                        ? "Minimum call out fee"
                        : `${washPreview.panelCount} panels × ${formatPKR(washPreview.costPerPanelPKR)}`}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                      <Wrench className="h-3.5 w-3.5" /> Custom Pricing
                    </span>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      Select a panel count on the left to see an instant estimate, or just send your request. Our
                      team will follow up with a custom quote.
                    </p>
                  </>
                ))}
              {masterService === "SYSTEM_UPGRADES" && washPreviewError && (
                <p className="mt-2 text-xs text-red-500">{washPreviewError}</p>
              )}

              {masterService === "EV_CHARGER" &&
                (evPreview ? (
                  <>
                    <p className="mt-1.5 text-2xl font-bold text-slate-900">
                      {formatPKR(evPreview.totalClientPricePKR)}
                      {evPreviewLoading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-orange-400" />}
                    </p>
                    {evPreview.chargerUnitPricePKR > 0 && (
                      <p className="text-xs text-slate-500">
                        incl. {formatPKR(evPreview.chargerUnitPricePKR)} charger unit + {formatPKR(evPreview.baseInstallationFeePKR)}{" "}
                        installation
                      </p>
                    )}
                    {evPreview.extraCablePKR > 0 && (
                      <p className="text-xs text-slate-500">incl. {formatPKR(evPreview.extraCablePKR)} extra cable</p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    Select a charger type on the left to see your live total here.
                  </p>
                ))}
              {masterService === "EV_CHARGER" && evPreviewError && <p className="mt-2 text-xs text-red-500">{evPreviewError}</p>}

              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <div>
                  <label htmlFor="fullName" className="mb-1 block text-xs font-medium text-slate-600">
                    Full Name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ahmed Khan"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
                  />
                </div>
                <div>
                  <label htmlFor="whatsappPhone" className="mb-1 block text-xs font-medium text-slate-600">
                    WhatsApp Number
                  </label>
                  <input
                    id="whatsappPhone"
                    type="tel"
                    required
                    pattern="^\+?[0-9]{10,15}$"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="+92 3XX XXXXXXX"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25"
                  />
                </div>
              </div>

              {addOnError && (
                <p role="alert" className="mt-2 text-xs text-red-500">
                  {addOnError}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="glow-cta mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand-gold py-3.5 text-sm font-semibold text-brand-gold-ink transition-all duration-200 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculating…
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-4 w-4" />
                    Send via WhatsApp
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <PrintableReport billDetails={billDetails} billSource={billSource} />
    </form>

    {/* Mobile-Only Floating Bottom Bar (Part 3) — lg:hidden since the
        desktop layout already has the live total permanently visible in
        the sticky right column; on mobile that column is pushed far
        below the fold by the single-column stack, so this repeats the
        number where a thumb can actually act on it. Only for Complete
        Solar (this is the only flow with a real "Quotation" / turnkey price
        to show — EV Charger/System Upgrades use different terminology
        and already read fine without a second summary bar).

        Moved OUTSIDE <form> (2026-09-04) — real bug found while adding
        the liquid-glass treatment below: the <form> above has its own
        backdrop-blur-xl (for its own frosted-card look), and CSS
        backdrop-filter/filter/transform on an ancestor creates a NEW
        containing block for `position: fixed` descendants — so this
        bar's "fixed bottom-0" was pinning to the FORM's bottom edge,
        not the viewport's, and drifted off-screen (negative rect.top,
        confirmed via getBoundingClientRect) the moment you scrolled
        past the form. Sibling of the form now, so it's fixed to the
        real viewport like it's supposed to be. Pre-existing bug, not
        introduced by anything else in this change. */}
    {masterService === "COMPLETE_SOLAR" && (
      // Liquid glass (2026-09-04 feedback: "all overlapping should be
      // in a liquid glass style") — this bar sits fixed on top of
      // scrolled page content, so it's a real overlap, not just a
      // section boundary. Translucent dark fill + backdrop-blur + a
      // hairline top border reads as "floating glass" instead of a
      // solid opaque slab; kept dark (not light glass) since the white
      // total/button text needs the dark backing for contrast.
      <div className="safe-bottom fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t border-white/10 bg-slate-950/70 px-4 pt-4 text-white shadow-2xl backdrop-blur-xl lg:hidden print:hidden">
        <div className="min-w-0">
          {/* Same "real configured capacity, not the frozen bill-derived
              figure" fix as the Live Estimate panel's System stat. */}
          <p className="text-[10px] text-slate-400">
            Est. Total
            {livePreview
              ? ` · ${formatTrim(
                  livePreview.equipment.panel.specValue
                    ? (livePreview.equipment.panel.count * livePreview.equipment.panel.specValue) / 1000
                    : livePreview.systemKw,
                  1
                )} kW System`
              : ""}
          </p>
          <p className="truncate text-base font-bold">
            {livePreview ? formatPKR(livePreview.totalClientPricePKR) : "Enter your bill above"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => document.getElementById("contact-and-submit")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-semibold text-brand-teal-ink transition-all duration-200 hover:brightness-95"
        >
          Get Quotation <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    )}

    {/* Mobile-only marketing sections below the calculator (2026-09-04,
        design kit handoff, following Main.html's page structure — not
        just the estimator card). Proof Band ("1,200+ systems live" etc.)
        and the Testimonial are deliberately NOT included yet:
        BUILD_SPEC.md itself flags both as placeholder/sample values, and
        this app never ships fabricated stats or a made-up customer
        quote — waiting on the user to supply real figures/a real,
        permissioned testimonial. "48-hour install" also isn't used as a
        fixed claim (explicit answer: install time varies by job) —
        "Fast Installation"/"Go live in days" instead of a specific
        number. print:hidden matches every other decorative section on
        this page (see the header's own print:hidden). */}
    <div className="mx-auto mt-6 max-w-2xl print:hidden">
      {/* Trust pills, Brand strip, and How It Works sections all removed
          (2026-09-04 feedback: "too much text on the main page" /
          "repitition of the information" — Trust Pills' own claims were
          already covered elsewhere on this same short page: "no hidden
          fees" in the reassurance banner and footer band, battery-ready
          is obvious from the product itself. Explicit "no need of this
          information" for Brand Strip/How It Works. Real catalog brands
          are still visible in the Market Watch ticker above. */}

      {/* Services row — real master-service picks, reusing the exact
          same setMasterService/setSector state the "What do you need?"
          fieldset above already uses. Scroll targets (2026-09-04): that
          fieldset is now desktop-only (hidden lg:block, see its own doc
          comment above), so `serviceSelectionRef` renders at zero size
          on mobile and is useless as a mobile scroll target. EV
          Charger/Panel Washing keep their own refs (unaffected — those
          input sections were never lg:hidden). Complete Solar's mobile
          content has no single ref of its own (it's the dark hero card
          vs. the Enterprise card, swapped on `sector`), so that one
          scrolls back to the top of #calculator instead — exactly where
          the dark card now lives as the first element below Hero. */}
      <div className="mt-6 lg:hidden">
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-widest text-orange-700">More We Do</p>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => {
              setMasterService("EV_CHARGER");
              requestAnimationFrame(() => requestAnimationFrame(() => scrollToStep(evChargerRef)));
            }}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center transition-colors duration-200 hover:border-orange-300"
          >
            <EVChargerIcon className="h-6 w-6 text-orange-600" />
            <span className="text-[11px] font-semibold leading-tight text-slate-900">EV Charger</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMasterService("SYSTEM_UPGRADES");
              requestAnimationFrame(() => requestAnimationFrame(() => scrollToStep(panelWashingRef)));
            }}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center transition-colors duration-200 hover:border-orange-300"
          >
            <WaterDropIcon className="h-6 w-6 text-orange-600" />
            <span className="text-[11px] font-semibold leading-tight text-slate-900">Washing & Service</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMasterService("COMPLETE_SOLAR");
              chooseSector("COMMERCIAL");
              requestAnimationFrame(() => requestAnimationFrame(scrollToCalculator));
            }}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center transition-colors duration-200 hover:border-orange-300"
          >
            <SectorIllustration sector="COMMERCIAL" className="h-6 w-8" />
            <span className="text-[11px] font-semibold leading-tight text-slate-900">Commercial & Industrial</span>
          </button>
        </div>
      </div>

      {/* Footer CTA band — sits above the real site footer, distinct
          from the sticky Mobile-Only Floating Bottom Bar (that one's
          persistent/quick-access while scrolling; this is the one-time
          closing CTA at the end of the page, matching Main.html). */}
      <div className="mt-7 rounded-3xl bg-[#0F172A] p-6 lg:hidden">
        <p className="text-xl font-extrabold tracking-tight text-white">Ready to cut your bill?</p>
        <div className="mt-3.5 flex gap-2.5">
          <button
            type="button"
            onClick={() => document.getElementById("contact-and-submit")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-700 text-sm font-bold text-white transition-colors duration-200 hover:bg-orange-800"
          >
            Get instant quote
          </button>
          <a
            href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(GENERAL_INQUIRY_WA_MESSAGE)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackWhatsAppClick("footer_cta_band")}
            className="flex min-h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-white transition-colors duration-200 hover:bg-slate-100"
            aria-label="Chat on WhatsApp"
          >
            <MessageCircle className="h-5 w-5 text-emerald-600" />
          </a>
        </div>
        <p className="mt-3 font-mono text-[11px] text-[#8FA0B4]">+92 328 2155550 · solarpixel.pk</p>
      </div>
    </div>
    </>
  );
}

// ============================================================================
// Dual Customization Paths — Recommended vs Custom Equipment Builder
// ============================================================================

/** Real complaint (2026-08-27): "many customers didn't see [Custom
 *  Equipment Builder]" — the old toggle's unselected state was plain
 *  slate-grey text, which read as a disabled/secondary label rather
 *  than a real second option worth clicking. Fixed two ways: the Custom
 *  side now keeps its own violet color identity even while inactive
 *  (not "grey until picked"), plus a small pulsing dot.
 *
 *  Simplified + made more prominent for mobile first-time users
 *  (2026-08-29, explicit instruction): "Custom Equipment Builder" as a
 *  toggle/CTA label reads as developer jargon to someone who just wants
 *  to "pick their own brands" — renamed to "Build Your Own" everywhere
 *  it's a short label. Buttons are full-width and stacked below the
 *  dashboard's own @container breakpoint (this section lives in the
 *  narrower left column, so a real viewport breakpoint would trigger
 *  side-by-side while the column itself is still phone-narrow — same
 *  reasoning as the Property Type/System Type cards above), 52px
 *  minimum touch height, bold 2px border + tinted background + a
 *  checkmark on whichever side is active — not just a text-color swap,
 *  which is exactly what made the old toggle easy to miss.
 *
 *  A first pass at this also added a large tappable "entry card" below
 *  the toggle repeating the same "Build Your Own" offer — immediately
 *  flagged (2026-08-29) as pure repetition: the same headline/subtext
 *  twice, and two elements doing the literal same onChange("CUSTOM").
 *  Reverted to one short caption instead — the toggle itself is already
 *  the prominent, unmissable element; the caption just makes sure
 *  "Recommended" doesn't read as the only option. */
function PathToggle({ path, onChange }: { path: CustomizationPath; onChange: (path: CustomizationPath) => void }) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-2.5 @sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange("RECOMMENDED")}
          aria-pressed={path === "RECOMMENDED"}
          className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold leading-tight transition-all duration-200 ${
            path === "RECOMMENDED"
              ? "border-orange-700 bg-orange-50 text-orange-900"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
          }`}
        >
          {/* Wand2 (2026-08-29) — was Sparkles, the same icon "Live
              Estimate" used elsewhere on the page; a magic-wand reads
              more specifically as "picked for you," distinct from the
              live-updating-number meaning Activity now carries there. */}
          <Wand2 className="h-4.5 w-4.5 shrink-0" />
          Solar Pixel Recommended
          {path === "RECOMMENDED" && <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-orange-700" />}
        </button>
        <button
          type="button"
          onClick={() => onChange("CUSTOM")}
          aria-pressed={path === "CUSTOM"}
          className={`relative flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold leading-tight transition-all duration-200 ${
            path === "CUSTOM"
              ? "border-violet-700 bg-violet-50 text-violet-900"
              : "border-violet-200 bg-violet-50/60 text-violet-700 hover:border-violet-300 hover:bg-violet-100"
          }`}
        >
          {path !== "CUSTOM" && (
            <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
            </span>
          )}
          <SlidersHorizontal className="h-4.5 w-4.5 shrink-0" />
          Build Your Own
          {path === "CUSTOM" && <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-violet-700" />}
        </button>
      </div>
      {path === "RECOMMENDED" && (
        <p className="mt-2 text-center text-xs text-violet-600">
          Want to select your own inverter, panels, or batteries? Tap <span className="font-semibold">Build Your Own</span> above.
        </p>
      )}
    </div>
  );
}

// Multi-layered orange palette shared by every card/pill/badge in the
// Custom Equipment Builder — one place to keep "selected" reading as
// unambiguously "chosen" (solid, high-contrast) vs. everything else
// staying quiet until hovered/picked.
const CARD_SELECTED_CLASSES = "border-2 border-orange-800 bg-orange-700 text-white shadow-md";
const CARD_UNSELECTED_CLASSES =
  "border border-slate-200 bg-slate-50 text-slate-800 hover:border-orange-300 hover:bg-orange-50/40";

/** Step B of the cascading picker — the smaller pill row of models/specs
 *  that appears once a brand card is active. Unselected pills read as
 *  "soft lavender badges" (a lighter weight than the brand cards above
 *  them), selected escalates to the same solid treatment as a selected
 *  card so the actual pick is unambiguous. */
function ModelPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl px-3 py-1.5 text-xs transition-all ${
        active
          ? `${CARD_SELECTED_CLASSES} font-bold ring-2 ring-offset-2 ring-orange-600`
          : "border border-orange-200 bg-orange-100 font-medium text-orange-900 hover:border-orange-400"
      }`}
    >
      {label}
    </button>
  );
}

/** "+ Rs 45,000" / "− Rs 12,000" / "Included in Base" vs whichever option
 *  is currently active in this slot, scaled by the system's real size —
 *  accurate because both prices are the SAME already-marked-up per-unit
 *  rate the real pricing engine applies (see getPublicUnitPricesPKR in
 *  lib/db/admin.ts), computed client-side so every card updates instantly
 *  with no per-candidate round-trip. Powers the Default & Swap cards'
 *  price-delta line (Part 3) — unlike the old pill hint this used to
 *  drive, it ALWAYS returns a label (never null): the active option's own
 *  card reads "Included in Base" rather than showing nothing. */
function swapDeltaLabel(candidateUnitPricePKR: number | null, activeUnitPricePKR: number | null, scale: number, isActive: boolean): string {
  if (isActive) return "Included in Base";
  if (candidateUnitPricePKR === null) return "Custom pricing";
  if (activeUnitPricePKR === null || scale <= 0) return "Enter your bill to see pricing";
  const delta = Math.round((candidateUnitPricePKR - activeUnitPricePKR) * scale);
  if (Math.abs(delta) < 1) return "Included in Base";
  return delta > 0 ? `+ ${formatPKR(delta)}` : `− ${formatPKR(Math.abs(delta))}`;
}

/** Red for a "+" (costs more than the current selection) label, green
 *  for a "−" (costs less) one — clear at-a-glance affordability signal
 *  swapDeltaLabel's own orange/emerald split (Part 3) didn't quite give:
 *  orange doesn't read as unambiguously "this costs more" the way red
 *  does. Every OTHER label swapDeltaLabel can return ("Included in
 *  Base", "Custom pricing", "Enter your bill to see pricing") isn't a
 *  real price comparison at all, so those stay neutral slate rather
 *  than being force-fit into red or green. */
function deltaColorClass(deltaLabel: string): string {
  if (deltaLabel.startsWith("+")) return "text-red-600";
  if (deltaLabel.startsWith("−")) return "text-emerald-600";
  return "text-slate-500";
}

/** Exact line cost for one Cables/Protection/Mounting catalog option
 *  (Part 4) — the SAME unitPricePKR × systemWatts math swapDeltaLabel
 *  above already uses for the panel/inverter/battery cards, just shown as
 *  a plain absolute price rather than a delta: these VisualCards have no
 *  single "current selection" to diff against (Cable Brand/Protection/
 *  Structure are each their own flat pick, not a Default & Swap row), so
 *  every pill just states its own real cost outright — e.g. "Elevated
 *  Structure — Rs 69,231". Null before a bill is entered, or for a
 *  catalog item with no priced entry ("Other"). */
function equipmentUnitCostLabel(unitPricePKR: number | null, scale: number): string | null {
  if (unitPricePKR === null || scale <= 0) return null;
  return formatPKR(Math.round(unitPricePKR * scale));
}

/** One "Default & Swap" row (Apple-style: a clean summary line + a
 *  "Change" button that expands to the full alternatives grid) — replaces
 *  the old two-step brand-then-model cascading accordion for Panels/
 *  Inverter/Battery. `currentPriceLabel` is the EXACT line cost when
 *  known (from the live preview's real breakdown — see the callers in
 *  CalculatorCard), null before a bill is entered. */
function EquipmentSwapRow({
  title,
  icon: Icon,
  currentLabel,
  currentPriceLabel,
  isOpen,
  onToggleOpen,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  currentLabel: string;
  currentPriceLabel: string | null;
  isOpen: boolean;
  onToggleOpen: () => void;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll centering (2026-08-24, International SaaS Hero Redesign
  // task) — when "Change" opens this row's picker, the newly-revealed
  // grid of brand/model cards can push well past the bottom of a
  // mobile viewport while the row's own header stays pinned at the top
  // of view. Centering the row itself (not just scrolling it into
  // view) keeps roughly equal picker content visible above and below,
  // instead of leaving the user staring at just the header they have
  // to scroll further to see anything from. Local to this component
  // (not one of CalculatorCard's named refs) since every one of the 8
  // EquipmentSwapRow instances needs its own independent version of
  // this, keyed off its own isOpen — a single shared ref couldn't tell
  // which row just opened.
  useEffect(() => {
    if (isOpen) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isOpen]);

  return (
    <div ref={rowRef} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-orange-700">
              <Icon className="h-7 w-7" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
            {/* Was a single-line `truncate` — real equipment names
                ("Jinko Bifacial 610W N-Type") plus a price suffix
                routinely ran past a narrow mobile row and clipped to an
                unreadable snippet. Wrapping to 2-3 lines instead (this
                row's icon and Change button are both self-height, not
                pinned to a single text line, so a taller row here costs
                nothing layout-wise). */}
            <p className="text-sm font-semibold text-slate-900">
              {currentLabel}
              {currentPriceLabel && <span className="ml-1.5 font-bold text-orange-700">— {currentPriceLabel}</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={isOpen}
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3.5 text-xs font-semibold text-orange-700 transition-colors duration-200 hover:border-orange-300 hover:bg-orange-100"
        >
          {isOpen ? "Close" : "Change"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </div>
      {isOpen && <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-3.5">{children}</div>}
    </div>
  );
}

/** One alternative inside an expanded Default & Swap row — a rich
 *  selectable card (brand/model name + logo if the catalog has one, per
 *  Part 3's "rich selectable cards") with the price delta shown directly
 *  on it via swapDeltaLabel(). */
function SwapOptionCard({
  label,
  imageUrl,
  icon: Icon,
  active,
  onClick,
  deltaLabel,
  inStock = true,
}: {
  label: string;
  imageUrl: string | null;
  /** Fallback sketch icon shown when there's no brand `imageUrl` — used
   *  by Mounting Structure's two real (no-brand) structure types
   *  (2026-08-27) so a customer can visually tell them apart at a
   *  glance, same "architectural sketch" icon set the section headers
   *  already use (see StandardStructureIcon/ElevatedStructureIcon).
   *  `imageUrl` still wins if both are somehow passed. */
  icon?: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  deltaLabel: string;
  /** Inventory guardrail (2026-08-20) — false greys the card out,
   *  disables its button, and shows an "Out of Stock" badge instead of
   *  the price delta; the customer must never be able to select it. Not
   *  every catalog slot has stock data plumbed through yet (Cable/
   *  Breakers/Structure), so this defaults to true — "assume in stock"
   *  — rather than requiring every caller to pass it. */
  inStock?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!inStock}
      aria-pressed={active}
      aria-disabled={!inStock}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all ${
        !inStock
          ? "cursor-not-allowed border border-slate-200 bg-slate-100 opacity-60"
          : active
            ? CARD_SELECTED_CLASSES
            : CARD_UNSELECTED_CLASSES
      }`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Google Drive URL, not a local/optimizable asset
        <img src={imageUrl} alt="" className={`h-6 w-10 shrink-0 object-contain ${!inStock ? "grayscale" : ""}`} />
      ) : (
        Icon && (
          <Icon
            className={`h-7 w-7 shrink-0 ${!inStock ? "text-slate-300" : active ? "text-orange-100" : "text-violet-400"}`}
          />
        )
      )}
      <span className="min-w-0">
        {/* Same "was truncate, real brand/model names clip on mobile"
            fix as EquipmentSwapRow above — this is the picker grid
            itself (e.g. "Jinko Bifacial 610W N-Type"), the exact place
            a truncated name reads as a broken UI. */}
        <span className={`block text-xs font-semibold ${!inStock ? "text-slate-500" : ""}`}>{label}</span>
        {!inStock ? (
          <span className="block text-[11px] font-semibold text-slate-400">Out of Stock</span>
        ) : (
          <span className={`block text-[11px] font-semibold ${active ? "text-orange-100" : deltaColorClass(deltaLabel)}`}>
            {deltaLabel}
          </span>
        )}
      </span>
    </button>
  );
}

/** Battery capacity option card — replaces the old free-text kWh input.
 *  Same selected/unselected treatment as VisualCard, plus a second,
 *  muted line for the preset's plain-language description. */
/** Two-line spec card — a bold headline value ("2.56 kWh", "7 kW") plus a
 *  muted plain-language description underneath. Originally built for the
 *  Battery Capacity presets; reused as-is for EV Charger Type (same
 *  "headline spec + description" shape), just with the caller supplying
 *  an already-formatted title instead of a hardcoded " kWh" suffix. */
function SpecCard({
  title,
  description,
  active,
  onClick,
  inStock = true,
}: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
  /** Inventory guardrail (2026-08-25) — same treatment as
   *  SwapOptionCard's own `inStock` prop above: false greys the card
   *  out, disables its button, and swaps `description` for an "Out of
   *  Stock" badge; the customer must never be able to select it.
   *  Defaults to true ("assume in stock") since most SpecCard callers
   *  (Panel Washing tiers, Target Budget) have no stock concept at
   *  all. */
  inStock?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!inStock}
      aria-pressed={active}
      aria-disabled={!inStock}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-2 text-center transition-all ${
        !inStock
          ? "cursor-not-allowed border border-slate-200 bg-slate-100 opacity-60"
          : `cursor-pointer ${active ? CARD_SELECTED_CLASSES : CARD_UNSELECTED_CLASSES}`
      }`}
    >
      <span className={`text-xs font-semibold ${!inStock ? "text-slate-500" : ""}`}>{title}</span>
      {!inStock ? (
        <span className="text-[10px] font-semibold leading-tight text-slate-400">Out of Stock</span>
      ) : (
        <span className={`text-[10px] leading-tight ${active ? "text-orange-100" : "text-slate-500"}`}>{description}</span>
      )}
    </button>
  );
}

/** Plain native `<input type="range">` wrapper — resurrected (2026-09-03)
 *  from wip-archive/HomePageContent.mobile-live-meter-wip-2026-08-29.tsx
 *  for the mobile Home tab's bill slider (LOCKED spec §2). Standalone/
 *  pure, no dependency on any of the deleted mobile-shell state, so
 *  reintroducing it doesn't reopen the mobile-redesign revert. */
function RangeSlider({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      className="h-11 w-full cursor-pointer accent-orange-500"
    />
  );
}

/** A +/- quantity picker — the Site Works row's alternative to
 *  SwapOptionCard's brand-select pattern (Part "Site Works," 2026-08-20):
 *  these 3 items aren't a brand pick, just a customer-adjustable count
 *  against a flat admin rate. 0 is a valid, reachable value ("I don't
 *  need this item"), never negative. */
/** min defaults to 0 (Site Works' Earthing/Lightning — "I don't need
 *  this item" is valid); the Panel Quantity Adjuster passes a real
 *  min/max (see its caller) so this same component enforces the
 *  bill-required floor and the selected inverter's rated-kW ceiling
 *  without duplicating clamp logic in two places. */
function QuantityStepper({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-base font-bold text-orange-700 transition-colors duration-200 hover:border-orange-300 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <span className="w-4 text-center text-sm font-bold text-slate-900">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max ?? Infinity, value + 1))}
          disabled={max !== undefined && value >= max}
          aria-label={`Increase ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-base font-bold text-orange-700 transition-colors duration-200 hover:border-orange-300 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

/** A simple on/off service add-on card (2026-08-21's "Services" section)
 *  — a real switch (role="switch"/aria-checked), not a button styled to
 *  look like one. Distinct from every other Custom Builder row: there's
 *  no brand to swap and no quantity to pick, just "include this or
 *  don't." `priceLabel` is null before a bill is entered (or if the
 *  backend hasn't returned a resolved panelWashing selection yet) —
 *  never shows a stale/guessed number. */
function ServiceToggleCard({
  title,
  icon: Icon,
  description,
  active,
  onToggle,
  priceLabel,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  description: string;
  active: boolean;
  onToggle: () => void;
  priceLabel: string | null;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition-colors duration-200 ${
        active ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${
              active ? "border-orange-200 bg-white text-orange-700" : "border-slate-200 bg-slate-50 text-orange-700"
            }`}
          >
            <Icon className="h-7 w-7" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-[11px] text-slate-500">{description}</p>
          {active && priceLabel && <p className="text-xs font-bold text-orange-700">{priceLabel}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={title}
        onClick={onToggle}
        className={`relative flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ${
          active ? "bg-orange-700" : "bg-slate-300"
        }`}
      >
        <span
          className="absolute h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
          // Inline style, not Tailwind's translate-x-6/translate-x-1 — this
          // project's compiled Tailwind output doesn't include the
          // translate-* utility family at all (verified live), so those
          // classes silently no-op. Pre-existing bug (this knob has never
          // actually slid) — see the separate "Fix broken Tailwind
          // translate-* utility scale" follow-up task for the two other
          // known instances and the root config gap.
          style={{ transform: active ? "translateX(24px)" : "translateX(4px)" }}
        />
      </button>
    </div>
  );
}

function CustomRequirementNotice() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-3 text-left text-xs leading-relaxed text-orange-800">
      <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
      <p>
        <span className="font-semibold">Custom Requirement Noted:</span> Our senior engineering team will source
        pricing for your specific equipment request and include it in your final WhatsApp Quotation.
      </p>
    </div>
  );
}

// ============================================================================
// Bill Details panel (pre-submit) — shown right after a successful
// upload. Nulls render as "—", never fabricated: OCR/PDF-text extraction
// is best-effort, and we'd rather admit uncertainty than guess.
// ============================================================================

const BILL_SOURCE_LABEL: Record<Exclude<BillSource, "MANUAL">, string> = {
  UPLOADED_PDF: "From Your PDF",
  UPLOADED_IMAGE: "From Your Photo",
};

function BillDetailsPanel({ details, source }: { details: UploadedBillDetails; source: BillSource }) {
  const rows: [string, string][] = [
    ["Consumer", details.consumerName ?? "—"],
    ["Consumer ID", details.consumerId ?? "—"],
    ["Tariff Category", details.tariffCategory ?? "—"],
    ["Billing Month", details.billingMonth ?? "—"],
    ["Units Consumed", details.unitsConsumed !== null ? `${details.unitsConsumed} units` : "—"],
    ["Sanctioned Load", details.sanctionedLoadKw !== null ? `${details.sanctionedLoadKw} kW` : "—"],
    ["Issue Date", formatDate(details.issueDate)],
    ["Due Date", formatDate(details.dueDate)],
  ];

  return (
    <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-700">Bill Details</p>
        <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
          <BadgeCheck className="h-3 w-3" /> {source === "MANUAL" ? "" : BILL_SOURCE_LABEL[source]}
        </span>
      </div>
      <p className="mt-1 text-[10px] text-stone-500">
        Extracted automatically. Please double-check the numbers below against your bill.
      </p>

      {details.address && <p className="mt-1.5 text-[11px] text-stone-500">{details.address}</p>}

      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        {rows.map(([label, value]) => (
          <DetailRow key={label} label={label} value={value} />
        ))}
      </dl>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-stone-200 pt-3">
        <div>
          <p className="text-[10px] text-stone-500">Current Bill</p>
          <p className="text-sm font-bold text-stone-900">{formatPKR(details.currentBillPKR)}</p>
        </div>
        <div>
          <p className="text-[10px] text-stone-500">
            Total Payable{details.arrearsPKR > 0 ? " (incl. arrears)" : ""}
          </p>
          <p className="text-sm font-bold text-stone-900">
            {details.totalPayablePKR !== null ? formatPKR(details.totalPayablePKR) : "—"}
          </p>
        </div>
        {details.payableAfterDueDatePKR !== null && (
          <div className="col-span-2">
            <p className="text-[10px] text-stone-500">Payable After Due Date (incl. surcharge)</p>
            <p className="text-sm font-bold text-stone-900">{formatPKR(details.payableAfterDueDatePKR)}</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => window.print()}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white py-2 text-xs font-medium text-stone-600 transition-colors duration-200 hover:border-orange-300 hover:text-orange-700"
      >
        <Download className="h-3.5 w-3.5" /> Download Bill Summary
      </button>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right font-medium text-stone-700">{value}</dd>
    </>
  );
}

// ============================================================================
// Result — "Custom Solar Report" with analytics & ROI
// ============================================================================

/** One BOQ line — Sr No. is assigned by position when rendering (battery
 *  is conditionally spliced in above, so a fixed index here would leave
 *  gaps for ONGRID_ZERO_EXPORT systems). */
interface BoqRow {
  description: string;
  uom: "PCS" | "JOB";
  qty: string;
}

/** Report screen — a brand-aligned sales quotation (light theme: white/
 *  slate background, orange headers/accents, emerald financials — per
 *  the "BOQ Light Theme" update, then the 2026-08-24 purple-to-orange
 *  rebrand on top of that same light theme; previously dark zinc-950/
 *  orange (a different, fully-dark phase, not this one), see project
 *  memory for that history) that IS the print output too, not a
 *  separate mirror the way the old ResultSummary/PrintableReport pair
 *  worked. Only the interactive chrome (Edit Inputs, the two action
 *  buttons) is `print:hidden` — a light background needs no special
 *  print-color-adjust handling the way the earlier dark version did. */
/** Detailed Cost Breakdown rows — one row per category the backend's
 *  ItemizedBreakdown already returns (see lib/db/admin.ts), at exactly
 *  the granularity it's actually computed at. Several BOQ rows (DC
 *  Cable / AC Cables / AC Distribution Box) share ONE combined backend
 *  figure (cablingAndProtectionPKR) rather than a real per-row price
 *  each, so this groups them the same way rather than fabricating a
 *  three-way split with no real number behind it. Battery is omitted
 *  entirely for ONGRID_ZERO_EXPORT (batteryPKR is 0 then, not a real
 *  line); a HYBRID_BATTERY quote where the customer explicitly opted
 *  out gets an explicit "Not Included" row instead of silent omission.
 *
 *  Extracted (2026-08-28) from ResultSummary's own inline
 *  costBreakdownRows into a standalone pure function — currently only
 *  called by ResultSummary itself (post-submit), but accepts either
 *  QuoteResult or SolarPreviewResult with no cast (both carry
 *  structurally identical breakdown/equipment/panelWashing/serviceType
 *  fields), so a future pre-submit preview surface can reuse it directly
 *  without re-deriving these rows. No behavior change from the original
 *  inline version. */
function buildCostBreakdownRows(source: {
  breakdown: ItemizedBreakdown;
  serviceType: ServiceType;
  equipment: ResolvedEquipment;
  panelWashing: PanelWashingSelection | null;
}): { label: string; valuePKR: number; displayOverride?: string }[] {
  const { battery } = source.equipment;
  const { panelWashing } = source;
  const batteryOptedOutInHybrid = source.serviceType === "HYBRID_BATTERY" && !battery;
  return [
    { label: "Solar Panels", valuePKR: source.breakdown.panelsPKR },
    {
      label: source.equipment.inverter.quantity > 1 ? `Inverter (× ${source.equipment.inverter.quantity})` : "Inverter",
      valuePKR: source.breakdown.inverterPKR,
    },
    ...(battery
      ? [{ label: "Lithium Battery", valuePKR: source.breakdown.batteryPKR }]
      : batteryOptedOutInHybrid
        ? [{ label: "Lithium Battery", valuePKR: 0, displayOverride: "Not Included" }]
        : []),
    { label: "Galvanized Mounting Structure", valuePKR: source.breakdown.structurePKR },
    { label: "AC/DC Cables, Distribution Box & Safety Equipment", valuePKR: source.breakdown.cablingAndProtectionPKR },
    { label: "Transportation, Installation & Commissioning", valuePKR: source.breakdown.installationPKR },
    source.breakdown.siteWorksPKR > 0
      ? { label: "Site Works (Civil, Earthing & Lightning Arrestor)", valuePKR: source.breakdown.siteWorksPKR }
      : { label: "Site Works (Civil, Earthing & Lightning Arrestor)", valuePKR: 0, displayOverride: "Not Included" },
    ...(panelWashing
      ? [{ label: "Panel Washing (One Time Visit)", valuePKR: source.breakdown.panelWashingPKR }]
      : []),
  ];
}

function ResultSummary({
  result,
  onEdit,
  connectionPhase,
  installationArea,
  customerName,
}: {
  result: QuoteResult;
  onEdit: () => void;
  /** "Refine your details" (2026-09-04, mobile Live Estimate panel) —
   *  capture-only, no pricing effect (see that field's own doc comment
   *  in CalculatorCard). Optional/undefined for the EV Charger/Panel
   *  Washing add-on flows, which don't collect these at all. Its
   *  Mounting Structure sibling field needs no equivalent here — it's a
   *  real priced pick already reflected in result.totalClientPricePKR,
   *  not a capture-only note. */
  connectionPhase?: InverterPhase | null;
  /** Contact.html baseline (2026-09-04) — same capture-only pattern,
   *  same optional/undefined-for-add-on-flows caveat. */
  installationArea?: string;
  /** The customer's own name, already typed into the contact form just
   *  above this result — only used to build a professional document
   *  title/PDF filename below, see that effect's own doc comment. */
  customerName: string;
}) {
  const { panel, inverter, battery } = result.equipment;
  const { civilBlockQty, earthingBoreQty, lightningArrestorQty } = result.siteWorks;
  const { panelWashing } = result;
  // "Panel Washing One Time Visit (...)" — exact PDF wording per spec:
  // the parenthetical is either the real tier breakdown ("50 Panels @ Rs
  // 150/panel") or, when the minimum visit fee floor was the binding
  // price, "(Minimum Call Out Fee)" instead — never both, never a
  // fabricated per-panel rate for a floored price. No dashes (2026-09-04
  // feedback: replace "-" with a space everywhere in the app).
  const panelWashingDescription = panelWashing
    ? panelWashing.isMinimumFeeApplied
      ? "Panel Washing One Time Visit (Minimum Call Out Fee)"
      : `Panel Washing One Time Visit (${panelWashing.panelCount} Panels @ ${formatPKR(panelWashing.ratePerPanel)}/panel)`
    : null;

  // Part 1: dynamic panel count. panelCount is `panel.count` (2026-08-20)
  // — the backend's real, already-clamped count — NOT re-derived from
  // systemKw here: that guess breaks the instant the customer adjusts
  // the Panel Quantity Adjuster away from baseline.
  const panelCount = panel.count;

  // Flags a real system-size/inverter-capacity mismatch the pricing
  // engine doesn't itself enforce (see ResolvedEquipmentItem's doc
  // comment) — now sourced from the backend's resolved equipment, so
  // this fires on the Recommended path too, not just Custom.
  const isInverterBottleneck =
    inverter.specValue !== null && inverter.specValue * inverter.quantity < result.systemKw;

  // Row 10 branches on whether the system actually needs a real grid
  // net-metering interconnection. Both ServiceTypes this app currently
  // offers (HYBRID_BATTERY, ONGRID_ZERO_EXPORT) are explicitly zero-export
  // / no-net-metering products — see the "No WAPDA net-metering paperwork.
  // Ever." line elsewhere on this page and the business rules in project
  // memory — so there is no reachable path today where the Net Metering
  // copy should print; `isNetMeteredSystem` always resolves false. Kept as
  // an explicit branch (not a bare constant) so wiring up a real
  // net-metered ServiceType later is a one-line change here, not a hunt
  // through the BOQ table.
  const isNetMeteredSystem: boolean = false;
  const netMeteringRowDescription = isNetMeteredSystem
    ? "Net Metering Facility (DISCO File Prep, NEPRA License & Green Meter)"
    : "Smart Power Controller & System Configuration";

  const boqRows: BoqRow[] = [
    { description: `${panel.label} Tier 1 - Grade 1`, uom: "PCS", qty: String(panelCount) },
    { description: "Galvanized Iron Rust Proof Customized Elevated Structure", uom: "JOB", qty: "1" },
    { description: `${inverter.label} | WIFI Dongle`, uom: "PCS", qty: String(inverter.quantity) },
    ...(battery
      ? [{ description: `Lithium Battery Backup ${formatTrim(battery.capacityKwh)}kWh`, uom: "PCS" as const, qty: "1" }]
      : []),
    { description: "DC Cable 6mm Tin Coated Copper 8mm OD Double PVC Insulated", uom: "JOB", qty: "1" },
    { description: "AC Cables as per NEPRA Requirements", uom: "JOB", qty: "1" },
    { description: "AC Distribution Box & Safety Equipment", uom: "JOB", qty: "1" },
    { description: "Earthing Pits with Ground Copper Electrode & Lightning Protection", uom: "JOB", qty: "1" },
    ...(civilBlockQty > 0
      ? [{ description: `Concrete Civil Blocks for Roof Mount (Qty: ${civilBlockQty})`, uom: "PCS" as const, qty: String(civilBlockQty) }]
      : []),
    ...(earthingBoreQty > 0 ? [{ description: "Earthing Bore", uom: "PCS" as const, qty: String(earthingBoreQty) }] : []),
    ...(lightningArrestorQty > 0
      ? [{ description: "Lightning Arrestor", uom: "PCS" as const, qty: String(lightningArrestorQty) }]
      : []),
    ...(panelWashingDescription ? [{ description: panelWashingDescription, uom: "JOB" as const, qty: "1" }] : []),
    { description: "Transportation, Installation, Testing & Commissioning", uom: "JOB", qty: "1" },
    { description: netMeteringRowDescription, uom: "JOB", qty: "1" },
  ];

  const customNote = result.hasCustomRequirements
    ? "\n\nNote: includes custom/specific equipment requests. Please confirm final pricing for those items."
    : "";
  // "Refine your details" (2026-09-04) — capture-only, folded straight
  // into the message text same as customNote above; no pricing effect,
  // see connectionPhase's own doc comment.
  const refineDetailsNote =
    connectionPhase
      ? `\n- Connection: ${PHASE_LABEL[connectionPhase]}`
      : "";
  // Contact.html baseline — folded in the same way, only when actually filled.
  const installationAreaNote = installationArea?.trim() ? `\n- Installation Area: ${installationArea.trim()}` : "";
  // Public, unauthenticated quote view (app/quote/[quoteId]/page.tsx) —
  // NOT a literal generated PDF file, see that route's doc comment for
  // why (a real PDF-generation + storage pipeline is a materially
  // bigger, separate project; this webpage is print-to-PDF-able via the
  // browser instead, same "no PDF library" convention the on-site
  // "Download Quotation (PDF)" button already uses). Falls back to a
  // relative path server-side (window is undefined during SSR) — this
  // component only ever actually renders client-side in practice, but
  // the fallback keeps the string well-formed either way.
  const pdfUrl = typeof window !== "undefined" ? `${window.location.origin}/quote/${result.quoteId}` : `/quote/${result.quoteId}`;
  const waMessage = `Assalam o Alaikum! I generated a custom quote on your site:\n- System: ${result.systemKw}kW (${panelCount} panels)\n- Total Price: ${formatPKR(result.totalClientPricePKR)}\n- Reference ID: #${result.quoteId}${refineDetailsNote}${installationAreaNote}\n\n📄 Official PDF Quotation: ${pdfUrl}\n\nI would like to schedule a site survey.${customNote}`;
  const waHref = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(waMessage)}`;

  const today = new Date().toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });

  // Document title (2026-09-04, "download file top line is saying Live
  // Solar Calculator... it's a quotation, don't mention Lahore, should
  // be professional") — this page is client-rendered at the SAME URL as
  // the homepage (?step=report), so without this it silently inherits
  // the homepage's own SEO <title> ("Solar Installation Lahore | Solar
  // Pixel", root layout's own metadata — correct for that page's actual
  // job, Google search results, but wrong for a document a customer
  // prints). This is also exactly what both the browser's native print
  // header AND the "Save as PDF" default filename are built from — so
  // fixing it here fixes the print header text and gives a real,
  // professional suggested filename for free, both from one change.
  //
  // Two simpler approaches were tried and empirically failed before
  // this one — both confirmed live, not theoretical:
  //  1. A plain `document.title = "..."` useEffect: kept getting reset
  //     back to the SEO title within a second of being set.
  //  2. A real `<title>` JSX element (React 19 hoists these to <head>):
  //     it DID mount, but Next kept RE-INSERTING A FRESH SECOND <title>
  //     node alongside it rather than replacing/deduplicating — and
  //     `document.title` (the print header/PDF-filename source, and the
  //     DOM spec's own defined behavior) always reads the FIRST <title>
  //     in the document, so whichever node Next inserted first kept
  //     winning regardless of what mine said.
  // What actually works: don't fight over WHICH single node wins —
  // watch the whole <head> for any <title>-shaped change (a text edit
  // OR a brand new node being inserted, both observed live) and, on
  // every such change, collapse back down to exactly one <title> with
  // the right text. Self-heals within a paint of whatever Next's own
  // metadata rendering does, instead of depending on winning a specific
  // race against it.
  useEffect(() => {
    const desired = `Solar Pixel Quotation - ${customerName.trim() || "Customer"} - ${today}`;
    const previousText = document.querySelector("title")?.textContent ?? document.title;

    const enforce = () => {
      const titles = document.querySelectorAll("title");
      if (titles.length === 0) {
        const el = document.createElement("title");
        el.textContent = desired;
        document.head.appendChild(el);
        return;
      }
      // Keep only the first — drop any extra <title> nodes Next's own
      // metadata rendering re-inserts alongside ours.
      titles.forEach((el, i) => {
        if (i > 0) el.remove();
      });
      if (titles[0].textContent !== desired) titles[0].textContent = desired;
    };

    enforce();
    const observer = new MutationObserver(enforce);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      const titles = document.querySelectorAll("title");
      titles.forEach((el, i) => {
        if (i > 0) el.remove();
      });
      if (titles[0]) titles[0].textContent = previousText;
    };
  }, [customerName, today]);

  // Detailed Cost Breakdown — see buildCostBreakdownRows's own doc
  // comment above for the grouping/omission rules. The rows always sum
  // to exactly totalClientPricePKR — same already-rounded-lines
  // guarantee calculateSystemPricing's breakdown itself provides,
  // verified live below.
  const costBreakdownRows = buildCostBreakdownRows(result);

  return (
    <div className="animate-fade-up relative mx-auto my-8 w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-200/60 print:my-0 print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      {/* Background watermark (2026-09-04) — a large, very faint version
          of the real mark sitting quietly behind the whole document
          (screen AND print, deliberately NOT print:hidden — the point is
          it should survive onto the printed/saved PDF too, unlike the
          hero's decorative glow blobs which are). Kept extremely low
          opacity so it never fights with reading the BOQ/Cost Breakdown
          numbers — an official-document cue, not a loud "PROOF" stamp.
          Own gradientId (see BrandMark's own doc comment on why: two
          BrandMark instances on one page would otherwise share one SVG
          <defs> id and break one instance's fill). */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 opacity-[0.04]"
      >
        <BrandMark className="h-full w-full" gradientId="resultWatermark" />
      </div>
      {/* Screen-only chrome — edit affordance + upload-source badge. */}
      <div className="flex items-center justify-between gap-3 px-6 pt-5 print:hidden">
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3.5 text-xs font-semibold text-orange-700 transition-colors duration-200 hover:border-orange-300 hover:bg-orange-100"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Edit Inputs
        </button>
        {result.billSource !== "MANUAL" && (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" /> From Your Bill
          </span>
        )}
      </div>

      {/* ---- Hero (2026-09-04, "need a better design for the quotation")
          — was a plain white header block (small navy title, a single
          bold "Estimated Turnkey Cost" line). Replaced with the same
          dark-gradient "hero" treatment already established elsewhere
          in this redesign (BuildSummary.html's own configuration-summary
          card), so the quotation opens with real visual weight instead
          of reading like a plain memo. print:[color-adjust:exact] +
          -webkit-print-color-adjust — WITHOUT these, most browsers strip
          background colors by default when printing (to save ink),
          which would leave this a WHITE box with WHITE text and no
          visible content at all. Forced on deliberately, since this
          literally IS the PDF (window.print()) — a quotation that
          vanishes on paper would be a real regression, not just a
          missed nicety. */}
      <div
        className="relative mx-4 mt-3 overflow-hidden rounded-2xl p-6 text-white sm:mx-6 sm:p-8 print:mx-0 print:mt-0 print:flex print:flex-row print:items-center print:justify-between print:gap-10 print:rounded-none print:border-b print:border-slate-300 print:px-10 print:py-8 print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]"
        style={{ background: "linear-gradient(155deg, #0F172A 0%, #0B1220 60%, #0B3B30 150%)" }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-emerald-400/15 blur-[90px] print:hidden" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-orange-400/10 blur-[90px] print:hidden" />

        {/* 2026-09-04 print-layout fix: the outer document goes edge to
            edge on paper (print:max-w-none on the card, since a Letter
            page is much wider than this mobile-card design's own
            content), which left this stacked, left-aligned block with a
            huge dead black area to its right — the exact "free space on
            the black header" the user flagged from a real printed
            screenshot. On screen (a narrow card) the stacked layout is
            still correct and untouched; print:flex splits it into a real
            two-column header instead (identity+title left, quote
            reference+total right) — the same convention real invoices
            use to fill a full-width header, not a novelty. The two
            "#id · date" spans below are a deliberate print/screen pair
            (one hidden each way), not a duplicate bug — screen keeps it
            beside the eyebrow label where it always was; print moves it
            to sit with the total on the right column instead. */}
        <div className="print:max-w-[58%]">
          {/* Real logo (2026-09-04, "should be professional and
              international leading") — BrandMark was already imported for
              the screen-only chrome bar elsewhere on this page, but never
              actually rendered ON the document itself; this hero's own
              "Powered by SP - Solar Pixel (Pvt) Ltd." was text-only, no
              graphic. A real logo mark is the actual baseline for "looks
              like an official document," not a nicety. */}
          <div className="relative flex items-center gap-2.5">
            <BrandMark className="h-9 w-9 shrink-0" gradientId="resultHeroMark" />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Solar Pixel</p>
              <p className="text-[10px] leading-tight text-white/50">(Pvt) Ltd.</p>
            </div>
          </div>

          <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2 print:mt-6 print:justify-start">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Official Quotation</span>
            <span className="font-mono text-[10.5px] text-white/60 print:hidden">
              #{result.quoteId.slice(0, 10).toUpperCase()} · {today}
            </span>
          </div>

          <h1 className="relative mt-3 text-[1.7rem] font-extrabold leading-tight tracking-tight sm:text-4xl print:mt-3">
            {result.systemKw} kW{" "}
            <span className="text-orange-400">{result.serviceType === "HYBRID_BATTERY" ? "Hybrid" : "On Grid"}</span> System
          </h1>
        </div>

        <div className="relative mt-5 print:mt-0 print:shrink-0 print:text-right">
          <p className="hidden font-mono text-[10.5px] text-white/60 print:mb-3 print:block">
            #{result.quoteId.slice(0, 10).toUpperCase()} · {today}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-white/50">Estimated Turnkey Cost</p>
          <p className="mt-0.5 font-mono text-[2rem] font-bold leading-none text-emerald-400 sm:text-4xl print:text-5xl">
            {formatPKR(result.totalClientPricePKR)}
          </p>
        </div>
      </div>

      {/* ---- Quick facts — light stat cards sitting just under the hero,
          same 3-figure set as before, restyled with icons + more room to
          breathe instead of a cramped 3-up strip. ---- */}
      <div className="mx-4 mt-4 grid grid-cols-3 gap-2.5 sm:mx-6 print:mx-0 print:mt-0 print:gap-0 print:divide-x print:divide-slate-200 print:rounded-none print:border-b print:border-slate-300">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center print:rounded-none print:border-0 print:bg-white print:py-2.5">
          <TrendingDown className="mx-auto h-3.5 w-3.5 text-emerald-600 print:hidden" />
          <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500 print:mt-0">Monthly Savings</p>
          <p className="mt-0.5 text-sm font-bold text-emerald-600">{formatPKR(result.estimatedMonthlySavingsPKR)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center print:rounded-none print:border-0 print:bg-white print:py-2.5">
          <Clock className="mx-auto h-3.5 w-3.5 text-slate-400 print:hidden" />
          <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500 print:mt-0">Payback</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">
            {result.paybackYears !== null ? `${result.paybackYears} yrs` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center print:rounded-none print:border-0 print:bg-white print:py-2.5">
          <CalendarCheck className="mx-auto h-3.5 w-3.5 text-slate-400 print:hidden" />
          <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500 print:mt-0">Live In</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">{result.daysToDeploy} Days</p>
        </div>
      </div>

      {/* ---- Warnings ---- */}
      {(isInverterBottleneck || result.hasCustomRequirements) && (
        <div className="space-y-2 px-6 pt-5 sm:px-8">
          {isInverterBottleneck && (
            <div className="flex items-start gap-2 rounded-xl border border-brand-coral-200 bg-brand-coral-50 px-3.5 py-2.5 text-left text-xs leading-relaxed text-brand-coral-ink">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-coral" />
              <p>
                Note: Your system size is limited to {result.systemKw}kW based on your selected Inverter capacity (
                {formatTrim(inverter.specValue! * inverter.quantity)}kW
                {inverter.quantity > 1 ? ` = ${formatTrim(inverter.specValue!)}kW × ${inverter.quantity}` : ""}).
                Pick a higher-capacity model under Build Your Own to size up.
              </p>
            </div>
          )}
          {result.hasCustomRequirements && (
            <div className="flex items-start gap-2 rounded-xl border border-brand-coral-200 bg-brand-coral-50 px-3.5 py-2.5 text-left text-xs leading-relaxed text-brand-coral-ink">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-coral" />
              <p>
                <span className="font-semibold">Custom Requirement Noted:</span> our senior engineering team will
                source pricing for your specific equipment request and include it in your final WhatsApp Quotation.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---- BOQ Table — same data/rows as before, restyled header (a
          dark gradient strip matching the hero instead of a flat navy
          fill) and softer, more generous row padding. ---- */}
      <div className="px-6 pt-6 sm:px-8">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700">
          <Receipt className="h-3.5 w-3.5" /> Itemized Quotation
        </p>
        <div className="mt-2.5 overflow-hidden rounded-xl border border-slate-200 shadow-sm shadow-slate-100">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr
                className="text-white print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]"
                style={{ background: "linear-gradient(90deg, #0F172A, #0B3B30)" }}
              >
                <th className="px-3 py-3 font-semibold">Sr No.</th>
                <th className="px-3 py-3 font-semibold">Product Description</th>
                <th className="px-3 py-3 font-semibold">UOM</th>
                <th className="px-3 py-3 text-right font-semibold">Product Qty</th>
              </tr>
            </thead>
            <tbody>
              {boqRows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="px-3 py-2.5 align-top text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2.5 align-top text-slate-700">{row.description}</td>
                  <td className="px-3 py-2.5 align-top text-slate-500">{row.uom}</td>
                  <td className="px-3 py-2.5 text-right align-top font-medium text-slate-700">{row.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ---- Detailed Cost Breakdown — one row per priced category ---- */}
        <p className="mb-1.5 mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700">
          <Receipt className="h-3.5 w-3.5" /> Cost Breakdown
        </p>
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm shadow-slate-100">
          <table className="w-full border-collapse text-left text-xs">
            <tbody>
              {costBreakdownRows.map((row, i) => (
                <tr key={row.label} className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                  <td className="px-3 py-2.5 text-slate-500">{row.label}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                    {row.displayOverride ?? formatPKR(row.valuePKR)}
                  </td>
                </tr>
              ))}
              <tr
                className="text-white print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]"
                style={{ background: "linear-gradient(90deg, #0F172A, #0B3B30)" }}
              >
                <td className="px-3 py-3 font-semibold">Total Turnkey Cost</td>
                <td className="px-3 py-3 text-right text-sm font-bold text-emerald-300">
                  {formatPKR(result.totalClientPricePKR)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Footer — the repeated "Total Price" card that used to sit
          here is gone (2026-09-04): the hero above already leads with
          that exact number in real visual weight, so restating it again
          right below the cost breakdown (which itself ends on the same
          total) was three copies of one figure on one document — pure
          repetition, not reinforcement. ---- */}
      <div className="mt-6 border-t border-slate-200 bg-slate-50 px-6 py-6 sm:px-8">
        <p className="text-center text-[11px] leading-relaxed text-slate-500">
          Email: solarpixelpk@gmail.com · Mobile: +92 328 2155550 · Site:{" "}
          <a
            href="https://www.solarpixel.pk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-700 underline-offset-2 hover:underline"
          >
            www.solarpixel.pk
          </a>
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 print:hidden">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackWhatsAppClick("quote_report_cta", result.quoteId)}
            className="glow-cta flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-orange-700 to-brand-gold-strong text-sm font-bold text-white transition-all duration-200 hover:brightness-105"
          >
            <MessageCircle className="h-4 w-4" /> Lock In Price on WhatsApp
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-600 transition-colors duration-200 hover:border-orange-300 hover:text-orange-700"
          >
            <Download className="h-4 w-4" /> Download Quotation (PDF)
          </button>
        </div>

        <p className="mt-3 text-center text-[10px] text-slate-500 print:hidden">
          Instant estimate. Your exact price is confirmed after an on-site engineering survey (Rs 5,000 fee applies).
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Add-on result — Panel Washing / EV Charger's own lightweight "Report"
// screen (step 5 equivalent for these two flows). Deliberately a
// separate component from ResultSummary/QuoteResult — mixing a totally
// different pricing shape into that already-large solar-specific
// component would be much higher risk than one small dedicated summary.
// No PrintableReport integration — not asked for, and these two flows
// were never persisted as a Quote to have a "contract" in the first
// place (see handleAddOnSubmit's doc comment).
// ============================================================================

function AddOnResultSummary({ result, onEdit }: { result: AddOnResult; onEdit: () => void }) {
  const isWashing = result.kind === "PANEL_WASHING";

  const waMessage = isWashing
    ? `Hi Solar Pixel! Following up on my Panel Washing quote: ${result.panelCount} panels, ${formatPKR(
        result.oneTimePricePKR
      )} one-time. Please confirm scheduling.`
    : `Hi Solar Pixel! Following up on my EV Charger installation quote: ${
        result.evChargerRatingKw ? `${result.evChargerRatingKw} kW, ` : ""
      }${formatPKR(result.totalClientPricePKR)} turnkey. Please confirm scheduling.`;
  const waHref = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(waMessage)}`;

  return (
    <div className="animate-fade-up rounded-3xl border border-stone-200/80 bg-white p-6 text-center shadow-xl shadow-stone-200/50 print:hidden">
      <button
        type="button"
        onClick={onEdit}
        className="-ml-1 -mt-1 mb-2 flex min-h-11 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3.5 text-xs font-semibold text-orange-700 transition-colors duration-200 hover:border-orange-300 hover:bg-orange-100"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Edit Inputs
      </button>

      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50">
        <CheckCircle2 className="h-6 w-6 text-orange-600" />
      </div>
      <h3 className="mt-3 text-lg font-semibold text-stone-900">
        {isWashing ? "Your Panel Washing Quote" : "Your EV Charger Installation Quote"}
      </h3>
      <p className="text-xs text-stone-500">We&apos;ve sent this to our team on WhatsApp. They&apos;ll confirm scheduling.</p>

      {isWashing ? (
        <div className="mt-5 grid grid-cols-2 gap-3 text-left">
          <Stat label="Panel Count" value={`${result.panelCount} panels`} />
          <Stat
            label="Cleaning Rate"
            value={result.isMinimumFeeApplied ? "Minimum call out fee" : `${formatPKR(result.costPerPanelPKR)}/panel`}
          />
          <div className="col-span-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
            <p className="text-xs text-stone-500">Total (One Time Visit)</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{formatPKR(result.oneTimePricePKR)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 text-left">
          <Stat label="Charger Rating" value={result.evChargerRatingKw ? `${result.evChargerRatingKw} kW` : "Custom"} />
          <Stat label="Charger Unit" value={result.chargerUnitPricePKR > 0 ? formatPKR(result.chargerUnitPricePKR) : "TBD"} />
          <Stat label="Cable Distance" value={`${result.cableDistanceMeters} m`} />
          <Stat label="Base Installation Fee" value={formatPKR(result.baseInstallationFeePKR)} />
          <Stat
            label={result.extraCableMeters > 0 ? `Extra Cable (${result.extraCableMeters}m)` : "Extra Cable"}
            value={result.extraCablePKR > 0 ? formatPKR(result.extraCablePKR) : "Included"}
          />
          <div className="col-span-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
            <p className="text-xs text-stone-500">Total Turnkey Cost</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{formatPKR(result.totalClientPricePKR)}</p>
          </div>
        </div>
      )}

      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackWhatsAppClick(isWashing ? "panel_washing_report_cta" : "ev_charger_report_cta")}
        className="glow-cta mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand-gold py-4 text-sm font-bold text-brand-gold-ink transition-all duration-200 hover:brightness-95"
      >
        <MessageCircle className="h-4 w-4" />
        Message Us on WhatsApp
      </a>

      <p className="mt-3 text-[11px] text-stone-500">Instant estimate. Your exact price is confirmed after a free consultation.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-stone-900">{value}</p>
    </div>
  );
}

// ============================================================================
// Printable report — hidden on screen, shown only for window.print().
// Covers the "Download Bill" flow (billDetails only, pre-submit, Step 3).
// The post-submit "Download Quotation (PDF)" flow no longer uses this —
// the redesigned ResultSummary is now its own print output directly, see
// its doc comment. Kept as a separate, plain black-on-white component
// (not the ResultSummary's dark theme) since a bill summary genuinely is
// a different, lighter-weight document.
// ============================================================================

function PrintableReport({
  billDetails,
  billSource,
}: {
  billDetails: UploadedBillDetails | null;
  billSource: BillSource;
}) {
  if (!billDetails) return null;
  const today = new Date().toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="hidden print:block print:text-black">
      <div className="flex items-center justify-between border-b border-stone-300 pb-3">
        <div>
          <p className="text-xl font-bold">Solar Pixel</p>
          <p className="text-xs text-stone-500">Smart Solar</p>
        </div>
        <p className="text-xs text-stone-500">Generated {today}</p>
      </div>

      {billSource !== "MANUAL" && (
        <section className="mt-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Bill Summary</h2>
          <p className="mt-1 text-[10px] text-stone-500">{BILL_SOURCE_LABEL[billSource]}. Please verify against your original bill.</p>
          <table className="mt-2 w-full border-collapse text-xs">
            <tbody>
              <PrintRow label="Consumer" value={billDetails.consumerName ?? "—"} />
              <PrintRow label="Consumer ID" value={billDetails.consumerId ?? "—"} />
              <PrintRow label="Address" value={billDetails.address ?? "—"} />
              <PrintRow label="Tariff Category" value={billDetails.tariffCategory ?? "—"} />
              <PrintRow label="Billing Month" value={billDetails.billingMonth ?? "—"} />
              <PrintRow
                label="Units Consumed"
                value={billDetails.unitsConsumed !== null ? `${billDetails.unitsConsumed} units` : "—"}
              />
              <PrintRow label="Current Bill" value={formatPKR(billDetails.currentBillPKR)} />
              {billDetails.arrearsPKR > 0 && <PrintRow label="Arrears" value={formatPKR(billDetails.arrearsPKR)} />}
              <PrintRow
                label="Total Payable"
                value={billDetails.totalPayablePKR !== null ? formatPKR(billDetails.totalPayablePKR) : "—"}
              />
              {billDetails.payableAfterDueDatePKR !== null && (
                <PrintRow label="Payable After Due Date" value={formatPKR(billDetails.payableAfterDueDatePKR)} />
              )}
              <PrintRow label="Issue Date" value={formatDate(billDetails.issueDate)} />
              <PrintRow label="Due Date" value={formatDate(billDetails.dueDate)} />
            </tbody>
          </table>
        </section>
      )}

      <p className="mt-6 text-[9px] text-stone-500">
        This is an instant, indicative estimate. Final pricing is confirmed after an on-site engineering survey (Rs 5,000 fee applies).
        Solar Pixel: Smart Solar systems for Residential, Commercial &amp; Industrial.
      </p>
    </div>
  );
}

function PrintRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="border border-stone-300 bg-stone-50 p-1.5 font-medium">{label}</td>
      <td className="border border-stone-300 p-1.5">{value}</td>
    </tr>
  );
}

// Add-on inquiries (EV Charger / System Upgrades & Washing) are now
// handled inline in CalculatorCard via the master toggle — see
// handleAddOnSubmit there. No backend persistence for either: neither
// has a specified pricing model or data shape (unlike the solar
// calculator), so submitting just opens a prefilled WhatsApp chat, same
// as before this redesign — no Lead/Quote row gets created.

// (The site footer used to be defined here as a local `Footer` component
// — moved to components/SiteFooter.tsx, 2026-09-05, "footer should
// remain the same across the application" — see that file's own doc
// comment. Rendered below via <SiteFooter />.)
