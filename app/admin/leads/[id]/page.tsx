"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Bot,
  HelpCircle,
  Clock,
  Link2,
  User,
  Sparkles,
  FileText,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { internalFetch, type ApiJson } from "@/lib/internal/access";
import {
  LeadDetailContent,
  StatusSelect,
  Section,
  DetailRow,
  formatPKTDateTime,
  formatDateTime,
  SECTOR_LABELS,
  type LeadDetail,
  type LeadStatus,
  type DeviceType,
  type LeadActivityType,
} from "../page";

/**
 * /admin/leads/:id — the "Lead Dossier": a dedicated full page for a
 * single lead (2026-08-25), replacing the old drawer-only detail view
 * as the complete experience (the drawer still exists for a quick
 * glance from the grid, and now links here via "Full Dossier →"). Reuses
 * LeadDetailContent/StatusSelect/Section/DetailRow from the list page's
 * module (../page) rather than duplicating the Contact/System/Financial
 * sections — this page only ADDS what the drawer never had: Lead
 * Intelligence and the Activity Timeline.
 *
 * Same client-side "ADMIN"-scoped internalFetch + useAdminAuth()
 * boundary as every other /admin/* page — the shared /admin/layout.tsx
 * already covers route-level access gating for anything under
 * /admin/leads (prefix-matched), so this page needs no AccessGate of
 * its own.
 */
