import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { updateGlobalPricingSettings, PricingConfigurationError } from "@/lib/db/admin";
import { assertSuperAdminAccess, InternalAuthError } from "@/lib/auth/internal-guard";

/**
 * POST /api/admin/pricing/rules — Expanded Super Admin Pricing Rates:
 * sector-specific installation rates + the two flat add-on-service rates
 * (EV Charger, Panel Washing). Deliberately a SEPARATE route from
 * /api/admin/pricing's UPDATE_GLOBAL_RULES action (structure rate +
 * sector margins) — see GlobalPricingSettings's doc comment in
 * schema.prisma for why these live in their own table. Same confidential
 * boundary as every other /api/admin/pricing/* route: gated by
 * assertSuperAdminAccess(req) before anything else runs.
 */
const updateRulesSchema = z.object({
  installationCostPerWattResidential: z.number().positive().max(1000).optional(),
  installationCostPerWattCommercial: z.number().positive().max(1000).optional(),
  installationCostPerWattIndustrial: z.number().positive().max(1000).optional(),
  evChargerInstallationFee: z.number().positive().max(1_000_000).optional(),
  washingCostPerPanel: z.number().positive().max(50_000).optional(),
  civilWorkCostPerBlock: z.number().positive().max(200_000).optional(),
  earthingCostPerBore: z.number().positive().max(200_000).optional(),
  lightningArrestorCostPerUnit: z.number().positive().max(200_000).optional(),
  updatedById: z.string().min(1, "updatedById is required"),
});

async function assertValidSuperAdmin(userId: string): Promise<boolean> {
  const admin = await prisma.user.findFirst({ where: { id: userId, role: "SUPER_ADMIN", isActive: true }, select: { id: true } });
  return admin !== null;
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

  const parsed = updateRulesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  if (!(await assertValidSuperAdmin(input.updatedById))) {
    return NextResponse.json({ error: "Not a valid, active Super Admin." }, { status: 400 });
  }

  try {
    const globalRules = await updateGlobalPricingSettings(input);
    return NextResponse.json({ globalRules });
  } catch (err) {
    if (err instanceof PricingConfigurationError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[POST /api/admin/pricing/rules]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
