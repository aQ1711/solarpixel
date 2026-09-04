"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Play,
  ExternalLink,
  Clock,
  AlertTriangle,
  Check,
  X,
  PackagePlus,
  Loader2,
  SkipForward,
  Link as LinkIcon,
} from "lucide-react";
import Link from "next/link";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { internalFetch, type ApiJson } from "@/lib/internal/access";

// ============================================================================
// /admin/market-prices — Market Price Scraper dashboard (2026-08-22).
//
// Shows the most recent daily w11stop.com price snapshot (see
// lib/scraper/marketPriceJob.ts) and lets a Super Admin trigger a fresh
// run on demand. Same light theme + AccessGate("ADMIN") shared-secret gate
// as /admin/leads and /admin/pricing — see AccessGate's own doc comment
// for why this is interim, not real auth.
//
// 2026-09-04 UPDATE ("add checkbox... add to the inventory"): this page
// WAS purely read-only reference data with a doc comment saying so
// verbatim. That's no longer accurate — a Super Admin can now check one
// or more scraped listings and walk them, one at a time, through the
// EXACT SAME create/update-material endpoints /admin/pricing itself uses
// (POST /api/admin/pricing, PUT /api/admin/pricing/:id) — no new backend
// route needed, no separate "MaterialCatalog" write path to drift from
// the one /admin/pricing already has. Still never automatic: every
// listing goes through AddToInventoryModal's review form first (a real
// design choice, not a shortcut — see that component's own doc comment
// for the componentType-specific unit/price pitfalls a blind auto-apply
// would hit).
// ============================================================================

type ComponentType = "SOLAR_PANEL" | "INVERTER" | "BATTERY" | "DC_CABLE" | "AC_CABLE" | "BREAKERS" | string;
type CostUnit = "PER_WATT" | "PER_METER" | "PER_KWH" | "PER_UNIT" | "PER_PIECE" | "LUMP_SUM";
type ServiceType = "HYBRID_BATTERY" | "ONGRID_ZERO_EXPORT";
type InverterPhase = "SINGLE_PHASE" | "THREE_PHASE";

const COMPONENT_LABEL: Record<string, string> = {
  SOLAR_PANEL: "Solar Panels",
  INVERTER: "Inverters",
  BATTERY: "Batteries",
  BREAKERS: "Breakers & Protection",
  DC_CABLE: "DC Cables",
  AC_CABLE: "AC Cables",
};

const UNIT_LABEL: Record<CostUnit, string> = {
  PER_WATT: "Per-Watt",
  PER_METER: "Per-Meter",
  PER_KWH: "Per-kWh",
  PER_UNIT: "Per-Unit",
  PER_PIECE: "Per-Piece",
  LUMP_SUM: "Fixed / Lump Sum",
};

/**
 * Which CostUnit the pricing engine actually queries for each
 * componentType — see calculateSystemPricing's activeFilter() calls in
 * lib/db/admin.ts, e.g. `activeFilter("BREAKERS", "PER_WATT", ...)`. A
 * RawVendorCost row saved under any OTHER unit is not a validation
 * error — it just silently never gets found by a real quote. Confirmed
 * by reading that file directly (2026-09-04), not assumed: SOLAR_PANEL/
 * DC_CABLE/AC_CABLE/BREAKERS/MOUNTING_STRUCTURE are all PER_WATT-only;
 * INVERTER/BATTERY are PER_PIECE-only. Drives both the pre-fill logic
 * and the locked/disabled unit field in AddToInventoryModal below.
 */
const REQUIRED_UNIT: Partial<Record<string, CostUnit>> = {
  SOLAR_PANEL: "PER_WATT",
  DC_CABLE: "PER_WATT",
  AC_CABLE: "PER_WATT",
  BREAKERS: "PER_WATT",
  MOUNTING_STRUCTURE: "PER_WATT",
  INVERTER: "PER_PIECE",
  BATTERY: "PER_PIECE",
};

