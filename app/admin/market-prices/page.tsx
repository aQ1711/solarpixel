"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Play, ExternalLink, Clock, AlertTriangle } from "lucide-react";
import { AccessGate } from "@/components/internal/AccessGate";
import { internalFetch } from "@/lib/internal/access";

// ============================================================================
// /admin/market-prices — Market Price Scraper dashboard (2026-08-22).
//
// Shows the most recent daily w11stop.com price snapshot (see
// lib/scraper/marketPriceJob.ts) and lets a Super Admin trigger a fresh
// run on demand. Deliberately READ-ONLY reference data — nothing here
// writes to the live catalog (RawVendorCost/EquipmentOption); an admin
// who spots a real price move still goes to /admin/pricing to act on it
// manually. Same light theme + AccessGate("ADMIN") shared-secret gate as
// /admin/leads and /admin/pricing — see AccessGate's own doc comment for
// why this is interim, not real auth.
// ============================================================================

type ComponentType = "SOLAR_PANEL" | "INVERTER" | "BATTERY" | string;

const COMPONENT_LABEL: Record<string, string> = {
  SOLAR_PANEL: "Solar Panels",
  INVERTER: "Inverters",
  BATTERY: "Batteries",
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

function formatPkr(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-PK")}`;
}

export default function MarketPricesAdminPage() {
  return (
    <AccessGate role="ADMIN" title="Market Price Scraper">
      {({ onUnauthorized }) => <MarketPricesDashboard onUnauthorized={onUnauthorized} />}
    </AccessGate>
  );
}

function MarketPricesDashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);
  const [lastResult, setLastResult] = useState<ScrapeResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  async function loadSnapshots() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await internalFetch("ADMIN", "/api/admin/market-prices");
      if (res.status === 401) return onUnauthorized();
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load market prices.");
      setSnapshots(data.snapshots ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(loadSnapshots, 0);
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
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "The scrape run failed.");
      setLastResult(data);
      await loadSnapshots();
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setScraping(false);
    }
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
              Real vendor listings from w11stop.com — reference only, never auto-applied to the live catalog.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
              onClick={loadSnapshots}
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
            <span>No snapshot yet — click Run Now, or wait for the daily 7:00 AM (PKT) automatic run.</span>
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
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([componentType, byBrand]) => (
              <section key={componentType} className="rounded-2xl border border-stone-200 bg-white shadow-sm">
                <h2 className="border-b border-stone-100 px-5 py-3 text-sm font-semibold text-stone-900">
                  {COMPONENT_LABEL[componentType] ?? componentType}
                </h2>
                <div className="divide-y divide-stone-100">
                  {Array.from(byBrand.entries()).map(([brand, items]) => (
                    <div key={brand} className="px-5 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{brand}</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <tbody className="divide-y divide-stone-50">
                            {items.map((item) => (
                              <tr key={item.id}>
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
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
