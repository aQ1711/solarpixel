/**
 * Site Projects (2026-10-07): shared, server-safe types and pure money
 * helpers. No `server-only` import on purpose — the labour-head page and
 * the admin review page both import these (types erase at build time, the
 * helpers are tiny pure functions) so the admin's live payout preview can
 * never drift from the number the server actually snapshots on approval.
 */

export type SiteProjectStatus =
  | "ASSIGNED"
  | "SUBMITTED"
  | "REVISION_REQUESTED"
  | "COUNTER_OFFERED"
  | "APPROVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "PAID"
  | "REJECTED";

export type SiteProjectEventType =
  | "CREATED"
  | "SUBMITTED"
  | "REVISION_REQUESTED"
  | "RESUBMITTED"
  | "COUNTER_OFFERED"
  | "ACCEPTED"
  | "DECLINED"
  | "APPROVED"
  | "REJECTED"
  | "STARTED"
  | "COMPLETED"
  | "PAID";

export interface SiteProjectMaterialDTO {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  proposedUnitPricePKR: number;
  /** Null until the Super Admin approves; then filled for every line. */
  approvedQuantity: number | null;
  approvedUnitPricePKR: number | null;
}

export interface SiteProjectEventDTO {
  id: string;
  type: SiteProjectEventType;
  actorLabel: string;
  note: string | null;
  createdAt: string;
}

export interface SiteProjectDTO {
  id: string;
  projectNumber: string;
  status: SiteProjectStatus;
  labourHead: { id: string; name: string };
  quote: { id: string; quoteNumber: string } | null;

  clientName: string;
  siteAddress: string;
  city: string;
  systemSizeKw: number | null;
  /** YYYY-MM-DD */
  plannedStartDate: string | null;
  crewSize: number | null;
  estimatedDays: number | null;
  scopeNotes: string | null;

  materials: SiteProjectMaterialDTO[];
  /** What the labour head proposed (sum of quantity x proposed price). */
  proposedMaterialsTotalPKR: number;
  /** The labour head's own service fee, entered with their quotation. */
  proposedLabourFeePKR: number;

  reviewNote: string | null;
  reviewedAt: string | null;
  /** The Super Admin's fee while COUNTER_OFFERED, the agreed fee once approved. */
  labourFeePKR: number | null;
  approvedMaterialsTotalPKR: number | null;
  /** Frozen at approval: approved materials + labour fee. */
  payoutPKR: number | null;
  /** Admin only (null for the labour head): what the customer quotation
   *  charges for everything except panels, inverters and batteries, to
   *  compare with the labour head's agreed price. */
  quotedBosPKR: number | null;

  startedAt: string | null;
  completedAt: string | null;
  completionNotes: string | null;

  paidAt: string | null;
  paymentReference: string | null;

  /** When the Super Admin created and assigned the project. */
  createdAt: string;
  /** When the labour head last submitted materials; null while ASSIGNED. */
  submittedAt: string | null;
  events: SiteProjectEventDTO[];
}

/** An approved/dispatched customer quote a project can optionally be linked
 *  to. Carries no price: the quote's price never travels with a site project
 *  (the labour head, who sees the project, must never see what the customer
 *  pays). */
export interface LinkableQuoteDTO {
  id: string;
  quoteNumber: string;
  clientName: string;
  city: string;
  address: string | null;
  systemKw: number;
  serviceType: string;
}

export interface LabourHeadOptionDTO {
  id: string;
  name: string;
}

/** What the admin's "New project" form needs to offer. */
export interface ProjectOptionsDTO {
  labourHeads: LabourHeadOptionDTO[];
  quotes: LinkableQuoteDTO[];
}

export const SITE_PROJECT_STATUS_LABEL: Record<SiteProjectStatus, string> = {
  ASSIGNED: "Waiting for materials",
  SUBMITTED: "Awaiting approval",
  REVISION_REQUESTED: "Changes requested",
  COUNTER_OFFERED: "Counter-offer sent",
  APPROVED: "Prices agreed, ready to start",
  IN_PROGRESS: "Site in progress",
  COMPLETED: "Completed, payout pending",
  PAID: "Paid",
  REJECTED: "Rejected",
};

/** Money math is done in whole paisa-safe 2dp steps so the figure shown to
 *  the admin while editing is identical to the one stored on approval. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineTotalPKR(quantity: number, unitPricePKR: number): number {
  return roundMoney(quantity * unitPricePKR);
}

export function sumLinesPKR(lines: { quantity: number; unitPricePKR: number }[]): number {
  return roundMoney(lines.reduce((sum, l) => sum + lineTotalPKR(l.quantity, l.unitPricePKR), 0));
}

/** Payout the labour head is owed: approved materials plus the labour fee. */
export function computePayoutPKR(approvedMaterialsTotalPKR: number, labourFeePKR: number): number {
  return roundMoney(approvedMaterialsTotalPKR + labourFeePKR);
}
