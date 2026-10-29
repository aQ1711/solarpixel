import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { listQuotableCatalog } from "@/lib/db/admin";
import { getSuperAdminActorId, type AdminIdentity } from "@/lib/auth/internal-guard";
import { lineTotalPKR, roundMoney, type CatalogItemDTO, type CustomQuotationDTO, type QuoteSector } from "@/lib/customQuotation/types";

/**
 * Custom Quotations (2026-10-20). The creator sends ONLY item codes and
 * quantities; every unit price is looked up here, server-side, from the
 * catalog (listQuotableCatalog: the same marked-up client price as the
 * storefront, never a cost or margin). There is deliberately no field a
 * request can use to set or override a price.
 */

export class CustomQuotationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/** Stores phone numbers in international form (+92XXXXXXXXXX) so a WhatsApp
 *  link works: "0300 1234567" and "92300..." both become "+923001234567". */
export function normalizePkPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+92${digits.slice(1)}`;
  return `+${digits}`;
}

export const sectorSchema = z.enum(["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL"]);

export const createQuotationSchema = z.object({
  customerName: z.string().trim().min(2, "Customer name is required").max(120),
  customerPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{10,18}$/, "Enter a valid phone number"),
  customerCity: z.string().trim().min(1, "City is required").max(80),
  customerAddress: z.string().trim().max(300).nullish(),
  sector: sectorSchema,
  notes: z.string().trim().max(2000).nullish(),
  items: z
    .array(
      z.object({
        code: z.string().min(1),
        componentType: z.string().min(1),
        quantity: z.coerce.number().positive("Quantity must be more than 0").max(100_000),
      }),
    )
    .min(1, "Add at least one item")
    .max(60),
});
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

/** Editing a quotation: the same fields again, plus an optional note on what changed. */
export const editQuotationSchema = createQuotationSchema.extend({
  versionNote: z.string().trim().max(300).nullish(),
});
export type EditQuotationInput = z.infer<typeof editQuotationSchema>;

const include = { items: { orderBy: { sortOrder: "asc" } } } satisfies Prisma.CustomQuotationInclude;
type Row = Prisma.CustomQuotationGetPayload<{ include: typeof include }>;

function toDTO(row: Row): CustomQuotationDTO {
  return {
    id: row.id,
    quotationNumber: row.quotationNumber,
    version: row.version,
    versionNote: row.versionNote,
    isLatest: true, // corrected by the callers that know about newer versions
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerCity: row.customerCity,
    customerAddress: row.customerAddress,
    sector: row.sector,
    notes: row.notes,
    totalPKR: row.totalPKR.toNumber(),
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((i) => ({
      id: i.id,
      componentType: i.componentType,
      itemCode: i.itemCode,
      label: i.label,
      brand: i.brand,
      unitLabel: i.unitLabel,
      quantity: i.quantity.toNumber(),
      unitPricePKR: i.unitPricePKR.toNumber(),
      lineTotalPKR: i.lineTotalPKR.toNumber(),
    })),
  };
}

/** The picker's catalog: in-stock items only, locked prices. */
export async function getCatalog(sector: QuoteSector): Promise<CatalogItemDTO[]> {
  return (await listQuotableCatalog(sector)).filter((i) => i.inStock);
}

/** Looks every requested item up in the catalog (server-side prices only) and
 *  returns the priced lines plus their total. Shared by create and edit. */
async function priceLines(input: CreateQuotationInput) {
  const catalog = new Map((await listQuotableCatalog(input.sector)).map((i) => [`${i.componentType}::${i.code}`, i]));

  const seen = new Set<string>();
  const lines = input.items.map((requested, index) => {
    const key = `${requested.componentType}::${requested.code}`;
    if (seen.has(key)) throw new CustomQuotationError("The same item was added twice. Change its quantity instead.");
    seen.add(key);
    const item = catalog.get(key);
    if (!item) throw new CustomQuotationError("One of the items isn't in the catalog any more. Reload and try again.", 409);
    if (!item.inStock) throw new CustomQuotationError(`${item.label} is out of stock.`, 409);
    return {
      sortOrder: index,
      componentType: item.componentType,
      itemCode: item.code,
      label: item.label,
      brand: item.brand,
      unitLabel: item.unitLabel,
      quantity: requested.quantity,
      unitPricePKR: item.unitPricePKR,
      lineTotalPKR: lineTotalPKR(requested.quantity, item.unitPricePKR),
    };
  });
  const total = roundMoney(lines.reduce((sum, l) => sum + l.lineTotalPKR, 0));
  return { lines, total };
}

export async function createCustomQuotation(identity: AdminIdentity, input: CreateQuotationInput): Promise<CustomQuotationDTO> {
  const { lines, total } = await priceLines(input);

  // The Super Admin has no per-request User row (see internal-guard), so
  // attribute their quotations to the seeded SUPER_ADMIN account.
  const createdById = identity.userId ?? (await getSuperAdminActorId());

  const prisma = await getDb();
  const created = await prisma.customQuotation.create({
    data: {
      quotationNumber: `CQ-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      version: 1,
      customerName: input.customerName,
      customerPhone: normalizePkPhone(input.customerPhone),
      customerCity: input.customerCity,
      customerAddress: input.customerAddress || null,
      sector: input.sector,
      notes: input.notes || null,
      totalPKR: total,
      createdById,
      createdByName: identity.name,
      items: { create: lines },
    },
    include,
  });
  return toDTO(created);
}

