import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  computePayoutPKR,
  roundMoney,
  sumLinesPKR,
  type CatalogGroupDTO,
  type LinkableQuoteDTO,
  type ProjectOptionsDTO,
  type SiteProjectDTO,
  type SiteProjectEventType,
  type SiteProjectStatus,
} from "@/lib/siteProjects/types";

/**
 * Site Projects (2026-10-07): the labour-head work-order workflow.
 *
 *   Super Admin creates the project + assigns a labour head -> ASSIGNED
 *   labour head enters the materials and their prices         -> SUBMITTED
 *   Super Admin reviews prices:
 *       approve (sets labour fee)           -> APPROVED
 *       send back with a note               -> REVISION_REQUESTED -> (edit) -> SUBMITTED
 *       edit the lines and counter-offer    -> COUNTER_OFFERED
 *           labour head accepts             -> APPROVED (prices fixed)
 *           labour head declines + note     -> REVISION_REQUESTED -> (edit) -> SUBMITTED
 *       reject / cancel                     -> REJECTED
 *   labour head starts the site             -> IN_PROGRESS
 *   labour head ends it with a report       -> COMPLETED
 *   Super Admin releases the payout         -> PAID
 *
 * The labour head never creates a project or edits its details; they only
 * pick the project assigned to them and enter materials. Details can be
 * corrected by the Super Admin until the project is approved.
 *
 * Public-schema client only (getDb): the prices here are the labour head's
 * own proposed purchase prices, never Solar Pixel's vendor cost or margin,
 * so it never needs (and never gets) the admin client. Every transition is a
 * conditional `updateMany` on the expected current status, so two
 * simultaneous taps/clicks can't both win.
 */

/** Thrown for expected business-rule failures; routes map it to a response. */
export class SiteProjectError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

const SUPER_ADMIN_LABEL = "Super Admin";

/** Statuses before the Super Admin has approved the prices: details are
 *  still correctable and the project can still be cancelled. */
const PRE_APPROVAL: SiteProjectStatus[] = ["ASSIGNED", "SUBMITTED", "REVISION_REQUESTED", "COUNTER_OFFERED"];

// ============================================================================
// Validation
// ============================================================================

const materialInputSchema = z.object({
  itemGroup: z.string().trim().min(1).max(40).nullish(),
  itemCode: z.string().trim().min(1).max(80).nullish(),
  name: z.string().trim().min(1, "Every material needs a name").max(120),
  unit: z.string().trim().min(1, "Every material needs a unit").max(20),
  quantity: z.coerce.number().positive("Quantity must be more than 0").max(1_000_000),
  unitPricePKR: z.coerce.number().positive("Price must be more than 0").max(100_000_000),
});

/** What the Super Admin enters when creating (or correcting) a project. */
export const projectDetailsSchema = z.object({
  labourHeadId: z.string().min(1, "Choose the labour head for this project"),
  quoteId: z.string().min(1).nullish(),
  clientName: z.string().trim().min(1, "Client name is required").max(120),
  siteAddress: z.string().trim().min(1, "Site address is required").max(300),
  city: z.string().trim().min(1, "City is required").max(80),
  systemSizeKw: z.coerce.number().positive().max(5000).nullish(),
  plannedStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid start date")
    .nullish(),
  crewSize: z.coerce.number().int().min(1).max(500).nullish(),
  estimatedDays: z.coerce.number().int().min(1).max(730).nullish(),
  scopeNotes: z.string().trim().max(4000).nullish(),
});
export type ProjectDetailsInput = z.infer<typeof projectDetailsSchema>;

/** What the labour head submits: only the materials and their prices. */
export const materialsInputSchema = z.object({
  materials: z.array(materialInputSchema).min(1, "Add at least one material").max(100),
  /** The labour head's own service fee, part of their quotation. */
  labourFeePKR: z.coerce.number().min(0, "Service fee can't be negative").max(100_000_000).default(0),
});
export type MaterialInput = z.infer<typeof materialInputSchema>;

