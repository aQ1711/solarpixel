"use client";

import { Suspense, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { trackWhatsAppClick } from "@/lib/analytics";
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
  Sparkles,
  Upload,
  FileText,
  X,
  SlidersHorizontal,
  PanelsTopLeft,
  AlertTriangle,
  Receipt,
  BatteryCharging,
  Mail,
  Phone,
  Globe,
  Calculator,
  Info,
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
// Provenance of the bill amount — mirrors Prisma's BillSource enum.
type BillSource = "MANUAL" | "UPLOADED_PDF" | "UPLOADED_IMAGE";
type UploadState = "idle" | "uploading" | "success" | "error";
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
   *  the adjuster's floor (bill-required minimum); maxCount is the
   *  selected inverter's own rated-kW ceiling, or null (unbounded) when
   *  that inverter has no specValue on file. */
  panel: ResolvedEquipmentItem & { count: number; baselineCount: number; maxCount: number | null };
  inverter: ResolvedEquipmentItem;
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
type ComponentType = "SOLAR_PANEL" | "INVERTER" | "BATTERY" | "DC_CABLE" | "AC_CABLE" | "BREAKERS" | "MOUNTING_STRUCTURE";

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
   *  server-side to [baselinePanelCount, maxPanelCount] regardless of
   *  what's sent here (see livePreview.equipment.panel's doc comment for
   *  those limits). Omitted defaults to the bill-derived baseline count,
   *  unchanged behavior. */
  panelQtyOverride?: number;
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
  evChargerRatingKw: number;
  cableDistanceMeters: number;
  includedCableMeters: number;
  extraCableMeters: number;
  extraCablePKR: number;
  baseInstallationFeePKR: number;
  totalClientPricePKR: number;
}

type AddOnResult = PanelWashingResult | EvChargerResult;

const PANEL_COUNT_PRESETS = [10, 20, 30, 50] as const;

const EV_CHARGER_TYPES: { kw: number; description: string }[] = [
  { kw: 7, description: "Single Phase. Standard Home" },
  { kw: 11, description: "Three Phase. Fast Charge" },
  { kw: 22, description: "Three Phase. Commercial / Heavy Duty" },
];

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
  { value: "COMMERCIAL", label: "Commercial", description: "For offices & retail. Flexible Hybrid or On-Grid." },
  { value: "INDUSTRIAL", label: "Industrial", description: "For factories & heavy load. High capacity On-Grid." },
];
const DEFAULT_SECTOR: Sector = "RESIDENTIAL";
const SECTOR_LABEL: Record<Sector, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INDUSTRIAL: "Industrial",
};

