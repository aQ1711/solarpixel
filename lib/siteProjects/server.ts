import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  computePayoutPKR,
  roundMoney,
  sumLinesPKR,
  type LinkableQuoteDTO,
  type SiteProjectDTO,
  type SiteProjectEventType,
} from "@/lib/siteProjects/types";

/**
 * Site Projects (2026-10-07): the labour-head work-order workflow.
 *
 *   labour head enters details + materials  -> SUBMITTED
 *   Super Admin reviews prices:
 *       approve (sets labour fee)           -> APPROVED
 *       send back with a note               -> REVISION_REQUESTED -> (edit) -> SUBMITTED
 *       reject                              -> REJECTED
 *   labour head starts the site             -> IN_PROGRESS
 *   labour head ends it with a report       -> COMPLETED
 *   Super Admin releases the payout         -> PAID
 *
 * Public-schema client only (getDb): everything here is data the labour
 * head entered about their own purchases, never Solar Pixel's vendor cost
 * or margin, so it never needs (and never gets) the admin client. Every
 * transition is a conditional `updateMany` on the expected current status,
 * so two simultaneous taps/clicks can't both win.
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

// ============================================================================
// Validation
// ============================================================================

const materialInputSchema = z.object({
  name: z.string().trim().min(1, "Every material needs a name").max(120),
  unit: z.string().trim().min(1, "Every material needs a unit").max(20),
  quantity: z.coerce.number().positive("Quantity must be more than 0").max(1_000_000),
  unitPricePKR: z.coerce.number().positive("Price must be more than 0").max(100_000_000),
});

export const projectInputSchema = z.object({
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
  materials: z.array(materialInputSchema).min(1, "Add at least one material").max(100),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

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
  z.object({ decision: z.literal("REQUEST_REVISION"), note: z.string().trim().min(1, "Tell them what to change").max(1000) }),
  z.object({ decision: z.literal("REJECT"), note: z.string().trim().min(1, "Give a reason for rejecting").max(1000) }),
]);
export type ReviewInput = z.infer<typeof reviewInputSchema>;

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

function toDTO(row: ProjectRow): SiteProjectDTO {
  const materials = row.materials.map((m) => ({
    id: m.id,
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
    submittedAt: row.submittedAt.toISOString(),
    events: row.events.map((e) => ({
      id: e.id,
      type: e.type,
      actorLabel: e.actorLabel,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

function generateProjectNumber(): string {
  return `SITE-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function toMaterialCreate(input: ProjectInput["materials"]) {
  return input.map((m, i) => ({
    sortOrder: i,
    name: m.name,
    unit: m.unit,
    quantity: m.quantity,
    proposedUnitPricePKR: m.unitPricePKR,
  }));
}

function toDetailFields(input: ProjectInput) {
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

// ============================================================================
// Labour head (Field Engineer account) side
// ============================================================================

/** The labour head is just a real, active Field Engineer account — the
 *  shared maker token can't prove which one is calling, so every labour-head
 *  function below re-checks the supplied id against the DB and scopes every
 *  read/write to it. */
async function assertLabourHead(engineerId: string): Promise<void> {
  const prisma = await getDb();
  const engineer = await prisma.user.findFirst({
    where: { id: engineerId, role: "FIELD_ENGINEER", isActive: true },
    select: { id: true },
  });
  if (!engineer) throw new SiteProjectError("That labour head account isn't valid or is deactivated.", 403);
}

async function labourHeadName(engineerId: string): Promise<string> {
  const prisma = await getDb();
  const u = await prisma.user.findUnique({ where: { id: engineerId }, select: { name: true } });
  return u?.name ?? "Labour head";
}

export async function listLinkableQuotes(): Promise<LinkableQuoteDTO[]> {
  const prisma = await getDb();
  const quotes = await prisma.quote.findMany({
    where: {
      status: { in: ["CHECKER_APPROVED", "DISPATCHED"] },
      // One site project per customer quote (a rejected one doesn't count).
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
  });
  return quotes.map((q) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    clientName: q.lead.fullName,
    city: q.lead.city,
    address: q.lead.address,
    systemKw: (q.finalSystemSizeKw ?? q.estimatedSystemSizeKw).toNumber(),
    serviceType: q.serviceType,
  }));
}

