"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, FilePlus2, Loader2, Lock, Minus, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { internalFetch, type ApiJson } from "@/lib/internal/access";
import {
  COMPONENT_GROUPS,
  itemKey,
  SECTOR_LABEL,
  lineTotalPKR,
  roundMoney,
  type CatalogItemDTO,
  type CustomQuotationDTO,
  type QuoteSector,
} from "@/lib/customQuotation/types";

const pkr = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const formatPKR = (n: number) => pkr.format(n);
const CARD = "rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5";
const FIELD =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200";
const LABEL = "mb-1 block text-xs font-medium text-stone-500";

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
                        {q.quotationNumber} · {q.customerCity}
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

// ============================================================================
// Builder
// ============================================================================

interface Picked {
  item: CatalogItemDTO;
  quantity: string;
}

function QuotationBuilder({ onUnauthorized, onCancel }: { onUnauthorized: (reason?: string) => void; onCancel: () => void }) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCity, setCustomerCity] = useState("Lahore");
  const [customerAddress, setCustomerAddress] = useState("");
  const [sector, setSector] = useState<QuoteSector>("RESIDENTIAL");
  const [notes, setNotes] = useState("");
  const [catalog, setCatalog] = useState<CatalogItemDTO[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // (Re)load the catalog for the chosen customer type. The server prices
  // every item itself, so picked items just re-bind to the fresh prices.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      setCatalog(null);
      setCatalogError(null);
      try {
        const res = await internalFetch("ADMIN", `/api/admin/custom-quotes/catalog?sector=${sector}`);
        if (res.status === 401) return onUnauthorized();
        const data = (await res.json()) as ApiJson<{ items?: CatalogItemDTO[] }>;
        if (cancelled) return;
        if (!res.ok) return setCatalogError(data?.error ?? "Could not load the catalog.");
        const items = data.items ?? [];
        setCatalog(items);
        setPicked((prev) =>
          prev.flatMap((p) => {
            const fresh = items.find((i) => itemKey(i) === itemKey(p.item));
            return fresh ? [{ ...p, item: fresh }] : [];
          }),
        );
      } catch {
        if (!cancelled) setCatalogError("Network error loading the catalog.");
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector]);

  const groupsPresent = useMemo(
    () => COMPONENT_GROUPS.filter((g) => catalog?.some((i) => i.componentType === g.type)),
    [catalog],
  );

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog ?? []).filter(
      (i) =>
        (group === "ALL" || i.componentType === group) &&
        (q === "" || i.label.toLowerCase().includes(q) || (i.brand ?? "").toLowerCase().includes(q)),
    );
  }, [catalog, search, group]);

  const total = roundMoney(picked.reduce((s, p) => s + lineTotalPKR(Number(p.quantity) || 0, p.item.unitPricePKR), 0));
  const pickedKeys = new Set(picked.map((p) => itemKey(p.item)));

  function add(item: CatalogItemDTO) {
    setPicked((prev) => (prev.some((p) => itemKey(p.item) === itemKey(item)) ? prev : [...prev, { item, quantity: "1" }]));
  }
  function setQty(key: string, quantity: string) {
    setPicked((prev) => prev.map((p) => (itemKey(p.item) === key ? { ...p, quantity } : p)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Only codes and quantities are sent: the server sets every price.
      const res = await internalFetch("ADMIN", "/api/admin/custom-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerCity,
          customerAddress: customerAddress || null,
          sector,
          notes: notes || null,
          items: picked.map((p) => ({ code: p.item.code, componentType: p.item.componentType, quantity: Number(p.quantity) })),
        }),
      });
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ quotation?: CustomQuotationDTO }>;
      if (!res.ok || !data.quotation) return setError(data?.error ?? "Could not create the quotation.");
      router.push(`/admin/custom-quotes/${data.quotation.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28">
      <button type="button" onClick={onCancel} className="flex min-h-11 items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" /> Back to quotations
      </button>

      <div className={`${CARD} space-y-3`}>
        <h2 className="text-base font-semibold text-stone-900">Customer</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="customerName" className={LABEL}>
              Name
            </label>
            <input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required className={FIELD} />
          </div>
          <div>
            <label htmlFor="customerPhone" className={LABEL}>
              WhatsApp number
            </label>
            <input id="customerPhone" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="03XX XXXXXXX" required className={FIELD} />
          </div>
          <div>
            <label htmlFor="customerCity" className={LABEL}>
              City
            </label>
            <input id="customerCity" value={customerCity} onChange={(e) => setCustomerCity(e.target.value)} required className={FIELD} />
          </div>
          <div>
            <label htmlFor="sector" className={LABEL}>
              Customer type
            </label>
            <select id="sector" value={sector} onChange={(e) => setSector(e.target.value as QuoteSector)} className={FIELD}>
              {(Object.keys(SECTOR_LABEL) as QuoteSector[]).map((s) => (
                <option key={s} value={s}>
                  {SECTOR_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="customerAddress" className={LABEL}>
            Address <span className="text-stone-400">(optional)</span>
          </label>
          <input id="customerAddress" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className={FIELD} />
        </div>
      </div>

      <div className={`${CARD} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-stone-900">Add items</h2>
          <p className="flex items-center gap-1 text-xs text-stone-400">
            <Lock className="h-3 w-3" /> Prices are fixed
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            aria-label="Search the catalog"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search, e.g. Goodwe, 10kW, battery"
            className={`${FIELD} pl-9`}
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ type: "ALL", label: "All" }, ...groupsPresent].map((g) => (
            <button
              key={g.type}
              type="button"
              onClick={() => setGroup(g.type)}
              aria-pressed={group === g.type}
              className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-xs font-medium transition ${
                group === g.type ? "border-violet-600 bg-violet-600 text-white" : "border-stone-200 bg-white text-stone-600"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {!catalog && !catalogError && (
          <div className="flex items-center gap-2 py-4 text-sm text-stone-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the catalog…
          </div>
        )}
        {catalogError && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {catalogError}
          </p>
        )}
        <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-100">
          {matches.map((i) => (
            <li key={itemKey(i)} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-stone-900">{i.label}</p>
                <p className="text-xs tabular-nums text-stone-500">
                  {formatPKR(i.unitPricePKR)} {i.unitLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => add(i)}
                disabled={pickedKeys.has(itemKey(i))}
                className="min-h-10 shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:border-stone-200 disabled:bg-stone-50 disabled:text-stone-400"
              >
                {pickedKeys.has(itemKey(i)) ? "Added" : "Add"}
              </button>
            </li>
          ))}
          {catalog && matches.length === 0 && <li className="px-3 py-6 text-center text-sm text-stone-400">No items match.</li>}
        </ul>
      </div>

      <div className={`${CARD} space-y-3`}>
        <h2 className="text-base font-semibold text-stone-900">Quotation items</h2>
        {picked.length === 0 && <p className="text-sm text-stone-400">Nothing added yet. Pick items above.</p>}
        {picked.map((p) => {
          const qty = Number(p.quantity) || 0;
          return (
            <div key={itemKey(p.item)} className="rounded-xl border border-stone-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900">{p.item.label}</p>
                  <p className="text-xs tabular-nums text-stone-500">
                    {formatPKR(p.item.unitPricePKR)} {p.item.unitLabel}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${p.item.label}`}
                  onClick={() => setPicked((prev) => prev.filter((x) => itemKey(x.item) !== itemKey(p.item)))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-stone-400 transition hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => setQty(itemKey(p.item), String(Math.max(1, qty - 1)))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    aria-label={`Quantity for ${p.item.label}`}
                    inputMode="decimal"
                    value={p.quantity}
                    onChange={(e) => setQty(itemKey(p.item), e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))}
                    className="h-10 w-16 rounded-lg border border-stone-200 text-center text-sm tabular-nums outline-none focus:border-violet-400"
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => setQty(itemKey(p.item), String(qty + 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm font-bold tabular-nums text-stone-900">{formatPKR(lineTotalPKR(qty, p.item.unitPricePKR))}</p>
              </div>
            </div>
          );
        })}
        <div>
          <label htmlFor="notes" className={LABEL}>
            Notes for the customer <span className="text-stone-400">(optional)</span>
          </label>
          <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={FIELD} />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-56">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-stone-400">Total</p>
            <p className="text-lg font-bold tabular-nums text-stone-900">{formatPKR(total)}</p>
          </div>
          <button
            type="submit"
            disabled={busy || picked.length === 0}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create quotation
          </button>
        </div>
      </div>
    </form>
  );
}
