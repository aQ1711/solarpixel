"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FilePlus2, Loader2, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { QuotationBuilder } from "@/components/admin/QuotationBuilder";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { internalFetch, type ApiJson } from "@/lib/internal/access";
import type { CustomQuotationDTO } from "@/lib/customQuotation/types";

const pkr = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const formatPKR = (n: number) => pkr.format(n);
const CARD = "rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5";

export default function CustomQuotesPage() {
  const { onUnauthorized, viewer } = useAdminAuth();
  const [quotations, setQuotations] = useState<CustomQuotationDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await internalFetch("ADMIN", "/api/admin/custom-quotes");
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ quotations?: CustomQuotationDTO[] }>;
      if (!res.ok) throw new Error(data?.error ?? "Could not load quotations.");
      setQuotations(data.quotations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-4 sm:px-8 sm:py-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-violet-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Solar Pixel · {viewer?.kind === "SUPER_ADMIN" ? "Super Admin" : (viewer?.name ?? "Admin")}
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-stone-900">Custom Quotations</h1>
            <p className="mt-1 text-sm text-stone-500">
              Build a quotation from any catalog items, such as a single inverter or battery. Prices are fixed from the catalog.
            </p>
          </div>
          {!creating && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="flex min-h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 shadow-sm transition hover:text-stone-900 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
              >
                <Plus className="h-3.5 w-3.5" /> New quotation
              </button>
            </div>
          )}
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {creating ? (
          <QuotationBuilder onUnauthorized={onUnauthorized} onCancel={() => setCreating(false)} />
        ) : (
          <>
            {loading && !quotations && (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
            {quotations?.length === 0 && (
              <div className={`${CARD} py-12 text-center`}>
                <FilePlus2 className="mx-auto h-8 w-8 text-stone-300" />
                <p className="mt-2 text-sm text-stone-500">No custom quotations yet. Tap New quotation to create one.</p>
              </div>
            )}
            <div className="space-y-2.5">
              {quotations?.map((q) => (
                <Link
                  key={q.id}
                  href={`/admin/custom-quotes/${q.id}`}
                  className="block rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-violet-300"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-[10rem] flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900">{q.customerName}</p>
                      <p className="mt-0.5 truncate text-xs text-stone-500">
                        {q.quotationNumber}
                        {q.version > 1 ? ` (v${q.version})` : ""} · {q.customerCity}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-stone-900">{formatPKR(q.totalPKR)}</p>
                  </div>
                  <p className="mt-2 text-xs text-stone-500">
                    {q.items.length} item{q.items.length === 1 ? "" : "s"} · {new Date(q.createdAt).toLocaleDateString("en-PK", { dateStyle: "medium" })}
                    {viewer?.kind === "SUPER_ADMIN" ? ` · by ${q.createdByName}` : ""}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
