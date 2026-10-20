/**
 * Custom Quotations (2026-10-20): shared, server-safe types. Only SELLING
 * prices appear anywhere in these types; no cost or margin ever reaches a
 * Custom Quotation creator.
 */

export type QuoteSector = "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL";

/** One catalog item the creator can add, with its locked unit price. */
export interface CatalogItemDTO {
  code: string;
  componentType: string;
  label: string;
  brand: string | null;
  specValue: number | null;
  unitLabel: string;
  unitPricePKR: number;
  inStock: boolean;
}

export interface CustomQuotationItemDTO {
  id: string;
  componentType: string;
  itemCode: string;
  label: string;
  brand: string | null;
  unitLabel: string;
  quantity: number;
  unitPricePKR: number;
  lineTotalPKR: number;
}

/** One entry in a quotation's version history. */
export interface QuotationVersionDTO {
  id: string;
  version: number;
  versionNote: string | null;
  totalPKR: number;
  createdByName: string;
  createdAt: string;
}

export interface CustomQuotationDTO {
  id: string;
  quotationNumber: string;
  /** 1 for the original; each edit adds the next number. */
  version: number;
  versionNote: string | null;
  /** True when no newer version of this quotation exists. */
  isLatest: boolean;
  /** Every version of this quotation, oldest first (detail view only). */
  versions?: QuotationVersionDTO[];
  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerAddress: string | null;
  sector: QuoteSector;
  notes: string | null;
  totalPKR: number;
  createdByName: string;
  createdAt: string;
  items: CustomQuotationItemDTO[];
}

export const SECTOR_LABEL: Record<QuoteSector, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INDUSTRIAL: "Industrial",
};

/** Catalog grouping headings, in the order they appear in the picker. */
export const COMPONENT_GROUPS: { type: string; label: string }[] = [
  { type: "INVERTER", label: "Inverters" },
  { type: "BATTERY", label: "Batteries" },
  { type: "SOLAR_PANEL", label: "Solar panels" },
  { type: "EV_CHARGER", label: "EV chargers" },
  { type: "MOUNTING_STRUCTURE", label: "Mounting structure" },
  { type: "DC_CABLE", label: "DC cabling" },
  { type: "AC_CABLE", label: "AC cabling" },
  { type: "BREAKERS", label: "Protection and breakers" },
  { type: "LABOR", label: "Installation and labour" },
];

/** A catalog code is only unique within a category (DC and AC cabling share
 *  codes), so an item is identified by category + code. */
export function itemKey(item: { componentType: string; code: string }): string {
  return `${item.componentType}::${item.code}`;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineTotalPKR(quantity: number, unitPricePKR: number): number {
  return roundMoney(quantity * unitPricePKR);
}
