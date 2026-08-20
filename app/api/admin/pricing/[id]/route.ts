import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { updateMaterialItem, deactivateMaterialItem, PricingConfigurationError } from "@/lib/db/admin";
import { assertSuperAdminAccess, InternalAuthError } from "@/lib/auth/internal-guard";

// Same normalization contract as /api/admin/pricing's CREATE_MATERIAL
// schema — see its mediaUrlSchema/specEntrySchema doc comments.
const mediaUrlSchema = z.string().trim().max(500).url("Must be a valid URL");
const specEntrySchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(200),
});
const specsSchema = z.array(specEntrySchema).max(30);

const putBodySchema = z.object({
  vendorCostRs: z.number().positive().max(10_000_000).optional(),
  marginPercentOverride: z.number().min(0).max(99).nullable().optional(),
  isDefault: z.boolean().optional(),
  label: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  // Pass null explicitly to clear; omit to leave unchanged — same
  // contract as `brand`/`marginPercentOverride` above.
  logoUrl: mediaUrlSchema.nullable().optional(),
  brochureUrl: mediaUrlSchema.nullable().optional(),
  specs: specsSchema.nullable().optional(),
  updatedById: z.string().min(1, "updatedById is required"),
});

const deleteBodySchema = z.object({
  deactivatedById: z.string().min(1, "deactivatedById is required"),
});

async function assertValidSuperAdmin(userId: string): Promise<boolean> {
  const admin = await prisma.user.findFirst({ where: { id: userId, role: "SUPER_ADMIN", isActive: true }, select: { id: true } });
  return admin !== null;
}

/** PUT /api/admin/pricing/:id — update vendor cost, margin override, or
 *  default status for one material. `id` is EquipmentOption.id. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  if (!(await assertValidSuperAdmin(input.updatedById))) {
    return NextResponse.json({ error: "Not a valid, active Super Admin." }, { status: 400 });
  }

  try {
    const item = await updateMaterialItem(id, {
      vendorCostRs: input.vendorCostRs,
      marginPercentOverride: input.marginPercentOverride,
      isDefault: input.isDefault,
      label: input.label,
      brand: input.brand,
      logoUrl: input.logoUrl,
      brochureUrl: input.brochureUrl,
      specs: input.specs,
    });
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof PricingConfigurationError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("[PUT /api/admin/pricing/:id]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

/** DELETE /api/admin/pricing/:id — deactivates a material (isActive =
 *  false on both the catalog entry and its vendor cost row). Soft delete
 *  only — see deactivateMaterialItem's doc comment; nothing is ever
 *  hard-deleted from vendor cost history. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { id } = await params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // DELETE bodies are easy to omit by accident — treat empty/missing as {}
    // rather than a hard 400, the schema below still requires deactivatedById.
  }
  const parsed = deleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  if (!(await assertValidSuperAdmin(parsed.data.deactivatedById))) {
    return NextResponse.json({ error: "Not a valid, active Super Admin." }, { status: 400 });
  }

  try {
    await deactivateMaterialItem(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PricingConfigurationError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("[DELETE /api/admin/pricing/:id]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
