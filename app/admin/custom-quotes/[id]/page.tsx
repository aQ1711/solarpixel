"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, History, Loader2, MessageCircle, Pencil, Printer } from "lucide-react";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { BrandMark } from "@/components/BrandMark";
import { internalFetch, type ApiJson } from "@/lib/internal/access";
import { buildWaLink } from "@/lib/whatsapp";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, WEBSITE_URL } from "@/lib/constants/contact";
import { SECTOR_LABEL, type CustomQuotationDTO } from "@/lib/customQuotation/types";

const pkr = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const formatPKR = (n: number) => pkr.format(n);
const formatQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Itemised WhatsApp text for the customer. Selling prices only. */
function buildMessage(q: CustomQuotationDTO): string {
  const lines = q.items.map((i) => `• ${i.label} × ${formatQty(i.quantity)} = ${formatPKR(i.lineTotalPKR)}`);
  return [
    `Assalam o Alaikum ${q.customerName},`,
    `Here is your Solar Pixel quotation ${q.quotationNumber}${q.version > 1 ? ` (version ${q.version})` : ""}:`,
    "",
    ...lines,
    "",
    `Total: ${formatPKR(q.totalPKR)}`,
    ...(q.notes ? ["", q.notes] : []),
    "",
    "Reply here to confirm or ask any question. Thank you!",
  ].join("\n");
}