interface Snapshot {
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

interface ScrapeResult {
  savedCount: number;
  skippedBrands: { searchBrand: string; reason: string }[];
}

/** Narrow slice of /api/admin/pricing's MaterialCatalogItem — only what
 *  this page needs for existing-item matching + the "Update Existing"
 *  dropdown. */
interface MaterialItem {
  id: string;
  componentType: ComponentType;
  code: string;
  label: string;
  brand: string | null;
  unit: CostUnit | null;
  unitCostRs: number | null;
}

interface Admin {
  id: string;
  name: string;
}

function formatPkr(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-PK")}`;
}

/** Same convention as /admin/pricing's own MaterialModal.slugify — kept
 *  as a separate local copy rather than a shared import since the two
 *  pages don't otherwise share component code, see this page's own top
 *  doc comment on why. */
function slugifyCode(brand: string, label: string): string {
  return `${brand}_${label}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Pulls a wattage like 610 out of "Longi TOPCon 610W" — the ONE
 *  reliable, non-fabricated conversion from a scraped full-unit price to
 *  the per-watt rate SOLAR_PANEL actually needs (see REQUIRED_UNIT
 *  above). Matches both the abbreviated "610W"/"610 W" and the spelled-
 *  out "560watt"/"560 Watts" w11stop itself uses inconsistently across
 *  listings — confirmed live testing this against the real snapshot
 *  data (a plain `\d+w\b` pattern missed "Jinko 560watt Mono Perc Solar
 *  Panel" outright, since "560watt" has no word boundary between "w"
 *  and "att"). Returns null (never a guess) if neither pattern matches —
 *  the modal leaves the rate blank in that case rather than defaulting
 *  to something wrong. */
function extractWatts(itemName: string): number | null {
  const match = itemName.match(/\b(\d{3,4})\s*watts?\b/i) ?? itemName.match(/\b(\d{3,4})\s*w\b/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Loose, human-reviewed-anyway match: same componentType, and either
 *  brand text contains the other (case-insensitive) — e.g. scraped
 *  "Chint Electric" matches a catalog brand of "Chint". Only ever used
 *  to PRE-SELECT a starting guess in the modal; the admin can always
 *  pick a different existing item or switch to "Create New" instead. */
function findLikelyMatch(snapshot: Snapshot, materials: MaterialItem[]): MaterialItem | null {
  const scrapedBrand = (snapshot.brand ?? snapshot.searchBrand).toLowerCase().trim();
  if (!scrapedBrand) return null;
  const sameType = materials.filter((m) => m.componentType === snapshot.componentType && m.brand);
  return (
    sameType.find((m) => {
      const b = m.brand!.toLowerCase().trim();
      return b.includes(scrapedBrand) || scrapedBrand.includes(b);
    }) ?? null
  );
}

// ============================================================================
// Toast notifications — same minimal pattern as /admin/pricing's own.
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

export default function MarketPricesAdminPage() {
  const { onUnauthorized } = useAdminAuth();
  return <MarketPricesDashboard onUnauthorized={onUnauthorized} />;
}

function MarketPricesDashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [actingAdminId, setActingAdminId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);
  const [lastResult, setLastResult] = useState<ScrapeResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Non-null while the "Add to Inventory" review queue is open — the
  // first entry is the one currently shown in AddToInventoryModal;
  // advanceQueue() shifts it off after each Save/Skip.
  const [queue, setQueue] = useState<Snapshot[] | null>(null);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueDone, setQueueDone] = useState({ created: 0, updated: 0, skipped: 0 });

  const { toasts, pushSuccess, pushError } = useToasts();

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const [snapRes, matRes, adminsRes] = await Promise.all([
        internalFetch("ADMIN", "/api/admin/market-prices"),
        internalFetch("ADMIN", "/api/admin/pricing"),
        internalFetch("ADMIN", "/api/admin/checker/admins"),
      ]);
      if (snapRes.status === 401 || matRes.status === 401 || adminsRes.status === 401) return onUnauthorized();

      const snapData = (await snapRes.json()) as ApiJson<{ snapshots?: Snapshot[] }>;
      const matData = (await matRes.json()) as ApiJson<{ items?: MaterialItem[] }>;
      const adminsData = (await adminsRes.json()) as ApiJson<{ admins?: Admin[] }>;
      if (!snapRes.ok) throw new Error(snapData?.error ?? "Could not load market prices.");
      if (!matRes.ok) throw new Error(matData?.error ?? "Could not load the equipment catalog.");
      if (!adminsRes.ok) throw new Error(adminsData?.error ?? "Could not load admins.");

      setSnapshots(snapData.snapshots ?? []);
      setMaterials(matData.items ?? []);
      setAdmins(adminsData.admins ?? []);
      setActingAdminId((prev) => prev || adminsData.admins?.[0]?.id || "");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(loadAll, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runScrapeNow() {
    setScraping(true);
    setScrapeError(null);
    setLastResult(null);
    try {
      const res = await internalFetch("ADMIN", "/api/admin/market-prices", { method: "POST" });
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<ScrapeResult>;
      if (!res.ok) throw new Error(data?.error ?? "The scrape run failed.");
      setLastResult(data);
      setSelectedIds(new Set());
      const snapRes = await internalFetch("ADMIN", "/api/admin/market-prices");
      if (snapRes.status === 401) return onUnauthorized();
      const snapData = (await snapRes.json()) as ApiJson<{ snapshots?: Snapshot[] }>;
      if (snapRes.ok) setSnapshots(snapData.snapshots ?? []);
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setScraping(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Select-all for one brand group (2026-09-04) — the natural "group"
   *  granularity here is componentType > brand, exactly how the table
   *  below is already sectioned, so one checkbox per brand heading
   *  rather than a separate flat "select all N listings" control. */
  function toggleGroupSelected(items: Snapshot[]) {
    const allSelected = items.every((i) => selectedIds.has(i.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  }

  function startQueue() {
    if (!snapshots) return;
    const items = snapshots.filter((s) => selectedIds.has(s.id));
    if (items.length === 0) return;
    setQueueTotal(items.length);
    setQueueDone({ created: 0, updated: 0, skipped: 0 });
    setQueue(items);
  }

  // Deliberately NOT reading/updating `queue`/`selectedIds` via their own
  // functional setState updaters here — an earlier version did the
  // "is this the last item, and if so fire the summary toast" check
  // inside `setQueue(prev => ...)` itself, which is a real bug: React
  // Strict Mode intentionally double-invokes state-updater callbacks in
  // development specifically to catch impure ones, and pushSuccess/
  // setSelectedIds are side effects — confirmed live, the summary toast
  // fired twice for one real PUT request. `queue` is read directly from
  // the surrounding closure instead (safe: this function only runs from
  // a definite, single event — a button click — never during a render).
  function advanceQueue(outcome: "created" | "updated" | "skipped") {
    const tally = { ...queueDone, [outcome]: queueDone[outcome] + 1 };
    setQueueDone(tally);

    const rest = (queue ?? []).slice(1);
    setQueue(rest.length > 0 ? rest : null);
    if (rest.length === 0) {
      setSelectedIds(new Set());
      const parts = [
        tally.created > 0 ? `${tally.created} added` : null,
        tally.updated > 0 ? `${tally.updated} updated` : null,
        tally.skipped > 0 ? `${tally.skipped} skipped` : null,
      ].filter(Boolean);
      if (parts.length > 0) pushSuccess(`Done: ${parts.join(", ")}.`);
    }
  }

  function cancelQueue() {
    setQueue(null);
    setSelectedIds(new Set());
  }

  const fetchedAt = snapshots?.[0]?.fetchedAt ?? null;
  const grouped = new Map<ComponentType, Map<string, Snapshot[]>>();
  for (const s of snapshots ?? []) {
    if (!grouped.has(s.componentType)) grouped.set(s.componentType, new Map());
    const byBrand = grouped.get(s.componentType)!;
    if (!byBrand.has(s.searchBrand)) byBrand.set(s.searchBrand, []);
    byBrand.get(s.searchBrand)!.push(s);
  }

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-violet-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Solar Pixel · Admin
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-stone-900">Market Price Scraper</h1>
            <p className="mt-1 text-sm text-stone-500">
              Real vendor listings from w11stop.com. Check any listing below and <strong>Add to Inventory</strong> to review it
              into your live equipment catalog — nothing is applied automatically.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/pricing"
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 shadow-sm transition hover:text-stone-900"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              Pricing Catalog
            </Link>
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
              onClick={runScrapeNow}
              disabled={scraping}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
            >
              <Play className={`h-3.5 w-3.5 ${scraping ? "animate-pulse" : ""}`} />
              {scraping ? "Scraping…" : "Run Now"}
            </button>
            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 shadow-sm transition hover:text-stone-900 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 shadow-sm">
          <Clock className="h-4 w-4 text-stone-400" />
          {fetchedAt ? (
            <span>
              Last fetched <strong className="text-stone-900">{new Date(fetchedAt).toLocaleString("en-PK")}</strong> ·{" "}
              {snapshots?.length ?? 0} listings
            </span>
          ) : (
            <span>No snapshot yet. Click Run Now, or wait for the daily 7:00 AM (PKT) automatic run.</span>
          )}
        </div>

        {scrapeError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {scrapeError}
          </div>
        )}
        {lastResult && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Saved {lastResult.savedCount} listings this run.
            {lastResult.skippedBrands.length > 0 && (
              <span className="ml-1 text-emerald-700">
                No results for: {lastResult.skippedBrands.map((b) => b.searchBrand).join(", ")}.
              </span>
            )}
          </div>
        )}
        {loadError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {loadError}
          </div>
        )}

        {loading && !snapshots ? (
          <div className="flex items-center justify-center py-16 text-sm text-stone-400">Loading…</div>
        ) : snapshots && snapshots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-500">
            No market-price data yet. Click <strong>Run Now</strong> to fetch the first snapshot.
          </div>
        ) : (
          <div className="space-y-6 pb-24">
            {Array.from(grouped.entries()).map(([componentType, byBrand]) => (
              <section key={componentType} className="rounded-2xl border border-stone-200 bg-white shadow-sm">
                <h2 className="border-b border-stone-100 px-5 py-3 text-sm font-semibold text-stone-900">
                  {COMPONENT_LABEL[componentType] ?? componentType}
                </h2>
                <div className="divide-y divide-stone-100">
                  {Array.from(byBrand.entries()).map(([brand, items]) => {
                    const allSelected = items.every((i) => selectedIds.has(i.id));
                    const someSelected = !allSelected && items.some((i) => selectedIds.has(i.id));
                    return (
                    <div key={brand} className="px-5 py-3">
                      <label className="mb-2 flex w-fit items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400 hover:text-stone-600">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={() => toggleGroupSelected(items)}
                          aria-label={`Select all ${brand} listings`}
                          className="h-3.5 w-3.5 rounded border-stone-300 text-violet-600 focus:ring-violet-400"
                        />
                        {brand} <span className="font-normal normal-case text-stone-300">· select all</span>
                      </label>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <tbody className="divide-y divide-stone-50">
                            {items.map((item) => (
                              <tr key={item.id} className={selectedIds.has(item.id) ? "bg-violet-50/60" : undefined}>
                                <td className="w-8 py-1.5 pr-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => toggleSelected(item.id)}
                                    aria-label={`Select ${item.itemName}`}
                                    className="h-4 w-4 rounded border-stone-300 text-violet-600 focus:ring-violet-400"
                                  />
                                </td>
                                <td className="py-1.5 pr-3 text-stone-700">{item.itemName}</td>
                                <td className="py-1.5 pr-3 text-stone-400">{item.model ?? "—"}</td>
                                <td className="py-1.5 pr-3 text-right font-medium text-stone-900">{formatPkr(item.priceRs)}</td>
                                {item.oldPriceRs && (
                                  <td className="py-1.5 pr-3 text-right text-xs text-stone-400 line-through">
                                    {formatPkr(item.oldPriceRs)}
                                  </td>
                                )}
                                <td className="py-1.5 text-right">
                                  <a
                                    href={item.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800"
                                  >
                                    View <ExternalLink className="h-3 w-3" />
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Sticky selection bar — appears once at least one listing is
          checked, same "floating action bar" convention as the
          storefront's own mobile price bar. */}
      {selectedIds.size > 0 && !queue && (
        <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between border-t border-stone-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] sm:px-8">
          <span className="text-sm font-medium text-stone-700">{selectedIds.size} listing{selectedIds.size === 1 ? "" : "s"} selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-xl px-3 py-2 text-xs font-medium text-stone-500 hover:text-stone-800"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={startQueue}
              disabled={!actingAdminId}
              title={!actingAdminId ? "Select “Acting as…” above first" : undefined}
              className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              Add to Inventory
            </button>
          </div>
        </div>
      )}

      {queue && queue.length > 0 && (
        <AddToInventoryModal
          key={queue[0].id}
          snapshot={queue[0]}
          position={queueTotal - queue.length + 1}
          total={queueTotal}
          materials={materials}
          actingAdminId={actingAdminId}
          onCreated={(item) => {
            setMaterials((prev) => [...prev, item]);
            pushSuccess(`Added ${item.label} to inventory.`);
            advanceQueue("created");
          }}
          onUpdated={(item) => {
            setMaterials((prev) => prev.map((m) => (m.id === item.id ? item : m)));
            pushSuccess(`Updated ${item.label}'s cost.`);
            advanceQueue("updated");
          }}
          onSkip={() => advanceQueue("skipped")}
          onCancelAll={cancelQueue}
          onError={(msg) => pushError(msg)}
        />
      )}

      <ToastStack toasts={toasts} />
    </main>
  );
}

