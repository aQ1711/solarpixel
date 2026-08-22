import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { prisma } from "@/lib/db/client";
import { PrintButton } from "./PrintButton";

/**
 * Public, unauthenticated quote view — GET /quote/:quoteId. Serves as
 * the "📄 Official PDF Quotation" link in the WhatsApp CTA messages
 * (see lib/whatsapp's sibling client-side message builders in
 * app/page.tsx's ResultSummary).
 *
 * DELIBERATE SCOPE DECISION, not an oversight: this is a real webpage a
 * customer can view or print-to-PDF via their own browser (PrintButton,
 * same window.print() convention as "Download Quotation (PDF)" on the
 * main site — see that button's doc comment), NOT a server-rendered
 * binary PDF file at a stored URL. Building an actual PDF-generation +
 * file-storage pipeline (headless Chrome rendering, real object
 * storage) is a materially bigger, separate project — no PDF library is
 * installed, and this project's existing file storage (lib/storage/
 * local.ts) writes to local disk, which doesn't survive a Netlify
 * redeploy (see project memory's open-gaps entry #2) — the exact same
 * problem a persisted PDF file would hit. A stable webpage URL avoids
 * that gap entirely and gives an equivalent result (the recipient can
 * still save/print it as a PDF themselves).
 *
 * DATA EXPOSED, DELIBERATELY MINIMAL: only `resolvedEquipmentSnapshot`/
 * `breakdownSnapshot` — both already documented as cost-free, client-
 * safe DTOs in schema.prisma (never a raw vendor cost or margin %,
 * never PII). The customer's `Lead` (fullName/phone) is intentionally
 * NEVER joined or shown here — this route has no auth and a quote's
 * `id` (a cuid) could in principle be forwarded/leaked, so keeping PII
 * off this specific page is a deliberate privacy floor, independent of
 * how unguessable a cuid already is.
 *
 * DETAIL LEVEL, also deliberate: this shows the SAME granularity as the
 * live report's "Cost Breakdown" section (one line per category,
 * including combined Site Works/Panel Washing totals) — NOT the
 * itemized BOQ table's per-row descriptions (e.g. the exact "50 Panels
 * @ Rs 150/panel" wording). Reproducing that would need the live
 * panelWashing/siteWorks resolution detail, which isn't persisted on
 * `Quote` today (only the category PKR totals are, via
 * `breakdownSnapshot`) — a real follow-up if the itemized view is
 * needed here too, not silently faked from the totals alone.
 */

const pkr = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const formatPKR = (n: number) => pkr.format(n);

const SERVICE_TYPE_LABEL: Record<string, string> = {
  HYBRID_BATTERY: "Hybrid + Battery Backup",
  ONGRID_ZERO_EXPORT: "On-Grid",
};

const SECTOR_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INDUSTRIAL: "Industrial",
};

interface ResolvedEquipmentItem {
  code: string;
  brand: string | null;
  label: string;
  specValue: number | null;
}
interface ResolvedEquipmentSnapshot {
  panel: ResolvedEquipmentItem & { count: number };
  inverter: ResolvedEquipmentItem;
  battery: (ResolvedEquipmentItem & { capacityKwh: number }) | null;
}
interface BreakdownSnapshot {
  panelsPKR: number;
  inverterPKR: number;
  batteryPKR: number;
  cablingAndProtectionPKR: number;
  structurePKR: number;
  installationPKR: number;
  siteWorksPKR?: number;
  panelWashingPKR?: number;
}

const WHATSAPP_BUSINESS_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || "923000000000";

