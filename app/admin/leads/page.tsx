"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  RefreshCw,
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Zap,
  Sun,
  BatteryCharging,
  Receipt,
  FileText,
  ChevronRight,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { AccessGate } from "@/components/internal/AccessGate";
import { internalFetch } from "@/lib/internal/access";

// ============================================================================
// /admin/leads — Internal Admin Lead Dashboard.
//
// Deliberately LIGHT-themed, matching /admin/pricing (the newer of the two
// existing internal tools) rather than /admin/checker's dark theme — no
// single locked convention exists across /admin/*, and a data-dense grid +
// slide-out drawer reads cleanest on a light, spacious surface. Same
// AccessGate("ADMIN") shared-secret boundary as the other two dashboards —
// see lib/auth/internal-guard.ts for why this is interim, not real auth.
// ============================================================================

// ---- Types (mirror the API routes' JSON shapes) ----

type LeadStatus = "NEW" | "CONTACTED" | "SURVEY_BOOKED" | "WON" | "LOST";

/** Mirrors lib/auth/internal-guard.ts's AdminIdentity — who's actually
 *  looking at this page right now (the single Super Admin, or a
 *  delegated Admin identified by their personal access code). */
interface Viewer {
  kind: "SUPER_ADMIN" | "ADMIN";
  userId: string | null;
  name: string;
}

interface LeadListItem {
  id: string;
  createdAt: string;
  fullName: string;
  phone: string;
  sector: string;
  status: LeadStatus;
  quote: {
    id: string;
    quoteNumber: string;
    serviceType: string;
    status: string;
    systemKw: number;
    turnkeyPricePKR: number;
  } | null;
}

interface ResolvedEquipmentItem {
  code: string;
  brand: string | null;
  label: string;
  specValue: number | null;
}

interface ResolvedEquipment {
  panel: ResolvedEquipmentItem;
  inverter: ResolvedEquipmentItem;
  battery: (ResolvedEquipmentItem & { capacityKwh: number }) | null;
}

interface ItemizedBreakdown {
  panelsPKR: number;
  inverterPKR: number;
  batteryPKR: number;
  cablingAndProtectionPKR: number;
  structurePKR: number;
  installationPKR: number;
}

interface LeadDetail {
  lead: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    city: string;
    address: string | null;
    sector: string;
    source: string;
    status: LeadStatus;
    monthlyBillRs: number;
    createdAt: string;
  };
  quote: {
    id: string;
    quoteNumber: string;
    serviceType: string;
    status: string;
    systemKw: number;
    automatedEstimatePriceRs: number;
    finalPriceRs: number | null;
    billSource: string;
    uploadedBillFileUrl: string | null;
    createdAt: string;
    resolvedEquipment: ResolvedEquipment | null;
    breakdown: ItemizedBreakdown | null;
    breakdownIsEstimate: boolean;
    breakdownError: string | null;
  } | null;
}

// ---- Formatting & label helpers ----

const pkr = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const formatPKR = (n: number) => pkr.format(n);
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });

const SECTOR_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INDUSTRIAL: "Industrial",
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  HYBRID_BATTERY: "Hybrid + Battery",
  ONGRID_ZERO_EXPORT: "On-Grid",
};