// ============================================================================
// Add to Inventory — per-listing review modal
// ============================================================================

/**
 * One scraped listing at a time (the parent drives a queue over multiple
 * selections) — pre-filled from the snapshot, but ALWAYS reviewed before
 * saving, never auto-applied. Two real pitfalls a blind "just POST the
 * scraped price" button would hit, both handled explicitly here rather
 * than silently:
 *
 *  1. Unit mismatch: the pricing engine hard-requires a specific CostUnit
 *     per componentType (see REQUIRED_UNIT above) — SOLAR_PANEL/
 *     DC_CABLE/AC_CABLE/BREAKERS/MOUNTING_STRUCTURE are all PER_WATT
 *     (a rate multiplied by the customer's system size), never a flat
 *     per-item price. A scraped listing's own price is a flat, one-unit
 *     price (one breaker, one panel, one cable roll) — for SOLAR_PANEL
 *     specifically that converts cleanly (price / watts-parsed-from-name
 *     = a real per-watt rate); for BREAKERS/DC_CABLE/AC_CABLE/
 *     MOUNTING_STRUCTURE there's no watts-per-unit to divide by, so the
 *     rate field is left BLANK with an explicit note rather than
 *     converting nothing into something.
 *  2. Existing-item collision: if the admin picks "Update Existing" this
 *     overwrites that item's live vendor cost immediately — same
 *     confirmation weight as editing it directly in /admin/pricing.
 */
