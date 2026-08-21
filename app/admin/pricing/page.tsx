"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Star,
  X,
  Check,
  AlertTriangle,
  Sun,
  Zap,
  BatteryCharging,
  Cable,
  Pencil,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { AccessGate } from "@/components/internal/AccessGate";
import { internalFetch } from "@/lib/internal/access";
import { formatGoogleDriveLink } from "@/lib/utils/googleDrive";

// ============================================================================
// /admin/pricing — Equipment & Pricing Control Engine.
//
// Deliberately LIGHT-themed, unlike /maker/survey and /admin/checker
// (both dark, via the --color-* tokens in globals.css) — an explicit ask
// for this page, not an oversight; see project memory for the established
// dark-internal/light-public convention this intentionally departs from.
//
// Manages the SAME EquipmentOption + RawVendorCost + MarginRule data the
// live quote calculator reads (via lib/db/admin.ts's material-catalog
// functions) — there is no separate "MaterialCatalog" table. A save here
// changes real pricing on the next quote calculated, immediately.
// ============================================================================

type ComponentType = "SOLAR_PANEL" | "INVERTER" | "BATTERY" | "DC_CABLE" | "AC_CABLE" | "BREAKERS";
type ServiceType = "HYBRID_BATTERY" | "ONGRID_ZERO_EXPORT";
type CostUnit = "PER_WATT" | "PER_METER" | "PER_KWH" | "PER_UNIT" | "PER_PIECE" | "LUMP_SUM";
type Sector = "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL";

interface SpecEntry {
  key: string;
  value: string;
}

interface MaterialItem {
  id: string;
  componentType: ComponentType;
  code: string;
  label: string;
  brand: string | null;
  specValue: number | null;
  applicableServiceType: ServiceType | null;
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
  customerPricePreviewPKR: number | null;
  /** Google Drive direct-view links — see formatGoogleDriveLink in
   *  lib/utils/googleDrive.ts for the normalized shape. */
  logoUrl: string | null;
  brochureUrl: string | null;
  /** Ordered comparison-spec key/value pairs, edited via the Add/Edit
   *  Material modal's Dynamic Specs Builder. */
  specs: SpecEntry[] | null;
}

/** The 5 admin-editable Panel Washing rate fields (2026-08-21 tiered
 *  pricing) — used as a single `onSaveWashingRate(field, v)` callback
 *  rather than 5 separate props, same "one callback, field as an
 *  argument" pattern `onSaveMargin(sector, v)` already uses for the 3
 *  sector margins. */
type WashingRateField =
  | "washingRateTier1PerPanel"
  | "washingRateTier2PerPanel"
  | "washingRateTier3PerPanel"
  | "washingRateTier4PerPanel"
  | "washingMinimumVisitFeePKR";

interface GlobalRules {
  structureCostPerWatt: number;
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
  sectorMargins: Record<Sector, number>;
}

interface Admin {
  id: string;
  name: string;
}

const SECTORS: Sector[] = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL"];
const SECTOR_LABEL: Record<Sector, string> = { RESIDENTIAL: "Residential", COMMERCIAL: "Commercial", INDUSTRIAL: "Industrial" };

const UNIT_LABEL: Record<CostUnit, string> = {
  PER_WATT: "Per-Watt",
  PER_METER: "Per-Meter",
  PER_KWH: "Per-kWh",
  PER_UNIT: "Per-Unit",
  PER_PIECE: "Per-Piece",
  LUMP_SUM: "Fixed / Lump Sum",
};
const UNIT_SUFFIX: Record<CostUnit, string> = {
  PER_WATT: "/W",
  PER_METER: "/m",
  PER_KWH: "/kWh",
  PER_UNIT: "/unit",
  PER_PIECE: "/pc",
  LUMP_SUM: " flat",
};

type TabKey = "SOLAR_PANEL" | "INVERTER" | "BATTERY" | "CABLES_BREAKERS";
const TABS: { key: TabKey; label: string; emoji: string; componentTypes: ComponentType[] }[] = [
  { key: "SOLAR_PANEL", label: "Solar Panels", emoji: "☀️", componentTypes: ["SOLAR_PANEL"] },
  { key: "INVERTER", label: "Inverters", emoji: "⚡", componentTypes: ["INVERTER"] },
  { key: "BATTERY", label: "Lithium Batteries", emoji: "🔋", componentTypes: ["BATTERY"] },
  { key: "CABLES_BREAKERS", label: "Cables & Breakers", emoji: "🔌", componentTypes: ["DC_CABLE", "AC_CABLE", "BREAKERS"] },
];

const pkr = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const formatPKR = (n: number) => pkr.format(n);

// ============================================================================
// Toast notifications — minimal, no new dependency
// ============================================================================

