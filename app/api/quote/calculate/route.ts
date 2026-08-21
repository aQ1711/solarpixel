import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Sector, ServiceType, BillSource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import {
  calculateSystemPricing,
  calculatePanelWashingQuote,
  getEvChargerInstallationFeePKR,
  PricingConfigurationError,
  type EquipmentSelections,
  type ItemizedBreakdown,
  type ResolvedEquipment,
  type SiteWorksQuantities,
  type PanelWashingSelection,
  type BudgetTier,
} from "@/lib/db/admin";
import { DAYS_TO_DEPLOY_DEFAULT } from "@/lib/constants";

// EV Charger cable pricing has no admin-configurable field yet (unlike
// evChargerInstallationFee) — only the flat base fee lives in
// GlobalPricingSettings. This placeholder rate is flagged the same way
// other documented assumptions in this route are (see
// daytimeUsagePct's per-sector defaults elsewhere in the codebase);
// follow-up would add a real `evChargerCableRatePerMeter` settings field.
const EV_CHARGER_INCLUDED_CABLE_METERS = 10;
const EV_CHARGER_EXTRA_CABLE_RATE_PKR_PER_METER = 500;

// ============================================================================
// Constants — Zero-Export sizing & business defaults
// ============================================================================

/** Blended PKR/unit tariff used for the instant estimate (Business Rule:
 *  "Automated Estimate ... calculated using daytime load and blended PKR
 *  tariffs"). Not a real WAPDA slab lookup — deliberately a single blended
 *  figure for a fast, no-red-tape quote. */
const BLENDED_TARIFF_PKR_PER_UNIT = 52;

/** Average daily generation, kWh produced per kW installed, Pakistan. */
const DAILY_GENERATION_FACTOR = 4.1;

/** Catalog inverter sizes we actually stock/install. Anything above the
 *  largest entry is industrial-custom and rounds up to the nearest 10kW. */
const STANDARD_INVERTER_SIZES_KW = [3, 5, 10, 15, 20, 30, 50, 100] as const;

/** Offset target for the "near-zero bill" comparison tier — sized to
 *  cover ~98% of consumption rather than just the sector-default daytime
 *  share. Deliberately NOT 100%: weather variance, consumption spikes,
 *  and (depending on tariff structure) WAPDA minimum/fixed charges mean
 *  a literal guaranteed PKR-0 bill isn't a defensible claim. The
 *  frontend must label this "Near-Zero Bill" / "up to X% offset", never
 *  "0 bill guaranteed". */
const NEAR_ZERO_BILL_OFFSET_PCT = 0.98;

// ============================================================================
// Zod input schema
// ============================================================================

// Custom Equipment Builder selections — every field is an
// EquipmentOption.code (see /api/equipment-options), or the reserved
// value "OTHER" for "Other / Specific Requirement". Omitted entirely =
// Recommended path; all fields individually optional even when present
// (an omitted field within a Custom selection still falls back to the
// Recommended default for that one component — see
// lib/db/admin.ts's calculateSystemPricing).
const equipmentSelectionsSchema = z.object({
  panelCode: z.string().trim().min(1).max(60).optional(),
  inverterCode: z.string().trim().min(1).max(60).optional(),
  batteryCode: z.string().trim().min(1).max(60).optional(),
  batteryCapacityKwh: z.number().positive().max(200).optional(),
  dcCableCode: z.string().trim().min(1).max(60).optional(),
  acCableCode: z.string().trim().min(1).max(60).optional(),
  breakersCode: z.string().trim().min(1).max(60).optional(),
  structureCode: z.string().trim().min(1).max(60).optional(),
  // "Site Works" quantities (2026-08-20) — customer-adjustable counts,
  // not brand/model codes. int() + nonnegative (0 is valid — "I don't
  // need this item"), capped generously against a fat-fingered entry.
  civilBlockQty: z.number().int().min(0).max(500).optional(),
  earthingBoreQty: z.number().int().min(0).max(500).optional(),
  lightningArrestorQty: z.number().int().min(0).max(500).optional(),
  // Panel Quantity Adjuster (2026-08-20) — clamped server-side to
  // [baselinePanelCount, maxPanelCount] regardless of what's sent here
  // (see calculateSystemPricing); this is just a shape/range check.
  panelQtyOverride: z.number().int().positive().max(5000).optional(),
  // "One-Time Panel Washing Visit" (2026-08-21) — Custom Builder toggle.
  includePanelWashing: z.boolean().optional(),
});