function AddToInventoryModal({
  snapshot,
  position,
  total,
  materials,
  actingAdminId,
  onCreated,
  onUpdated,
  onSkip,
  onCancelAll,
  onError,
}: {
  snapshot: Snapshot;
  position: number;
  total: number;
  materials: MaterialItem[];
  actingAdminId: string;
  onCreated: (item: MaterialItem) => void;
  onUpdated: (item: MaterialItem) => void;
  onSkip: () => void;
  onCancelAll: () => void;
  onError: (message: string) => void;
}) {
  const requiredUnit = REQUIRED_UNIT[snapshot.componentType] ?? null;
  const watts = snapshot.componentType === "SOLAR_PANEL" ? extractWatts(snapshot.itemName) : null;
  // A scraped listing's own price is always the flat, one-unit price —
  // only SOLAR_PANEL (via the parsed wattage above) and INVERTER/BATTERY
  // (already flat PER_PIECE, no conversion needed) have a safe, non-
  // fabricated starting rate; everything else starts blank, see this
  // component's own doc comment above.
  const suggestedRate =
    snapshot.componentType === "SOLAR_PANEL" && watts
      ? Math.round((snapshot.priceRs / watts) * 100) / 100
      : requiredUnit === "PER_PIECE"
        ? snapshot.priceRs
        : null;

  const likelyMatch = findLikelyMatch(snapshot, materials);
  const sameTypeMaterials = materials.filter((m) => m.componentType === snapshot.componentType);

  const [saveMode, setSaveMode] = useState<"create" | "update">(likelyMatch ? "update" : "create");
  const [updateTargetId, setUpdateTargetId] = useState(likelyMatch?.id ?? sameTypeMaterials[0]?.id ?? "");
  const [brand, setBrand] = useState(snapshot.brand ?? snapshot.searchBrand);
  const [label, setLabel] = useState(snapshot.model ? `${snapshot.brand ?? snapshot.searchBrand} ${snapshot.model}` : snapshot.itemName);
  const [code, setCode] = useState(slugifyCode(snapshot.brand ?? snapshot.searchBrand, snapshot.model ?? snapshot.itemName));
  const [vendorCostRs, setVendorCostRs] = useState(suggestedRate !== null ? String(suggestedRate) : "");
  const [applicableServiceType, setApplicableServiceType] = useState<ServiceType | "">("");
  const [phase, setPhase] = useState<InverterPhase | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateTarget = sameTypeMaterials.find((m) => m.id === updateTargetId) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const costNum = Number(vendorCostRs);
    if (!Number.isFinite(costNum) || costNum <= 0) {
      setError(
        requiredUnit === "PER_WATT" && suggestedRate === null
          ? "Enter a per-watt rate — the scraped price is a flat, one-unit price, not a system rate (see the note below)."
          : "Enter a valid cost."
      );
      return;
    }

    setSaving(true);
    try {
      if (saveMode === "update") {
        if (!updateTarget) {
          setError("Pick an existing item to update.");
          setSaving(false);
          return;
        }
        const res = await internalFetch("ADMIN", `/api/admin/pricing/${updateTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendorCostRs: costNum, updatedById: actingAdminId }),
        });
        const data = (await res.json()) as ApiJson<{ item?: MaterialItem }>;
        if (!res.ok || !data.item) throw new Error(data?.error ?? "Could not update this item.");
        onUpdated(data.item);
      } else {
        if (!code.trim() || !label.trim() || !brand.trim()) {
          setError("Code, Name, and Brand are required.");
          setSaving(false);
          return;
        }
        const res = await internalFetch("ADMIN", "/api/admin/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "CREATE_MATERIAL",
            componentType: snapshot.componentType,
            code: code.trim(),
            label: label.trim(),
            brand: brand.trim(),
            specValue: watts ?? undefined,
            applicableServiceType: applicableServiceType || undefined,
            phase: snapshot.componentType === "INVERTER" && phase ? phase : undefined,
            unit: requiredUnit ?? "PER_PIECE",
            vendorCostRs: costNum,
            vendorName: brand.trim(),
            createdById: actingAdminId,
          }),
        });
        const data = (await res.json()) as ApiJson<{ item?: MaterialItem }>;
        if (!res.ok || !data.item) throw new Error(data?.error ?? "Could not add this item.");
        onCreated(data.item);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 px-4">
      <div className="animate-fade-up max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Add to Inventory</h2>
            <p className="mt-0.5 text-[11px] text-stone-400">
              {position} of {total}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelAll}
            aria-label="Close"
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Read-only scraped source, for reference while reviewing. */}
        <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5 text-xs text-stone-500">
          <p className="font-medium text-stone-700">{snapshot.itemName}</p>
          <p className="mt-0.5">
            {COMPONENT_LABEL[snapshot.componentType] ?? snapshot.componentType} · Scraped price {formatPkr(snapshot.priceRs)}
            {snapshot.model ? ` · ${snapshot.model}` : ""} ·{" "}
            <a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:text-violet-800">
              Source ↗
            </a>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {sameTypeMaterials.length > 0 && (
            <div className="flex rounded-xl border border-stone-200 bg-stone-50 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setSaveMode("create")}
                className={`flex-1 rounded-lg py-2 transition-colors duration-200 ${
                  saveMode === "create" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                Create New
              </button>
              <button
                type="button"
                onClick={() => setSaveMode("update")}
                className={`flex-1 rounded-lg py-2 transition-colors duration-200 ${
                  saveMode === "update" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                Update Existing
              </button>
            </div>
          )}

          {saveMode === "update" ? (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-600">
                Existing Item {likelyMatch && <span className="font-normal text-emerald-600">(auto-matched by brand)</span>}
              </label>
              <select
                value={updateTargetId}
                onChange={(e) => setUpdateTargetId(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
              >
                {sameTypeMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.brand ? `${m.brand} — ` : ""}
                    {m.label} {m.unitCostRs != null ? `(currently ${formatPkr(m.unitCostRs)}${m.unit ? `/${UNIT_LABEL[m.unit]}` : ""})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-600">Name</label>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-600">Brand</label>
                  <input
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Catalog Code <span className="font-normal text-stone-400">(must be unique)</span>
                </label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 font-mono text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
                />
              </div>
              {snapshot.componentType === "INVERTER" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-stone-600">Service Type</label>
                    <select
                      value={applicableServiceType}
                      onChange={(e) => setApplicableServiceType(e.target.value as ServiceType | "")}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
                    >
                      <option value="">Both</option>
                      <option value="HYBRID_BATTERY">Hybrid + Battery</option>
                      <option value="ONGRID_ZERO_EXPORT">On Grid</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-stone-600">Phase</label>
                    <select
                      value={phase}
                      onChange={(e) => setPhase(e.target.value as InverterPhase | "")}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
                    >
                      <option value="">Select…</option>
                      <option value="SINGLE_PHASE">Single Phase</option>
                      <option value="THREE_PHASE">Three Phase</option>
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">
              {saveMode === "update" ? "New Vendor Cost (PKR)" : "Vendor Cost (PKR)"}
              {requiredUnit && <span className="font-normal text-stone-400"> — priced {UNIT_LABEL[requiredUnit]}</span>}
            </label>
            <input
              value={vendorCostRs}
              onChange={(e) => setVendorCostRs(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder={requiredUnit === "PER_WATT" && suggestedRate === null ? "Enter your own per-watt rate" : "e.g. 32"}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/25"
            />
            {requiredUnit === "PER_WATT" && suggestedRate === null && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-700">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {snapshot.componentType === "SOLAR_PANEL"
                  ? `Couldn't detect a wattage in "${snapshot.itemName}" — enter the per-watt rate yourself (scraped price ${formatPkr(
                      snapshot.priceRs
                    )} isn't a per-watt figure).`
                  : `This category is priced per watt of system size by the pricing engine. The scraped ${formatPkr(
                      snapshot.priceRs
                    )} is a per-item reference price, not a system rate — enter your own per-watt rate.`}
              </p>
            )}
            {requiredUnit === "PER_WATT" && suggestedRate !== null && watts && (
              <p className="mt-1.5 text-[11px] text-stone-400">
                Suggested from {formatPkr(snapshot.priceRs)} ÷ {watts}W — review before saving.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onSkip}
              disabled={saving}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-stone-200 px-4 text-sm font-medium text-stone-600 transition-colors duration-200 hover:bg-stone-50 disabled:opacity-60"
            >
              <SkipForward className="h-4 w-4" /> Skip
            </button>
            <button
              type="submit"
              disabled={saving || !actingAdminId}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-stone-900 text-sm font-semibold text-white transition-colors duration-200 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving…" : saveMode === "update" ? "Update Cost" : "Add Material"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