interface ToastMessage {
  id: number;
  type: "success" | "error";
  text: string;
}

function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  function push(type: ToastMessage["type"], text: string) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }
  return { toasts, pushSuccess: (text: string) => push("success", text), pushError: (text: string) => push("error", text) };
}

function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-fade-up pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
            t.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {t.type === "success" ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function PricingAdminPage() {
  return (
    <AccessGate role="ADMIN" title="Equipment & Pricing Control Engine">
      {({ onUnauthorized }) => <PricingDashboard onUnauthorized={onUnauthorized} />}
    </AccessGate>
  );
}

function PricingDashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [items, setItems] = useState<MaterialItem[] | null>(null);
  const [globalRules, setGlobalRules] = useState<GlobalRules | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [actingAdminId, setActingAdminId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("SOLAR_PANEL");
  // "closed" | "create" | an item being edited — one modal component
  // (MaterialModal below) serves both Add and Edit.
  const [modalState, setModalState] = useState<{ mode: "closed" } | { mode: "create" } | { mode: "edit"; item: MaterialItem }>({
    mode: "closed",
  });
  const { toasts, pushSuccess, pushError } = useToasts();

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const [pricingRes, adminsRes] = await Promise.all([
        internalFetch("ADMIN", "/api/admin/pricing"),
        internalFetch("ADMIN", "/api/admin/checker/admins"),
      ]);
      if (pricingRes.status === 401 || adminsRes.status === 401) return onUnauthorized();

      const pricingData = await pricingRes.json();
      const adminsData = await adminsRes.json();
      if (!pricingRes.ok) throw new Error(pricingData?.error ?? "Could not load pricing data.");
      if (!adminsRes.ok) throw new Error(adminsData?.error ?? "Could not load admins.");

      setItems(pricingData.items ?? []);
      setGlobalRules(pricingData.globalRules ?? null);
      setAdmins(adminsData.admins ?? []);
      setActingAdminId((prev) => prev || adminsData.admins?.[0]?.id || "");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(loadAll, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveGlobalRules(patch: { structureCostPerWatt?: number; sectorMargins?: Partial<Record<Sector, number>> }) {
    if (!actingAdminId) {
      pushError("Select an admin identity before saving.");
      return false;
    }
    try {
      const res = await internalFetch("ADMIN", "/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "UPDATE_GLOBAL_RULES", updatedById: actingAdminId, ...patch }),
      });
      if (res.status === 401) return onUnauthorized(), false;
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed.");
      setGlobalRules(data.globalRules);
      pushSuccess("Global rate updated.");
      return true;
    } catch (err) {
      pushError(err instanceof Error ? err.message : "Save failed.");
      return false;
    }
  }

  // Sector installation rates + EV Charger/Panel Washing add-on rates —
  // POST /api/admin/pricing/rules, a separate endpoint from
  // saveGlobalRules above (see GlobalPricingSettings's doc comment in
  // schema.prisma for why).
  async function saveGlobalPricingRates(patch: {
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
  }) {
    if (!actingAdminId) {
      pushError("Select an admin identity before saving.");
      return false;
    }
    try {
      const res = await internalFetch("ADMIN", "/api/admin/pricing/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedById: actingAdminId, ...patch }),
      });
      if (res.status === 401) return onUnauthorized(), false;
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed.");
      setGlobalRules(data.globalRules);
      pushSuccess("Rate updated.");
      return true;
    } catch (err) {
      pushError(err instanceof Error ? err.message : "Save failed.");
      return false;
    }
  }

  async function saveMaterial(
    id: string,
    patch: {
      vendorCostRs?: number;
      marginPercentOverride?: number | null;
      isDefault?: boolean;
      inStock?: boolean;
      label?: string;
      brand?: string | null;
      logoUrl?: string | null;
      brochureUrl?: string | null;
      specs?: SpecEntry[] | null;
    }
  ) {
    if (!actingAdminId) {
      pushError("Select an admin identity before saving.");
      return false;
    }
    try {
      const res = await internalFetch("ADMIN", `/api/admin/pricing/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedById: actingAdminId, ...patch }),
      });
      if (res.status === 401) return onUnauthorized(), false;
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed.");
      setItems((prev) => {
        if (!prev) return prev;
        const updated = data.item as MaterialItem;
        return prev.map((it) => {
          if (it.id === updated.id) return updated;
          // Clearing another item's isDefault client-side when this one
          // just became the default for the same slot — mirrors what the
          // backend just did, avoids a full reload to see it reflected.
          if (updated.isDefault && it.componentType === updated.componentType && it.applicableServiceType === updated.applicableServiceType) {
            return { ...it, isDefault: false };
          }
          return it;
        });
      });
      pushSuccess(`${data.item.label} updated.`);
      return true;
    } catch (err) {
      pushError(err instanceof Error ? err.message : "Save failed.");
      return false;
    }
  }

  async function deleteMaterial(item: MaterialItem) {
    if (!actingAdminId) {
      pushError("Select an admin identity before deleting.");
      return;
    }
    if (!window.confirm(`Deactivate "${item.label}"? It will disappear from the customer-facing calculator.`)) return;
    try {
      const res = await internalFetch("ADMIN", `/api/admin/pricing/${item.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivatedById: actingAdminId }),
      });
      if (res.status === 401) return onUnauthorized();
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error ?? "Delete failed.");
      }
      setItems((prev) => (prev ? prev.map((it) => (it.id === item.id ? { ...it, isActive: false, isDefault: false } : it)) : prev));
      pushSuccess(`${item.label} deactivated.`);
    } catch (err) {
      pushError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  const activeTabDef = TABS.find((t) => t.key === activeTab)!;
  const visibleItems = useMemo(
    () => (items ?? []).filter((it) => activeTabDef.componentTypes.includes(it.componentType) && it.isActive),
    [items, activeTabDef]
  );

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Solar Pixel · Super Admin</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-stone-900">Equipment &amp; Pricing Control Engine</h1>
            <p className="mt-1 text-sm text-stone-500">Every save here changes the live customer quote calculator immediately.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={actingAdminId}
              onChange={(e) => setActingAdminId(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 outline-none focus:border-violet-400"
            >
              <option value="" disabled>
                Acting as…
              </option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition-colors duration-200 hover:border-stone-300 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        {loading && !items && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading pricing engine…
          </div>
        )}

        {loadError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {loadError}
          </p>
        )}

        {globalRules && (
          <KpiBanner
            globalRules={globalRules}
            onSaveStructure={(v) => saveGlobalRules({ structureCostPerWatt: v })}
            onSaveMargin={(sector, v) => saveGlobalRules({ sectorMargins: { [sector]: v } })}
            onSaveInstallationResidential={(v) => saveGlobalPricingRates({ installationCostPerWattResidential: v })}
            onSaveInstallationCommercial={(v) => saveGlobalPricingRates({ installationCostPerWattCommercial: v })}
            onSaveInstallationIndustrial={(v) => saveGlobalPricingRates({ installationCostPerWattIndustrial: v })}
            onSaveEvChargerFee={(v) => saveGlobalPricingRates({ evChargerInstallationFee: v })}
            onSaveWashingRate={(field, v) => saveGlobalPricingRates({ [field]: v })}
            onSaveCivilBlockRate={(v) => saveGlobalPricingRates({ civilWorkCostPerBlock: v })}
            onSaveEarthingBoreRate={(v) => saveGlobalPricingRates({ earthingCostPerBore: v })}
            onSaveLightningArrestorRate={(v) => saveGlobalPricingRates({ lightningArrestorCostPerUnit: v })}
          />
        )}

        {items && (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-white p-1">
                {TABS.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      aria-pressed={active}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
                        active ? "bg-violet-50 text-violet-700" : "text-stone-500 hover:text-stone-700"
                      }`}
                    >
                      <span aria-hidden>{tab.emoji}</span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setModalState({ mode: "create" })}
                className="flex min-h-10 items-center gap-1.5 rounded-xl bg-stone-900 px-4 text-xs font-semibold text-white transition-colors duration-200 hover:bg-stone-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add New Material
              </button>
            </div>

            <MaterialTable
              items={visibleItems}
              residentialMargin={globalRules?.sectorMargins.RESIDENTIAL ?? 0}
              onSaveMaterial={saveMaterial}
              onDelete={deleteMaterial}
              onEdit={(item) => setModalState({ mode: "edit", item })}
            />
          </>
        )}
      </div>

      {modalState.mode !== "closed" && (
        <MaterialModal
          key={modalState.mode === "edit" ? modalState.item.id : "create"}
          mode={modalState.mode}
          editingItem={modalState.mode === "edit" ? modalState.item : null}
          // Bug fix (2026-08-22): "Add New Material" used to always
          // default the modal's OWN componentType picker to SOLAR_PANEL,
          // regardless of which tab you were actually on — so adding a
          // material from the Inverter tab silently created a Solar
          // Panel instead unless you noticed and manually changed the
          // in-modal dropdown too. The item was really "added," just to
          // the wrong category, so the Inverter tab kept showing "No
          // active materials yet." Now defaults to whichever
          // componentType the current tab actually represents (the
          // first one, for the merged Cables & Breakers tab) — still
          // changeable inside the modal, just a correct starting point.
          defaultComponentType={activeTabDef.componentTypes[0]}
          onClose={() => setModalState({ mode: "closed" })}
          residentialMargin={globalRules?.sectorMargins.RESIDENTIAL ?? 0}
          onCreate={async (input) => {
            if (!actingAdminId) {
              pushError("Select an admin identity before adding a material.");
              return false;
            }
            try {
              const res = await internalFetch("ADMIN", "/api/admin/pricing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "CREATE_MATERIAL", createdById: actingAdminId, ...input }),
              });
              if (res.status === 401) return onUnauthorized(), false;
              const data = await res.json();
              if (!res.ok) throw new Error(data?.error ?? "Could not add material.");
              setItems((prev) => (prev ? [...prev, data.item as MaterialItem] : prev));
              pushSuccess(`${data.item.label} added to the catalog.`);
              return true;
            } catch (err) {
              pushError(err instanceof Error ? err.message : "Could not add material.");
              return false;
            }
          }}
          onUpdate={(id, patch) => saveMaterial(id, patch)}
        />
      )}

      <ToastStack toasts={toasts} />
    </main>
  );
}

// ============================================================================
// KPI banner — Structure / Installation / Sector margins, inline-editable
// ============================================================================

function KpiBanner({
  globalRules,
  onSaveStructure,
  onSaveMargin,
  onSaveInstallationResidential,
  onSaveInstallationCommercial,
  onSaveInstallationIndustrial,
  onSaveEvChargerFee,
  onSaveWashingRate,
  onSaveCivilBlockRate,
  onSaveEarthingBoreRate,
  onSaveLightningArrestorRate,
}: {
  globalRules: GlobalRules;
  onSaveStructure: (v: number) => Promise<boolean>;
  onSaveMargin: (sector: Sector, v: number) => Promise<boolean>;
  onSaveInstallationResidential: (v: number) => Promise<boolean>;
  onSaveInstallationCommercial: (v: number) => Promise<boolean>;
  onSaveInstallationIndustrial: (v: number) => Promise<boolean>;
  onSaveEvChargerFee: (v: number) => Promise<boolean>;
  onSaveWashingRate: (field: WashingRateField, v: number) => Promise<boolean>;
  onSaveCivilBlockRate: (v: number) => Promise<boolean>;
  onSaveEarthingBoreRate: (v: number) => Promise<boolean>;
  onSaveLightningArrestorRate: (v: number) => Promise<boolean>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard label="Structure Base Rate" suffix="/W">
        <InlineEditableNumber value={globalRules.structureCostPerWatt} prefix="Rs " suffix="/W" onSave={onSaveStructure} />
      </KpiCard>
      <KpiCard label="Installation Rate by Sector">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">Residential</span>
            <InlineEditableNumber
              value={globalRules.installationCostPerWattResidential}
              prefix="Rs "
              suffix="/W"
              compact
              onSave={onSaveInstallationResidential}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">Commercial</span>
            <InlineEditableNumber
              value={globalRules.installationCostPerWattCommercial}
              prefix="Rs "
              suffix="/W"
              compact
              onSave={onSaveInstallationCommercial}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">Industrial</span>
            <InlineEditableNumber
              value={globalRules.installationCostPerWattIndustrial}
              prefix="Rs "
              suffix="/W"
              compact
              onSave={onSaveInstallationIndustrial}
            />
          </div>
        </div>
      </KpiCard>
      <KpiCard label="Default Margin by Sector">
        <div className="flex flex-col gap-1.5">
          {SECTORS.map((sector) => (
            <div key={sector} className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-stone-500">{SECTOR_LABEL[sector]}</span>
              <InlineEditableNumber
                value={globalRules.sectorMargins[sector]}
                suffix="%"
                compact
                onSave={(v) => onSaveMargin(sector, v)}
              />
            </div>
          ))}
        </div>
      </KpiCard>
      <KpiCard label="EV Charger Installation Fee">
        <InlineEditableNumber value={globalRules.evChargerInstallationFee} prefix="Rs " onSave={onSaveEvChargerFee} />
      </KpiCard>
      <KpiCard label="Panel Washing Rates (One-Time Visit)">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">1-20 panels</span>
            <InlineEditableNumber
              value={globalRules.washingRateTier1PerPanel}
              prefix="Rs "
              suffix="/panel"
              compact
              onSave={(v) => onSaveWashingRate("washingRateTier1PerPanel", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">21-60 panels</span>
            <InlineEditableNumber
              value={globalRules.washingRateTier2PerPanel}
              prefix="Rs "
              suffix="/panel"
              compact
              onSave={(v) => onSaveWashingRate("washingRateTier2PerPanel", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">61-150 panels</span>
            <InlineEditableNumber
              value={globalRules.washingRateTier3PerPanel}
              prefix="Rs "
              suffix="/panel"
              compact
              onSave={(v) => onSaveWashingRate("washingRateTier3PerPanel", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">151+ panels</span>
            <InlineEditableNumber
              value={globalRules.washingRateTier4PerPanel}
              prefix="Rs "
              suffix="/panel"
              compact
              onSave={(v) => onSaveWashingRate("washingRateTier4PerPanel", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-1.5">
            <span className="text-[11px] text-stone-500">Minimum visit fee</span>
            <InlineEditableNumber
              value={globalRules.washingMinimumVisitFeePKR}
              prefix="Rs "
              compact
              onSave={(v) => onSaveWashingRate("washingMinimumVisitFeePKR", v)}
            />
          </div>
        </div>
      </KpiCard>
      <KpiCard label="Site Works Rates">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">Civil Block</span>
            <InlineEditableNumber value={globalRules.civilWorkCostPerBlock} prefix="Rs " compact onSave={onSaveCivilBlockRate} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">Earthing Bore</span>
            <InlineEditableNumber value={globalRules.earthingCostPerBore} prefix="Rs " compact onSave={onSaveEarthingBoreRate} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">Lightning Arrestor</span>
            <InlineEditableNumber
              value={globalRules.lightningArrestorCostPerUnit}
              prefix="Rs "
              compact
              onSave={onSaveLightningArrestorRate}
            />
          </div>
        </div>
      </KpiCard>
    </div>
  );
}

function KpiCard({ label, children }: { label: string; suffix?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Click-to-edit number — displays formatted, becomes an input on click,
 *  saves on Enter/blur, reverts on Escape. Used throughout for inline
 *  KPI and per-row cost/margin editing. */
function InlineEditableNumber({
  value,
  prefix = "",
  suffix = "",
  compact = false,
  onSave,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
  onSave: (value: number) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);

  function startEditing() {
    // Refresh the draft from the current value right when editing opens,
    // rather than syncing it via an effect on every value change — draft
    // only ever needs to reflect `value` at the moment editing begins.
    setDraft(String(value));
    setEditing(true);
  }

  async function commit() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDraft(String(value));
      setEditing(false);
      return;
    }
    if (parsed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(parsed);
    setSaving(false);
    if (!ok) setDraft(String(value));
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(String(value));
              setEditing(false);
            }
          }}
          className={`rounded-lg border border-violet-300 bg-violet-50/50 px-2 py-1 text-right outline-none focus:ring-2 focus:ring-violet-400/25 ${
            compact ? "w-14 text-xs" : "w-20 text-xl font-bold"
          }`}
        />
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className={`group inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition-colors duration-200 hover:bg-violet-50 ${
        compact ? "text-xs font-semibold text-stone-800" : "text-2xl font-bold text-stone-900"
      }`}
    >
      {prefix}
      {value}
      {suffix}
      <Pencil className={`shrink-0 text-stone-300 opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
    </button>
  );
}

// ============================================================================
// Material data table
// ============================================================================

const COMPONENT_TYPE_ICON: Record<ComponentType, typeof Sun> = {
  SOLAR_PANEL: Sun,
  INVERTER: Zap,
  BATTERY: BatteryCharging,
  DC_CABLE: Cable,
  AC_CABLE: Cable,
  BREAKERS: Cable,
};

function specDisplay(item: MaterialItem): string {
  if (item.specValue == null) return "—";
  if (item.componentType === "SOLAR_PANEL") return `${item.specValue}W`;
  if (item.componentType === "INVERTER") return `${item.specValue}kW`;
  return String(item.specValue);
}

function MaterialTable({
  items,
  residentialMargin,
  onSaveMaterial,
  onDelete,
  onEdit,
}: {
  items: MaterialItem[];
  residentialMargin: number;
  onSaveMaterial: (
    id: string,
    patch: {
      vendorCostRs?: number;
      marginPercentOverride?: number | null;
      isDefault?: boolean;
      inStock?: boolean;
      label?: string;
      brand?: string | null;
      logoUrl?: string | null;
      brochureUrl?: string | null;
      specs?: SpecEntry[] | null;
    }
  ) => Promise<boolean>;
  onDelete: (item: MaterialItem) => void;
  onEdit: (item: MaterialItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
        No active materials in this category yet — add one to get started.
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            <th className="px-4 py-3">Item Name</th>
            <th className="px-4 py-3">Spec</th>
            <th className="px-4 py-3">Cost Type</th>
            <th className="px-4 py-3">Vendor Cost (PKR)</th>
            <th className="px-4 py-3">Admin Margin (%)</th>
            <th className="px-4 py-3">Customer Price</th>
            <th className="px-4 py-3">Default</th>
            <th className="px-4 py-3">Stock</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const Icon = COMPONENT_TYPE_ICON[item.componentType];
            return (
              <tr key={item.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {item.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external Google Drive URL, not a local/optimizable asset
                      <img
                        src={item.logoUrl}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-md border border-stone-200 bg-white object-contain"
                      />
                    ) : (
                      <Icon className="h-4 w-4 shrink-0 text-violet-500" />
                    )}
                    <div>
                      <p className="font-medium text-stone-900">{item.label}</p>
                      <p className="flex items-center gap-1.5 text-xs text-stone-500">
                        {item.brand}
                        {item.brochureUrl && (
                          <a
                            href={item.brochureUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View brochure PDF"
                            className="inline-flex items-center gap-0.5 text-violet-500 hover:text-violet-700 hover:underline"
                          >
                            <FileText className="h-3 w-3" /> Brochure
                          </a>
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-stone-600">{specDisplay(item)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs text-stone-600">
                    {item.unit ? UNIT_LABEL[item.unit] : "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {item.unitCostRs !== null ? (
                    <InlineEditableNumber
                      value={item.unitCostRs}
                      prefix="Rs "
                      suffix={item.unit ? UNIT_SUFFIX[item.unit] : ""}
                      compact
                      onSave={(v) => onSaveMaterial(item.id, { vendorCostRs: v })}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {item.unitCostRs !== null ? (
                    <div className="flex items-center gap-1.5">
                      <InlineEditableNumber
                        value={item.marginPercentOverride ?? residentialMargin}
                        suffix="%"
                        compact
                        onSave={(v) => onSaveMaterial(item.id, { marginPercentOverride: v })}
                      />
                      {item.marginPercentOverride === null && (
                        <span className="text-[10px] text-stone-400">(default)</span>
                      )}
                      {item.marginPercentOverride !== null && (
                        <button
                          type="button"
                          title="Clear override, use sector default"
                          onClick={() => onSaveMaterial(item.id, { marginPercentOverride: null })}
                          className="text-[10px] text-violet-500 underline-offset-2 hover:underline"
                        >
                          reset
                        </button>
                      )}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-emerald-700">
                  {item.customerPricePreviewPKR !== null ? formatPKR(item.customerPricePreviewPKR) : "—"}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={item.isDefault}
                    onClick={() => onSaveMaterial(item.id, { isDefault: true })}
                    title={item.isDefault ? "Current Recommended default" : "Make this the Recommended default"}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                      item.isDefault
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-stone-200 bg-white text-stone-400 hover:border-violet-300 hover:text-violet-600"
                    }`}
                  >
                    <Star className={`h-3 w-3 ${item.isDefault ? "fill-emerald-500 text-emerald-500" : ""}`} />
                    {item.isDefault ? "Default" : "Set Default"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSaveMaterial(item.id, { inStock: !item.inStock })}
                    title={item.inStock ? "In stock — click to mark out of stock" : "Out of stock — click to restock"}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                      item.inStock
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {item.inStock ? "In Stock" : "Out of Stock"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      aria-label={`Edit ${item.label}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors duration-200 hover:bg-violet-50 hover:text-violet-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      aria-label={`Deactivate ${item.label}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Add / Edit Material modal
// ============================================================================

const CATEGORY_OPTIONS: { value: ComponentType; label: string }[] = [
  { value: "SOLAR_PANEL", label: "Solar Panel" },
  { value: "INVERTER", label: "Inverter" },
  { value: "BATTERY", label: "Lithium Battery" },
  { value: "DC_CABLE", label: "DC Cable" },
  { value: "AC_CABLE", label: "AC Cable" },
  { value: "BREAKERS", label: "Protection & Breakers" },
];
const UNIT_OPTIONS: CostUnit[] = ["PER_WATT", "PER_KWH", "PER_METER", "PER_UNIT", "PER_PIECE", "LUMP_SUM"];

interface CreateMaterialInput {
  componentType: ComponentType;
  code: string;
  label: string;
  brand?: string;
  specValue?: number;
  applicableServiceType?: ServiceType;
  unit: CostUnit;
  vendorCostRs: number;
  marginPercentOverride?: number;
  isDefault?: boolean;
  logoUrl?: string;
  brochureUrl?: string;
  specs?: SpecEntry[];
}

interface UpdateMaterialPatch {
  label?: string;
  brand?: string | null;
  vendorCostRs?: number;
  marginPercentOverride?: number | null;
  logoUrl?: string | null;
  brochureUrl?: string | null;
  specs?: SpecEntry[] | null;
}

function slugify(label: string, brand: string): string {
  return `${brand}_${label}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Dynamic key-value row manager for a material's "Comparison
 *  Specifications" — Add Specification appends an empty row, each row
 *  has its own Remove button. Blank rows (empty key or value) are
 *  silently dropped on submit, not on every keystroke, so a half-typed
 *  row doesn't vanish while the admin is still filling it in. */
function SpecsBuilder({ specs, onChange }: { specs: SpecEntry[]; onChange: (specs: SpecEntry[]) => void }) {
  function updateRow(index: number, field: "key" | "value", value: string) {
    onChange(specs.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }
  function removeRow(index: number) {
    onChange(specs.filter((_, i) => i !== index));
  }
  function addRow() {
    onChange([...specs, { key: "", value: "" }]);
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-stone-600">
        Comparison Specifications <span className="font-normal text-stone-400">(optional)</span>
      </label>
      <div className="space-y-2">
        {specs.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={row.key}
              onChange={(e) => updateRow(i, "key", e.target.value)}
              placeholder="Spec Name, e.g. Efficiency"
              className="w-1/2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
            />
            <input
              value={row.value}
              onChange={(e) => updateRow(i, "value", e.target.value)}
              placeholder="Value, e.g. 22.5%"
              className="w-1/2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label="Remove specification row"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700"
      >
        <Plus className="h-3.5 w-3.5" /> Add Specification
      </button>
    </div>
  );
}

function MaterialModal({
  mode,
  editingItem,
  defaultComponentType,
  onClose,
  onCreate,
  onUpdate,
  residentialMargin,
}: {
  mode: "create" | "edit";
  editingItem: MaterialItem | null;
  /** Which componentType to preselect in create mode — the tab the
   *  admin was actually on when they clicked "Add New Material." Only
   *  a starting point (still changeable via the dropdown below);
   *  ignored in edit mode, where `editingItem`'s own value always wins. */
  defaultComponentType?: ComponentType;
  onClose: () => void;
  onCreate: (input: CreateMaterialInput) => Promise<boolean>;
  onUpdate: (id: string, patch: UpdateMaterialPatch) => Promise<boolean>;
  residentialMargin: number;
}) {
  const isEdit = mode === "edit" && editingItem !== null;

  // componentType/specValue/applicableServiceType/unit aren't editable
  // after creation (UpdateMaterialInput doesn't support changing them —
  // they're the join-key/pricing-shape fields lib/db/admin.ts resolves
  // by), so their inputs are disabled in edit mode, not hidden — the
  // admin can still see what they're editing.
  const [componentType, setComponentType] = useState<ComponentType>(
    editingItem?.componentType ?? defaultComponentType ?? "SOLAR_PANEL"
  );
  const [label, setLabel] = useState(editingItem?.label ?? "");
  const [brand, setBrand] = useState(editingItem?.brand ?? "");
  const [specValue, setSpecValue] = useState(editingItem?.specValue != null ? String(editingItem.specValue) : "");
  const [applicableServiceType, setApplicableServiceType] = useState<ServiceType | "">(
    editingItem?.applicableServiceType ?? ""
  );
  // BATTERY prices PER_KWH, everything else in this catalog PER_WATT —
  // match the resolved starting componentType (not a blind PER_WATT
  // default) so switching tabs before opening the modal doesn't leave a
  // silently-wrong unit an admin has to remember to fix by hand.
  const [unit, setUnit] = useState<CostUnit>(
    editingItem?.unit ?? ((defaultComponentType ?? "SOLAR_PANEL") === "BATTERY" ? "PER_KWH" : "PER_WATT")
  );
  const [vendorCostRs, setVendorCostRs] = useState(editingItem?.unitCostRs != null ? String(editingItem.unitCostRs) : "");
  const [marginPercentOverride, setMarginPercentOverride] = useState(
    editingItem?.marginPercentOverride != null ? String(editingItem.marginPercentOverride) : ""
  );
  const [logoUrl, setLogoUrl] = useState(editingItem?.logoUrl ?? "");
  const [brochureUrl, setBrochureUrl] = useState(editingItem?.brochureUrl ?? "");
  const [specs, setSpecs] = useState<SpecEntry[]>(editingItem?.specs ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsServiceType = componentType === "INVERTER" || componentType === "BATTERY";
  const costNum = Number(vendorCostRs);
  const marginNum = marginPercentOverride.trim() !== "" ? Number(marginPercentOverride) : residentialMargin;
  const previewPKR =
    Number.isFinite(costNum) && costNum > 0 && Number.isFinite(marginNum) && marginNum < 100
      ? Math.round(costNum / (1 - marginNum / 100))
      : null;

  // Applied on blur (instant feedback while filling the form) AND again
  // on submit (covers paste-then-immediately-submit, and is a harmless
  // no-op on an already-normalized link — see formatGoogleDriveLink's
  // idempotency note). The server re-applies it a third time regardless,
  // since it never trusts client-side formatting.
  function normalizeLogoUrl() {
    setLogoUrl((v) => (v.trim() ? formatGoogleDriveLink(v) : v));
  }
  function normalizeBrochureUrl() {
    setBrochureUrl((v) => (v.trim() ? formatGoogleDriveLink(v) : v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!label.trim() || !brand.trim()) {
      setError("Name and Brand are required.");
      return;
    }
    if (!Number.isFinite(costNum) || costNum <= 0) {
      setError("Enter a valid Vendor Cost.");
      return;
    }

    const normalizedLogoUrl = logoUrl.trim() ? formatGoogleDriveLink(logoUrl.trim()) : "";
    const normalizedBrochureUrl = brochureUrl.trim() ? formatGoogleDriveLink(brochureUrl.trim()) : "";
    // Blank rows are dropped here (submit time), not as the admin types —
    // see SpecsBuilder's doc comment.
    const cleanSpecs = specs
      .map((s) => ({ key: s.key.trim(), value: s.value.trim() }))
      .filter((s) => s.key && s.value);

    setSaving(true);
    const ok =
      isEdit && editingItem
        ? await onUpdate(editingItem.id, {
            label: label.trim(),
            brand: brand.trim(),
            vendorCostRs: costNum,
            marginPercentOverride: marginPercentOverride.trim() !== "" ? Number(marginPercentOverride) : null,
            logoUrl: normalizedLogoUrl || null,
            brochureUrl: normalizedBrochureUrl || null,
            specs: cleanSpecs.length > 0 ? cleanSpecs : null,
          })
        : await onCreate({
            componentType,
            code: slugify(label, brand),
            label: label.trim(),
            brand: brand.trim(),
            specValue: specValue.trim() !== "" ? Number(specValue) : undefined,
            applicableServiceType: needsServiceType && applicableServiceType ? applicableServiceType : undefined,
            unit,
            vendorCostRs: costNum,
            marginPercentOverride: marginPercentOverride.trim() !== "" ? Number(marginPercentOverride) : undefined,
            logoUrl: normalizedLogoUrl || undefined,
            brochureUrl: normalizedBrochureUrl || undefined,
            specs: cleanSpecs.length > 0 ? cleanSpecs : undefined,
          });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-900">{isEdit ? "Edit Material" : "Add New Material"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        {isEdit && editingItem && <p className="mt-0.5 text-[11px] text-stone-400">Code: {editingItem.code}</p>}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">Category</label>
            <select
              value={componentType}
              onChange={(e) => setComponentType(e.target.value as ComponentType)}
              disabled={isEdit}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-600">Name</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Trina Vertex 620W"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-600">Brand</label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Trina Solar"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-600">Specification (optional)</label>
              <input
                value={specValue}
                onChange={(e) => setSpecValue(e.target.value.replace(/[^\d.]/g, ""))}
                disabled={isEdit}
                placeholder={componentType === "SOLAR_PANEL" ? "Watts, e.g. 620" : "kW, e.g. 10"}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            {needsServiceType && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">Service Type</label>
                <select
                  value={applicableServiceType}
                  onChange={(e) => setApplicableServiceType(e.target.value as ServiceType | "")}
                  disabled={isEdit}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Both</option>
                  <option value="HYBRID_BATTERY">Hybrid + Battery</option>
                  <option value="ONGRID_ZERO_EXPORT">On-Grid</option>
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-600">Cost Type</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as CostUnit)}
                disabled={isEdit}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABEL[u]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-600">Vendor Cost (PKR)</label>
              <input
                value={vendorCostRs}
                onChange={(e) => setVendorCostRs(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="e.g. 32"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">
              Margin % <span className="font-normal text-stone-400">(optional — defaults to Residential&apos;s {residentialMargin}%)</span>
            </label>
            <input
              value={marginPercentOverride}
              onChange={(e) => setMarginPercentOverride(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder={`${residentialMargin}`}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-stone-600">
                <ImageIcon className="h-3.5 w-3.5" /> Brand Logo URL (Google Drive)
              </label>
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                onBlur={normalizeLogoUrl}
                placeholder="https://drive.google.com/file/d/…/view"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-stone-600">
                <FileText className="h-3.5 w-3.5" /> Brochure PDF URL (Google Drive)
              </label>
              <input
                value={brochureUrl}
                onChange={(e) => setBrochureUrl(e.target.value)}
                onBlur={normalizeBrochureUrl}
                placeholder="https://drive.google.com/file/d/…/view"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
              />
            </div>
          </div>

          <SpecsBuilder specs={specs} onChange={setSpecs} />

          {previewPKR !== null && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="text-xs font-medium text-emerald-700">Live Customer Price Preview</span>
              <span className="text-lg font-bold text-emerald-700">
                {formatPKR(previewPKR)}
                {unit ? UNIT_SUFFIX[unit] : ""}
              </span>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Material"}
          </button>
        </form>
      </div>
    </div>
  );
}