// Target Budget tiers (2026-08-20) — auto-selects inverter/battery
// defaults for this bracket instead of the admin-marked Recommended
// default; see BudgetTier in lib/db/admin.ts. Does NOT change how
// systemKw itself is sized (the real daytime-offset formula is
// unaffected either way).
const BUDGET_TIERS = ["UNDER_1M", "1M_TO_1_5M", "1_5M_PLUS"] as const;

// Which "kind" of request this is — omitted entirely = "SOLAR", so every
// existing Complete Solar caller (which never sends this field) keeps
// hitting the exact same required-field validation and pipeline as
// before this update. PANEL_WASHING/EV_CHARGER skip the solar sizing
// pipeline AND Lead/Quote persistence entirely (see handlePanelWashing/
// handleEvCharger below) — same "no backend persistence for these two"
// boundary the System Upgrades/EV Charger inquiry always had, now just
// backed by a real computed price instead of none at all.
const REQUEST_KINDS = ["SOLAR", "SOLAR_PREVIEW", "PANEL_WASHING", "EV_CHARGER"] as const;

const calculateQuoteSchema = z
  .object({
    requestKind: z.enum(REQUEST_KINDS).optional().default("SOLAR"),

    // ---- SOLAR-only fields — required when requestKind === "SOLAR",
    // enforced below in .superRefine() rather than here, since they must
    // stay valid `.optional()` at the base-schema level for the other
    // two request kinds (and for SOLAR's own live-preview calls, which
    // omit fullName/whatsappPhone entirely — see PANEL_WASHING/EV_CHARGER
    // doc below for why that's the same reasoning). ----
    monthlyBillPKR: z
      .number()
      .positive("monthlyBillPKR must be greater than 0")
      .max(10_000_000, "monthlyBillPKR is unrealistically large")
      .optional(),

    sector: z.nativeEnum(Sector).optional(),

    // Customer's choice for Residential/Commercial (defaults to
    // HYBRID_BATTERY/ONGRID_ZERO_EXPORT respectively if omitted — see
    // resolveServiceType() below). Ignored for INDUSTRIAL even if sent;
    // the server forces ONGRID_ZERO_EXPORT there regardless, it never
    // trusts the client for that part.
    serviceType: z.nativeEnum(ServiceType).optional(),

    /** e.g. 0.7 for 70% of consumption happening during daylight hours. */
    daytimeUsagePct: z
      .number()
      .min(0.05, "daytimeUsagePct must be at least 5%")
      .max(1, "daytimeUsagePct cannot exceed 100%")
      .optional(),

    // Set by the frontend based on how monthlyBillPKR was obtained — typed
    // in, or extracted from an uploaded bill (see /api/bill-upload). Only
    // ever drives a cosmetic badge on the result screen, never used in
    // pricing or any security-relevant decision, so a client spoofing it
    // only misleads themselves. If that stops being true, it needs real
    // server-side reverification instead of trusting the client flag as-is.
    billSource: z.nativeEnum(BillSource).optional().default("MANUAL"),

    // Public URL of an uploaded bill file (PDF/photo), from /api/bill-upload's
    // response — stored on the Quote for the Super Admin to view later, never
    // read back or fetched server-side, so this only needs a shape check
    // (must be one of our own saved-upload paths, not an arbitrary string).
    billFileUrl: z
      .string()
      .trim()
      .max(300)
      .regex(/^\/uploads\//, "billFileUrl must be a saved upload path")
      .optional(),

    // Omitted = Recommended path. Present = Custom Equipment Builder path.
    equipmentSelections: equipmentSelectionsSchema.optional(),

    // Target Budget tier (2026-08-20) — see BUDGET_TIERS above. Optional;
    // omitted means the ordinary admin-configured Recommended default
    // resolves the inverter/battery, unchanged from before this feature.
    targetBudgetTier: z.enum(BUDGET_TIERS).optional(),

    // Single-step lead capture: for a SOLAR *submission* the lead is
    // persisted BEFORE the price is shown, so name + WhatsApp are
    // required (prisma/schema.prisma has Lead.fullName/phone as NOT
    // NULL — this route creates that row). Optional at the base schema
    // level so a SOLAR *live preview* (report-step "Edit Inputs" re-runs,
    // if ever added) or a PANEL_WASHING/EV_CHARGER request — neither of
    // which persists a Lead — can omit them entirely.
    fullName: z.string().trim().min(2).max(120).optional(),
    whatsappPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{10,15}$/, "Enter a valid WhatsApp number")
      .optional(),
    city: z.string().trim().min(2).max(80).default("Lahore"),

    // ---- PANEL_WASHING-only fields ----
    // "Monthly Subscription" (a 20%-off recurring option) was removed
    // 2026-08-21 — this is always a one-time visit now, so there's no
    // frequency field to accept.
    panelCount: z.number().int().positive().max(2000).optional(),

    // ---- EV_CHARGER-only fields ----
    evChargerRatingKw: z.number().positive().max(100).optional(),
    /** Total cable run — the first EV_CHARGER_INCLUDED_CABLE_METERS are
     *  included in the base fee, only the excess is charged. Omitted =
     *  assume the included distance is enough. */
    evChargerCableDistanceMeters: z.number().positive().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.requestKind === "SOLAR" || data.requestKind === "SOLAR_PREVIEW") {
      if (data.monthlyBillPKR === undefined) {
        ctx.addIssue({ code: "custom", path: ["monthlyBillPKR"], message: "monthlyBillPKR is required" });
      }
      if (data.sector === undefined) {
        ctx.addIssue({ code: "custom", path: ["sector"], message: "sector is required" });
      }
      if (data.daytimeUsagePct === undefined) {
        ctx.addIssue({ code: "custom", path: ["daytimeUsagePct"], message: "daytimeUsagePct is required" });
      }
      // fullName/whatsappPhone are ONLY required for a real SOLAR
      // submission (the one that persists a Lead) — SOLAR_PREVIEW is the
      // live-preview variant the dashboard calls on every bill/equipment
      // change, and never has (or needs) contact details yet.
      if (data.requestKind === "SOLAR") {
        if (data.fullName === undefined) {
          ctx.addIssue({ code: "custom", path: ["fullName"], message: "fullName is required" });
        }
        if (data.whatsappPhone === undefined) {
          ctx.addIssue({ code: "custom", path: ["whatsappPhone"], message: "whatsappPhone is required" });
        }
      }
    } else if (data.requestKind === "PANEL_WASHING") {
      if (data.panelCount === undefined) {
        ctx.addIssue({ code: "custom", path: ["panelCount"], message: "panelCount is required" });
      }
    } else if (data.requestKind === "EV_CHARGER") {
      if (data.evChargerRatingKw === undefined) {
        ctx.addIssue({ code: "custom", path: ["evChargerRatingKw"], message: "evChargerRatingKw is required" });
      }
    }
  });

