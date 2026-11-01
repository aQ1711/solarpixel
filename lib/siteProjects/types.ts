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
  /** Catalog item this line was picked from; null for a custom line. */
  itemGroup: string | null;
  itemCode: string | null;
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

export type PaymentKind = "SURVEY_FEE" | "ADVANCE" | "PROGRESS" | "FINAL";

export const PAYMENT_KINDS: PaymentKind[] = ["SURVEY_FEE", "ADVANCE", "PROGRESS", "FINAL"];

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  SURVEY_FEE: "Survey fee",
  ADVANCE: "Advance",
  PROGRESS: "Progress payment",
  FINAL: "Final payment",
};

/** Admin only: one payment received from the customer. */
export interface CustomerPaymentDTO {
  id: string;
  kind: PaymentKind;
  amountPKR: number;
  /** YYYY-MM-DD */
  receivedOn: string;
  reference: string | null;
  note: string | null;
  /** Cancelled by mistake: still listed, no longer counted. */
  voided: boolean;
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
  /** Admin only (null for the labour head): what the customer is charged,
   *  entered by the Super Admin. */
  customerPricePKR: number | null;

  /** Admin only (empty for the labour head): what the customer has paid, newest last. */
  customerPayments: CustomerPaymentDTO[];
  /** Admin only (null for the labour head): total of the payments that count (not cancelled). */
  customerPaidPKR: number | null;

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

/** One pickable item for the labour head: a name only, never a price. */
export interface CatalogItemDTO {
  code: string;
  label: string;
}

export interface CatalogGroupDTO {
  group: string;
  label: string;
  /** Unit the line starts with when this group's item is picked. */
  defaultUnit: string;
  items: CatalogItemDTO[];
}

// ============================================================================
// Money checks (used by the admin screen and again by the server)
// ============================================================================

/** The least margin a job should make before the Super Admin has to confirm. */
export const MIN_JOB_MARGIN_PERCENT = 10;

export interface MarginCheck {
  level: "NO_PRICE" | "LOSS" | "LOW" | "OK";
  /** Customer price minus what the labour head is paid; null with no price. */
  marginPKR: number | null;
  marginPercent: number | null;
}

/** Is this job worth doing at this payout? Compares what the customer pays
 *  with what the labour head is paid. */
export function checkJobMargin(customerPricePKR: number | null, payoutPKR: number): MarginCheck {
  if (customerPricePKR === null || customerPricePKR <= 0) return { level: "NO_PRICE", marginPKR: null, marginPercent: null };
  const marginPKR = roundMoney(customerPricePKR - payoutPKR);
  const marginPercent = Math.round((marginPKR / customerPricePKR) * 1000) / 10;
  if (marginPKR < 0) return { level: "LOSS", marginPKR, marginPercent };
  if (marginPercent < MIN_JOB_MARGIN_PERCENT) return { level: "LOW", marginPKR, marginPercent };
  return { level: "OK", marginPKR, marginPercent };
}

export interface PaymentCheck {
  level: "NO_PRICE" | "UNPAID" | "OK";
  owedPKR: number | null;
  paidPKR: number;
  /** What the customer still has to pay; null with no price. */
  outstandingPKR: number | null;
}

/** Has the customer paid what they owe for this job? */
export function checkCustomerPaid(customerPricePKR: number | null, paidPKR: number): PaymentCheck {
  if (customerPricePKR === null || customerPricePKR <= 0) return { level: "NO_PRICE", owedPKR: null, paidPKR, outstandingPKR: null };
  const outstandingPKR = roundMoney(Math.max(customerPricePKR - paidPKR, 0));
  return { level: outstandingPKR > 0 ? "UNPAID" : "OK", owedPKR: customerPricePKR, paidPKR, outstandingPKR };
}