const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  HYBRID_BATTERY: "Hybrid + Battery Backup",
  ONGRID_ZERO_EXPORT: "On-Grid",
};
const SERVICE_TYPE_ICON: Record<ServiceType, typeof BatteryCharging> = {
  HYBRID_BATTERY: BatteryCharging,
  ONGRID_ZERO_EXPORT: Gauge,
};
const SERVICE_TYPE_DESCRIPTION: Record<ServiceType, string> = {
  HYBRID_BATTERY: "Get a turnkey solar + battery solution for 24/7 power security, even during an outage.",
  ONGRID_ZERO_EXPORT: "Lower upfront cost, no battery hardware. Zero WAPDA net-metering paperwork either way.",
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

const RESIDENTIAL_ONGRID_WARNING =
  "On-Grid inverters shut down during power outages. For 24/7 uninterrupted power, a Hybrid System is strongly recommended.";

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

const WHATSAPP_BUSINESS_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || "923000000000";
// Generic prefilled text for every WhatsApp CTA that has no quote/inquiry
// context yet (header, footer, the floating badge before a result
// exists) — distinct from the quote-specific messages built in
// ResultSummary/AddOnResultSummary, which include real numbers.
const GENERAL_INQUIRY_WA_MESSAGE = "Assalam o Alaikum! I'd like to learn more about Solar Pixel's solar systems.";

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
          automatically, even if the ticker's height ever changes. */}
      <div className="sticky top-0 z-30 print:hidden">
        <MarketWatchTicker />
        <Header />
      </div>
      <Hero />
      <Footer />
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

function MarketWatchTicker() {
  const [panelItems, setPanelItems] = useState<TickerItem[] | null>(null);
  const [hybridInverterItems, setHybridInverterItems] = useState<TickerItem[] | null>(null);
  const [ongridInverterItems, setOngridInverterItems] = useState<TickerItem[] | null>(null);
  const [batteryItems, setBatteryItems] = useState<TickerItem[] | null>(null);
  const [visibility, setVisibility] = useState<TickerVisibility>(DEFAULT_TICKER_VISIBILITY);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/equipment-options?sector=RESIDENTIAL")
      .then((res) => res.json())
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
    rows.push({ key: "ongrid", items: ongridInverterItems, tag: "ON-GRID", direction: "left" });
  if (visibility.showBatteries && batteryItems?.length) rows.push({ key: "batteries", items: batteryItems, tag: "BATTERIES", direction: "right" });

  // Fixed-height placeholder while loading, sized for the DEFAULT
  // (all-4-visible) case — the common one — so Header/Hero below don't
  // jump once real data arrives. Each row is ~28.5px (py-1.5 + text-xs
  // line height, measured live), so 4 rows ≈ 115px. If an admin has
  // actually hidden a row, the placeholder is briefly taller than the
  // real (shorter) ticker for one paint — a one-time, minor mismatch,
  // not a fabricated-data issue.
  if (stillLoading) {
    return <div aria-hidden className="safe-top-thin w-full bg-zinc-950" style={{ height: "115px" }} />;
  }

  // Every enabled row turned out empty (or every row is admin-hidden) —
  // nothing real to show, so show nothing rather than an empty shell.
  if (rows.length === 0) return null;

  return (
    <div aria-hidden className="safe-top-thin relative w-full overflow-hidden bg-zinc-950 font-mono text-xs">
      {rows.map((row, i) => (
        <TickerRow
          key={row.key}
          items={row.items}
          direction={row.direction}
          tag={row.tag}
          className={i > 0 ? "border-t border-zinc-800" : undefined}
        />
      ))}
    </div>
  );
}

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
/** How many seconds of scroll time each ticker item "deserves" — tuned
 *  against the original panel row (32s for 3 real panels ≈ 10.67s/item),
 *  which read at a "normal" pace. A FIXED duration regardless of item
 *  count (the old bug) made any row that grew past its original item
 *  count scroll proportionally faster for the same distance — this is
 *  what made the inverter row feel fast once it grew from ~5-6 items to
 *  12. Computing duration = items.length * this constant keeps every
 *  row's perceived speed the same no matter how many SKUs the catalog
 *  ends up with. */
const TICKER_SECONDS_PER_ITEM = 32 / 3;
const TICKER_MIN_SECONDS = 16;

function TickerRow({
  items,
  direction,
  tag,
  className,
}: {
  items: TickerItem[];
  direction: "left" | "right";
  /** Short pinned label (e.g. "HYBRID" / "ON-GRID") at the row's left
   *  edge, static and non-scrolling — the visual differentiator between
   *  the two inverter rows the ticker items themselves don't otherwise
   *  carry (their label text is just the product name). */
  tag?: string;
  className?: string;
}) {
  const doubled = [...items, ...items];
  const durationSeconds = Math.max(TICKER_MIN_SECONDS, Math.round(items.length * TICKER_SECONDS_PER_ITEM));
  return (
    // pl-4 lives here, on the non-animated overflow-hidden wrapper, NOT
    // on the translating row below — it used to be on the row itself,
    // which made row.scrollWidth asymmetric (16px of padding before the
    // first copy, none after the second) and broke the "translate by
    // exactly -50%" seamless-loop assumption. That was only HALF the bug
    // though (see below).
    <div className={`flex w-full items-center overflow-hidden whitespace-nowrap pl-4 ${className ?? ""}`}>
      {tag ? (
        <span className="mr-3 shrink-0 rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-400">
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
          "lag when the ticker finishes." */}
      <div
        className={`flex shrink-0 items-center whitespace-nowrap py-1.5 ${
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

function Header() {
  return (
    <header className="px-3 pt-3 sm:px-5">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 rounded-full border border-stone-200 bg-white/90 py-2 pl-4 pr-2 shadow-sm shadow-stone-200/50 backdrop-blur-md sm:pl-5 sm:pr-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg">Solar Pixel</span>
          <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 sm:inline-block">
            No Net Metering
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(GENERAL_INQUIRY_WA_MESSAGE)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackWhatsAppClick("header")}
            className="hidden min-h-9 items-center gap-1.5 rounded-full border border-stone-200 px-3.5 text-xs font-medium text-stone-600 transition-colors duration-200 hover:border-stone-300 hover:text-stone-900 sm:flex"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Chat with us
          </a>
          <button
            type="button"
            onClick={scrollToCalculator}
            className="flex min-h-9 items-center gap-1.5 rounded-full bg-stone-900 px-3.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-stone-800 sm:px-4"
          >
            <span className="sm:hidden">Get Quote</span>
            <span className="hidden sm:inline">Get Instant Quote</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// Hero + Calculator
// ============================================================================

function Hero() {
  return (
    <section className="dot-grid relative px-5 pb-6 pt-4 sm:pt-6 md:pb-4 print:p-0">
      {/* Ambient glow, purely decorative — two soft, low-opacity washes
          instead of one saturated blob, for a calmer first impression. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-160px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet-200/20 blur-[130px] print:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-80px] top-[40px] h-[280px] w-[280px] rounded-full bg-emerald-200/15 blur-[110px] print:hidden"
      />

      {/* Mobile-First Hero overhaul (2026-08-22) — headline, subhead, a
          single unmissable CTA, and a 3-step "what happens next" strip,
          all sized to fit above the fold on a real iPhone 12 Pro
          viewport (390×844, verified live via resize_window). The CTA
          just scrolls to the SAME #calculator card that already renders
          a little further down (nothing structural changed there) — a
          shortcut for someone who wants to jump straight in, not a gate
          in front of it, since the card was already reachable by
          scrolling either way.

          Desktop Hero Compaction (2026-08-22, same day) — tightened
          every gap below on md:+ specifically (mobile spacing is
          untouched, it was already sized for the mobile-first pass
          above) and widened the subhead so it wraps to 1 line instead
          of 2-3 on a wide screen, both aimed at the same goal: pull
          "What do you need?" up into view on a real 1080p desktop
          without scrolling. Verified live via resize_window — see this
          function's own doc comment isn't the place for that log, it's
          in project memory alongside the actual measured numbers. */}
      <div className="relative mx-auto max-w-2xl text-center print:hidden">
        <h1 className="text-balance text-[1.85rem] font-bold leading-[1.15] tracking-tight text-stone-900 sm:text-5xl sm:leading-[1.1]">
          Get Your Exact Solar Price in <span className="text-violet-600">60 Seconds</span>.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-balance text-sm text-stone-600 sm:mt-2.5 sm:max-w-xl sm:text-lg">
          {/* "your monthly bill," not "your WAPDA units" — the calculator's
              real first field asks for a Rupee amount (Average Monthly
              Bill), not a units/kWh meter reading; corrected to match the
              actual product instead of publishing a wrong claim. */}
          No waiting for salesmen. Enter your monthly bill, see the exact engineering, and get a transparent
          quotation instantly.
        </p>

        <button
          type="button"
          onClick={scrollToCalculator}
          className="glow-cta mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-violet-600/30 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] sm:mt-5 sm:w-auto sm:px-10 sm:py-4"
        >
          Calculate My Solar Cost
          <ArrowRight className="h-5 w-5" />
        </button>

        <div className="mt-3 flex items-center justify-center gap-1 text-[11px] font-medium text-stone-400 sm:mt-3.5 sm:gap-1.5 sm:text-xs">
          <span className="flex items-center gap-1">
            <Receipt className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> 1. Enter Bill
          </span>
          <ArrowRight className="h-2.5 w-2.5 shrink-0 text-stone-300" />
          <span className="flex items-center gap-1">
            <SlidersHorizontal className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> 2. Configure System
          </span>
          <ArrowRight className="h-2.5 w-2.5 shrink-0 text-stone-300" />
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> 3. Get Instant Quote
          </span>
        </div>
      </div>

      <div id="calculator" className="relative mx-auto mt-5 w-full scroll-mt-24 sm:mt-5 md:mt-4 print:mt-0 print:max-w-none">
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
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">
        {step}
      </span>
      <p className="flex min-w-0 items-center gap-1.5 text-xs font-bold tracking-wide text-slate-800 uppercase">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-violet-500" />}
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
  // incomplete state, just skips pausing there. Only meaningful for
  // masterService === "COMPLETE_SOLAR" — the other two master services
  // render a completely different, shorter form with none of these
  // sections, so the refs simply stay unattached (null) for them and
  // scrollToStep's optional chaining no-ops safely.
  const serviceSelectionRef = useRef<HTMLFieldSetElement>(null);
  const energyProfileRef = useRef<HTMLDivElement>(null);
  const configurationRef = useRef<HTMLDivElement>(null);

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
  const [evChargerRatingKw, setEvChargerRatingKw] = useState<number | null>(null);
  const [evCableDistanceMeters, setEvCableDistanceMeters] = useState(String(EV_CHARGER_INCLUDED_CABLE_METERS));
  const [evPreview, setEvPreview] = useState<EvChargerResult | null>(null);
  const [evPreviewLoading, setEvPreviewLoading] = useState(false);
  const [evPreviewError, setEvPreviewError] = useState<string | null>(null);

  const [sector, setSector] = useState<Sector>(DEFAULT_SECTOR);
  // Residential defaults to Hybrid (recommended); Commercial defaults to
  // On-Grid — both are genuinely interactive/customer choice now, only
  // Industrial stays hard-locked. See LOCKED_SERVICE_TYPE_BY_SECTOR.
  const [residentialServiceType, setResidentialServiceType] = useState<ServiceType>("HYBRID_BATTERY");
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
  // "One-Time Panel Washing Visit" (2026-08-21) — Services section toggle.
  const [includePanelWashing, setIncludePanelWashing] = useState(false);

  const serviceType: ServiceType =
    LOCKED_SERVICE_TYPE_BY_SECTOR[sector] ?? (sector === "RESIDENTIAL" ? residentialServiceType : commercialServiceType);
  const resolvedBillPKR = billAmountInput.trim() === "" ? null : Number(billAmountInput);

  // Lazily fetch the equipment catalog the first time the Custom path is
  // opened, and RE-fetch whenever sector changes while it's open — the
  // per-item unitPricePKR each option now carries is margin-adjusted per
  // sector (see getPublicUnitPricesPKR), so a stale catalog would show
  // stale prices on the pills after a sector switch. Every setState call
  // here lives inside a promise callback, not synchronously in the effect
  // body — "loading" is derived above instead.
  useEffect(() => {
    if (customizationPath !== "CUSTOM") return;
    let cancelled = false;
    fetch(`/api/equipment-options?sector=${sector}`)
      .then(async (res) => {
        const data = await res.json();
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
  }, [customizationPath, sector]);

  function firstNonOther(list?: EquipmentOptionDTO[]): string | null {
    return list?.find((o) => !o.isOtherOption)?.code ?? null;
  }

  // Inverter options are filtered by serviceType (On-Grid vs Hybrid).
  const inverterOptionsForServiceType = (equipmentOptions?.INVERTER ?? []).filter(
    (o) => o.isOtherOption || o.applicableServiceType === serviceType,
  );
  const batteryOptions = equipmentOptions?.BATTERY ?? [];

  // Effective selection = the user's explicit pick, if still valid for the
  // current serviceType — otherwise the Recommended default for that slot.
  const effectivePanelCode = panelCode ?? firstNonOther(equipmentOptions?.SOLAR_PANEL);
  const effectiveInverterCode =
    inverterCode && inverterOptionsForServiceType.some((o) => o.code === inverterCode)
      ? inverterCode
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
  const effectiveStructureCode = structureCode ?? firstNonOther(equipmentOptions?.MOUNTING_STRUCTURE);

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
  // Debounced ~500ms, same pattern as Panel Washing/EV Charger's own live
  // previews — calls the SOLAR_PREVIEW request kind (same pricing
  // pipeline as a real submission, but never persists a Lead/Quote; see
  // the doc comment on SolarPreviewResult and the route's `isPreview`
  // branch). Fires on every bill/sector/service-type/equipment change so
  // the right-column summary and the per-pill price hints both stay live.
  const [livePreview, setLivePreview] = useState<SolarPreviewResult | null>(null);
  const [livePreviewLoading, setLivePreviewLoading] = useState(false);
  const [livePreviewError, setLivePreviewError] = useState<string | null>(null);

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
            targetBudgetTier: targetBudgetTier ?? undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setLivePreviewError(data?.error ?? "Could not calculate an estimate.");
          return;
        }
        setLivePreview(data as SolarPreviewResult);
      } catch {
        setLivePreviewError("Network error. Please try again.");
      } finally {
        setLivePreviewLoading(false);
      }
    }, 500);
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
        const data = await res.json();
        setBaselinePreview(data as SolarPreviewResult);
      } catch {
        // Purely a supplementary reference figure — a failed fetch just
        // leaves the "Starting from" line hidden, never blocks or errors
        // the main live estimate.
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [masterService, resolvedBillPKR, sector, serviceType]);

  function handleBillAmountChange(raw: string) {
    setBillAmountInput(raw);
    // Editing the amount by hand after an upload means we can no longer
    // vouch for it being exactly what the document said.
    if (billSource !== "MANUAL") {
      setBillSource("MANUAL");
      setBillDetails(null);
    }
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
      const data = await res.json();

      if (!res.ok) {
        setUploadState("error");
        setUploadError(data?.error ?? "Couldn't read that file. Enter your bill amount manually.");
        return;
      }

      const details = data as UploadedBillDetails;
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
        const data = await res.json();
        if (!res.ok) {
          setWashPreviewError(data?.error ?? "Could not calculate an estimate.");
          return;
        }
        setWashPreview(data as PanelWashingResult);
      } catch {
        setWashPreviewError("Network error. Please try again.");
      } finally {
        setWashPreviewLoading(false);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [masterService, washPanelCount, sector, washPreview]);

  // ---- EV Charger live preview ---- (same pattern as above)
  useEffect(() => {
    if (masterService !== "EV_CHARGER" || evChargerRatingKw === null) return;
    const distance = Number(evCableDistanceMeters);
    if (!Number.isFinite(distance) || distance <= 0) return;
    if (evPreview && evChargerRatingKw === evPreview.evChargerRatingKw && distance === evPreview.cableDistanceMeters) return;

    const timeoutId = setTimeout(async () => {
      setEvPreviewLoading(true);
      setEvPreviewError(null);
      try {
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestKind: "EV_CHARGER",
            evChargerRatingKw,
            evChargerCableDistanceMeters: distance,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setEvPreviewError(data?.error ?? "Could not calculate an estimate.");
          return;
        }
        setEvPreview(data as EvChargerResult);
      } catch {
        setEvPreviewError("Network error. Please try again.");
      } finally {
        setEvPreviewLoading(false);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [masterService, evChargerRatingKw, evCableDistanceMeters, evPreview]);

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
          targetBudgetTier: targetBudgetTier ?? undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data?.error ?? "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }

      setResult(data as QuoteResult);
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
        const data = await res.json();
        if (!res.ok) {
          setAddOnError(data?.error ?? "Could not calculate your quote. Please try again.");
          setStatus("idle");
          return;
        }
        const priced = data as PanelWashingResult;
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
      if (evChargerRatingKw === null) {
        setAddOnError("Select a charger type.");
        return;
      }
      setStatus("loading");
      try {
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestKind: "EV_CHARGER",
            evChargerRatingKw,
            evChargerCableDistanceMeters: Number(evCableDistanceMeters) || EV_CHARGER_INCLUDED_CABLE_METERS,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAddOnError(data?.error ?? "Could not calculate your quote. Please try again.");
          setStatus("idle");
          return;
        }
        const priced = data as EvChargerResult;
        const message = `Hi Solar Pixel! I'm ${fullName} and I'd like to request: ${serviceLabel} (${priced.evChargerRatingKw} kW). Quote: ${formatPKR(priced.totalClientPricePKR)} turnkey.${detailsLine}`;
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
      <ResultSummary result={result} onEdit={handleEditInputs} />
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
          reads as three empty little boxes in a lot of white space. */}
      <fieldset ref={serviceSelectionRef}>
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
                  // Complete Solar's Energy Profile card only exists in
                  // the DOM for that branch (see the masterService ===
                  // "COMPLETE_SOLAR" ternary below) — switching INTO it
                  // from a different service means the ref isn't
                  // attached yet at the moment this handler runs, so the
                  // scroll has to wait for React to actually commit that
                  // new DOM before it can find something to scroll to.
                  // Double rAF (not a fixed setTimeout) is the standard
                  // "wait for the next real paint" pattern — one rAF
                  // alone can still fire before layout has settled.
                  if (value === "COMPLETE_SOLAR") {
                    requestAnimationFrame(() => requestAnimationFrame(() => scrollToStep(energyProfileRef)));
                  }
                }}
                aria-pressed={active}
                className={`relative flex min-w-0 items-start gap-3 rounded-2xl p-4 text-left transition-all duration-200 ${
                  active
                    ? "border-2 border-violet-600 bg-violet-50"
                    : "border border-slate-200 bg-slate-50 hover:border-violet-400 hover:shadow-md"
                }`}
              >
                {active && <CornerBrackets />}
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${
                    active ? "border-violet-300 bg-white text-violet-700" : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  <Icon className="h-9 w-9" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${active ? "text-violet-900" : "text-slate-900"}`}>{label}</span>
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
            {/* 1. Average Monthly Bill — top, auto-calculates recommended
                kW (via the live-preview effect above). Upload dropzone
                folded in here too — same conceptual step as before.
                bg-white (vs. Step 2/3's bg-stone-50) breaks up the "wall
                of identical cards" look (Part 2) — see StepHeader. */}
            <div ref={energyProfileRef} className="rounded-2xl border border-slate-200 bg-white p-4">
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
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 pr-11 text-base font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
                    />
                    {billSource !== "MANUAL" && (
                      <BadgeCheck className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                    )}
                  </div>
                </div>
                <div>
                  {/* Target Budget (2026-08-20) — auto-selects the
                      inverter/battery strategy (see the Calculation
                      Transparency dropdown below for what each tier
                      actually does); does NOT change system size itself.
                      "No preference" keeps the ordinary admin-configured
                      Recommended default, unchanged from before this
                      feature. */}
                  <label htmlFor="targetBudgetTier" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Target Budget
                  </label>
                  <select
                    id="targetBudgetTier"
                    value={targetBudgetTier ?? ""}
                    onChange={(e) => setTargetBudgetTier((e.target.value || null) as BudgetTier | null)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base font-medium text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
                  >
                    <option value="">No preference</option>
                    <option value="UNDER_1M">Under Rs 1 Million</option>
                    <option value="1M_TO_1_5M">Rs 1 Million - Rs 1.5 Million</option>
                    <option value="1_5M_PLUS">Rs 1.5 Million+</option>
                  </select>
                </div>
              </div>

              {resolvedBillPKR !== null && resolvedBillPKR > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-violet-700">
                  <Zap className="h-4 w-4 shrink-0" />
                  {livePreview ? (
                    <>Recommended System: {livePreview.systemKw} kW</>
                  ) : (
                    <>Calculating recommended system size…</>
                  )}
                  {livePreviewLoading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                </p>
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
                    className="flex items-center gap-1 text-sm text-violet-600 transition-colors duration-200 hover:text-violet-700"
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
                            (based on Rs {DISPLAY_BLENDED_TARIFF_PKR_PER_UNIT}/unit blended LESCO tariff)
                          </p>
                          <p>
                            <span className="font-semibold text-slate-900">2. Daytime Demand:</span> ~{dailyDaytimeKwh.toFixed(1)} kWh/day
                            ({offsetPct}% of {SECTOR_LABEL[sector].toLowerCase()} usage typically falls during daylight hours)
                          </p>
                          <p>
                            <span className="font-semibold text-slate-900">3. Solar Output:</span> A {livePreview.systemKw} kW system
                            produces ~{dailySolarOutputKwh.toFixed(1)} kWh/day in Lahore, sized to cover that daytime demand.
                          </p>
                          {serviceType === "HYBRID_BATTERY" && (
                            <p>
                              <span className="font-semibold text-slate-900">4. Battery Offset:</span> Surplus daytime generation
                              charges your battery to cover essential loads after dark.
                            </p>
                          )}
                          {targetBudgetTier && (
                            <p>
                              <span className="font-semibold text-slate-900">5. Budget Strategy:</span>{" "}
                              {targetBudgetTier === "UNDER_1M" &&
                                "Smallest in-stock hybrid inverter that fits your system, no battery, for the lowest upfront cost."}
                              {targetBudgetTier === "1M_TO_1_5M" &&
                                "Smallest in-stock hybrid inverter that fits your system, plus our cheapest in-stock battery."}
                              {targetBudgetTier === "1_5M_PLUS" &&
                                `Oversized ${formatTrim(livePreview.equipment.inverter.specValue ?? livePreview.systemKw)}kW inverter selected to leave room for future panels without requiring an upgrade, plus battery.`}
                            </p>
                          )}
                          <p className="border-t border-slate-200 pt-2 font-semibold text-violet-700">
                            Result: Sized to offset ~{offsetPct}% of your bill, the portion used during daylight hours, without
                            exporting anything back to the grid.
                          </p>
                        </div>
                      );
                    })()}
                </div>
              )}

              <div className="mt-2">
                {uploadState === "uploading" ? (
                  <div className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-500" />
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
                  <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-center transition-colors duration-200 hover:border-violet-400 hover:bg-violet-50/40">
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
            <div className="@container rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <StepHeader step={2} title="Property & System" />
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-slate-700">Property Type</legend>
                <div className="grid grid-cols-1 gap-4 @xl:grid-cols-3">
                  {SECTOR_CARDS.map(({ value, label, description }) => {
                    const active = sector === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSector(value)}
                        aria-pressed={active}
                        className={`relative flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-2xl p-2.5 text-left transition-all duration-200 ${
                          active
                            ? "border-2 border-violet-600 bg-violet-50 text-violet-900"
                            : "border border-slate-200 bg-white text-slate-700 hover:border-violet-400 hover:shadow-md"
                        }`}
                      >
                        {active && <CornerBrackets />}
                        <span
                          className={`flex h-14 w-16 shrink-0 items-center justify-center rounded-xl border sm:h-16 sm:w-20 ${
                            active ? "border-violet-300 bg-white text-violet-600" : "border-slate-200 bg-white text-slate-400"
                          }`}
                        >
                          <SectorIllustration sector={value} className="h-9 w-12 sm:h-10 sm:w-14" />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${active ? "text-violet-900" : "text-slate-900"}`}>
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
                    <Sun className="h-4 w-4 shrink-0 text-violet-500" />
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
                                ? "border-2 border-violet-600 bg-violet-50 text-violet-900"
                                : "border border-slate-200 bg-white text-slate-700 hover:border-violet-400 hover:shadow-md"
                            }`}
                          >
                            {active && <CornerBrackets />}
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                active ? "bg-violet-600 text-white" : "border border-slate-200 bg-white text-violet-500"
                              }`}
                            >
                              <Icon className="h-4.5 w-4.5" />
                            </span>
                            <span className="min-w-0">
                              <span className={`block text-xs font-semibold ${active ? "text-violet-900" : "text-slate-900"}`}>
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
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-violet-950">
                    <PanelsTopLeft className="h-3.5 w-3.5 text-violet-500" />
                    Custom Equipment Builder
                  </p>

                  {equipmentOptionsLoading && (
                    <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                      Loading equipment options…
                    </div>
                  )}
                  {equipmentOptionsError && (
                    <p role="alert" className="text-xs text-red-500">
                      {equipmentOptionsError}
                    </p>
                  )}

                  {equipmentOptions && (
                    <div className="space-y-3">
                      {/* 1. Solar Panels — Default & Swap, plus the Panel
                          Quantity Adjuster (2026-08-20). Min/max come
                          from the live backend response (baselineCount =
                          the bill-required floor; maxCount = the
                          currently selected inverter's own rated-kW
                          ceiling, null = unbounded when that inverter has
                          no specValue on file) — never computed
                          client-side, so the adjuster's limits can never
                          drift from what the server will actually accept. */}
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
                        {livePreview && (
                          <div>
                            <p className="mb-1.5 block text-xs font-medium text-slate-600">
                              Number of Panels
                              <span className="ml-1.5 font-normal text-slate-400">
                                (min {livePreview.equipment.panel.baselineCount}
                                {livePreview.equipment.panel.maxCount !== null &&
                                  ` · max ${livePreview.equipment.panel.maxCount}`}
                                )
                              </span>
                            </p>
                            <QuantityStepper
                              label="Panels"
                              value={livePreview.equipment.panel.count}
                              onChange={(v) => setPanelQtyOverride(v)}
                              min={livePreview.equipment.panel.baselineCount}
                              max={livePreview.equipment.panel.maxCount ?? undefined}
                            />
                          </div>
                        )}
                      </EquipmentSwapRow>

                      {/* 2. Inverter — Default & Swap */}
                      <EquipmentSwapRow
                        title={`Inverter: ${SERVICE_TYPE_LABEL[serviceType]}`}
                        icon={InverterIcon}
                        currentLabel={currentInverterOption?.label ?? "Select an inverter"}
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
                                  if (defaultSku) setInverterCode(defaultSku.code);
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
                              onClick={() => setInverterCode(OTHER_CODE)}
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
                                  onClick={() => setInverterCode(o.code)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
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
                          title="One-Time Panel Washing Visit"
                          icon={WaterDropIcon}
                          description="A single professional cleaning visit after installation, not a recurring plan."
                          active={includePanelWashing}
                          onToggle={() => setIncludePanelWashing((s) => !s)}
                          priceLabel={livePreview?.panelWashing ? formatPKR(livePreview.breakdown.panelWashingPKR) : null}
                        />
                      </div>
                    </div>
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
            <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-lg shadow-violet-100/60">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-600">
                <Sparkles className="h-3.5 w-3.5" /> Live Estimate
              </p>

              {livePreview ? (
                <>
                  <p className="mt-1.5 text-3xl font-bold text-slate-900">{formatPKR(livePreview.totalClientPricePKR)}</p>
                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                    Estimated Turnkey Cost
                    {livePreviewLoading && <Loader2 className="h-3 w-3 animate-spin text-violet-400" />}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                    <div>
                      <p className="text-[10px] text-slate-500">System</p>
                      <p className="text-sm font-bold text-slate-900">{livePreview.systemKw} kW</p>
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
                  />
                </div>
              </div>

              {errorMessage && (
                <p role="alert" className="mt-2 text-xs text-red-500">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="glow-cta mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 py-3.5 text-sm font-semibold text-stone-900 transition-all duration-200 hover:from-amber-500 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
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

      {/* Mobile-Only Floating Bottom Bar (Part 3) — lg:hidden since the
          desktop layout already has the live total permanently visible in
          the sticky right column; on mobile that column is pushed far
          below the fold by the single-column stack, so this repeats the
          number where a thumb can actually act on it. Only for Complete
          Solar (this is the only flow with a real "Quotation" / turnkey price
          to show — EV Charger/System Upgrades use different terminology
          and already read fine without a second summary bar). */}
      {masterService === "COMPLETE_SOLAR" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between bg-slate-950 p-4 text-white shadow-2xl lg:hidden print:hidden">
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400">Est. Total</p>
            <p className="truncate text-base font-bold">
              {livePreview ? formatPKR(livePreview.totalClientPricePKR) : "Enter your bill above"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById("contact-and-submit")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 px-4 py-2.5 text-sm font-semibold text-stone-900 transition-all duration-200 hover:from-amber-500 hover:to-amber-600"
          >
            Get Quotation <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Floating mobile WhatsApp badge — general inquiry, since no quote
          exists yet at this point in the flow (ResultSummary/
          AddOnResultSummary render their own copy of this with the real
          quote-specific message once one does). Offset higher when the
          Complete Solar bottom price bar above is also showing, so the
          two don't visually stack on top of each other. */}
      <FloatingWhatsAppButton
        message={GENERAL_INQUIRY_WA_MESSAGE}
        source="floating_badge_form"
        raised={masterService === "COMPLETE_SOLAR"}
      />

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
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-violet-600">
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
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
                />
              </div>
            )}

            {masterService === "EV_CHARGER" && (
              <div className="@container rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-violet-600">
                    <EVChargerIcon className="h-8 w-8" />
                  </span>
                  <p className="text-sm font-semibold text-slate-800">EV Charger Installation</p>
                </div>
                <p className="mb-1.5 block text-xs font-medium text-slate-600">Charger Type</p>
                <div className="grid grid-cols-1 gap-3 @sm:grid-cols-3">
                  {EV_CHARGER_TYPES.map((type) => (
                    <SpecCard
                      key={type.kw}
                      title={`${type.kw} kW`}
                      description={type.description}
                      active={evChargerRatingKw === type.kw}
                      onClick={() => setEvChargerRatingKw(type.kw)}
                    />
                  ))}
                </div>

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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
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
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
              />
            </div>
          </div>

          {/* ---- RIGHT COLUMN: sticky live total/pricing + contact + submit,
              same wrapper classes as the Solar dashboard's right column ---- */}
          <div className="lg:sticky lg:top-32 lg:z-30 lg:self-start">
            <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-lg shadow-violet-100/60">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-600">
                <Sparkles className="h-3.5 w-3.5" /> {masterService === "EV_CHARGER" ? "Live Total" : "Estimate"}
              </p>

              {masterService === "SYSTEM_UPGRADES" &&
                (washPreview ? (
                  <>
                    <p className="mt-1.5 text-2xl font-bold text-slate-900">
                      {formatPKR(washPreview.oneTimePricePKR)}
                      {washPreviewLoading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-violet-400" />}
                    </p>
                    <p className="text-xs text-slate-500">
                      {washPreview.isMinimumFeeApplied
                        ? "Minimum call-out fee"
                        : `${washPreview.panelCount} panels × ${formatPKR(washPreview.costPerPanelPKR)}`}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
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
                      {evPreviewLoading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-violet-400" />}
                    </p>
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
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
                className="glow-cta mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 py-3.5 text-sm font-semibold text-stone-900 transition-all duration-200 hover:from-amber-500 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
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
  );
}

// ============================================================================
// Dual Customization Paths — Recommended vs Custom Equipment Builder
// ============================================================================

function PathToggle({ path, onChange }: { path: CustomizationPath; onChange: (path: CustomizationPath) => void }) {
  const options: { value: CustomizationPath; label: string; icon: typeof Sparkles }[] = [
    { value: "RECOMMENDED", label: "Solar Pixel Recommended", icon: Sparkles },
    { value: "CUSTOM", label: "Custom Equipment Builder", icon: SlidersHorizontal },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
      {options.map(({ value, label, icon: Icon }) => {
        const active = path === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={active}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[11px] font-semibold leading-tight transition-colors duration-200 sm:text-xs ${
              active ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Multi-layered purple palette shared by every card/pill/badge in the
// Custom Equipment Builder — one place to keep "selected" reading as
// unambiguously "chosen" (solid, high-contrast) vs. everything else
// staying quiet until hovered/picked.
const CARD_SELECTED_CLASSES = "border-2 border-violet-800 bg-violet-700 text-white shadow-md";
const CARD_UNSELECTED_CLASSES =
  "border border-slate-200 bg-slate-50 text-slate-800 hover:border-violet-300 hover:bg-violet-50/40";

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
          ? `${CARD_SELECTED_CLASSES} font-bold ring-2 ring-offset-2 ring-violet-500`
          : "border border-violet-200 bg-violet-100 font-medium text-violet-900 hover:border-violet-400"
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
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-violet-600">
              <Icon className="h-7 w-7" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
            <p className="truncate text-sm font-semibold text-slate-900">
              {currentLabel}
              {currentPriceLabel && <span className="ml-1.5 font-bold text-violet-700">— {currentPriceLabel}</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={isOpen}
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-3.5 text-xs font-semibold text-violet-700 transition-colors duration-200 hover:border-violet-300 hover:bg-violet-100"
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
  active,
  onClick,
  deltaLabel,
  inStock = true,
}: {
  label: string;
  imageUrl: string | null;
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
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- external Google Drive URL, not a local/optimizable asset
        <img src={imageUrl} alt="" className={`h-6 w-10 shrink-0 object-contain ${!inStock ? "grayscale" : ""}`} />
      )}
      <span className="min-w-0">
        <span className={`block truncate text-xs font-semibold ${!inStock ? "text-slate-500" : ""}`}>{label}</span>
        {!inStock ? (
          <span className="block text-[11px] font-semibold text-slate-400">Out of Stock</span>
        ) : (
          <span
            className={`block text-[11px] font-semibold ${active ? "text-violet-100" : deltaLabel.startsWith("+") ? "text-orange-700" : "text-emerald-700"}`}
          >
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
}: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-2 text-center transition-all ${
        active ? CARD_SELECTED_CLASSES : CARD_UNSELECTED_CLASSES
      }`}
    >
      <span className="text-xs font-semibold">{title}</span>
      <span className={`text-[10px] leading-tight ${active ? "text-violet-100" : "text-slate-500"}`}>{description}</span>
    </button>
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
          className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-base font-bold text-violet-700 transition-colors duration-200 hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <span className="w-4 text-center text-sm font-bold text-slate-900">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max ?? Infinity, value + 1))}
          disabled={max !== undefined && value >= max}
          aria-label={`Increase ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-base font-bold text-violet-700 transition-colors duration-200 hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
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
        active ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${
              active ? "border-violet-200 bg-white text-violet-600" : "border-slate-200 bg-slate-50 text-violet-600"
            }`}
          >
            <Icon className="h-7 w-7" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-[11px] text-slate-500">{description}</p>
          {active && priceLabel && <p className="text-xs font-bold text-violet-700">{priceLabel}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={title}
        onClick={onToggle}
        className={`relative flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ${
          active ? "bg-violet-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            active ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function CustomRequirementNotice() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-3 text-left text-xs leading-relaxed text-violet-800">
      <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
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
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white py-2 text-xs font-medium text-stone-600 transition-colors duration-200 hover:border-violet-300 hover:text-violet-700"
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
 *  slate background, violet headers/accents, emerald financials — per
 *  the "BOQ Light Theme" update; previously dark zinc-950/orange, see
 *  project memory for that history) that IS the print output too, not a
 *  separate mirror the way the old ResultSummary/PrintableReport pair
 *  worked. Only the interactive chrome (Edit Inputs, the two action
 *  buttons) is `print:hidden` — a light background needs no special
 *  print-color-adjust handling the way the earlier dark version did. */
function ResultSummary({ result, onEdit }: { result: QuoteResult; onEdit: () => void }) {
  const { panel, inverter, battery } = result.equipment;
  const { civilBlockQty, earthingBoreQty, lightningArrestorQty } = result.siteWorks;
  const { panelWashing } = result;
  // "Panel Washing - One-Time Visit (...)" — exact PDF wording per spec:
  // the parenthetical is either the real tier breakdown ("50 Panels @ Rs
  // 150/panel") or, when the minimum visit fee floor was the binding
  // price, "(Minimum Call-Out Fee)" instead — never both, never a
  // fabricated per-panel rate for a floored price.
  const panelWashingDescription = panelWashing
    ? panelWashing.isMinimumFeeApplied
      ? "Panel Washing - One-Time Visit (Minimum Call-Out Fee)"
      : `Panel Washing - One-Time Visit (${panelWashing.panelCount} Panels @ ${formatPKR(panelWashing.ratePerPanel)}/panel)`
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
  const isInverterBottleneck = inverter.specValue !== null && inverter.specValue < result.systemKw;

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
    ? "Net Metering Facility (LESCO File Prep, NEPRA License & Green Meter)"
    : "Smart Power Controller & System Configuration";

  const boqRows: BoqRow[] = [
    { description: `${panel.label} Tier 1 - Grade 1`, uom: "PCS", qty: String(panelCount) },
    { description: "Galvanized Iron Rust Proof Customized Elevated Structure", uom: "JOB", qty: "1" },
    { description: `${inverter.label} | WIFI Dongle`, uom: "PCS", qty: "1" },
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
  const waMessage = `Assalam o Alaikum! I generated a custom quote on your site:\n- System: ${result.systemKw}kW (${panelCount} panels)\n- Total Price: ${formatPKR(result.totalClientPricePKR)}\n- Reference ID: #${result.quoteId}\n\n📄 Official PDF Quotation: ${pdfUrl}\n\nI would like to schedule a site survey.${customNote}`;
  const waHref = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(waMessage)}`;

  const today = new Date().toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });

  // Detailed Cost Breakdown — one row per category the backend's
  // ItemizedBreakdown already returns (see lib/db/admin.ts), at exactly
  // the granularity it's actually computed at. Several BOQ rows above
  // (DC Cable / AC Cables / AC Distribution Box) share ONE combined
  // backend figure (cablingAndProtectionPKR) rather than a real per-row
  // price each, so this footer groups them the same way rather than
  // fabricating a three-way split with no real number behind it. Battery
  // is omitted entirely for ONGRID_ZERO_EXPORT (batteryPKR is 0 then, not
  // a real line). The rows always sum to exactly totalClientPricePKR —
  // same already-rounded-lines guarantee calculateSystemPricing's
  // breakdown itself provides, verified live below.
  //
  // A HYBRID_BATTERY quote where the customer explicitly opted out via
  // the Custom Builder's "No Battery" card (Optional Battery, 2026-08-20)
  // ALSO resolves battery to null (same shape as ONGRID_ZERO_EXPORT — see
  // NONE_CODE's doc comment in lib/db/admin.ts), so `battery` alone can't
  // tell the two apart. serviceType still can: only a HYBRID_BATTERY quote
  // with no resolved battery means "opted out," and gets an explicit
  // "Not Included" row instead of silent omission, so the customer sees
  // their opt-out was actually honored, not just missing.
  const batteryOptedOutInHybrid = result.serviceType === "HYBRID_BATTERY" && !battery;
  const costBreakdownRows: { label: string; valuePKR: number; displayOverride?: string }[] = [
    { label: "Solar Panels", valuePKR: result.breakdown.panelsPKR },
    { label: "Inverter", valuePKR: result.breakdown.inverterPKR },
    ...(battery
      ? [{ label: "Lithium Battery", valuePKR: result.breakdown.batteryPKR }]
      : batteryOptedOutInHybrid
        ? [{ label: "Lithium Battery", valuePKR: 0, displayOverride: "Not Included" }]
        : []),
    { label: "Galvanized Mounting Structure", valuePKR: result.breakdown.structurePKR },
    { label: "AC/DC Cables, Distribution Box & Safety Equipment", valuePKR: result.breakdown.cablingAndProtectionPKR },
    { label: "Transportation, Installation & Commissioning", valuePKR: result.breakdown.installationPKR },
    // Civil blocks + earthing/boring + lightning arrestor combined, same
    // grouping reasoning as the cabling line above — a customer can zero
    // out all three (0 is a valid quantity), same "Not Included" treatment
    // as an opted-out battery rather than a confusing "Rs 0" line.
    result.breakdown.siteWorksPKR > 0
      ? { label: "Site Works (Civil, Earthing & Lightning Arrestor)", valuePKR: result.breakdown.siteWorksPKR }
      : { label: "Site Works (Civil, Earthing & Lightning Arrestor)", valuePKR: 0, displayOverride: "Not Included" },
    ...(panelWashing
      ? [{ label: "Panel Washing (One-Time Visit)", valuePKR: result.breakdown.panelWashingPKR }]
      : []),
  ];

  return (
    <div className="animate-fade-up mx-auto my-8 w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-200/60 print:my-0 print:max-w-none print:rounded-none print:shadow-none">
      {/* Screen-only chrome — edit affordance + upload-source badge. */}
      <div className="flex items-center justify-between gap-3 px-6 pt-5 print:hidden">
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3.5 text-xs font-semibold text-violet-700 transition-colors duration-200 hover:border-violet-300 hover:bg-violet-100"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Edit Inputs
        </button>
        {result.billSource !== "MANUAL" && (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" /> From Your Bill
          </span>
        )}
      </div>

      {/* ---- Document Header ---- */}
      <div className="border-b border-slate-200 px-6 pb-6 pt-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-slate-500">
          <span className="font-semibold tracking-wide text-violet-600">Powered by SP - Solar Pixel (Pvt) Ltd.</span>
          <span>
            Quote #{result.quoteId.slice(0, 10).toUpperCase()} · {today}
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
          {result.systemKw} KW <span className="text-violet-600">Sales Quotation</span>
        </h1>
        <p className="mt-1 text-lg font-semibold text-emerald-600">
          Estimated Turnkey Cost: {formatPKR(result.totalClientPricePKR)}
        </p>
      </div>

      {/* ---- Quick facts ---- */}
      <div className="grid grid-cols-3 gap-px bg-slate-200">
        <div className="bg-slate-50 px-3 py-3 text-center sm:px-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Monthly Savings</p>
          <p className="mt-0.5 text-sm font-bold text-emerald-600">{formatPKR(result.estimatedMonthlySavingsPKR)}</p>
        </div>
        <div className="bg-slate-50 px-3 py-3 text-center sm:px-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Payback</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">
            {result.paybackYears !== null ? `${result.paybackYears} yrs` : "—"}
          </p>
        </div>
        <div className="bg-slate-50 px-3 py-3 text-center sm:px-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Live In</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">{result.daysToDeploy} Days</p>
        </div>
      </div>

      {/* ---- Warnings ---- */}
      {(isInverterBottleneck || result.hasCustomRequirements) && (
        <div className="space-y-2 px-6 pt-5 sm:px-8">
          {isInverterBottleneck && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-left text-xs leading-relaxed text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p>
                Note: Your system size is limited to {result.systemKw}kW based on your selected Inverter capacity (
                {formatTrim(inverter.specValue!)}kW). Pick a higher-capacity model in Custom Equipment Builder to
                size up.
              </p>
            </div>
          )}
          {result.hasCustomRequirements && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-left text-xs leading-relaxed text-amber-800">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p>
                <span className="font-semibold">Custom Requirement Noted:</span> our senior engineering team will
                source pricing for your specific equipment request and include it in your final WhatsApp Quotation.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---- BOQ Table ---- */}
      <div className="px-6 pt-5 sm:px-8">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Receipt className="h-3.5 w-3.5 text-violet-600" /> Itemized Quotation
        </p>
        <div className="mt-2.5 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-violet-600 text-white">
                <th className="px-3 py-2.5 font-semibold">Sr No.</th>
                <th className="px-3 py-2.5 font-semibold">Product Description</th>
                <th className="px-3 py-2.5 font-semibold">UOM</th>
                <th className="px-3 py-2.5 text-right font-semibold">Product Qty</th>
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
        <p className="mb-1.5 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Receipt className="h-3.5 w-3.5 text-violet-600" /> Cost Breakdown
        </p>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-xs">
            <tbody>
              {costBreakdownRows.map((row, i) => (
                <tr key={row.label} className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                  <td className="px-3 py-2 text-slate-500">{row.label}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">
                    {row.displayOverride ?? formatPKR(row.valuePKR)}
                  </td>
                </tr>
              ))}
              <tr className="bg-emerald-50">
                <td className="px-3 py-2.5 font-semibold text-emerald-800">Total Turnkey Cost</td>
                <td className="px-3 py-2.5 text-right text-sm font-bold text-emerald-700">
                  {formatPKR(result.totalClientPricePKR)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Footer ---- */}
      <div className="mt-6 border-t border-slate-200 bg-slate-50 px-6 py-6 sm:px-8">
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
          <span className="text-sm font-semibold text-slate-700">Total Price</span>
          <span className="text-xl font-bold text-emerald-600">{formatPKR(result.totalClientPricePKR)}</span>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
          Email: solarpixelpk@gmail.com · Mobile: +92 328 2155550 · Site:{" "}
          <a
            href="https://www.solarpixel.pk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-600 underline-offset-2 hover:underline"
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
            className="glow-cta flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-violet-600 to-purple-600 text-sm font-bold text-white transition-all duration-200 hover:from-violet-500 hover:to-purple-500"
          >
            <MessageCircle className="h-4 w-4" /> Lock In Price on WhatsApp
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-600 transition-colors duration-200 hover:border-violet-300 hover:text-violet-700"
          >
            <Download className="h-4 w-4" /> Download Quotation (PDF)
          </button>
        </div>

        <p className="mt-3 text-center text-[10px] text-slate-500 print:hidden">
          Instant estimate. Your exact price is confirmed after an on-site engineering survey (Rs 5,000 fee applies).
        </p>
      </div>

      <FloatingWhatsAppButton message={waMessage} source="floating_badge_quote_report" quoteId={result.quoteId} />
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
    : `Hi Solar Pixel! Following up on my EV Charger installation quote: ${result.evChargerRatingKw} kW, ${formatPKR(
        result.totalClientPricePKR
      )} turnkey. Please confirm scheduling.`;
  const waHref = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(waMessage)}`;

  return (
    <div className="animate-fade-up rounded-3xl border border-stone-200/80 bg-white p-6 text-center shadow-xl shadow-stone-200/50 print:hidden">
      <button
        type="button"
        onClick={onEdit}
        className="-ml-1 -mt-1 mb-2 flex min-h-11 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3.5 text-xs font-semibold text-violet-700 transition-colors duration-200 hover:border-violet-300 hover:bg-violet-100"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Edit Inputs
      </button>

      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50">
        <CheckCircle2 className="h-6 w-6 text-violet-500" />
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
            value={result.isMinimumFeeApplied ? "Minimum call-out fee" : `${formatPKR(result.costPerPanelPKR)}/panel`}
          />
          <div className="col-span-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
            <p className="text-xs text-stone-500">Total (One-Time Visit)</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{formatPKR(result.oneTimePricePKR)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 text-left">
          <Stat label="Charger Rating" value={`${result.evChargerRatingKw} kW`} />
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
        className="glow-cta mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 py-4 text-sm font-bold text-stone-900 transition-all duration-200 hover:from-amber-500 hover:to-amber-600"
      >
        <MessageCircle className="h-4 w-4" />
        Message Us on WhatsApp
      </a>

      <p className="mt-3 text-[11px] text-stone-500">Instant estimate. Your exact price is confirmed after a free consultation.</p>

      <FloatingWhatsAppButton message={waMessage} source={isWashing ? "floating_badge_panel_washing_report" : "floating_badge_ev_charger_report"} />
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

/** Small L-shaped marks framing each corner of a relatively-positioned
 *  parent — a "viewfinder"/registration-mark accent used on the active
 *  Property Type / System Type / Master Service cards. Purely decorative.
 *  (Formerly also used by the "Why Solar Pixel" features grid, removed
 *  2026-08-20 — this component itself stays, still in active use.) */
function CornerBrackets() {
  const base = "pointer-events-none absolute h-3 w-3 border-violet-300";
  return (
    <span aria-hidden className="contents">
      <span className={`${base} left-0 top-0 rounded-tl-md border-l-2 border-t-2`} />
      <span className={`${base} right-0 top-0 rounded-tr-md border-r-2 border-t-2`} />
      <span className={`${base} bottom-0 left-0 rounded-bl-md border-b-2 border-l-2`} />
      <span className={`${base} bottom-0 right-0 rounded-br-md border-b-2 border-r-2`} />
    </span>
  );
}

// ============================================================================
// Footer
// ============================================================================

// Bang & Olufsen-style luxury footer (Part 4, 2026-08-20 replacement of
// the old plain centered footer). Real, already-established contact
// details only (Email/Phone/Site — the exact same values already quoted
// in the BOQ report footer below) — no fabricated social-media accounts
// or links. Lucide-react 1.31 doesn't ship brand icons (Facebook/
// Instagram/etc. were dropped from the library), which settled that
// question anyway: rather than hand-drawing brand marks for accounts
// that don't exist, "Social" lists the one channel this business
// genuinely uses for that kind of direct engagement (WhatsApp) plus the
// public site URL.
//
// 2026-08-22 (Legal Trust Pages task): "Legal" items are now real links
// — app/about, app/privacy-policy, and app/terms all exist now (see
// components/legal/LegalPageShell.tsx), closing the gap this comment
// used to describe (a styled link that 404s is worse than an honest
// label — that's no longer the tradeoff). Gained a 4th "Company" column
// (About Us + Live Calculator, the latter a plain #calculator hash link
// — works on this page via native anchor scroll, and works from any
// OTHER page via a full navigation back to "/" that lands on the
// section, no JS wiring needed either way).
const WEBSITE_URL = "https://www.solarpixel.pk";
const CONTACT_EMAIL = "solarpixelpk@gmail.com";
const CONTACT_PHONE_DISPLAY = "+92 328 2155550";
const CONTACT_PHONE_TEL = "+923282155550";

function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#0a0714] text-white print:hidden">
      <div className="mx-auto flex max-w-7xl">
        {/* LEFT EDGE: "SOLAR", vertical, bottom-to-top. Hidden below md
            per the brief — at narrow widths there's no room for a full-
            height typographic column without crushing the center
            content, so it drops out entirely rather than being scaled
            down into illegibility. */}
        <div className="hidden shrink-0 border-r border-white/10 md:flex md:items-center md:justify-center md:px-1 lg:px-4">
          <span
            aria-hidden
            className="pointer-events-none select-none whitespace-nowrap font-black uppercase leading-none tracking-tight text-white/[0.07]"
            style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", fontSize: "clamp(3.5rem, 9vw, 8rem)" }}
          >
            Solar
          </span>
        </div>

        {/* CENTER: standard footer link columns */}
        <div className="flex-1 px-6 py-16 sm:px-10 sm:py-20">
          <div className="mx-auto grid max-w-4xl gap-10 text-center sm:grid-cols-2 sm:text-left lg:grid-cols-4">
            <FooterColumn title="Company">
              <FooterLink href="/about" icon={Info}>
                About Us
              </FooterLink>
              <FooterLink href="/#calculator" icon={Calculator}>
                Live Calculator
              </FooterLink>
            </FooterColumn>

            <FooterColumn title="Contact">
              <FooterLink
                href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(GENERAL_INQUIRY_WA_MESSAGE)}`}
                icon={MessageCircle}
                onClick={() => trackWhatsAppClick("footer_contact")}
              >
                WhatsApp
              </FooterLink>
              <FooterLink href={`mailto:${CONTACT_EMAIL}`} icon={Mail}>
                {CONTACT_EMAIL}
              </FooterLink>
              <FooterLink href={`tel:${CONTACT_PHONE_TEL}`} icon={Phone}>
                {CONTACT_PHONE_DISPLAY}
              </FooterLink>
            </FooterColumn>

            <FooterColumn title="Social">
              <FooterLink
                href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(GENERAL_INQUIRY_WA_MESSAGE)}`}
                icon={MessageCircle}
                onClick={() => trackWhatsAppClick("footer_social")}
              >
                Chat with us
              </FooterLink>
              <FooterLink href={WEBSITE_URL} icon={Globe}>
                www.solarpixel.pk
              </FooterLink>
            </FooterColumn>

            <FooterColumn title="Legal">
              <a href="/privacy-policy" className="block text-sm text-white/70 transition-colors duration-200 hover:text-white">
                Privacy Policy
              </a>
              <a href="/terms" className="block text-sm text-white/70 transition-colors duration-200 hover:text-white">
                Terms of Service
              </a>
            </FooterColumn>
          </div>

          <div className="mx-auto mt-14 max-w-3xl border-t border-white/10 pt-6 text-center text-xs text-white/40 sm:text-left">
            <p className="max-w-md sm:mx-0 mx-auto">
              Smart Solar for Residential, Commercial and Industrial. No net billing, no green meters. Just a
              system that goes live fast.
            </p>
            <p className="mt-2">
              © {new Date().getFullYear()} Solar Pixel. Estimates are indicative and confirmed after an on-site
              engineering survey (Rs 5,000 fee applies).
            </p>
          </div>
        </div>

        {/* RIGHT EDGE: "PIXEL", vertical, top-to-bottom */}
        <div className="hidden shrink-0 border-l border-white/10 md:flex md:items-center md:justify-center md:px-1 lg:px-4">
          <span
            aria-hidden
            className="pointer-events-none select-none whitespace-nowrap font-black uppercase leading-none tracking-tight text-white/[0.07]"
            style={{ writingMode: "vertical-rl", fontSize: "clamp(3.5rem, 9vw, 8rem)" }}
          >
            Pixel
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{title}</p>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}

/** Mobile floating WhatsApp CTA — bottom-right, per brief's exact spec
 *  (fixed, 20px from bottom/right, z-50). `lg:hidden` scopes it to
 *  mobile/tablet, matching this file's existing mobile-only breakpoint
 *  convention (see the Mobile-Only Floating Bottom Bar above). `raised`
 *  bumps it above the Complete Solar bottom price bar when that's also
 *  on screen, so the two never visually overlap — both are only ever
 *  rendered together during the input phase (the report screens each
 *  render their OWN copy of this button with the bar's condition simply
 *  false, since neither report view has that bar at all). */
function FloatingWhatsAppButton({ message, source, quoteId, raised }: { message: string; source: string; quoteId?: string; raised?: boolean }) {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsAppClick(source, quoteId)}
      aria-label="Chat with us on WhatsApp"
      className={`fixed right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition-transform duration-200 hover:scale-105 lg:hidden print:hidden ${
        raised ? "bottom-24" : "bottom-5"
      }`}
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}

function FooterLink({
  href,
  icon: Icon,
  onClick,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 text-sm text-white/70 transition-colors duration-200 hover:text-white sm:justify-start"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </a>
  );
}
