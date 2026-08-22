import "server-only";
import { prisma } from "@/lib/db/client";

/**
 * Market Watch ticker visibility toggles (2026-08-22) — see
 * TickerSettings's doc comment in schema.prisma for why this lives in
 * its own small file using the PUBLIC prisma client (lib/db/client.ts),
 * not lib/db/admin.ts: there's no vendor-cost boundary to cross here,
 * just a plain display-config singleton the anonymous storefront reads
 * directly (via /api/equipment-options) and a Super Admin edits (via
 * /api/admin/ticker-settings).
 */

export interface TickerSettingsDTO {
  showSolarPanels: boolean;
  showOnGridInverters: boolean;
  showHybridInverters: boolean;
  showBatteries: boolean;
}

/** Every row defaults to visible — a fresh/unseeded DB shows every
 *  ticker row rather than silently going blank. */
const DEFAULT_TICKER_SETTINGS: TickerSettingsDTO = {
  showSolarPanels: true,
  showOnGridInverters: true,
  showHybridInverters: true,
  showBatteries: true,
};

export async function getTickerSettings(): Promise<TickerSettingsDTO> {
  const row = await prisma.tickerSettings.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!row) return DEFAULT_TICKER_SETTINGS;
  return {
    showSolarPanels: row.showSolarPanels,
    showOnGridInverters: row.showOnGridInverters,
    showHybridInverters: row.showHybridInverters,
    showBatteries: row.showBatteries,
  };
}

export interface UpdateTickerSettingsInput {
  showSolarPanels?: boolean;
  showOnGridInverters?: boolean;
  showHybridInverters?: boolean;
  showBatteries?: boolean;
  updatedById: string;
}

/** Find-the-one-row-update-in-place, same pattern as
 *  updateGlobalPricingSettings in lib/db/admin.ts — creates the
 *  singleton on first write if it doesn't exist yet. */
export async function updateTickerSettings(input: UpdateTickerSettingsInput): Promise<TickerSettingsDTO> {
  const existing = await prisma.tickerSettings.findFirst({ orderBy: { updatedAt: "desc" } });
  const current = existing
    ? {
        showSolarPanels: existing.showSolarPanels,
        showOnGridInverters: existing.showOnGridInverters,
        showHybridInverters: existing.showHybridInverters,
        showBatteries: existing.showBatteries,
      }
    : DEFAULT_TICKER_SETTINGS;

  const merged: TickerSettingsDTO = {
    showSolarPanels: input.showSolarPanels ?? current.showSolarPanels,
    showOnGridInverters: input.showOnGridInverters ?? current.showOnGridInverters,
    showHybridInverters: input.showHybridInverters ?? current.showHybridInverters,
    showBatteries: input.showBatteries ?? current.showBatteries,
  };

  if (existing) {
    await prisma.tickerSettings.update({ where: { id: existing.id }, data: { ...merged, updatedById: input.updatedById } });
  } else {
    await prisma.tickerSettings.create({ data: { ...merged, updatedById: input.updatedById } });
  }

  return merged;
}