type CalculateQuoteInput = z.infer<typeof calculateQuoteSchema>;

// ============================================================================
// Market-reality service type lock (2026, revised)
// ============================================================================
// Industrial is On-Grid exclusively — battery economics don't work at
// that load scale — and that lock is enforced HERE, server-side, as the
// actual source of truth (never trust the client for something pricing
// depends on). Residential/Commercial are genuinely the customer's
// choice: Residential defaults to HYBRID_BATTERY (recommended, for
// outage backup — the UI warns when a Residential customer opts into
// On-Grid instead), Commercial defaults to ONGRID_ZERO_EXPORT. Both only
// need a default because the field is optional on the wire.

function resolveServiceType(sector: Sector, requestedServiceType: ServiceType | undefined): ServiceType {
  if (sector === "INDUSTRIAL") return "ONGRID_ZERO_EXPORT";
  if (requestedServiceType === "HYBRID_BATTERY" || requestedServiceType === "ONGRID_ZERO_EXPORT") {
    return requestedServiceType;
  }
  return sector === "RESIDENTIAL" ? "HYBRID_BATTERY" : "ONGRID_ZERO_EXPORT";
}

// ============================================================================
// Zero-Export sizing math
// ============================================================================

function roundUpToStandardInverterSize(rawKw: number): number {
  const match = STANDARD_INVERTER_SIZES_KW.find((size) => size >= rawKw);
  if (match !== undefined) return match;
  // 100kW+ industrial: round up to the nearest 10kW block.
  return Math.ceil(rawKw / 10) * 10;
}

