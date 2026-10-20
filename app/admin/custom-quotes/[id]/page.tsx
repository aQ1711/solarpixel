"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, MessageCircle, Printer } from "lucide-react";
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
    `Here is your Solar Pixel quotation ${q.quotationNumber}:`,
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

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-4 sm:px-8 sm:py-6 print:min-h-0 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link href="/admin/custom-quotes" className="flex min-h-11 items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
            <ArrowLeft className="h-4 w-4" /> All quotations
          </Link>
          {quotation && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-300"
              >
                <Printer className="h-4 w-4" /> Print / Save PDF
              </button>
              <a
                href={buildWaLink(quotation.customerPhone, buildMessage(quotation))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> Send on WhatsApp
              </a>
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

        {quotation && (
          <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
            <header className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
              <div className="flex items-center gap-2.5">
                <BrandMark className="h-9 w-9 shrink-0" gradientId="solarPixelMarkGradientQuote" />
                <div>
                  <p className="text-lg font-bold leading-tight text-stone-900">Solar Pixel</p>
                  <p className="text-xs text-stone-500">{WEBSITE_URL.replace("https://", "")}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-stone-400">Quotation</p>
                <p className="text-sm font-semibold text-stone-900">{quotation.quotationNumber}</p>
                <p className="text-xs text-stone-500">{new Date(quotation.createdAt).toLocaleDateString("en-PK", { dateStyle: "long" })}</p>
              </div>
            </header>

            <section className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-stone-400">Prepared for</p>
                <p className="mt-0.5 font-semibold text-stone-900">{quotation.customerName}</p>
                <p className="text-stone-600">{quotation.customerPhone}</p>
                <p className="text-stone-600">
                  {quotation.customerAddress ? `${quotation.customerAddress}, ` : ""}
                  {quotation.customerCity}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs uppercase tracking-wider text-stone-400">Customer type</p>
                <p className="mt-0.5 text-stone-700">{SECTOR_LABEL[quotation.sector]}</p>
                <p className="mt-1 text-xs text-stone-400">Prepared by {quotation.createdByName}</p>
              </div>
            </section>

            <section className="mt-5">
              <div className="hidden grid-cols-[minmax(0,1fr)_4rem_7.5rem_8rem] gap-3 border-b border-stone-200 pb-2 text-xs font-medium text-stone-400 sm:grid">
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
                    <p className="text-right tabular-nums text-stone-600 sm:text-right">{formatPKR(i.unitPricePKR)}</p>
                    <p className="col-span-2 text-right font-semibold tabular-nums text-stone-900 sm:col-span-1">{formatPKR(i.lineTotalPKR)}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-baseline justify-between border-t-2 border-stone-900 pt-3">
                <span className="text-sm font-semibold uppercase tracking-wider text-stone-600">Total</span>
                <span className="text-2xl font-bold tabular-nums text-stone-900">{formatPKR(quotation.totalPKR)}</span>
              </div>
            </section>

            {quotation.notes && (
              <section className="mt-5 rounded-xl bg-stone-50 p-3 text-sm text-stone-700 print:border print:border-stone-200 print:bg-white">
                <p className="mb-0.5 text-xs font-medium uppercase tracking-wider text-stone-400">Notes</p>
                <p className="whitespace-pre-line">{quotation.notes}</p>
              </section>
            )}

            <footer className="mt-6 border-t border-stone-200 pt-3 text-xs text-stone-400">
              Solar Pixel · {CONTACT_PHONE_DISPLAY} · {CONTACT_EMAIL}
            </footer>
          </article>
        )}
      </div>
    </main>
  );
}