/**
 * Edit = add a new version. The row being edited is never touched: a new row
 * with the same quotation number and version + 1 is written, re-priced from
 * the current catalog (the server still sets every price), so the earlier
 * versions stay exactly as they were sent. Only the latest version can be
 * edited. The new version keeps the ORIGINAL owner (createdById) so a delegated
 * admin still sees their own quotation after the Super Admin edits it;
 * createdByName records who actually made this version.
 */
export async function createQuotationVersion(
  identity: AdminIdentity,
  fromId: string,
  input: EditQuotationInput,
): Promise<CustomQuotationDTO> {
  const prisma = await getDb();
  const source = await prisma.customQuotation.findFirst({ where: { id: fromId, ...visibleTo(identity) } });
  if (!source) throw new CustomQuotationError("Quotation not found.", 404);

  const { lines, total } = await priceLines(input);

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.customQuotation.findFirst({
      where: { quotationNumber: source.quotationNumber },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    if (latest && latest.version !== source.version) {
      throw new CustomQuotationError(`Version ${latest.version} already exists. Open the latest version to edit it.`, 409);
    }
    return tx.customQuotation.create({
      data: {
        quotationNumber: source.quotationNumber,
        version: source.version + 1,
        versionNote: input.versionNote || null,
        customerName: input.customerName,
        customerPhone: normalizePkPhone(input.customerPhone),
        customerCity: input.customerCity,
        customerAddress: input.customerAddress || null,
        sector: input.sector,
        notes: input.notes || null,
        totalPKR: total,
        createdById: source.createdById,
        createdByName: identity.name,
        items: { create: lines },
      },
      include,
    });
  });
  return toDTO(created);
}

/** The Super Admin sees every custom quotation; a delegated Admin with the
 *  QUOTES permission sees only the ones they created. */
function visibleTo(identity: AdminIdentity): Prisma.CustomQuotationWhereInput {
  return identity.kind === "SUPER_ADMIN" ? {} : { createdById: identity.userId ?? "none" };
}

export async function listCustomQuotations(identity: AdminIdentity): Promise<CustomQuotationDTO[]> {
  const prisma = await getDb();
  const rows = await prisma.customQuotation.findMany({
    where: visibleTo(identity),
    include,
    // Highest version first within each quotation number, so `distinct` keeps
    // the latest version of every quotation.
    orderBy: [{ quotationNumber: "asc" }, { version: "desc" }],
    distinct: ["quotationNumber"],
    take: 200,
  });
  return rows.map(toDTO).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCustomQuotation(identity: AdminIdentity, id: string): Promise<CustomQuotationDTO> {
  const prisma = await getDb();
  const row = await prisma.customQuotation.findFirst({ where: { id, ...visibleTo(identity) }, include });
  if (!row) throw new CustomQuotationError("Quotation not found.", 404);

  const history = await prisma.customQuotation.findMany({
    where: { quotationNumber: row.quotationNumber, ...visibleTo(identity) },
    orderBy: { version: "asc" },
    select: { id: true, version: true, versionNote: true, totalPKR: true, createdByName: true, createdAt: true },
  });
  const dto = toDTO(row);
  dto.versions = history.map((h) => ({
    id: h.id,
    version: h.version,
    versionNote: h.versionNote,
    totalPKR: h.totalPKR.toNumber(),
    createdByName: h.createdByName,
    createdAt: h.createdAt.toISOString(),
  }));
  dto.isLatest = history.length === 0 || history[history.length - 1].id === row.id;
  return dto;
}