function calculateSystemSize(monthlyBillPKR: number, daytimeUsagePct: number) {
  const monthlyUnits = monthlyBillPKR / BLENDED_TARIFF_PKR_PER_UNIT;
  const requiredDailyDaytimeUnits = (monthlyUnits / 30) * daytimeUsagePct;
  // Un-rounded kW needed to offset that daytime load — also the value we
  // persist as Quote.estimatedDaytimeLoadKw. Sizing math is unchanged by
  // serviceType — HYBRID_BATTERY adds hardware cost (see
  // calculateSystemPricing), not a different panel-sizing target; sizing
  // panels specifically to also charge a battery for evening backup is a
  // more sophisticated follow-up, not implemented here.
  const rawKwRequired = requiredDailyDaytimeUnits / DAILY_GENERATION_FACTOR;
  const systemKw = roundUpToStandardInverterSize(rawKwRequired);

  return { requiredDailyDaytimeUnits, rawKwRequired, systemKw };
}

function calculateSavingsAndPayback(requiredDailyDaytimeUnits: number, totalClientPricePKR: number) {
  // Zero-export offsets — never exports — so realistic monthly savings is
  // the daytime units offset × the blended tariff. (Algebraically this
  // reduces to monthlyBillPKR × daytimeUsagePct — kept in unit form here
  // so it stays traceable back through the sizing math above.)
  const estimatedMonthlySavingsPKR = Math.round(requiredDailyDaytimeUnits * 30 * BLENDED_TARIFF_PKR_PER_UNIT);

  const paybackYears =
    estimatedMonthlySavingsPKR > 0
      ? Math.round((totalClientPricePKR / (estimatedMonthlySavingsPKR * 12)) * 10) / 10
      : null;

  return { estimatedMonthlySavingsPKR, paybackYears };
}

