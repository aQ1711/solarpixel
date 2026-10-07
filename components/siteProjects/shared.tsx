import { SITE_PROJECT_STATUS_LABEL, type SiteProjectEventType, type SiteProjectStatus } from "@/lib/siteProjects/types";

/** Whole rupees when the amount is whole, otherwise exactly 2 decimals
 *  (Rs 2,500.50, never Rs 2,500.5) — material unit prices like Rs 25.50
 *  shouldn't be rounded away or shown ragged. */
const pkrWhole = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pkrCents = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatPKR = (n: number) => (Number.isInteger(n) ? pkrWhole : pkrCents).format(n);

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(isoOrYmd: string): string {
  // YYYY-MM-DD parses as UTC midnight; render in UTC so it never slips a day.
  return new Date(isoOrYmd).toLocaleDateString("en-PK", { dateStyle: "medium", timeZone: "UTC" });
}

export const EVENT_LABEL: Record<SiteProjectEventType, string> = {
  CREATED: "Project created",
  SUBMITTED: "Materials submitted for approval",
  REVISION_REQUESTED: "Changes requested",
  RESUBMITTED: "Resubmitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  STARTED: "Site started",
  COMPLETED: "Site ended",
  PAID: "Payout released",
};

// Tone per status. Two palettes because the labour-head page is dark and
// the admin page is light; both keep the label readable on its ground.
const STATUS_TONE: Record<SiteProjectStatus, { light: string; dark: string }> = {
  ASSIGNED: { light: "bg-indigo-100 text-indigo-800", dark: "bg-indigo-400/15 text-indigo-300" },
  SUBMITTED: { light: "bg-amber-100 text-amber-800", dark: "bg-amber-400/15 text-amber-300" },
  REVISION_REQUESTED: { light: "bg-orange-100 text-orange-800", dark: "bg-orange-400/15 text-orange-300" },
  APPROVED: { light: "bg-emerald-100 text-emerald-800", dark: "bg-emerald-400/15 text-emerald-300" },
  IN_PROGRESS: { light: "bg-sky-100 text-sky-800", dark: "bg-sky-400/15 text-sky-300" },
  COMPLETED: { light: "bg-violet-100 text-violet-800", dark: "bg-violet-400/15 text-violet-300" },
  PAID: { light: "bg-stone-200 text-stone-700", dark: "bg-white/10 text-[var(--color-ink-muted)]" },
  REJECTED: { light: "bg-red-100 text-red-800", dark: "bg-red-400/15 text-red-300" },
};

export function StatusBadge({ status, dark = false }: { status: SiteProjectStatus; dark?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${
        dark ? STATUS_TONE[status].dark : STATUS_TONE[status].light
      }`}
    >
      {SITE_PROJECT_STATUS_LABEL[status]}
    </span>
  );
}