export async function listProjectsForLabourHead(engineerId: string): Promise<SiteProjectDTO[]> {
  await assertLabourHead(engineerId);
  const prisma = await getDb();
  const rows = await prisma.siteProject.findMany({
    where: { labourHeadId: engineerId },
    include: projectInclude,
    orderBy: { submittedAt: "desc" },
    take: 100,
  });
  return rows.map(toDTO);
}

export async function createProject(engineerId: string, input: ProjectInput): Promise<SiteProjectDTO> {
  await assertLabourHead(engineerId);
  const prisma = await getDb();
  const actorLabel = await labourHeadName(engineerId);

  if (input.quoteId) {
    const quote = await prisma.quote.findUnique({
      where: { id: input.quoteId },
      select: { status: true, siteProjects: { where: { status: { not: "REJECTED" } }, select: { id: true } } },
    });
    if (!quote) throw new SiteProjectError("That quote wasn't found.", 404);
    if (quote.status !== "CHECKER_APPROVED" && quote.status !== "DISPATCHED") {
      throw new SiteProjectError("Only an approved quote can be linked to a site project.", 409);
    }
    if (quote.siteProjects.length > 0) {
      throw new SiteProjectError("That quote already has a site project.", 409);
    }
  }

  const created = await prisma.siteProject.create({
    data: {
      projectNumber: generateProjectNumber(),
      quoteId: input.quoteId ?? null,
      labourHeadId: engineerId,
      status: "SUBMITTED",
      ...toDetailFields(input),
      materials: { create: toMaterialCreate(input.materials) },
      events: { create: { type: "SUBMITTED", actorLabel } },
    },
    include: projectInclude,
  });
  return toDTO(created);
}

/** Edit-and-resubmit after the Super Admin asked for changes. */
export async function resubmitProject(engineerId: string, projectId: string, input: ProjectInput): Promise<SiteProjectDTO> {
  await assertLabourHead(engineerId);
  const prisma = await getDb();
  const actorLabel = await labourHeadName(engineerId);

  await prisma.$transaction(async (tx) => {
    const moved = await tx.siteProject.updateMany({
      where: { id: projectId, labourHeadId: engineerId, status: "REVISION_REQUESTED" },
      data: { status: "SUBMITTED", reviewNote: null, reviewedAt: null, submittedAt: new Date(), ...toDetailFields(input) },
    });
    if (moved.count === 0) await throwNotActionable(tx, projectId, engineerId, "resubmit");
    await tx.siteProjectMaterial.deleteMany({ where: { projectId } });
    await tx.siteProjectMaterial.createMany({
      data: toMaterialCreate(input.materials).map((m) => ({ ...m, projectId })),
    });
    await tx.siteProjectEvent.create({ data: { projectId, type: "RESUBMITTED", actorLabel } });
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

async function fetchProject(projectId: string): Promise<SiteProjectDTO> {
  const prisma = await getDb();
  const row = await prisma.siteProject.findUnique({ where: { id: projectId }, include: projectInclude });
  if (!row) throw new SiteProjectError("Project not found.", 404);
  return toDTO(row);
}

// ============================================================================
// Super Admin side
// ============================================================================

export async function listProjectsForAdmin(): Promise<SiteProjectDTO[]> {
  const prisma = await getDb();
  const rows = await prisma.siteProject.findMany({
    include: projectInclude,
    orderBy: { submittedAt: "desc" },
    take: 300,
  });
  return rows.map(toDTO);
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

    const toStatus = input.decision === "REJECT" ? "REJECTED" : "REVISION_REQUESTED";
    const eventType: SiteProjectEventType = input.decision === "REJECT" ? "REJECTED" : "REVISION_REQUESTED";
    const moved = await tx.siteProject.updateMany({
      where: { id: projectId, status: "SUBMITTED" },
      data: { status: toStatus, reviewedAt: new Date(), reviewNote: input.note },
    });
    if (moved.count === 0) await throwNotActionable(tx, projectId, null, "be reviewed");
    await tx.siteProjectEvent.create({
      data: { projectId, type: eventType, actorLabel: SUPER_ADMIN_LABEL, note: input.note },
    });
  });
  return fetchProject(projectId);
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
  return fetchProject(projectId);
}
