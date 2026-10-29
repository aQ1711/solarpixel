"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Loader2, Lock, Minus, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { internalFetch, type ApiJson } from "@/lib/internal/access";
import {
  COMPONENT_GROUPS,
  SECTOR_LABEL,
  itemKey,
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

// ============================================================================
// Builder
// ============================================================================

interface Picked {
  item: CatalogItemDTO;
  quantity: string;
  /** True once the creator typed or stepped the quantity themselves. Until
   *  then a per-kW item (structure, cabling, protection, labour) follows the
   *  system size worked out from the panels. */
  manual?: boolean;
  /** When editing: the unit price this line had in the version being edited,
   *  to flag lines whose catalog price has moved since. */
  wasPricePKR?: number;
}

const PER_KW_LABEL = "per kW of system";
const isPerKw = (item: CatalogItemDTO) => item.unitLabel === PER_KW_LABEL;

/**
 * The quotation form, used both to create a quotation and to edit one. Editing
 * never changes the quotation being edited: saving adds a new version (same
 * number, version + 1) priced from the current catalog.
 */
export function QuotationBuilder({
  editing,
  onUnauthorized,
  onCancel,
}: {
  editing?: CustomQuotationDTO;
  onUnauthorized: (reason?: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState(editing?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone ?? "");
  const [customerCity, setCustomerCity] = useState(editing?.customerCity ?? "Lahore");
  const [customerAddress, setCustomerAddress] = useState(editing?.customerAddress ?? "");
  const [sector, setSector] = useState<QuoteSector>(editing?.sector ?? "RESIDENTIAL");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [versionNote, setVersionNote] = useState("");
  // When editing, the saved lines are put back into the picker once the
  // catalog has loaded (exactly once; later sector changes just re-price).
  const seededFromEditing = useRef(false);
  const [droppedLabels, setDroppedLabels] = useState<string[]>([]);
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
        if (editing && !seededFromEditing.current) {
          seededFromEditing.current = true;
          const dropped: string[] = [];
          const seeded: Picked[] = [];
          for (const line of editing.items) {
            const fresh = items.find((i) => i.componentType === line.componentType && i.code === line.itemCode);
            if (!fresh) dropped.push(line.label);
            else seeded.push({ item: fresh, quantity: String(line.quantity), manual: true, wasPricePKR: line.unitPricePKR });
          }
          setPicked(seeded);
          setDroppedLabels(dropped);
        } else {
          setPicked((prev) =>
            prev.flatMap((p) => {
              const fresh = items.find((i) => itemKey(i) === itemKey(p.item));
              return fresh ? [{ ...p, item: fresh }] : [];
            }),
          );
        }
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

  // System size from the panels picked (panels x each one's watts), which the
  // per-kW items are priced against. Without this a 14.6 kW system was being
  // quoted as "1 kW" of structure/cabling/labour.
  const systemKw = roundMoney(
    picked
      .filter((p) => p.item.componentType === "SOLAR_PANEL")
      .reduce((sum, p) => sum + ((Number(p.quantity) || 0) * (p.item.specValue ?? 0)) / 1000, 0),
  );
  /** The quantity actually used: per-kW items follow the panels until edited. */
  const qtyOf = (p: Picked): number =>
    isPerKw(p.item) && !p.manual && systemKw > 0 ? systemKw : Number(p.quantity) || 0;

  const total = roundMoney(picked.reduce((s, p) => s + lineTotalPKR(qtyOf(p), p.item.unitPricePKR), 0));
  const pickedKeys = new Set(picked.map((p) => itemKey(p.item)));

  function add(item: CatalogItemDTO) {
    setPicked((prev) => (prev.some((p) => itemKey(p.item) === itemKey(item)) ? prev : [...prev, { item, quantity: "1" }]));
  }
  function setQty(key: string, quantity: string) {
    setPicked((prev) => prev.map((p) => (itemKey(p.item) === key ? { ...p, quantity, manual: true } : p)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Only codes and quantities are sent: the server sets every price.
      const res = await internalFetch("ADMIN", editing ? `/api/admin/custom-quotes/${editing.id}` : "/api/admin/custom-quotes", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerCity,
          customerAddress: customerAddress || null,
          sector,
          notes: notes || null,
          ...(editing ? { versionNote: versionNote || null } : {}),
          items: picked.map((p) => ({ code: p.item.code, componentType: p.item.componentType, quantity: qtyOf(p) })),
        }),
      });
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ quotation?: CustomQuotationDTO }>;
      if (!res.ok || !data.quotation) return setError(data?.error ?? (editing ? "Could not save the new version." : "Could not create the quotation."));
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
        <ArrowLeft className="h-4 w-4" /> {editing ? "Cancel" : "Back to quotations"}
      </button>

      {editing && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3.5 text-sm text-violet-900">
          <p className="font-semibold">
            Editing {editing.quotationNumber} (version {editing.version})
          </p>
          <p className="mt-0.5 text-xs text-violet-800">
            Saving creates version {editing.version + 1}. Version {editing.version} and the earlier ones stay exactly as they
            were. Prices are taken from today&apos;s catalog.
          </p>
        </div>
      )}
      {droppedLabels.length > 0 && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          These items are no longer in the catalog and were left out: {droppedLabels.join(", ")}.
        </p>
      )}

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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-stone-900">Quotation items</h2>
          {systemKw > 0 && (
            <p className="text-xs font-medium text-stone-500">
              System size from panels: <span className="tabular-nums text-stone-900">{systemKw} kW</span>
            </p>
          )}
        </div>
        {picked.length === 0 && <p className="text-sm text-stone-400">Nothing added yet. Pick items above.</p>}
        {picked.map((p) => {
          const qty = qtyOf(p);
          return (
            <div key={itemKey(p.item)} className="rounded-xl border border-stone-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900">{p.item.label}</p>
                  <p className="text-xs tabular-nums text-stone-500">
                    {formatPKR(p.item.unitPricePKR)} {p.item.unitLabel}
                  </p>
                  {p.wasPricePKR !== undefined && p.wasPricePKR !== p.item.unitPricePKR && (
                    <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                      Price is now {formatPKR(p.item.unitPricePKR)} (was {formatPKR(p.wasPricePKR)} in version {editing?.version}).
                    </p>
                  )}
                  {isPerKw(p.item) && (
                    <p className="mt-0.5 text-[11px] text-violet-600">
                      {p.manual
                        ? "Quantity set by you (kW)."
                        : systemKw > 0
                          ? `Follows your panels: ${systemKw} kW. Edit to change.`
                          : "Quantity in kW. Add panels to fill this in automatically."}
                    </p>
                  )}
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
                    value={isPerKw(p.item) && !p.manual && systemKw > 0 ? String(systemKw) : p.quantity}
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
        {editing && (
          <div>
            <label htmlFor="versionNote" className={LABEL}>
              What changed in this version? <span className="text-stone-400">(optional, internal)</span>
            </label>
            <input
              id="versionNote"
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              placeholder="e.g. Customer asked for a second battery"
              className={FIELD}
            />
          </div>
        )}
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
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? `Save as version ${editing.version + 1}` : "Create quotation"}
          </button>
        </div>
      </div>
    </form>
  );
}