export const reviewInputSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("APPROVE"),
    labourFeePKR: z.coerce.number().min(0, "Labour fee can't be negative").max(100_000_000),
    note: z.string().trim().max(1000).nullish(),
    materials: z
      .array(
        z.object({
          id: z.string().min(1),
          approvedQuantity: z.coerce.number().min(0).max(1_000_000),
          approvedUnitPricePKR: z.coerce.number().min(0).max(100_000_000),
        }),
      )
      .min(1),
  }),
  z.object({
    decision: z.literal("COUNTER_OFFER"),
    labourFeePKR: z.coerce.number().min(0, "Labour fee can't be negative").max(100_000_000),
    note: z.string().trim().max(1000).nullish(),
    materials: z
      .array(
        z.object({
          id: z.string().min(1),
          approvedQuantity: z.coerce.number().min(0).max(1_000_000),
          approvedUnitPricePKR: z.coerce.number().min(0).max(100_000_000),
        }),
      )
      .min(1),
  }),
  z.object({ decision: z.literal("REQUEST_REVISION"), note: z.string().trim().min(1, "Tell them what to change").max(1000) }),
  z.object({ decision: z.literal("REJECT"), note: z.string().trim().min(1, "Give a reason").max(1000) }),
]);
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const offerResponseSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("ACCEPT") }),
  z.object({ decision: z.literal("DECLINE"), note: z.string().trim().min(1, "Tell us what you want changed").max(1000) }),
]);
export type OfferResponseInput = z.infer<typeof offerResponseSchema>;

export const customerPriceSchema = z.object({
  /** Null clears it. */
  customerPricePKR: z.coerce.number().positive("Enter a price more than 0").max(1_000_000_000).nullable(),
});

export const completeInputSchema = z.object({
  completionNotes: z.string().trim().min(1, "Add a short completion report").max(4000),
});

export const paidInputSchema = z.object({
  paymentReference: z.string().trim().max(120).nullish(),
});

// ============================================================================
// Mapping
// ============================================================================

