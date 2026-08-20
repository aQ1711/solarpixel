/**
 * UI-ONLY placeholder quote math for the new v0-designed wizard
 * (components/wizard/**). Pure client-side arithmetic — no fetch, no
 * Prisma, no import from lib/db/admin.ts — deliberately disconnected
 * from the real quote engine (calculateSystemPricing) so this page can
 * ship as a pure UI port first. Swap `calculateQuote` for a real
 * `/api/quote/calculate` call (see the old app/page.tsx, preserved at
 * _archive/page.wired-production.*.tsx.bak, for the wiring pattern —
 * lead capture, Zod validation, equipment selections, etc.) in the
 * follow-up "wire up the actual API logic" pass.
 */

export type PropertyType = "residential" | "commercial" | "industrial";

export type PanelTier = "value" | "standard" | "premium";
export type InverterTier = "string" | "hybrid" | "premium";

export interface ConfigState {
  propertyType: PropertyType | null;
  monthlyBill: number;
  panelTier: PanelTier;
  inverterTier: InverterTier;
}

export interface QuoteResult {
  systemSizeKw: number;
  panelCount: number;
  turnkeyCost: number;
  monthlySavings: number;
  annualSavings: number;
  paybackYears: number;
  co2OffsetTons: number;
  lineItems: { label: string; detail: string; amount: number }[];
}

/* Assumptions tuned for the Pakistani market */
const TARIFF_PKR_PER_UNIT = 52; // avg blended tariff PKR/kWh
const PEAK_SUN_HOURS = 4.6; // avg daily for most of Pakistan
const PERFORMANCE_RATIO = 0.78;
const PANEL_WATTAGE = 580; // W per panel
const SAVINGS_RATIO = 0.86; // fraction of bill offset

const PANEL_COST_PER_KW: Record<PanelTier, number> = {
  value: 62_000,
  standard: 78_000,
  premium: 98_000,
};

const INVERTER_COST_PER_KW: Record<InverterTier, number> = {
  string: 24_000,
  hybrid: 42_000,
  premium: 58_000,
};

const BOS_COST_PER_KW = 34_000; // mounting, cabling, protections
const INSTALL_COST_PER_KW = 18_000; // labour + net-metering paperwork

export const PROPERTY_LABELS: Record<PropertyType, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
};

export const PANEL_LABELS: Record<PanelTier, string> = {
  value: "Value Tier (Longi / JA)",
  standard: "Standard (Canadian Solar N-Type)",
  premium: "Premium (Jinko Tiger Neo)",
};

export const INVERTER_LABELS: Record<InverterTier, string> = {
  string: "String Inverter (Growatt)",
  hybrid: "Hybrid + Battery Ready (Solis)",
  premium: "Premium Hybrid (Huawei / Sungrow)",
};

export function formatPKR(value: number): string {
  if (value >= 10_000_000) return `Rs ${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `Rs ${(value / 100_000).toFixed(2)} Lac`;
  return `Rs ${Math.round(value).toLocaleString("en-PK")}`;
}

export function calculateQuote(config: ConfigState): QuoteResult {
  const bill = Math.max(config.monthlyBill, 0);

  const monthlyUnits = bill / TARIFF_PKR_PER_UNIT;
  const dailyUnits = monthlyUnits / 30;
  const rawSize = dailyUnits / (PEAK_SUN_HOURS * PERFORMANCE_RATIO);

  const systemSizeKw = Math.max(Math.round(rawSize * 2) / 2, 1); // round to nearest 0.5, min 1kW
  const panelCount = Math.max(Math.ceil((systemSizeKw * 1000) / PANEL_WATTAGE), 2);

  const panelCost = systemSizeKw * PANEL_COST_PER_KW[config.panelTier];
  const inverterCost = systemSizeKw * INVERTER_COST_PER_KW[config.inverterTier];
  const bosCost = systemSizeKw * BOS_COST_PER_KW;
  const installCost = systemSizeKw * INSTALL_COST_PER_KW;

  const turnkeyCost = panelCost + inverterCost + bosCost + installCost;

  const monthlySavings = bill * SAVINGS_RATIO;
  const annualSavings = monthlySavings * 12;
  const paybackYears = annualSavings > 0 ? turnkeyCost / annualSavings : 0;

  const co2OffsetTons = (systemSizeKw * PEAK_SUN_HOURS * 365 * 0.45) / 1000;

  const lineItems = [
    {
      label: "Solar Panels",
      detail: `${panelCount} × ${PANEL_WATTAGE}W · ${PANEL_LABELS[config.panelTier]}`,
      amount: panelCost,
    },
    {
      label: "Inverter",
      detail: INVERTER_LABELS[config.inverterTier],
      amount: inverterCost,
    },
    {
      label: "Mounting & Balance of System",
      detail: "Structure, DC/AC cabling, surge & lightning protection",
      amount: bosCost,
    },
    {
      label: "Installation & Net Metering",
      detail: "Labour, commissioning & DISCO net-metering filing",
      amount: installCost,
    },
  ];

  return {
    systemSizeKw,
    panelCount,
    turnkeyCost,
    monthlySavings,
    annualSavings,
    paybackYears,
    co2OffsetTons,
    lineItems,
  };
}