function generateQuoteNumber(): string {
  return `SP-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

interface PricedTier {
  offsetPct: number;
  systemKw: number;
  rawKwRequired: number;
  totalClientPricePKR: number;
  estimatedMonthlySavingsPKR: number;
  paybackYears: number | null;
  hasCustomRequirements: boolean;
  breakdown: ItemizedBreakdown;
  resolvedEquipment: ResolvedEquipment;
  siteWorks: SiteWorksQuantities;
  panelWashing: PanelWashingSelection | null;
}

/** Sizes + prices one tier end-to-end (used for both the recommended
 *  quote and the "near-zero bill" comparison tier below) — one place so
 *  the two can never drift apart in how they compute a price. Passing
 *  the SAME `selections` into both tiers means the near-zero comparison
 *  reflects "same equipment, bigger system," not a silent reset to
 *  Recommended defaults. */
async function priceTier(
  monthlyBillPKR: number,
  offsetPct: number,
  sector: Sector,
  serviceType: ServiceType,
  selections: EquipmentSelections | undefined,
  targetBudgetTier: BudgetTier | undefined
): Promise<PricedTier> {
  const { requiredDailyDaytimeUnits, rawKwRequired, systemKw } = calculateSystemSize(monthlyBillPKR, offsetPct);
  const { totalClientPricePKR, hasCustomRequirements, breakdown, resolvedEquipment, siteWorks, panelWashing } = await calculateSystemPricing(
    systemKw,
    sector,
    serviceType,
    selections,
    targetBudgetTier
  );
  const { estimatedMonthlySavingsPKR, paybackYears } = calculateSavingsAndPayback(
    requiredDailyDaytimeUnits,
    totalClientPricePKR
  );
  return {
    offsetPct,
    systemKw,
    rawKwRequired,
    totalClientPricePKR,
    estimatedMonthlySavingsPKR,
    paybackYears,
    hasCustomRequirements,
    breakdown,
    resolvedEquipment,
    siteWorks,
    panelWashing,
  };
}

// ============================================================================
// POST /api/quote/calculate
// ============================================================================

export async function POST(req: NextRequest) {
  // Top-level guardrail: ANY unhandled exception below (a DB outage, a
  // driver error, a bug) must still resolve to a controlled JSON
  // response — never an empty body / framework-default error page that
  // the frontend can't parse, and never a raw error message that might
  // reference internal infrastructure.
  try {
    return await handleCalculateQuote(req);
  } catch (err) {
    console.error("[POST /api/quote/calculate] unhandled error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

async function handleCalculateQuote(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = calculateQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const input: CalculateQuoteInput = parsed.data;

  // PANEL_WASHING/EV_CHARGER are a completely different, much smaller
  // pricing shape — no system sizing, no Lead/Quote persistence — so
  // they branch off entirely before any of the SOLAR-specific logic
  // below (which is otherwise byte-for-byte unchanged from before this
  // update, guaranteeing existing Complete Solar behavior stays intact).
  if (input.requestKind === "PANEL_WASHING") {
    return handlePanelWashingQuote(input);
  }
  if (input.requestKind === "EV_CHARGER") {
    return handleEvChargerQuote(input);
  }

  // superRefine already guarantees these 3 are present for both SOLAR and
  // SOLAR_PREVIEW (the only kinds that reach this point — PANEL_WASHING/
  // EV_CHARGER already returned above) — this block is pure TypeScript
  // narrowing, not a real runtime path, and gives every reference below
  // a plain non-optional local instead of an `input.x!` assertion at
  // each call site. fullName/whatsappPhone are narrowed separately below,
  // only on the persisting SOLAR path.
  if (input.monthlyBillPKR === undefined || input.sector === undefined || input.daytimeUsagePct === undefined) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  const { monthlyBillPKR, sector, daytimeUsagePct } = input;
  const isPreview = input.requestKind === "SOLAR_PREVIEW";

  const serviceType = resolveServiceType(sector, input.serviceType);

  // 1 & 2. Zero-export sizing + pricing for the recommended tier — routed
  //        entirely through the admin-only boundary. Raw vendor costs and
  //        margin % never enter this function's scope.
  let recommended: PricedTier;
  try {
    recommended = await priceTier(
      monthlyBillPKR,
      daytimeUsagePct,
      sector,
      serviceType,
      input.equipmentSelections,
      input.targetBudgetTier
    );
  } catch (err) {
    if (err instanceof PricingConfigurationError) {
      // Log full internal detail server-side only; the client gets a
      // generic message with zero information about vendor_private.
      console.error("[POST /api/quote/calculate] pricing configuration error:", err.message);
      return NextResponse.json(
        { error: "Pricing is temporarily unavailable. Please try again shortly." },
        { status: 503 }
      );
    }
    throw err;
  }

  // 2b. "Near-Zero Bill" comparison tier — same pricing pipeline, just
  //     sized for a much higher offset target. Purely informational: NOT
  //     persisted as its own Quote/Lead (it's a what-if comparison, not a
  //     binding estimate), and non-fatal if it can't be priced — the
  //     recommended tier above still succeeds either way.
  let nearZeroBillTier: PricedTier | null = null;
  if (daytimeUsagePct < NEAR_ZERO_BILL_OFFSET_PCT) {
    try {
      nearZeroBillTier = await priceTier(
        monthlyBillPKR,
        NEAR_ZERO_BILL_OFFSET_PCT,
        sector,
        serviceType,
        input.equipmentSelections,
        input.targetBudgetTier
      );
    } catch (err) {
      if (err instanceof PricingConfigurationError) {
        console.error("[POST /api/quote/calculate] near-zero tier pricing error:", err.message);
      } else {
        throw err;
      }
    }
  }

  // 3. Persist Lead + Quote via the PUBLIC client (app_public_role) only —
  //    skipped entirely for SOLAR_PREVIEW. The dashboard calls that variant
  //    on every bill/sector/equipment change (debounced), so persisting on
  //    every keystroke would spam the leads table with incomplete rows
  //    (no contact info yet — that's only collected right before the real
  //    "SOLAR" submit). This write path never touches vendor_private.
  let quoteId: string | null = null;
  if (!isPreview) {
    // superRefine guarantees these 2 are present for a real (non-preview)
    // SOLAR submission.
    if (input.fullName === undefined || input.whatsappPhone === undefined) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const { fullName, whatsappPhone } = input;
    try {
      const quote = await prisma.$transaction(async (tx) => {
        const lead = await tx.lead.create({
          data: {
            fullName,
            phone: whatsappPhone,
            city: input.city,
            sector,
            source: "WEBSITE",
            monthlyBillRs: monthlyBillPKR,
          },
        });

        return tx.quote.create({
          data: {
            quoteNumber: generateQuoteNumber(),
            leadId: lead.id,
            sector,
            serviceType,
            status: "AUTOMATED_ESTIMATE",
            monthlyBillRs: monthlyBillPKR,
            blendedTariffRsPerUnit: BLENDED_TARIFF_PKR_PER_UNIT,
            estimatedDaytimeLoadKw: recommended.rawKwRequired,
            estimatedSystemSizeKw: recommended.systemKw,
            automatedEstimatePriceRs: recommended.totalClientPricePKR,
            billSource: input.billSource,
            uploadedBillFileUrl: input.billFileUrl ?? undefined,
            // Persisted as the EFFECTIVE tier ("no preference" -> the same
            // "UNDER_1M" it was actually priced under, per
            // calculateSystemPricing's targetBudgetTier doc comment) so
            // the Checker's exact-BOQ pass (calculateAdminBoqPricing) can
            // resolve the identical equipment default later, rather than
            // silently re-adding a battery cost on approval — see
            // Quote.targetBudgetTier's doc comment in schema.prisma.
            targetBudgetTier: input.targetBudgetTier ?? "UNDER_1M",
            equipmentSelections: input.equipmentSelections ?? undefined,
            // Cost-free snapshots of exactly what was priced — see their
            // doc comments in schema.prisma. `as unknown as Prisma.InputJsonValue`
            // matches the cast Prisma's own Json columns need for a typed
            // (not `any`) object — both DTOs are plain, JSON-serializable
            // interfaces (numbers/strings/null only).
            resolvedEquipmentSnapshot: recommended.resolvedEquipment as unknown as Prisma.InputJsonValue,
            breakdownSnapshot: recommended.breakdown as unknown as Prisma.InputJsonValue,
          },
        });
      });
      quoteId = quote.id;
    } catch (err) {
      console.error("[POST /api/quote/calculate] failed to persist lead/quote:", err);
      return NextResponse.json({ error: "Could not save your quote. Please try again." }, { status: 500 });
    }
  }

  // 4. Output contract. No raw costs, no margin %, no internal ids beyond
  //    the quote's own public id. `quoteId` is null for a preview (nothing
  //    was persisted) — the frontend must never treat a preview response
  //    as a bookable quote.
  return NextResponse.json({
    kind: isPreview ? "SOLAR_PREVIEW" : "SOLAR",
    quoteId,
    systemKw: recommended.systemKw,
    serviceType,
    totalClientPricePKR: recommended.totalClientPricePKR,
    estimatedMonthlySavingsPKR: recommended.estimatedMonthlySavingsPKR,
    paybackYears: recommended.paybackYears,
    offsetPct: daytimeUsagePct,
    daysToDeploy: DAYS_TO_DEPLOY_DEFAULT,
    billSource: input.billSource,
    monthlyBillPKR,
    hasCustomRequirements: recommended.hasCustomRequirements,
    breakdown: recommended.breakdown,
    equipment: recommended.resolvedEquipment,
    siteWorks: recommended.siteWorks,
    panelWashing: recommended.panelWashing,
    nearZeroBillTier: nearZeroBillTier && {
      systemKw: nearZeroBillTier.systemKw,
      totalClientPricePKR: nearZeroBillTier.totalClientPricePKR,
      estimatedMonthlySavingsPKR: nearZeroBillTier.estimatedMonthlySavingsPKR,
      paybackYears: nearZeroBillTier.paybackYears,
      offsetPct: nearZeroBillTier.offsetPct,
    },
  });
}

// ============================================================================
// Panel Washing & EV Charger — small, standalone add-on quotes. No system
// sizing, no Lead/Quote persistence (same "WhatsApp inquiry, not a
// binding Quote row" boundary these two service types always had — see
// project memory's open-gaps note on this) — just a real computed price
// from lib/db/admin.ts's calculation primitives instead of none at all.
// Used for both the wizard's live debounced preview (fullName/
// whatsappPhone omitted) and the final pre-WhatsApp calculation (present).
// ============================================================================

async function handlePanelWashingQuote(input: CalculateQuoteInput): Promise<NextResponse> {
  // superRefine guarantees panelCount is present for this requestKind.
  const panelCount = input.panelCount!;
  // No sector-selection UI exists for this flow (see app/page.tsx) —
  // defaults to Residential, the same sector the wizard's `sector` state
  // itself defaults to.
  const sector = input.sector ?? "RESIDENTIAL";

  try {
    const quote = await calculatePanelWashingQuote(panelCount);
    // The REAL tier rate, not `rawCostPKR / panelCount` — those two only
    // agree when the minimum visit fee floor DIDN'T kick in (2026-08-21
    // tiered pricing); dividing a floored total back out would silently
    // report a fabricated "effective" per-panel rate instead of the rate
    // that actually applied.
    const costPerPanelPKR = quote.ratePerPanel;
    // Exactly the backend's tiered rate — no margin/percentage added on
    // top (2026-08-21, explicit instruction; see
    // calculatePanelWashingQuote's doc comment in lib/db/admin.ts).
    const oneTimePricePKR = quote.clientPricePKR;

    return NextResponse.json({
      kind: "PANEL_WASHING",
      panelCount,
      sector,
      costPerPanelPKR,
      isMinimumFeeApplied: quote.isMinimumFeeApplied,
      oneTimePricePKR,
      totalClientPricePKR: oneTimePricePKR,
    });
  } catch (err) {
    if (err instanceof PricingConfigurationError) {
      console.error("[POST /api/quote/calculate] panel washing pricing error:", err.message);
      return NextResponse.json(
        { error: "Pricing is temporarily unavailable. Please try again shortly." },
        { status: 503 }
      );
    }
    throw err;
  }
}

async function handleEvChargerQuote(input: CalculateQuoteInput): Promise<NextResponse> {
  // superRefine guarantees evChargerRatingKw is present for this requestKind.
  const evChargerRatingKw = input.evChargerRatingKw!;
  const cableDistanceMeters = input.evChargerCableDistanceMeters ?? EV_CHARGER_INCLUDED_CABLE_METERS;
  const extraCableMeters = Math.max(0, cableDistanceMeters - EV_CHARGER_INCLUDED_CABLE_METERS);
  const extraCablePKR = Math.round(extraCableMeters * EV_CHARGER_EXTRA_CABLE_RATE_PKR_PER_METER);

  const baseInstallationFeePKR = await getEvChargerInstallationFeePKR();
  const totalClientPricePKR = Math.round(baseInstallationFeePKR + extraCablePKR);

  return NextResponse.json({
    kind: "EV_CHARGER",
    evChargerRatingKw,
    cableDistanceMeters,
    includedCableMeters: EV_CHARGER_INCLUDED_CABLE_METERS,
    extraCableMeters,
    extraCablePKR,
    baseInstallationFeePKR,
    totalClientPricePKR,
  });
}