const projectInclude = {
  labourHead: { select: { id: true, name: true } },
  quote: { select: { id: true, quoteNumber: true } },
  materials: { orderBy: { sortOrder: "asc" } },
  events: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.SiteProjectInclude;

type ProjectRow = Prisma.SiteProjectGetPayload<{ include: typeof projectInclude }>;

const num = (d: Prisma.Decimal | null): number | null => (d === null ? null : d.toNumber());
const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

/** Admin-only figures. Never passed for the labour head, so neither the
 *  customer price nor the customer quotation ever reaches them. */
interface AdminExtras {
  quotedBosPKR: number | null;
}

function toDTO(row: ProjectRow, admin?: AdminExtras): SiteProjectDTO {
  const materials = row.materials.map((m) => ({
    id: m.id,
    itemGroup: m.itemGroup,
    itemCode: m.itemCode,
    name: m.name,
    unit: m.unit,
    quantity: m.quantity.toNumber(),
    proposedUnitPricePKR: m.proposedUnitPricePKR.toNumber(),
    approvedQuantity: num(m.approvedQuantity),
    approvedUnitPricePKR: num(m.approvedUnitPricePKR),
  }));
  return {
    id: row.id,
    projectNumber: row.projectNumber,
    status: row.status,
    labourHead: row.labourHead,
    quote: row.quote,
    clientName: row.clientName,
    siteAddress: row.siteAddress,
    city: row.city,
    systemSizeKw: num(row.systemSizeKw),
    plannedStartDate: row.plannedStartDate ? row.plannedStartDate.toISOString().slice(0, 10) : null,
    crewSize: row.crewSize,
    estimatedDays: row.estimatedDays,
    scopeNotes: row.scopeNotes,
    materials,
    proposedMaterialsTotalPKR: sumLinesPKR(materials.map((m) => ({ quantity: m.quantity, unitPricePKR: m.proposedUnitPricePKR }))),
    proposedLabourFeePKR: row.proposedLabourFeePKR.toNumber(),
    quotedBosPKR: admin ? admin.quotedBosPKR : null,
    customerPricePKR: admin ? num(row.customerPricePKR) : null,
    reviewNote: row.reviewNote,
    reviewedAt: iso(row.reviewedAt),
    labourFeePKR: num(row.labourFeePKR),
    approvedMaterialsTotalPKR: num(row.approvedMaterialsTotalPKR),
    payoutPKR: num(row.payoutPKR),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    completionNotes: row.completionNotes,
    paidAt: iso(row.paidAt),
    paymentReference: row.paymentReference,
    createdAt: row.createdAt.toISOString(),
    submittedAt: iso(row.submittedAt),
    events: row.events.map((e) => ({
      id: e.id,
      type: e.type,
      actorLabel: e.actorLabel,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/** Everything the customer quotation charges except panels, inverters and
 *  batteries (cabling and protection, structure, installation, site works),
 *  read from the breakdown saved with the quote. */
function quotedBosFromSnapshot(snapshot: Prisma.JsonValue | null): number | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const b = snapshot as Record<string, unknown>;
  const n = (k: string) => (typeof b[k] === "number" ? (b[k] as number) : 0);
  const total = n("cablingAndProtectionPKR") + n("structurePKR") + n("installationPKR") + n("siteWorksPKR");
  return total > 0 ? roundMoney(total) : null;
}

function generateProjectNumber(): string {
  return `SITE-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function toMaterialCreate(input: MaterialInput[]) {
  return input.map((m, i) => ({
    sortOrder: i,
    itemGroup: m.itemGroup ?? null,
    itemCode: m.itemCode ?? null,
    name: m.name,
    unit: m.unit,
    quantity: m.quantity,
    proposedUnitPricePKR: m.unitPricePKR,
  }));
}

/** The detail columns shared by create and edit (labour head and quote are
 *  handled separately since they have their own rules). */
function toDetailFields(input: ProjectDetailsInput) {
  return {
    clientName: input.clientName,
    siteAddress: input.siteAddress,
    city: input.city,
    systemSizeKw: input.systemSizeKw ?? null,
    plannedStartDate: input.plannedStartDate ? new Date(`${input.plannedStartDate}T00:00:00.000Z`) : null,
    crewSize: input.crewSize ?? null,
    estimatedDays: input.estimatedDays ?? null,
    scopeNotes: input.scopeNotes || null,
  };
}

/** The admin's extra figures for a set of projects: the customer
 *  quotation's non-equipment lines, read from the quote's saved breakdown. */
async function adminExtrasFor(rows: ProjectRow[]): Promise<Map<string, AdminExtras>> {
  const prisma = await getDb();
  const quoteIds = rows.map((r) => r.quoteId).filter((id): id is string => id !== null);
  const quotes = quoteIds.length
    ? await prisma.quote.findMany({ where: { id: { in: quoteIds } }, select: { id: true, breakdownSnapshot: true } })
    : [];
  const bosByQuote = new Map(quotes.map((q) => [q.id, quotedBosFromSnapshot(q.breakdownSnapshot)]));
  return new Map(rows.map((r) => [r.id, { quotedBosPKR: r.quoteId ? (bosByQuote.get(r.quoteId) ?? null) : null }]));
}

/** `asAdmin` attaches the admin-only figures; the labour head's calls leave it
 *  off so they can never carry the customer price or quotation. */
async function fetchProject(projectId: string, asAdmin = false): Promise<SiteProjectDTO> {
  const prisma = await getDb();
  const row = await prisma.siteProject.findUnique({ where: { id: projectId }, include: projectInclude });
  if (!row) throw new SiteProjectError("Project not found.", 404);
  return toDTO(row, asAdmin ? (await adminExtrasFor([row])).get(row.id) : undefined);
}

/** Why a conditional transition matched nothing: wrong owner / missing
 *  (404, deliberately indistinguishable so ids can't be probed) vs. wrong
 *  current status (409 naming the status). */
async function throwNotActionable(
  tx: Prisma.TransactionClient,
  projectId: string,
  engineerId: string | null,
  verb: string,
): Promise<never> {
  const row = await tx.siteProject.findFirst({
    where: engineerId ? { id: projectId, labourHeadId: engineerId } : { id: projectId },
    select: { status: true },
  });
  if (!row) throw new SiteProjectError("Project not found.", 404);
  throw new SiteProjectError(`This project can't ${verb} right now (status: ${row.status}).`, 409);
}

// ============================================================================
// Shared lookups
// ============================================================================

async function findActiveLabourHead(id: string): Promise<{ id: string; name: string } | null> {
  const prisma = await getDb();
  return prisma.user.findFirst({
    where: { id, role: "FIELD_ENGINEER", isActive: true },
    select: { id: true, name: true },
  });
}

/** Quotes a site project can be linked to: approved/dispatched, and not
 *  already tied to a live project (one site project per customer quote; a
 *  rejected one doesn't count). `exceptProjectId` lets an edit keep its own
 *  current link. */
async function assertQuoteLinkable(quoteId: string, exceptProjectId?: string): Promise<void> {
  const prisma = await getDb();
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      status: true,
      siteProjects: {
        where: { status: { not: "REJECTED" }, ...(exceptProjectId ? { id: { not: exceptProjectId } } : {}) },
        select: { id: true },
      },
    },
  });
  if (!quote) throw new SiteProjectError("That quote wasn't found.", 404);
  if (quote.status !== "CHECKER_APPROVED" && quote.status !== "DISPATCHED") {
    throw new SiteProjectError("Only an approved quote can be linked to a site project.", 409);
  }
  if (quote.siteProjects.length > 0) throw new SiteProjectError("That quote already has a site project.", 409);
}

// ============================================================================
// Super Admin side
// ============================================================================

/** What the admin's New project form offers: active labour heads and the
 *  quotes that can still be linked. */
export async function getProjectOptions(): Promise<ProjectOptionsDTO> {
  const prisma = await getDb();
  const [labourHeads, quotes] = await Promise.all([
    prisma.user.findMany({
      where: { role: "FIELD_ENGINEER", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.quote.findMany({
      where: {
        status: { in: ["CHECKER_APPROVED", "DISPATCHED"] },
        siteProjects: { none: { status: { not: "REJECTED" } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        quoteNumber: true,
        estimatedSystemSizeKw: true,
        finalSystemSizeKw: true,
        serviceType: true,
        lead: { select: { fullName: true, city: true, address: true } },
      },
    }),
  ]);
  const linkable: LinkableQuoteDTO[] = quotes.map((q) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    clientName: q.lead.fullName,
    city: q.lead.city,
    address: q.lead.address,
    systemKw: (q.finalSystemSizeKw ?? q.estimatedSystemSizeKw).toNumber(),
    serviceType: q.serviceType,
  }));
  return { labourHeads, quotes: linkable };
}

export async function listProjectsForAdmin(): Promise<SiteProjectDTO[]> {
  const prisma = await getDb();
  const rows = await prisma.siteProject.findMany({
    include: projectInclude,
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const extras = await adminExtrasFor(rows);
  return rows.map((r) => toDTO(r, extras.get(r.id)));
}

/** Create a project and assign it to a labour head; they then only need to
 *  enter its materials. */
export async function createProject(input: ProjectDetailsInput): Promise<SiteProjectDTO> {
  const prisma = await getDb();
  const labourHead = await findActiveLabourHead(input.labourHeadId);
  if (!labourHead) throw new SiteProjectError("That labour head isn't valid or is deactivated.");
  if (input.quoteId) await assertQuoteLinkable(input.quoteId);

  const created = await prisma.siteProject.create({
    data: {
      projectNumber: generateProjectNumber(),
      quoteId: input.quoteId ?? null,
      labourHeadId: labourHead.id,
      status: "ASSIGNED",
      ...toDetailFields(input),
      events: { create: { type: "CREATED", actorLabel: SUPER_ADMIN_LABEL, note: `Assigned to ${labourHead.name}` } },
    },
    include: projectInclude,
  });
  return toDTO(created, (await adminExtrasFor([created])).get(created.id));
}

/** Correct a project's details. Allowed until the prices are approved; the
 *  labour head and the quote link can only change while no materials have
 *  been entered yet. */
export async function updateProjectDetails(projectId: string, input: ProjectDetailsInput): Promise<SiteProjectDTO> {
  const prisma = await getDb();

  const current = await prisma.siteProject.findUnique({
    where: { id: projectId },
    select: { status: true, labourHeadId: true, quoteId: true },
  });
  if (!current) throw new SiteProjectError("Project not found.", 404);
  if (!PRE_APPROVAL.includes(current.status)) {
    throw new SiteProjectError("Details can only be edited before the prices are approved.", 409);
  }

  const newQuoteId = input.quoteId ?? null;
  const reassigned = input.labourHeadId !== current.labourHeadId || newQuoteId !== current.quoteId;
  if (reassigned && current.status !== "ASSIGNED") {
    throw new SiteProjectError("The labour head and quote can't be changed once materials have been entered.", 409);
  }
  if (input.labourHeadId !== current.labourHeadId && !(await findActiveLabourHead(input.labourHeadId))) {
    throw new SiteProjectError("That labour head isn't valid or is deactivated.");
  }
  if (newQuoteId && newQuoteId !== current.quoteId) await assertQuoteLinkable(newQuoteId, projectId);

  const moved = await prisma.siteProject.updateMany({
    where: { id: projectId, status: current.status },
    data: { labourHeadId: input.labourHeadId, quoteId: newQuoteId, ...toDetailFields(input) },
  });
  if (moved.count === 0) throw new SiteProjectError("This project just changed. Reload and try again.", 409);
  return fetchProject(projectId, true);
}

export async function reviewProject(projectId: string, input: ReviewInput): Promise<SiteProjectDTO> {
  const prisma = await getDb();

  await prisma.$transaction(async (tx) => {
    if (input.decision === "APPROVE") {
      const lines = await tx.siteProjectMaterial.findMany({ where: { projectId }, select: { id: true } });
      const submitted = new Map(input.materials.map((m) => [m.id, m]));
      // The review must cover exactly the project's own lines, so a stale
      // or tampered payload can't leave a line unpriced or price a stranger.
      if (lines.length !== submitted.size || lines.some((l) => !submitted.has(l.id))) {
        throw new SiteProjectError("The material list changed. Reload and review again.", 409);
      }
      const approvedTotal = sumLinesPKR(
        input.materials.map((m) => ({ quantity: m.approvedQuantity, unitPricePKR: m.approvedUnitPricePKR })),
      );
      const labourFee = roundMoney(input.labourFeePKR);
      const payout = computePayoutPKR(approvedTotal, labourFee);
      if (payout <= 0) throw new SiteProjectError("The payout can't be zero. Approve at least one material or add a labour fee.");

      const moved = await tx.siteProject.updateMany({
        where: { id: projectId, status: "SUBMITTED" },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewNote: null,
          labourFeePKR: labourFee,
          approvedMaterialsTotalPKR: approvedTotal,
          payoutPKR: payout,
        },
      });
      if (moved.count === 0) await throwNotActionable(tx, projectId, null, "be approved");
      for (const m of input.materials) {
        await tx.siteProjectMaterial.update({
          where: { id: m.id },
          data: { approvedQuantity: m.approvedQuantity, approvedUnitPricePKR: m.approvedUnitPricePKR },
        });
      }
      await tx.siteProjectEvent.create({
        data: { projectId, type: "APPROVED", actorLabel: SUPER_ADMIN_LABEL, note: input.note || null },
      });
      return;
    }

    if (input.decision === "COUNTER_OFFER") {
      const lines = await tx.siteProjectMaterial.findMany({ where: { projectId }, select: { id: true } });
      const submitted = new Map(input.materials.map((m) => [m.id, m]));
      if (lines.length !== submitted.size || lines.some((l) => !submitted.has(l.id))) {
        throw new SiteProjectError("The material list changed. Reload and review again.", 409);
      }
      const offerTotal = sumLinesPKR(
        input.materials.map((m) => ({ quantity: m.approvedQuantity, unitPricePKR: m.approvedUnitPricePKR })),
      );
      const labourFee = roundMoney(input.labourFeePKR);
      if (computePayoutPKR(offerTotal, labourFee) <= 0) {
        throw new SiteProjectError("The offer can't be zero. Keep at least one material or add a service fee.");
      }
      // Not frozen yet: payout stays null until the labour head accepts.
      const moved = await tx.siteProject.updateMany({
        where: { id: projectId, status: { in: ["SUBMITTED", "COUNTER_OFFERED"] } },
        data: {
          status: "COUNTER_OFFERED",
          reviewedAt: new Date(),
          reviewNote: input.note || null,
          labourFeePKR: labourFee,
          approvedMaterialsTotalPKR: offerTotal,
          payoutPKR: null,
        },
      });
      if (moved.count === 0) await throwNotActionable(tx, projectId, null, "take a counter-offer");
      for (const m of input.materials) {
        await tx.siteProjectMaterial.update({
          where: { id: m.id },
          data: { approvedQuantity: m.approvedQuantity, approvedUnitPricePKR: m.approvedUnitPricePKR },
        });
      }
      await tx.siteProjectEvent.create({
        data: { projectId, type: "COUNTER_OFFERED", actorLabel: SUPER_ADMIN_LABEL, note: input.note || null },
      });
      return;
    }

    // Asking for changes only makes sense once materials are submitted; a
    // project can be rejected/cancelled at any point before approval.
    const fromStatuses: SiteProjectStatus[] = input.decision === "REJECT" ? PRE_APPROVAL : ["SUBMITTED"];
    const toStatus = input.decision === "REJECT" ? "REJECTED" : "REVISION_REQUESTED";
    const eventType: SiteProjectEventType = input.decision === "REJECT" ? "REJECTED" : "REVISION_REQUESTED";
    const moved = await tx.siteProject.updateMany({
      where: { id: projectId, status: { in: fromStatuses } },
      data: { status: toStatus, reviewedAt: new Date(), reviewNote: input.note },
    });
    if (moved.count === 0) await throwNotActionable(tx, projectId, null, input.decision === "REJECT" ? "be cancelled" : "be sent back");
    await tx.siteProjectEvent.create({
      data: { projectId, type: eventType, actorLabel: SUPER_ADMIN_LABEL, note: input.note },
    });
  });
  return fetchProject(projectId, true);
}

/** Set (or clear) what the customer is charged for this job. Allowed at any
 *  stage: it is the Super Admin's own figure, not part of the negotiation. */
export async function setCustomerPrice(projectId: string, customerPricePKR: number | null): Promise<SiteProjectDTO> {
  const prisma = await getDb();
  const moved = await prisma.siteProject.updateMany({
    where: { id: projectId },
    data: { customerPricePKR: customerPricePKR === null ? null : roundMoney(customerPricePKR) },
  });
  if (moved.count === 0) throw new SiteProjectError("Project not found.", 404);
  return fetchProject(projectId, true);
}

export async function markPaid(projectId: string, paymentReference: string | null | undefined): Promise<SiteProjectDTO> {
  const prisma = await getDb();
  await prisma.$transaction(async (tx) => {
    const moved = await tx.siteProject.updateMany({
      where: { id: projectId, status: "COMPLETED" },
      data: { status: "PAID", paidAt: new Date(), paymentReference: paymentReference || null },
    });
    if (moved.count === 0) await throwNotActionable(tx, projectId, null, "be marked paid");
    await tx.siteProjectEvent.create({
      data: { projectId, type: "PAID", actorLabel: SUPER_ADMIN_LABEL, note: paymentReference || null },
    });
  });
  return fetchProject(projectId, true);
}

// ============================================================================
// Labour head (Field Engineer account) side
// ============================================================================

/** The labour head is just a real, active Field Engineer account — the
 *  shared maker token can't prove which one is calling, so every labour-head
 *  function below re-checks the supplied id against the DB and scopes every
 *  read/write to it. */
async function assertLabourHead(engineerId: string): Promise<void> {
  if (!(await findActiveLabourHead(engineerId))) {
    throw new SiteProjectError("That labour head account isn't valid or is deactivated.", 403);
  }
}

async function labourHeadName(engineerId: string): Promise<string> {
  const prisma = await getDb();
  const u = await prisma.user.findUnique({ where: { id: engineerId }, select: { name: true } });
  return u?.name ?? "Labour head";
}

export async function listProjectsForLabourHead(engineerId: string): Promise<SiteProjectDTO[]> {
  await assertLabourHead(engineerId);
  const prisma = await getDb();
  const rows = await prisma.siteProject.findMany({
    where: { labourHeadId: engineerId },
    include: projectInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r) => toDTO(r));
}

/** Enter (or, after the Super Admin asked for changes, correct) the
 *  materials and prices, and send them for approval. */
export async function submitMaterials(
  engineerId: string,
  projectId: string,
  materials: MaterialInput[],
  labourFeePKR: number,
): Promise<SiteProjectDTO> {
  await assertLabourHead(engineerId);
  const prisma = await getDb();
  const actorLabel = await labourHeadName(engineerId);

  await prisma.$transaction(async (tx) => {
    const current = await tx.siteProject.findFirst({
      where: { id: projectId, labourHeadId: engineerId },
      select: { status: true },
    });
    if (!current) throw new SiteProjectError("Project not found.", 404);
    if (current.status !== "ASSIGNED" && current.status !== "REVISION_REQUESTED") {
      throw new SiteProjectError(`Materials can't be changed right now (status: ${current.status}).`, 409);
    }

    const moved = await tx.siteProject.updateMany({
      where: { id: projectId, labourHeadId: engineerId, status: current.status },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        reviewNote: null,
        reviewedAt: null,
        proposedLabourFeePKR: roundMoney(labourFeePKR),
        labourFeePKR: null,
        approvedMaterialsTotalPKR: null,
      },
    });
    if (moved.count === 0) await throwNotActionable(tx, projectId, engineerId, "take materials");

    await tx.siteProjectMaterial.deleteMany({ where: { projectId } });
    await tx.siteProjectMaterial.createMany({ data: toMaterialCreate(materials).map((m) => ({ ...m, projectId })) });
    await tx.siteProjectEvent.create({
      data: { projectId, type: current.status === "ASSIGNED" ? "SUBMITTED" : "RESUBMITTED", actorLabel },
    });
  });
  return fetchProject(projectId);
}

/** The labour head's answer to a counter-offer: accepting fixes the prices
 *  (the payout is frozen from the offered lines + fee); declining sends it
 *  back to them to edit and resubmit, with their note on the timeline. */
export async function respondToOffer(engineerId: string, projectId: string, input: OfferResponseInput): Promise<SiteProjectDTO> {
  await assertLabourHead(engineerId);
  const prisma = await getDb();
  const actorLabel = await labourHeadName(engineerId);

  await prisma.$transaction(async (tx) => {
    if (input.decision === "DECLINE") {
      const moved = await tx.siteProject.updateMany({
        where: { id: projectId, labourHeadId: engineerId, status: "COUNTER_OFFERED" },
        data: { status: "REVISION_REQUESTED", reviewNote: input.note },
      });
      if (moved.count === 0) await throwNotActionable(tx, projectId, engineerId, "decline the offer");
      await tx.siteProjectEvent.create({ data: { projectId, type: "DECLINED", actorLabel, note: input.note } });
      return;
    }

    const row = await tx.siteProject.findFirst({
      where: { id: projectId, labourHeadId: engineerId, status: "COUNTER_OFFERED" },
      select: { labourFeePKR: true, approvedMaterialsTotalPKR: true },
    });
    if (!row || row.labourFeePKR === null || row.approvedMaterialsTotalPKR === null) {
      return throwNotActionable(tx, projectId, engineerId, "accept the offer");
    }
    const payout = computePayoutPKR(row.approvedMaterialsTotalPKR.toNumber(), row.labourFeePKR.toNumber());
    const moved = await tx.siteProject.updateMany({
      where: { id: projectId, labourHeadId: engineerId, status: "COUNTER_OFFERED" },
      data: { status: "APPROVED", reviewNote: null, payoutPKR: payout },
    });
    if (moved.count === 0) await throwNotActionable(tx, projectId, engineerId, "accept the offer");
    await tx.siteProjectEvent.create({ data: { projectId, type: "ACCEPTED", actorLabel } });
  });
  return fetchProject(projectId);
}

export async function startSite(engineerId: string, projectId: string): Promise<SiteProjectDTO> {
  await assertLabourHead(engineerId);
  const prisma = await getDb();
  const actorLabel = await labourHeadName(engineerId);

  await prisma.$transaction(async (tx) => {
    const moved = await tx.siteProject.updateMany({
      where: { id: projectId, labourHeadId: engineerId, status: "APPROVED" },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
    if (moved.count === 0) await throwNotActionable(tx, projectId, engineerId, "start");
    await tx.siteProjectEvent.create({ data: { projectId, type: "STARTED", actorLabel } });
  });
  return fetchProject(projectId);
}

export async function endSite(engineerId: string, projectId: string, completionNotes: string): Promise<SiteProjectDTO> {
  await assertLabourHead(engineerId);
  const prisma = await getDb();
  const actorLabel = await labourHeadName(engineerId);

  await prisma.$transaction(async (tx) => {
    const moved = await tx.siteProject.updateMany({
      where: { id: projectId, labourHeadId: engineerId, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", completedAt: new Date(), completionNotes },
    });
    if (moved.count === 0) await throwNotActionable(tx, projectId, engineerId, "end");
    await tx.siteProjectEvent.create({ data: { projectId, type: "COMPLETED", actorLabel, note: completionNotes } });
  });
  return fetchProject(projectId);
}

// ============================================================================
// Item catalog for the labour head's quotation picker
// ============================================================================

/** Groups the labour head can pick from, in display order. Panels, inverters,
 *  batteries and EV chargers are deliberately absent: Solar Pixel supplies those. */
const PICKER_GROUPS: { group: string; label: string; defaultUnit: string }[] = [
  { group: "DC_CABLE", label: "DC cabling", defaultUnit: "m" },
  { group: "AC_CABLE", label: "AC cabling", defaultUnit: "m" },
  { group: "BREAKERS", label: "Protection and breakers", defaultUnit: "set" },
  { group: "MOUNTING_STRUCTURE", label: "Mounting structure", defaultUnit: "set" },
  { group: "LABOR", label: "Installation and labour", defaultUnit: "job" },
];

/** Site works are priced from flat admin rates, not catalog rows, so they are
 *  listed here by name. */
const SITE_WORKS_GROUP: CatalogGroupDTO = {
  group: "SITE_WORKS",
  label: "Site works",
  defaultUnit: "pcs",
  items: [
    { code: "CIVIL_BLOCK", label: "Civil blocks" },
    { code: "EARTHING_BORE", label: "Earthing and boring" },
    { code: "LIGHTNING_ARRESTOR", label: "Lightning arrestor" },
  ],
};

/** Names only, never a price: the picker shows the same items as the admin
 *  pricing catalog, and the labour head types their own rate for each. */
export async function getItemCatalog(): Promise<CatalogGroupDTO[]> {
  const prisma = await getDb();
  const options = await prisma.equipmentOption.findMany({
    where: {
      isActive: true,
      isOtherOption: false,
      componentType: { in: PICKER_GROUPS.map((g) => g.group) as never[] },
    },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { componentType: true, code: true, label: true },
  });
  const groups: CatalogGroupDTO[] = PICKER_GROUPS.map((g) => {
    const seen = new Set<string>();
    const items = options
      .filter((o) => o.componentType === g.group && !seen.has(o.code) && seen.add(o.code))
      .map((o) => ({ code: o.code, label: o.label }));
    return { ...g, items };
  }).filter((g) => g.items.length > 0);
  return [...groups, SITE_WORKS_GROUP];
}