export default function CustomQuotationPage() {
  const { onUnauthorized } = useAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [quotation, setQuotation] = useState<CustomQuotationDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await internalFetch("ADMIN", `/api/admin/custom-quotes/${id}`);
        if (res.status === 401) return onUnauthorized();
        const data = (await res.json()) as ApiJson<{ quotation?: CustomQuotationDTO }>;
        if (!res.ok || !data.quotation) return setError(data?.error ?? "Could not load the quotation.");
        setQuotation(data.quotation);
      } catch {
        setError("Network error. Please try again.");
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // The browser names a saved PDF after the page title, so make it read like a
  // file name: "Quotation CQ-2026-1690DF66 v2 - Mr Naveed - 20 Oct 2026".
  useEffect(() => {
    if (!quotation) return;
    const previous = document.title;
    const date = new Date(quotation.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const customer = quotation.customerName.replace(/[\\/:*?"<>|.]+/g, " ").replace(/\s+/g, " ").trim();
    document.title = `Quotation ${quotation.quotationNumber}${quotation.version > 1 ? ` v${quotation.version}` : ""} - ${customer} - ${date}`;
    return () => {
      document.title = previous;
    };
  }, [quotation]);

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-4 sm:px-8 sm:py-6 print:min-h-0 print:bg-white print:p-[10mm]">
      {/* A zero page margin is what makes the browser leave its own header and
          footer (date, title, URL) off the PDF; the main padding above keeps
          the sheet off the paper edge. */}
      <style>{"@media print{@page{size:A4;margin:0}}"}</style>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link href="/admin/custom-quotes" className="flex min-h-11 items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
            <ArrowLeft className="h-4 w-4" /> All quotations
          </Link>
          {quotation && (
            <div className="flex flex-wrap gap-2">
              {quotation.isLatest && (
                <Link
                  href={`/admin/custom-quotes/${quotation.id}/edit`}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-100"
                >
                  <Pencil className="h-4 w-4" /> Edit (new version)
                </Link>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-300"
              >
                <Printer className="h-4 w-4" /> Print / Save PDF
              </button>
              {quotation.isLatest && (
                <a
                  href={buildWaLink(quotation.customerPhone, buildMessage(quotation))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" /> Send on WhatsApp
                </a>
              )}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 print:hidden">
            {error}
          </p>
        )}
        {!quotation && !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-400 print:hidden">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {quotation && !quotation.isLatest && quotation.versions && (
          <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
            <span>
              You are viewing version {quotation.version}, which has been replaced. The latest is version{" "}
              {quotation.versions[quotation.versions.length - 1].version}.
            </span>
            <Link
              href={`/admin/custom-quotes/${quotation.versions[quotation.versions.length - 1].id}`}
              className="font-semibold text-amber-900 underline"
            >
              Open the latest
            </Link>
          </div>
        )}

        {quotation && (
          <article className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-200/50 print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
            <header
              className="relative z-10 p-6 text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact] sm:p-8"
              style={{ background: "linear-gradient(155deg, #0F172A 0%, #0B1220 60%, #0B3B30 150%)" }}
            >
              <div className="flex items-center gap-2.5">
                <BrandMark className="h-9 w-9 shrink-0" gradientId="solarPixelMarkGradientQuote" />
                <div>
                  <p className="text-sm font-semibold leading-tight">Solar Pixel</p>
                  <p className="text-[10px] text-slate-400">(Pvt) Ltd. · {WEBSITE_URL.replace("https://", "")}</p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest">
                <span className="text-emerald-400">Official Quotation</span>
                <span className="text-slate-400">{new Date(quotation.createdAt).toLocaleDateString("en-PK", { dateStyle: "long" })}</span>
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                {quotation.quotationNumber}
                {quotation.version > 1 && <span className="ml-2 text-base font-medium text-slate-400">Version {quotation.version}</span>}
              </h1>
              <p className="mt-1 text-sm text-slate-400">{SECTOR_LABEL[quotation.sector]} · Prepared for {quotation.customerName}</p>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-widest text-slate-400">Total price</p>
              <p className="font-mono text-3xl font-bold tabular-nums text-emerald-400 sm:text-4xl">{formatPKR(quotation.totalPKR)}</p>
            </header>

            <div className="relative isolate space-y-5 p-6 sm:p-8 print:[isolation:auto]">
            {/* Faint brand watermark centred on the items area (customer-facing quote look);
                deliberately not print:hidden so it survives Save as PDF. */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 opacity-[0.05] [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:fixed print:z-[1]"
            >
              <BrandMark className="h-full w-full" gradientId="customQuoteWatermark" />
            </div>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 print:bg-white">
                  <p className="text-xs text-stone-500">Prepared for</p>
                  <p className="mt-0.5 font-semibold text-stone-900">{quotation.customerName}</p>
                  <p className="text-sm text-stone-600">{quotation.customerPhone}</p>
                  <p className="text-sm text-stone-600">
                    {quotation.customerAddress ? `${quotation.customerAddress}, ` : ""}
                    {quotation.customerCity}
                  </p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 print:bg-white">
                  <p className="text-xs text-stone-500">Customer type</p>
                  <p className="mt-0.5 font-semibold text-stone-900">{SECTOR_LABEL[quotation.sector]}</p>
                  <p className="text-sm text-stone-600">Prepared by {quotation.createdByName}</p>
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Quotation items</p>
                <div className="mt-2 hidden grid-cols-[minmax(0,1fr)_4rem_7.5rem_8rem] gap-3 border-b border-stone-200 pb-2 text-xs font-medium text-stone-400 sm:grid">
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit price</span>
                  <span className="text-right">Amount</span>
                </div>
                <ul className="divide-y divide-stone-100">
                  {quotation.items.map((i) => (
                    <li key={i.id} className="grid grid-cols-2 gap-x-3 gap-y-0.5 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_4rem_7.5rem_8rem] sm:items-center">
                      <div className="col-span-2 sm:col-span-1">
                        <p className="font-medium text-stone-900">{i.label}</p>
                        <p className="text-xs text-stone-400">{i.unitLabel}</p>
                      </div>
                      <p className="text-stone-600 sm:text-right">
                        <span className="text-xs text-stone-400 sm:hidden">Qty </span>
                        {formatQty(i.quantity)}
                      </p>
                      <p className="text-right tabular-nums text-stone-600">{formatPKR(i.unitPricePKR)}</p>
                      <p className="col-span-2 text-right font-semibold tabular-nums text-stone-900 sm:col-span-1">{formatPKR(i.lineTotalPKR)}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-baseline justify-between border-t border-stone-200 pt-3">
                  <span className="text-sm font-semibold text-stone-900">Total</span>
                  <span className="font-mono text-2xl font-bold tabular-nums text-emerald-600">{formatPKR(quotation.totalPKR)}</span>
                </div>
              </section>

              {quotation.notes && (
                <section className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 text-sm text-stone-700 print:bg-white">
                  <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-stone-500">Notes</p>
                  <p className="whitespace-pre-line">{quotation.notes}</p>
                </section>
              )}

              <footer className="border-t border-stone-200 pt-3 text-xs text-stone-400">
                Solar Pixel (Pvt) Ltd. · {CONTACT_PHONE_DISPLAY} · {CONTACT_EMAIL}
              </footer>
            </div>
          </article>
        )}

        {quotation?.versions && quotation.versions.length > 1 && (
          <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm print:hidden sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
              <History className="h-4 w-4 text-stone-400" /> Version history
            </h2>
            <ul className="mt-3 divide-y divide-stone-100">
              {[...quotation.versions].reverse().map((v) => {
                const current = v.id === quotation.id;
                return (
                  <li key={v.id}>
                    <Link
                      href={`/admin/custom-quotes/${v.id}`}
                      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm transition hover:bg-stone-50 ${current ? "font-medium" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${current ? "bg-violet-600 text-white" : "bg-stone-100 text-stone-600"}`}>
                          v{v.version}
                        </span>
                        <span className="text-stone-700">
                          {v.version === quotation.versions![quotation.versions!.length - 1].version ? "Latest" : "Replaced"}
                          {v.versionNote ? ` · ${v.versionNote}` : v.version === 1 ? " · Original" : ""}
                        </span>
                      </span>
                      <span className="text-xs text-stone-500">
                        {new Date(v.createdAt).toLocaleDateString("en-PK", { dateStyle: "medium" })} · {v.createdByName} ·{" "}
                        <span className="font-semibold tabular-nums text-stone-800">{formatPKR(v.totalPKR)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
