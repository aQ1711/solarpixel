"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgePercent, Loader2, Plus } from "lucide-react";
import { internalFetch, type ApiJson } from "@/lib/internal/access";

/**
 * Bundle deals (2026-10-20): vendor combo prices for an inverter + battery
 * pair (e.g. the Goodwe ES Uniq / ET LV combos). The combo cost is a
 * confidential purchase cost, so this panel lives on the Super-Admin-only
 * Pricing page. The customer discount is derived from it automatically: the
 * saving versus the two items' current SEPARATE costs, passed on at the same
 * margin, so a rate change to either item moves the discount with it.
 */

interface Deal {
  id: string;
  inverterCode: string;
  inverterLabel: string;
  batteryCode: string;
  batteryLabel: string;
  comboCostRs: number;
  separateCostRs: number;
  savingRs: number;
  note: string | null;
  isActive: boolean;
}

interface CatalogOption {
  code: string;
  label: string;
  componentType: string;
  isActive: boolean;
}

const pkr = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });

export function BundleDealsPanel({
  catalog,
  onUnauthorized,
}: {
  catalog: CatalogOption[];
  onUnauthorized: () => void;
}) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newInverter, setNewInverter] = useState("");
  const [newBattery, setNewBattery] = useState("");
  const [newCost, setNewCost] = useState("");

  const call = useCallback(
    async (init?: RequestInit) => {
      const res = await internalFetch("ADMIN", "/api/admin/pricing/bundles", init);
      if (res.status === 401) {
        onUnauthorized();
        return null;
      }
      const data = (await res.json()) as ApiJson<{ deals?: Deal[] }>;
      if (!res.ok) throw new Error(data?.error ?? "Could not update bundle deals.");
      return data.deals ?? [];
    },
    [onUnauthorized],
  );

  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const d = await call();
        if (d) setDeals(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load bundle deals.");
      }
    }, 0);
    return () => clearTimeout(id);
  }, [call]);

  async function run(key: string, init: RequestInit, after?: () => void) {
    setBusyKey(key);
    setError(null);
    try {
      const d = await call({ ...init, headers: { "Content-Type": "application/json" } });
      if (d) {
        setDeals(d);
        after?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyKey(null);
    }
  }

  const inverters = catalog.filter((c) => c.componentType === "INVERTER" && c.isActive);
  const batteries = catalog.filter((c) => c.componentType === "BATTERY" && c.isActive);

  return (
    <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-900">
            <BadgePercent className="h-4 w-4 text-emerald-600" /> Bundle deals (inverter + battery combos)
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            Enter the vendor&apos;s combo price. Customers who pick that inverter and battery together get the whole saving
            versus buying them separately, at the same margin. The saving updates by itself when either item&apos;s cost changes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add deal
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {adding && (
        <form
          className="mt-4 grid gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-[1fr_1fr_9rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              "new",
              {
                method: "PUT",
                body: JSON.stringify({
                  inverterCode: newInverter,
                  batteryCode: newBattery,
                  comboCostRs: Number(newCost),
                  note: "10 years replacement warranty on Goodwe inverter + battery",
                }),
              },
              () => {
                setAdding(false);
                setNewInverter("");
                setNewBattery("");
                setNewCost("");
              },
            );
          }}
        >
          <select aria-label="Inverter" required value={newInverter} onChange={(e) => setNewInverter(e.target.value)} className="min-h-10 rounded-lg border border-stone-200 bg-white px-2.5 text-sm">
            <option value="">Inverter…</option>
            {inverters.map((i) => (
              <option key={i.code} value={i.code}>
                {i.label}
              </option>
            ))}
          </select>
          <select aria-label="Battery" required value={newBattery} onChange={(e) => setNewBattery(e.target.value)} className="min-h-10 rounded-lg border border-stone-200 bg-white px-2.5 text-sm">
            <option value="">Battery…</option>
            {batteries.map((b) => (
              <option key={b.code} value={b.code}>
                {b.label}
              </option>
            ))}
          </select>
          <input
            aria-label="Combo cost in rupees"
            inputMode="numeric"
            required
            placeholder="Combo cost"
            value={newCost}
            onChange={(e) => setNewCost(e.target.value.replace(/[^\d.]/g, ""))}
            className="min-h-10 rounded-lg border border-stone-200 bg-white px-2.5 text-sm"
          />
          <button type="submit" disabled={busyKey === "new"} className="min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busyKey === "new" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save"}
          </button>
        </form>
      )}

      {!deals && !error && (
        <div className="mt-4 flex items-center gap-2 text-sm text-stone-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {deals?.length === 0 && <p className="mt-4 text-sm text-stone-400">No bundle deals yet.</p>}

      {deals && deals.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-400">
                <th className="pb-2 font-medium">Inverter + battery</th>
                <th className="pb-2 font-medium">Separate cost</th>
                <th className="pb-2 font-medium">Combo cost</th>
                <th className="pb-2 font-medium">Saving</th>
                <th className="pb-2 text-right font-medium">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {deals.map((d) => {
                const edited = edits[d.id];
                const dirty = edited !== undefined && Number(edited) !== d.comboCostRs;
                return (
                  <tr key={d.id} className={d.isActive ? "" : "opacity-50"}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-stone-900">{d.inverterLabel}</p>
                      <p className="text-xs text-stone-500">+ {d.batteryLabel}</p>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-stone-600">{pkr.format(d.separateCostRs)}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          aria-label={`Combo cost for ${d.inverterLabel} with ${d.batteryLabel}`}
                          inputMode="numeric"
                          value={edited ?? String(d.comboCostRs)}
                          onChange={(e) => setEdits((p) => ({ ...p, [d.id]: e.target.value.replace(/[^\d.]/g, "") }))}
                          className="min-h-9 w-28 rounded-lg border border-stone-200 px-2 text-sm tabular-nums"
                        />
                        {dirty && (
                          <button
                            type="button"
                            disabled={busyKey === d.id}
                            onClick={() =>
                              run(
                                d.id,
                                { method: "PUT", body: JSON.stringify({ inverterCode: d.inverterCode, batteryCode: d.batteryCode, comboCostRs: Number(edited) }) },
                                () => setEdits((p) => { const n = { ...p }; delete n[d.id]; return n; }),
                              )
                            }
                            className="min-h-9 rounded-lg bg-violet-600 px-2.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {busyKey === d.id ? "…" : "Save"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`py-2.5 pr-3 tabular-nums font-medium ${d.savingRs > 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {d.savingRs > 0 ? pkr.format(d.savingRs) : "No saving"}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={d.isActive}
                        aria-label={`${d.isActive ? "Turn off" : "Turn on"} ${d.inverterLabel} with ${d.batteryLabel}`}
                        disabled={busyKey === d.id}
                        onClick={() => run(d.id, { method: "PATCH", body: JSON.stringify({ id: d.id, isActive: !d.isActive }) })}
                        className={`relative h-6 w-11 rounded-full transition-colors ${d.isActive ? "bg-emerald-600" : "bg-stone-300"}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${d.isActive ? "right-0.5" : "left-0.5"}`} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