const STATUS_CONFIG: Record<LeadStatus, { label: string; badge: string; dot: string }> = {
  NEW: { label: "New", badge: "border-slate-200 bg-slate-50 text-slate-700", dot: "bg-slate-400" },
  CONTACTED: { label: "Contacted", badge: "border-sky-200 bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  SURVEY_BOOKED: { label: "Survey Booked", badge: "border-violet-200 bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  WON: { label: "Won", badge: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  LOST: { label: "Lost", badge: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-500" },
};
const STATUS_ORDER: LeadStatus[] = ["NEW", "CONTACTED", "SURVEY_BOOKED", "WON", "LOST"];

// ============================================================================
// Page
// ============================================================================

export default function AdminLeadsPage() {
  return (
    <AccessGate role="ADMIN" title="Solar Pixel · Admin">
      {({ onUnauthorized }) => <LeadsDashboard onUnauthorized={onUnauthorized} />}
    </AccessGate>
  );
}

function LeadsDashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [leads, setLeads] = useState<LeadListItem[] | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  async function loadLeads() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await internalFetch("ADMIN", "/api/admin/leads");
      if (res.status === 401) return onUnauthorized();
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load leads.");
      setLeads(data.leads ?? []);
      setViewer(data.viewer ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred so the initial fetch's synchronous setState calls don't run
    // inside the effect's own call stack — same pattern as /admin/checker.
    const id = setTimeout(loadLeads, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStatusChange(leadId: string, status: LeadStatus) {
    // Optimistic — the row's badge updates immediately; the PATCH runs in
    // the background inside StatusSelect itself, which reverts on failure.
    setLeads((prev) => (prev ? prev.map((l) => (l.id === leadId ? { ...l, status } : l)) : prev));
  }

  const pendingCount = leads?.filter((l) => l.status !== "WON" && l.status !== "LOST").length ?? 0;

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-violet-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Solar Pixel · Admin
              {viewer && <span className="text-stone-400">· Signed in as {viewer.name}</span>}
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-stone-900">Lead Dashboard</h1>
            <p className="mt-1 text-sm text-stone-500">
              {leads?.length ?? 0} total leads · {pendingCount} in the active pipeline
            </p>
          </div>
          <div className="flex items-center gap-2">
            {viewer?.kind === "SUPER_ADMIN" && (
              <Link
                href="/admin/team"
                className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 shadow-sm transition hover:text-stone-900"
              >
                <UserCog className="h-3.5 w-3.5" />
                Manage Admins
              </Link>
            )}
            <button
              type="button"
              onClick={loadLeads}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 shadow-sm transition hover:text-stone-900 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        {loadError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        )}

        {loading && !leads ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : leads && leads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
            No leads yet — they&apos;ll show up here as customers submit quotes on the storefront.
          </div>
        ) : (
          <LeadsTable
            leads={leads ?? []}
            onSelectLead={setSelectedLeadId}
            onStatusChange={handleStatusChange}
            onUnauthorized={onUnauthorized}
          />
        )}
      </div>

      {selectedLeadId && (
        <LeadDetailDrawer
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onUnauthorized={onUnauthorized}
          onStatusChange={handleStatusChange}
        />
      )}
    </main>
  );
}

// ============================================================================
// Part 1 — The Lead Data Grid
// ============================================================================

function LeadsTable({
  leads,
  onSelectLead,
  onStatusChange,
  onUnauthorized,
}: {
  leads: LeadListItem[];
  onSelectLead: (id: string) => void;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
  onUnauthorized: () => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            <th className="px-4 py-3">Date Submitted</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">WhatsApp Number</th>
            <th className="px-4 py-3">Service Type</th>
            <th className="px-4 py-3 text-right">System Size</th>
            <th className="px-4 py-3 text-right">Turnkey Price</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => onSelectLead(lead.id)}
              className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-violet-50/40"
            >
              <td className="px-4 py-3 whitespace-nowrap text-stone-600">{formatDate(lead.createdAt)}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-stone-900">{lead.fullName}</p>
                <p className="text-xs text-stone-500">{SECTOR_LABELS[lead.sector] ?? lead.sector}</p>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-stone-600">{lead.phone}</td>
              <td className="px-4 py-3 whitespace-nowrap text-stone-600">
                {lead.quote ? (SERVICE_TYPE_LABELS[lead.quote.serviceType] ?? lead.quote.serviceType) : "—"}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap text-stone-600">
                {lead.quote ? `${lead.quote.systemKw} kW` : "—"}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-stone-900">
                {lead.quote ? formatPKR(lead.quote.turnkeyPricePKR) : "—"}
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <StatusSelect
                  leadId={lead.id}
                  status={lead.status}
                  onChange={onStatusChange}
                  onUnauthorized={onUnauthorized}
                />
              </td>
              <td className="px-4 py-3 text-right">
                <ChevronRight className="h-4 w-4 text-stone-300" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Part 2 — Status Pipeline Management
// ============================================================================

/** A `<select>` visually styled as a colored badge/pill (not a plain
 *  dropdown box) — satisfies the brief's "status badge/dropdown" as one
 *  control rather than a separate read-only badge plus an edit affordance.
 *  PATCHes on change, optimistically via `onChange` first, then reverts
 *  the visible value if the request fails. */
function StatusSelect({
  leadId,
  status,
  onChange,
  onUnauthorized,
}: {
  leadId: string;
  status: LeadStatus;
  onChange: (leadId: string, status: LeadStatus) => void;
  onUnauthorized: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const cfg = STATUS_CONFIG[status];

  async function handleChange(next: LeadStatus) {
    const previous = status;
    onChange(leadId, next); // optimistic
    setSaving(true);
    setError(false);
    try {
      const res = await internalFetch("ADMIN", `/api/admin/leads/${leadId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.status === 401) return onUnauthorized();
      if (!res.ok) {
        onChange(leadId, previous); // revert
        setError(true);
      }
    } catch {
      onChange(leadId, previous);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={`relative inline-flex items-center rounded-full border ${cfg.badge}`}>
        <span className={`ml-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
        <select
          value={status}
          onChange={(e) => handleChange(e.target.value as LeadStatus)}
          disabled={saving}
          aria-label={`Status for this lead — currently ${cfg.label}`}
          className="cursor-pointer appearance-none bg-transparent py-1 pr-6 pl-1.5 text-xs font-medium outline-none disabled:cursor-wait"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_CONFIG[s].label}
            </option>
          ))}
        </select>
      </span>
      {saving && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-stone-400" />}
      {error && (
        <span className="text-[10px] text-red-600" title="Could not save — reverted">
          !
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Part 3 — The Lead Detail Drawer
// ============================================================================

function LeadDetailDrawer({
  leadId,
  onClose,
  onUnauthorized,
  onStatusChange,
}: {
  leadId: string;
  onClose: () => void;
  onUnauthorized: () => void;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
}) {
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDetail(null);
      try {
        const res = await internalFetch("ADMIN", `/api/admin/leads/${leadId}`);
        if (res.status === 401) return onUnauthorized();
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Could not load this lead.");
        if (!cancelled) setDetail(data as LeadDetail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error — please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close lead detail"
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-[1px]"
      />

      {/* Slide-out panel */}
      <div className="animate-drawer-in absolute top-0 right-0 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <p className="text-sm font-semibold text-stone-900">Lead Details</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {detail && (
            <LeadDetailContent
              detail={detail}
              onStatusChange={onStatusChange}
              onUnauthorized={onUnauthorized}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function LeadDetailContent({
  detail,
  onStatusChange,
  onUnauthorized,
}: {
  detail: LeadDetail;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
  onUnauthorized: () => void;
}) {
  const { lead, quote } = detail;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900">{lead.fullName}</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {quote ? `Quote #${quote.quoteNumber}` : "No quote on file"} · Submitted {formatDateTime(lead.createdAt)}
            </p>
          </div>
          <StatusSelect leadId={lead.id} status={lead.status} onChange={onStatusChange} onUnauthorized={onUnauthorized} />
        </div>
      </div>

      {/* Contact info */}
      <Section title="Contact Information" icon={User}>
        <DetailRow icon={Phone} label="WhatsApp Number" value={lead.phone} />
        {lead.email && <DetailRow icon={Mail} label="Email" value={lead.email} />}
        <DetailRow icon={MapPin} label="Location" value={[lead.address, lead.city].filter(Boolean).join(", ")} />
        <DetailRow icon={Zap} label="Sector" value={SECTOR_LABELS[lead.sector] ?? lead.sector} />
        <DetailRow icon={Receipt} label="Monthly Bill" value={formatPKR(lead.monthlyBillRs)} />
      </Section>

      {quote && (
        <>
          {/* Exact configuration */}
          <Section title="System Configuration" icon={Sun}>
            <DetailRow icon={Zap} label="Service Type" value={SERVICE_TYPE_LABELS[quote.serviceType] ?? quote.serviceType} />
            <DetailRow icon={Sun} label="System Size" value={`${quote.systemKw} kW`} />
            {quote.resolvedEquipment ? (
              <>
                <DetailRow icon={Sun} label="Solar Panel" value={quote.resolvedEquipment.panel.label} />
                <DetailRow icon={Zap} label="Inverter" value={quote.resolvedEquipment.inverter.label} />
                <DetailRow
                  icon={BatteryCharging}
                  label="Battery"
                  value={
                    quote.resolvedEquipment.battery
                      ? // Round2 — capacityKwh is `systemKw × DEFAULT_BATTERY_KWH_PER_SYSTEM_KW`
                        // (lib/db/admin.ts), which produces float noise like
                        // 3.5999999999999996 for perfectly round inputs.
                        `${quote.resolvedEquipment.battery.label} (${Math.round(quote.resolvedEquipment.battery.capacityKwh * 100) / 100} kWh)`
                      : "Not included (On-Grid)"
                  }
                />
              </>
            ) : (
              <p className="text-xs text-stone-400">Equipment configuration unavailable.</p>
            )}
            {quote.uploadedBillFileUrl && (
              <a
                href={quote.uploadedBillFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:underline"
              >
                <FileText className="h-3.5 w-3.5" /> View Uploaded Bill
              </a>
            )}
          </Section>

          {/* Financial breakdown */}
          <Section title="Financial Breakdown" icon={Receipt}>
            {quote.breakdownError && (
              <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                {quote.breakdownError}
              </p>
            )}
            {quote.breakdownIsEstimate && !quote.breakdownError && (
              <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                This quote predates saved pricing snapshots — figures below are reconstructed from today&apos;s
                catalog prices, not necessarily what the customer originally saw.
              </p>
            )}
            {quote.breakdown ? (
              (() => {
                const b = quote.breakdown;
                const hasBattery = Boolean(quote.resolvedEquipment?.battery);
                // Deliberately the SUM of the lines actually rendered below,
                // never quote.finalPriceRs/automatedEstimatePriceRs directly
                // — those come from a DIFFERENT pricing pass (a Checker's
                // exact site-survey BOQ, or — for a pre-snapshot legacy
                // quote — whatever the catalog priced at when it was
                // originally submitted, not at read time). Showing either
                // of those as "the total" here would silently NOT match the
                // line items above it whenever prices/margins have since
                // changed, which is exactly the "sum must match the total"
                // guarantee Part 4 depends on. Either figure is still shown
                // below, clearly labeled as a separate reference point.
                const breakdownTotal =
                  b.panelsPKR +
                  b.inverterPKR +
                  (hasBattery ? b.batteryPKR : 0) +
                  b.structurePKR +
                  b.cablingAndProtectionPKR +
                  b.installationPKR;
                return (
                  <dl className="space-y-1.5 text-sm">
                    <BreakdownRow label="Solar Panels" value={b.panelsPKR} />
                    <BreakdownRow label="Inverter" value={b.inverterPKR} />
                    {hasBattery && <BreakdownRow label="Lithium Battery" value={b.batteryPKR} />}
                    <BreakdownRow label="Galvanized Mounting Structure" value={b.structurePKR} />
                    <BreakdownRow label="Cabling, DB & Safety Equipment" value={b.cablingAndProtectionPKR} />
                    <BreakdownRow label="Installation & Commissioning" value={b.installationPKR} />
                    <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-2 text-sm font-bold text-stone-900">
                      <span>Total Turnkey Price</span>
                      <span>{formatPKR(breakdownTotal)}</span>
                    </div>
                    <p className="text-[11px] text-stone-400">Original web estimate: {formatPKR(quote.automatedEstimatePriceRs)}</p>
                    {quote.finalPriceRs !== null && (
                      <p className="text-[11px] text-stone-400">
                        Checker-approved contract price (exact site-survey BOQ): {formatPKR(quote.finalPriceRs)}
                      </p>
                    )}
                  </dl>
                );
              })()
            ) : (
              !quote.breakdownError && <p className="text-xs text-stone-400">Breakdown unavailable.</p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
      <div className="min-w-0">
        <p className="text-[11px] text-stone-400">{label}</p>
        <p className="font-medium text-stone-800">{value}</p>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-800">{formatPKR(value)}</dd>
    </div>
  );
}