export default async function QuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      quoteNumber: true,
      sector: true,
      serviceType: true,
      estimatedSystemSizeKw: true,
      automatedEstimatePriceRs: true,
      resolvedEquipmentSnapshot: true,
      breakdownSnapshot: true,
      createdAt: true,
    },
  });

  if (!quote || !quote.resolvedEquipmentSnapshot || !quote.breakdownSnapshot) {
    notFound();
  }

  const equipment = quote.resolvedEquipmentSnapshot as unknown as ResolvedEquipmentSnapshot;
  const breakdown = quote.breakdownSnapshot as unknown as BreakdownSnapshot;
  const systemKw = quote.estimatedSystemSizeKw.toNumber();
  const totalPKR = quote.automatedEstimatePriceRs.toNumber();

  const breakdownRows: { label: string; valuePKR: number }[] = [
    { label: "Solar Panels", valuePKR: breakdown.panelsPKR },
    { label: "Inverter", valuePKR: breakdown.inverterPKR },
    ...(breakdown.batteryPKR > 0 ? [{ label: "Lithium Battery", valuePKR: breakdown.batteryPKR }] : []),
    { label: "Mounting Structure", valuePKR: breakdown.structurePKR },
    { label: "Cables, Protection & Safety Equipment", valuePKR: breakdown.cablingAndProtectionPKR },
    { label: "Installation & Commissioning", valuePKR: breakdown.installationPKR },
    ...(breakdown.siteWorksPKR ? [{ label: "Site Works", valuePKR: breakdown.siteWorksPKR }] : []),
    ...(breakdown.panelWashingPKR ? [{ label: "Panel Washing (One-Time Visit)", valuePKR: breakdown.panelWashingPKR }] : []),
  ];

  const waMessage = `Assalam o Alaikum! I'm reviewing my Solar Pixel quote (Reference ID: #${quoteId}) and would like to discuss it further.`;
  const waHref = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(waMessage)}`;

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-10 print:bg-white print:py-0 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <span className="text-lg font-semibold tracking-tight text-stone-900">Solar Pixel</span>
          <PrintButton />
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-200/50 sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Official Quotation</p>
              <h1 className="mt-1 text-2xl font-bold text-stone-900">{quote.quoteNumber}</h1>
              <p className="mt-1 text-sm text-stone-500">
                {SECTOR_LABEL[quote.sector] ?? quote.sector} · {SERVICE_TYPE_LABEL[quote.serviceType] ?? quote.serviceType}
              </p>
            </div>
            <p className="shrink-0 text-right text-xs text-stone-400">
              {quote.createdAt.toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs text-stone-500">System Size</p>
              <p className="mt-0.5 text-lg font-bold text-stone-900">{systemKw} kW</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs text-stone-500">Panels</p>
              <p className="mt-0.5 text-lg font-bold text-stone-900">
                {equipment.panel.count} × {equipment.panel.label}
              </p>
            </div>
            <div className="col-span-2 rounded-2xl border border-violet-200 bg-violet-50 p-4 sm:col-span-1">
              <p className="text-xs text-violet-700">Total Turnkey Price</p>
              <p className="mt-0.5 text-lg font-bold text-violet-900">{formatPKR(totalPKR)}</p>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Equipment</p>
            <ul className="space-y-1.5 text-sm text-stone-700">
              <li>
                Inverter: {equipment.inverter.label}
                {equipment.inverter.specValue ? ` (${equipment.inverter.specValue}kW)` : ""}
              </li>
              {equipment.battery && (
                <li>
                  Battery: {equipment.battery.label} ({equipment.battery.capacityKwh}kWh)
                </li>
              )}
            </ul>
          </div>

          <div className="mt-6 border-t border-stone-100 pt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Cost Breakdown</p>
            <div className="space-y-1.5 text-sm">
              {breakdownRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-stone-600">{row.label}</span>
                  <span className="font-medium text-stone-900">{formatPKR(row.valuePKR)}</span>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-2 text-base font-bold text-stone-900">
                <span>Total</span>
                <span>{formatPKR(totalPKR)}</span>
              </div>
            </div>
          </div>

          <p className="mt-6 text-xs text-stone-400">
            This is an instant estimate — the exact price is confirmed after an on-site engineering survey (Rs 5,000 fee
            applies). No WAPDA net-metering paperwork required.
          </p>
        </div>

        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-500 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-emerald-600 print:hidden"
        >
          <MessageCircle className="h-4 w-4" /> Discuss on WhatsApp
        </a>
      </div>
    </main>
  );
}
