"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  ShieldAlert,
  MessageCircle,
  CheckCircle2,
  Cable,
  Building2,
  StickyNote,
  RefreshCw,
  FileText,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { internalFetch, type ApiJson } from "@/lib/internal/access";

// ============================================================================
// Types (mirrors GET /api/admin/checker/quotes)
// ============================================================================

/** Mirrors lib/auth/internal-guard.ts's AdminIdentity — see the same type
 *  in app/admin/leads/page.tsx (added alongside this one, 2026-08-20's
 *  delegated-access update). */
interface Viewer {
  kind: "SUPER_ADMIN" | "ADMIN";
  userId: string | null;
  name: string;
}

interface PricingBreakdown {
  panelPKR: number;
  inverterPKR: number;
  batteryPKR: number;
  breakersPKR: number;
  structurePKR: number;
  installationPKR: number;
  dcCablePKR: number;
  acCablePKR: number;
  dataCablePKR: number;
  dbUpgradePKR: number;
}

interface Pricing {
  exactRawCostPKR: number;
  exactClientPricePKR: number;
  profitPKR: number;
  profitPercent: number;
  breakdown: PricingBreakdown;
  /** Same lines, each individually marked up — not shown in the Checker
   *  UI (breakdown/raw cost is what's audited here), but exists so the
   *  type matches what the API actually returns. */
  markedUpBreakdown: PricingBreakdown;
  /** Null for ONGRID_ZERO_EXPORT quotes. Pre-populates the editable
   *  "Final Approved Battery Capacity" field. */
  batteryCapacityKwh: number | null;
}

interface ReviewQuote {
  id: string;
  quoteNumber: string;
  sector: string;
  systemKw: number;
  automatedEstimatePriceRs: number;
  makerSubmittedAt: string | null;
  billSource: string;
  uploadedBillFileUrl: string | null;
  lead: { fullName: string; phone: string; city: string };
  survey: {
    engineerName: string;
    roofType: string;
    structureChoice: string;
    dcCableMeters: number;
    acCableMeters: number;
    dataCableMeters: number;
    requiresDbUpgrade: boolean;
    /** The engineer's on-site request — null if unset or ONGRID_ZERO_EXPORT.
     *  Already folded into `pricing.batteryCapacityKwh`'s default; shown
     *  separately here purely for the Super Admin's context. */
    surveyedBatteryCapacityKwh: number | null;
    photos: Record<string, string | null> | null;
    engineerNotes: string | null;
  };
  pricing: Pricing | null;
  pricingError: string | null;
}

interface Admin {
  id: string;
  name: string;
}

interface ApproveResult {
  quote: { id: string; status: string; finalPriceRs: number };
  whatsapp: { href: string; toPhone: string; message: string };
}

const pkr = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const formatPKR = (n: number) => pkr.format(n);

const ROOF_TYPE_LABELS: Record<string, string> = {
  RCC_CONCRETE: "RCC Concrete",
  CORRUGATED_METALLIC: "Corrugated Metallic",
  GROUND_MOUNT: "Ground Mount",
};
const STRUCTURE_LABELS: Record<string, string> = {
  STANDARD_L1_L2: "Standard L1/L2",
  CUSTOM_ELEVATED: "Custom Elevated",
};

// ============================================================================
// Page
// ============================================================================

export default function CheckerDashboardPage() {
  const { onUnauthorized } = useAdminAuth();
  return <CheckerDashboard onUnauthorized={onUnauthorized} />;
}

function CheckerDashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [quotes, setQuotes] = useState<ReviewQuote[] | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Cards stay mounted after approval (so their success/WhatsApp state
  // keeps showing) — this tracks which ones to exclude from the "pending"
  // count without unmounting them.
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const [quotesRes, adminsRes] = await Promise.all([
        internalFetch("ADMIN", "/api/admin/checker/quotes"),
        internalFetch("ADMIN", "/api/admin/checker/admins"),
      ]);
      if (quotesRes.status === 401 || adminsRes.status === 401) return onUnauthorized();

      const quotesData = (await quotesRes.json()) as ApiJson<{ quotes?: ReviewQuote[]; viewer?: Viewer | null }>;
      const adminsData = (await adminsRes.json()) as ApiJson<{ admins?: Admin[] }>;

      if (!quotesRes.ok) throw new Error(quotesData?.error ?? "Could not load quotes.");
      if (!adminsRes.ok) throw new Error(adminsData?.error ?? "Could not load admins.");

      setQuotes(quotesData.quotes ?? []);
      setAdmins(adminsData.admins ?? []);
      setViewer(quotesData.viewer ?? null);
      setApprovedIds(new Set());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred so the initial fetch's synchronous setState calls (loading/
    // error resets) don't run inside the effect's own call stack.
    const id = setTimeout(loadAll, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ colorScheme: "dark" }} className="min-h-dvh bg-[var(--color-bg)] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--color-neon)]">
              Solar Pixel · Checker
              {viewer && <span className="text-[var(--color-ink-faint)]"> · Signed in as {viewer.name}</span>}
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-[var(--color-ink)]">Approval Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Quotes awaiting review, {quotes?.filter((q) => !approvedIds.has(q.id)).length ?? 0} pending
            </p>
          </div>
          <div className="flex items-center gap-2">
            {viewer?.kind === "SUPER_ADMIN" && (
              <Link
                href="/admin/team"
                className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
              >
                <UserCog className="h-3.5 w-3.5" />
                Manage Admins
              </Link>
            )}
            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        {loading && !quotes && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-ink-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {loadError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {loadError}
          </p>
        )}

        {quotes && quotes.length === 0 && !loading && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-ink-muted)]">
            Nothing waiting on review right now.
          </div>
        )}

        <div className="space-y-4">
          {quotes?.map((q) => (
            <QuoteReviewCard
              key={q.id}
              quote={q}
              admins={admins}
              onUnauthorized={onUnauthorized}
              onApproved={(id) => setApprovedIds((prev) => new Set(prev).add(id))}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// Quote review card
// ============================================================================

function QuoteReviewCard({
  quote,
  admins,
  onUnauthorized,
  onApproved,
}: {
  quote: ReviewQuote;
  admins: Admin[];
  onUnauthorized: () => void;
  onApproved: (quoteId: string) => void;
}) {
  const [approverId, setApproverId] = useState("");
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [result, setResult] = useState<ApproveResult | null>(null);

  // Live pricing — starts as whatever GET /api/admin/checker/quotes
  // computed, then updates in place as the Super Admin edits the battery
  // capacity below (see the recalculate effect). Approve always sends
  // THIS value's capacity, so what's approved always matches what's on
  // screen — no possibility of approving a stale preview.
  const [pricing, setPricing] = useState<Pricing | null>(quote.pricing);
  const [batteryCapacityInput, setBatteryCapacityInput] = useState(
    quote.pricing?.batteryCapacityKwh != null ? String(quote.pricing.batteryCapacityKwh) : ""
  );
  const [recalculating, setRecalculating] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);

  const hasBattery = quote.pricing?.batteryCapacityKwh != null;

  // Debounced live recalculation — fires ~500ms after the Super Admin
  // stops typing a new battery capacity, not on every keystroke. Every
  // setState call here lives inside the setTimeout callback, not
  // synchronously in the effect body (same pattern as the
  // equipment-options fetch effect in app/page.tsx).
  useEffect(() => {
    if (!hasBattery) return;
    const parsedKwh = Number(batteryCapacityInput);
    if (!Number.isFinite(parsedKwh) || parsedKwh <= 0) return;
    if (pricing && parsedKwh === pricing.batteryCapacityKwh) return;

    const timeoutId = setTimeout(async () => {
      setRecalculating(true);
      setRecalcError(null);
      try {
        const res = await internalFetch("ADMIN", `/api/admin/checker/quotes/${quote.id}/recalculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finalBatteryCapacityKwh: parsedKwh }),
        });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        const data = (await res.json()) as ApiJson<{ pricing?: Pricing }>;
        if (!res.ok) {
          setRecalcError(data?.error ?? "Could not recalculate.");
          return;
        }
        setPricing(data.pricing as Pricing);
      } catch {
        setRecalcError("Network error. Please try again.");
      } finally {
        setRecalculating(false);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [batteryCapacityInput, hasBattery, pricing, quote.id, onUnauthorized]);

  const variancePct =
    pricing && quote.automatedEstimatePriceRs > 0
      ? Math.round(((pricing.exactClientPricePKR - quote.automatedEstimatePriceRs) / quote.automatedEstimatePriceRs) * 1000) / 10
      : null;

  async function handleApprove() {
    if (!approverId) {
      setApproveError("Select who is approving this quote.");
      return;
    }
    setApproving(true);
    setApproveError(null);
    try {
      const parsedKwh = Number(batteryCapacityInput);
      const res = await internalFetch("ADMIN", `/api/admin/checker/quotes/${quote.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedById: approverId,
          // Send the confirmed capacity currently on screen — whatever
          // was last successfully recalculated — so what gets approved
          // always matches what the Super Admin actually saw and reviewed.
          ...(hasBattery && Number.isFinite(parsedKwh) && parsedKwh > 0 ? { finalBatteryCapacityKwh: parsedKwh } : {}),
        }),
      });
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<ApproveResult>;
      if (!res.ok) {
        setApproveError(data?.error ?? "Could not approve this quote.");
        return;
      }
      setResult(data);
      onApproved(quote.id);
    } catch {
      setApproveError("Network error. Please try again.");
    } finally {
      setApproving(false);
    }
  }

  if (result) {
    return (
      <div className="animate-fade-up rounded-2xl border border-[var(--color-neon-dim)]/40 bg-[var(--color-neon)]/5 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-[var(--color-neon)]" />
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            {quote.quoteNumber} approved: {formatPKR(result.quote.finalPriceRs)}
          </p>
        </div>
        <a
          href={result.whatsapp.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[var(--color-amber)] py-3 text-sm font-semibold text-[var(--color-amber-ink)] transition hover:bg-[var(--color-amber-strong)]"
        >
          <MessageCircle className="h-4 w-4" />
          Send Contract via WhatsApp
        </a>
        <p className="mt-2 text-center text-[11px] text-[var(--color-ink-faint)]">to {result.whatsapp.toPhone}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-[var(--color-ink-faint)]">Quote #{quote.quoteNumber}</p>
          <p className="text-base font-semibold text-[var(--color-ink)]">{quote.lead.fullName}</p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {quote.lead.city} · {quote.sector} · {quote.systemKw} kW
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink-muted)]">
            Surveyed by {quote.survey.engineerName}
          </span>
          {quote.uploadedBillFileUrl && (
            <a
              href={quote.uploadedBillFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-amber)] hover:underline"
            >
              <FileText className="h-3 w-3" /> View Uploaded Bill
            </a>
          )}
        </div>
      </div>

      {/* Price comparison */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3">
          <p className="text-[11px] text-[var(--color-ink-muted)]">Automated Web Estimate</p>
          <p className="mt-0.5 text-base font-bold text-[var(--color-ink)]">{formatPKR(quote.automatedEstimatePriceRs)}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-muted)]">
            Exact Quotation Price
            {recalculating && <Loader2 className="h-3 w-3 animate-spin" />}
          </p>
          {pricing ? (
            <p className="mt-0.5 text-base font-bold text-[var(--color-ink)]">
              {formatPKR(pricing.exactClientPricePKR)}
              {variancePct !== null && (
                <span className={`ml-1.5 text-xs font-medium ${variancePct >= 0 ? "text-[var(--color-amber)]" : "text-[var(--color-neon)]"}`}>
                  ({variancePct > 0 ? "+" : ""}
                  {variancePct}%)
                </span>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-red-400">Unavailable</p>
          )}
        </div>
      </div>

      {hasBattery && (
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-3">
          <label htmlFor={`battery-kwh-${quote.id}`} className="text-[11px] text-[var(--color-ink-muted)]">
            Final Approved Battery Capacity (kWh)
          </label>
          {quote.survey.surveyedBatteryCapacityKwh != null && (
            <p className="mt-0.5 text-[10px] text-[var(--color-neon)]">
              Engineer requested {quote.survey.surveyedBatteryCapacityKwh} kWh on-site
            </p>
          )}
          <input
            id={`battery-kwh-${quote.id}`}
            type="text"
            inputMode="decimal"
            value={batteryCapacityInput}
            onChange={(e) => setBatteryCapacityInput(e.target.value.replace(/[^\d.]/g, ""))}
            className="mt-1 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/25"
          />
          <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
            Confirm or override the engineer&apos;s on-site request (or the pre-survey estimate, if no survey figure
            was given). The Quotation price above updates automatically.
          </p>
          {recalcError && <p className="mt-1 text-[11px] text-red-400">{recalcError}</p>}
        </div>
      )}

      {/* Survey details */}
      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-muted)]">
          <Building2 className="h-3.5 w-3.5" /> Measured Quotation
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <SurveyStat label="Roof Type" value={ROOF_TYPE_LABELS[quote.survey.roofType] ?? quote.survey.roofType} />
          <SurveyStat label="Structure" value={STRUCTURE_LABELS[quote.survey.structureChoice] ?? quote.survey.structureChoice} />
          <SurveyStat label="DC Cable" value={`${quote.survey.dcCableMeters} m`} />
          <SurveyStat label="AC Cable" value={`${quote.survey.acCableMeters} m`} />
          <SurveyStat label="Data Cable" value={`${quote.survey.dataCableMeters} m`} />
          <SurveyStat label="DB Upgrade" value={quote.survey.requiresDbUpgrade ? "Yes" : "No"} />
        </dl>
        {quote.survey.engineerNotes && (
          <p className="mt-2.5 flex items-start gap-1.5 border-t border-[var(--color-border)] pt-2.5 text-xs text-[var(--color-ink-muted)]">
            <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {quote.survey.engineerNotes}
          </p>
        )}
        {quote.survey.photos && Object.values(quote.survey.photos).some(Boolean) && (
          <div className="mt-2.5 flex gap-2 border-t border-[var(--color-border)] pt-2.5">
            {Object.entries(quote.survey.photos).map(([label, url]) =>
              url ? (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- locally-stored dev-only photo, next/image's remote-loader config isn't relevant here */}
                  <img src={url} alt={label} className="h-14 w-14 rounded-lg border border-[var(--color-border)] object-cover" />
                </a>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Confidential pricing */}
      {pricing ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--color-amber)]/40 bg-[var(--color-amber)]/5 p-3.5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-amber)]">
            <ShieldAlert className="h-3.5 w-3.5" /> Confidential: Super Admin Only
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <SurveyStat label="Raw Cost" value={formatPKR(pricing.exactRawCostPKR)} />
            <SurveyStat label="Profit" value={`${formatPKR(pricing.profitPKR)} (${pricing.profitPercent}%)`} />
          </dl>
          <details className="mt-2">
            <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
              <Cable className="h-3 w-3" /> Cost breakdown
            </summary>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 pl-4 text-[11px] text-[var(--color-ink-muted)]">
              <SurveyStat label="Panel" value={formatPKR(pricing.breakdown.panelPKR)} />
              <SurveyStat label="Inverter" value={formatPKR(pricing.breakdown.inverterPKR)} />
              {pricing.breakdown.batteryPKR > 0 && <SurveyStat label="Battery" value={formatPKR(pricing.breakdown.batteryPKR)} />}
              <SurveyStat label="Breakers" value={formatPKR(pricing.breakdown.breakersPKR)} />
              <SurveyStat label="Structure" value={formatPKR(pricing.breakdown.structurePKR)} />
              <SurveyStat label="Installation" value={formatPKR(pricing.breakdown.installationPKR)} />
              <SurveyStat label="DC Cable" value={formatPKR(pricing.breakdown.dcCablePKR)} />
              <SurveyStat label="AC Cable" value={formatPKR(pricing.breakdown.acCablePKR)} />
              <SurveyStat label="Data Cable" value={formatPKR(pricing.breakdown.dataCablePKR)} />
              {quote.survey.requiresDbUpgrade && (
                <SurveyStat label="DB Upgrade" value={formatPKR(pricing.breakdown.dbUpgradePKR)} />
              )}
            </dl>
          </details>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {quote.pricingError ?? "Pricing unavailable."}
        </p>
      )}

      {/* Approve action */}
      <div className="mt-4 flex flex-col gap-2 border-t border-[var(--color-border)] pt-4 sm:flex-row">
        <select
          value={approverId}
          onChange={(e) => setApproverId(e.target.value)}
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/25"
        >
          <option value="">Approving as…</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleApprove}
          disabled={approving || !pricing || recalculating}
          className="glow-cta flex items-center justify-center gap-2 rounded-xl bg-[var(--color-amber)] px-4 py-2.5 text-sm font-semibold text-[var(--color-amber-ink)] transition hover:bg-[var(--color-amber-strong)] disabled:cursor-not-allowed disabled:opacity-60 sm:whitespace-nowrap"
        >
          {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve & Generate Final Contract"}
        </button>
      </div>
      {approveError && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {approveError}
        </p>
      )}
    </div>
  );
}

function SurveyStat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[var(--color-ink-faint)]">{label}</dt>
      <dd className="text-right font-medium text-[var(--color-ink)]">{value}</dd>
    </>
  );
}
