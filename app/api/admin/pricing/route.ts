import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ComponentType, CostUnit, ServiceType, Sector, InverterPhase } from "@prisma/client";
import { getDb } from "@/lib/db/client";
import {
  listMaterialCatalog,
  createMaterialItem,
  updateGlobalPricingRule,
  PricingConfigurationError,
} from "@/lib/db/admin";
import { assertSuperAdminAccess, InternalAuthError } from "@/lib/auth/internal-guard";

/**
 * /api/admin/pricing — the Equipment & Pricing Control Engine's data
 * endpoint. Confidential (vendor cost + margin data) — every handler is
 * gated by assertSuperAdminAccess(req) before anything else runs,
 * same shared-secret interim guard as /api/admin/checker/*. Both GET and
 * POST go through lib/db/admin.ts's material-catalog functions, never
 * touching adminPrisma directly (see that file's module doc for why).
 */

// Only the componentTypes /admin/pricing's 5 inventory tabs cover — new
// materials can't be created for MOUNTING_STRUCTURE/LABOR (those are
// single-rate KPI fields, not multi-item catalogs) or the exact-BOQ-only
// buckets (CT_COIL, DB_UPGRADE, TRANSPORT) from here.
const CATALOG_COMPONENT_TYPES = ["SOLAR_PANEL", "INVERTER", "BATTERY", "DC_CABLE", "AC_CABLE", "BREAKERS", "EV_CHARGER"] as const;

// Loose on purpose — formatGoogleDriveLink() (called from lib/db/admin.ts,
// never trusting the client) normalizes whatever share-link shape comes
// through here. Only a max length + "must be an absolute URL" are
// enforced at this layer; anything that isn't actually a Drive link just
// passes through formatGoogleDriveLink unchanged and gets stored as-is.
const mediaUrlSchema = z.string().trim().max(500).url("Must be a valid URL");

const specEntrySchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(200),
});
const specsSchema = z.array(specEntrySchema).max(30);

const createMaterialSchema = z.object({
  type: z.literal("CREATE_MATERIAL"),
  componentType: z.enum(CATALOG_COMPONENT_TYPES),
  code: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9_]+$/, "code must be letters, numbers, and underscores only"),
  label: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(80).optional(),
  specValue: z.number().positive().max(100_000).optional(),
  applicableServiceType: z.nativeEnum(ServiceType).optional(),
  // Only meaningful for componentType=INVERTER (2026-08-22) — ignored
  // for everything else, same "accepted but only used where relevant"
  // pattern as applicableServiceType/specValue.
  phase: z.nativeEnum(InverterPhase).optional(),
  unit: z.nativeEnum(CostUnit),
  vendorCostRs: z.number().positive().max(10_000_000),
  vendorName: z.string().trim().max(120).optional(),
  marginPercentOverride: z.number().min(0).max(99).optional(),
  isDefault: z.boolean().optional(),
  // Inventory guardrail (2026-08-20) — see its doc comment in schema.prisma.
  inStock: z.boolean().optional(),
  logoUrl: mediaUrlSchema.optional(),
  brochureUrl: mediaUrlSchema.optional(),
  specs: specsSchema.optional(),
  createdById: z.string().min(1, "createdById is required"),
});

const updateGlobalRulesSchema = z.object({
  type: z.literal("UPDATE_GLOBAL_RULES"),
  structureCostPerWatt: z.number().positive().max(1000).optional(),
  // z.record() with an enum key schema is EXHAUSTIVE in Zod 4 — it
  // requires every Sector key to be present, not just the ones supplied.
  // That silently broke every single-sector margin save from
  // /admin/pricing (KpiCard's per-sector InlineEditableNumber always
  // PATCHes one sector at a time, e.g. { RESIDENTIAL: 25 }), which
  // always 400'd with "expected number, received undefined" for the two
  // omitted sectors. z.partialRecord() is Zod's actual partial-record
  // primitive for enum/literal keys, matching what
  // UpdateGlobalRulesInput.sectorMargins's own doc comment already
  // promised ("Partial — only the sectors present are changed") and what
  // updateGlobalPricingRule() in lib/db/admin.ts already implements
  // (loops ALL_SECTORS, `if (percent === undefined) continue`).
  sectorMargins: z.partialRecord(z.nativeEnum(Sector), z.number().min(0).max(99)).optional(),
  updatedById: z.string().min(1, "updatedById is required"),
});

const postBodySchema = z.discriminatedUnion("type", [createMaterialSchema, updateGlobalRulesSchema]);

async function assertValidSuperAdmin(userId: string): Promise<boolean> {
  const prisma = await getDb();
  const admin = await prisma.user.findFirst({ where: { id: userId, role: "SUPER_ADMIN", isActive: true }, select: { id: true } });
  return admin !== null;
}

export async function GET(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const catalog = await listMaterialCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    console.error("[GET /api/admin/pricing]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const actingUserId = input.type === "CREATE_MATERIAL" ? input.createdById : input.updatedById;
  if (!(await assertValidSuperAdmin(actingUserId))) {
    return NextResponse.json({ error: "Not a valid, active Super Admin." }, { status: 400 });
  }

  try {
    if (input.type === "CREATE_MATERIAL") {
      const item = await createMaterialItem({
        componentType: input.componentType as ComponentType,
        code: input.code,
        label: input.label,
        brand: input.brand,
        specValue: input.specValue,
        applicableServiceType: input.applicableServiceType,
        phase: input.phase,
        unit: input.unit,
        vendorCostRs: input.vendorCostRs,
        vendorName: input.vendorName,
        marginPercentOverride: input.marginPercentOverride,
        isDefault: input.isDefault,
        inStock: input.inStock,
        logoUrl: input.logoUrl,
        brochureUrl: input.brochureUrl,
        specs: input.specs,
        createdById: input.createdById,
      });
      return NextResponse.json({ item }, { status: 201 });
    }

    const globalRules = await updateGlobalPricingRule({
      structureCostPerWatt: input.structureCostPerWatt,
      sectorMargins: input.sectorMargins,
      updatedById: input.updatedById,
    });
    return NextResponse.json({ globalRules });
  } catch (err) {
    if (err instanceof PricingConfigurationError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[POST /api/admin/pricing]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