export default function LeadDossierPage() {
  const { onUnauthorized } = useAdminAuth();
  const params = useParams<{ id: string }>();
  const leadId = params.id;

  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await internalFetch("ADMIN", `/api/admin/leads/${leadId}`);
        if (res.status === 401) return onUnauthorized();
        const data = (await res.json()) as ApiJson<LeadDetail>;
        if (!res.ok) throw new Error(data?.error ?? "Could not load this lead.");
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error. Please try again.");
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

  function handleStatusChange(id: string, status: LeadStatus) {
    setDetail((prev) => (prev && prev.lead.id === id ? { ...prev, lead: { ...prev.lead, status } } : prev));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/admin/leads"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition hover:text-stone-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Leads
      </Link>

      {loading && (
        <div className="mt-16 flex items-center justify-center gap-2 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading dossier…
        </div>
      )}

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      {detail && (
        <div className="mt-5 space-y-5">
          {/* Header */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Lead Dossier</p>
                <h1 className="mt-1 text-2xl font-bold text-stone-900">{detail.lead.fullName}</h1>
                <p className="mt-1 text-sm text-stone-500">
                  {SECTOR_LABELS[detail.lead.sector] ?? detail.lead.sector} ·{" "}
                  {detail.quote ? `Quote #${detail.quote.quoteNumber}` : "No quote on file"} · First seen{" "}
                  {formatDateTime(detail.lead.createdAt)}
                </p>
              </div>
              <StatusSelect
                leadId={detail.lead.id}
                status={detail.lead.status}
                onChange={handleStatusChange}
                onUnauthorized={onUnauthorized}
              />
            </div>
          </div>

          {/* Existing Contact/System/Financial sections, unchanged from
              the drawer */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <LeadDetailContent detail={detail} onStatusChange={handleStatusChange} onUnauthorized={onUnauthorized} />
          </div>

          {/* New: Lead Intelligence */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <LeadIntelligenceSection lead={detail.lead} />
          </div>

          {/* New: Activity Timeline */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <ActivityTimeline activities={detail.activities} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Lead Intelligence
// ============================================================================

const DEVICE_ICON: Record<DeviceType, typeof Monitor> = {
  MOBILE: Smartphone,
  TABLET: Tablet,
  DESKTOP: Monitor,
  BOT: Bot,
  UNKNOWN: HelpCircle,
};

const DEVICE_LABEL: Record<DeviceType, string> = {
  MOBILE: "Mobile",
  TABLET: "Tablet",
  DESKTOP: "Desktop",
  BOT: "Bot / Crawler",
  UNKNOWN: "Unknown device",
};

/** Every field here is best-effort/nullable by design — see each
 *  column's own doc comment in schema.prisma. A missing value renders
 *  as "Not captured", never a blank row or a fabricated placeholder,
 *  since a null here can mean several genuinely different things (an
 *  older lead predating this feature, a platform with no equivalent
 *  header, or the header simply not present on that request) and this
 *  page has no way to tell those apart. */
function LeadIntelligenceSection({ lead }: { lead: LeadDetail["lead"] }) {
  const DeviceIcon = lead.deviceType ? DEVICE_ICON[lead.deviceType] : HelpCircle;
  const locationParts = [lead.detectedCity, lead.detectedRegion, lead.detectedCountry].filter(Boolean);
  const hasCoords = lead.detectedLatitude !== null && lead.detectedLongitude !== null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600" />
        <h2 className="text-sm font-semibold text-stone-900">Lead Intelligence</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section title="Location" icon={Globe}>
          <DetailRow icon={Globe} label="Detected Location" value={locationParts.length > 0 ? locationParts.join(", ") : "Not captured"} />
          {hasCoords && (
            <DetailRow
              icon={Globe}
              label="Coordinates"
              value={`${lead.detectedLatitude!.toFixed(4)}, ${lead.detectedLongitude!.toFixed(4)}`}
            />
          )}
          <DetailRow icon={Globe} label="IP Address" value={lead.ipAddress ?? "Not captured"} />
          <DetailRow
            icon={Link2}
            label="Referrer"
            value={lead.referrerUrl ? new URL(lead.referrerUrl).hostname : "Direct / not captured"}
          />
        </Section>
        <Section title="Device" icon={DeviceIcon}>
          <DetailRow
            icon={DeviceIcon}
            label="Device Type"
            value={lead.deviceType ? DEVICE_LABEL[lead.deviceType] : "Not captured"}
          />
          <DetailRow icon={Monitor} label="Browser" value={lead.browserName ?? "Not captured"} />
          <DetailRow icon={Monitor} label="Operating System" value={lead.osName ?? "Not captured"} />
          <DetailRow icon={Clock} label="Captured At" value={formatPKTDateTime(lead.createdAt)} />
        </Section>
      </div>
      {/* Geolocation only ever populates on Vercel (production) — see
          extractLeadIntelligence's doc comment in lib/leadIntelligence.ts.
          A lead captured on localhost/Netlify staging will always show
          "Not captured" for location fields, which is expected, not a
          bug. */}
      {locationParts.length === 0 && (
        <p className="mt-3 text-[11px] text-stone-400">
          Location data is only available for leads captured on the production site.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Activity Timeline
// ============================================================================

const ACTIVITY_ICON: Record<LeadActivityType, typeof Sparkles> = {
  QUOTE_GENERATED: FileText,
  STATUS_CHANGED: TrendingUp,
  QUOTE_APPROVED: CheckCircle2,
};

const ACTIVITY_COLOR: Record<LeadActivityType, string> = {
  QUOTE_GENERATED: "bg-violet-100 text-violet-700",
  STATUS_CHANGED: "bg-amber-100 text-amber-700",
  QUOTE_APPROVED: "bg-emerald-100 text-emerald-700",
};

function ActivityTimeline({ activities }: { activities: LeadDetail["activities"] }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-violet-600" />
        <h2 className="text-sm font-semibold text-stone-900">Activity Timeline</h2>
      </div>
      {activities.length === 0 ? (
        <p className="text-xs text-stone-400">No activity recorded yet.</p>
      ) : (
        <ol className="relative space-y-5 border-l border-stone-200 pl-5">
          {activities.map((activity) => {
            const Icon = ACTIVITY_ICON[activity.type];
            return (
              <li key={activity.id} className="relative">
                <span
                  className={`absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full ${ACTIVITY_COLOR[activity.type]}`}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <p className="text-sm text-stone-800">{activity.description ?? activity.type}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-400">
                  <User className="h-3 w-3" /> {formatPKTDateTime(activity.createdAt)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
