import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { BrandMark } from "@/components/BrandMark";
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
  ONGRID_ZERO_EXPORT: "On Grid",
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
  // quantity is optional here because older snapshots (saved before the
  // 2026-08-29 multi-inverter "clubbing" fix) never had this field.
  inverter: ResolvedEquipmentItem & { quantity?: number };
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

/**
 * Page-specific title (2026-09-04, "should be professional... don't
 * mention Lahore") — without this, this page silently inherited the
 * root layout's homepage SEO title ("Solar Installation Lahore | Solar
 * Pixel", correct for that page's actual job: Google search results,
 * wrong for a document a customer opens/prints from a WhatsApp link).
 * Renders through the same root "%s | Solar Pixel" template every other
 * page here already uses (About/Privacy/Terms) — kept to quote number +
 * date only, deliberately no customer name: this route is public and
 * unauthenticated (see this file's own top doc comment on why PII is
 * never shown here), so nothing personally identifying belongs in a
 * <title> tag either, which can end up in browser history/tab previews.
 */
export async function generateMetadata({ params }: { params: Promise<{ quoteId: string }> }): Promise<Metadata> {
  const { quoteId } = await params;
  const prisma = await getDb();
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { quoteNumber: true, createdAt: true },
  });
  if (!quote) {
    return { title: "Quotation Not Found" };
  }
  const dateLabel = quote.createdAt.toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });
  return {
    title: `Quotation ${quote.quoteNumber} - ${dateLabel}`,
    description: `Official Solar Pixel quotation ${quote.quoteNumber}.`,
  };
}

export default async function QuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const prisma = await getDb();

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
    {
      label: equipment.inverter.quantity && equipment.inverter.quantity > 1 ? `Inverter (× ${equipment.inverter.quantity})` : "Inverter",
      valuePKR: breakdown.inverterPKR,
    },
    ...(breakdown.batteryPKR > 0 ? [{ label: "Lithium Battery", valuePKR: breakdown.batteryPKR }] : []),
    { label: "Mounting Structure", valuePKR: breakdown.structurePKR },
    { label: "Cables, Protection & Safety Equipment", valuePKR: breakdown.cablingAndProtectionPKR },
    { label: "Installation & Commissioning", valuePKR: breakdown.installationPKR },
    ...(breakdown.siteWorksPKR ? [{ label: "Site Works", valuePKR: breakdown.siteWorksPKR }] : []),
    ...(breakdown.panelWashingPKR ? [{ label: "Panel Washing (One Time Visit)", valuePKR: breakdown.panelWashingPKR }] : []),
  ];

  const waMessage = `Assalam o Alaikum! I'm reviewing my Solar Pixel quote (Reference ID: #${quoteId}) and would like to discuss it further.`;
  const waHref = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(waMessage)}`;

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-10 print:bg-white print:py-0 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-stone-900">
            {/* Real Solar Pixel brand mark (2026-08-29) — same one the
                storefront Header uses, see components/BrandMark.tsx. */}
            <BrandMark className="h-7 w-7 shrink-0" />
            Solar Pixel
          </span>
          <PrintButton />
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-200/50 print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
          {/* Background watermark (2026-09-04, "should have Solar pixel
              badging logo or watermark") — mirrors ResultSummary's own
              watermark (app/HomePageContent.tsx) so a customer following
              the WhatsApp "Official PDF Quotation" link to THIS page sees
              the same professional treatment. Deliberately NOT
              print:hidden — this is the actual "PDF" (PrintButton /
              window.print()), so the watermark must survive onto the
              saved/printed document, unlike the hero's decorative glow
              blob which is print:hidden. Own gradientId per BrandMark's
              own doc comment — this page already renders a second
              BrandMark in the screen-only chrome bar above. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 opacity-[0.04]"
          >
            <BrandMark className="h-full w-full" gradientId="quotePageWatermark" />
          </div>
          {/* Hero (2026-09-04, "need a better design for the quotation")
              — same dark-gradient treatment as the on-site ResultSummary
              this page mirrors, so a customer following the WhatsApp
              "Official PDF Quotation" link sees a consistent, premium
              document rather than a plainer stand-in. print color-adjust
              forced on for the same reason as ResultSummary's own hero:
              most browsers strip background colors when printing by
              default, and this page's own PrintButton IS the "PDF" —
              without it the header would print as blank white space. */}
          <div
            className="relative overflow-hidden rounded-t-3xl p-6 text-white sm:p-8 print:rounded-none print:border-b print:border-stone-300 print:p-6 print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]"
            style={{ background: "linear-gradient(155deg, #0F172A 0%, #0B1220 60%, #0B3B30 150%)" }}
          >
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-emerald-400/15 blur-[90px] print:hidden" />

            {/* Real logo in the hero itself, not just the screen-only
                chrome bar above (see the watermark comment on this same
                page) — matches ResultSummary's own hero treatment. */}
            <div className="relative flex items-center gap-2.5">
              <BrandMark className="h-9 w-9 shrink-0" gradientId="quotePageHeroMark" />
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight">Solar Pixel</p>
                <p className="text-[10px] leading-tight text-white/50">(Pvt) Ltd.</p>
              </div>
            </div>

            <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                Official Quotation
              </span>
              <span className="font-mono text-[10.5px] text-white/60">
                {quote.createdAt.toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            <h1 className="relative mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{quote.quoteNumber}</h1>
            <p className="relative mt-1 text-xs text-white/50 sm:text-sm">
              {SECTOR_LABEL[quote.sector] ?? quote.sector} · {SERVICE_TYPE_LABEL[quote.serviceType] ?? quote.serviceType}
            </p>
            <div className="relative mt-5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-white/50">Total Turnkey Price</p>
              <p className="mt-0.5 font-mono text-3xl font-bold leading-none text-emerald-400 sm:text-4xl">{formatPKR(totalPKR)}</p>
            </div>
          </div>

          <div className="p-6 sm:p-8">
          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Equipment</p>
            <ul className="space-y-1.5 text-sm text-stone-700">
              <li>
                Inverter: {equipment.inverter.label}
                {equipment.inverter.quantity && equipment.inverter.quantity > 1 ? ` × ${equipment.inverter.quantity}` : ""}
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
            This is an instant estimate. The exact price is confirmed after an on site engineering survey (Rs 5,000 fee
            applies). No WAPDA net metering paperwork required.
          </p>
          </div>
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
