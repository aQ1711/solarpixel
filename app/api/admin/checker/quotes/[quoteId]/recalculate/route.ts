import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { calculateAdminBoqPricing, parseEquipmentSelections, parseBudgetTier, PricingConfigurationError } from "@/lib/db/admin";
import { assertAdminModuleAccess, InternalAuthError } from "@/lib/auth/internal-guard";

const recalculateSchema = z.object({
  /** Omitted = re-derive the pre-survey estimate, same as the initial
   *  GET /api/admin/checker/quotes figure. */
  finalBatteryCapacityKwh: z.number().positive().max(500).optional(),
});

/**
 * POST /api/admin/checker/quotes/:quoteId/recalculate — read-only price
 * preview, NOT an approval. Lets the Checker UI live-update the total as
 * the Super Admin edits "Final Approved Battery Capacity" before
 * actually clicking Approve (which independently recomputes the same
 * way — this route never writes anything, so there's no risk of the
 * preview and the real approval disagreeing due to a stale write).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ quoteId: string }> }) {
  try {
    await assertAdminModuleAccess(req, "CHECKER");
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { quoteId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = recalculateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: { siteSurvey: true } });
    if (!quote) {
      return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    }
    if (!quote.siteSurvey) {
      return NextResponse.json({ error: "No site survey on file for this quote." }, { status: 409 });
    }
    const survey = quote.siteSurvey;

    const pricing = await calculateAdminBoqPricing({
      systemKw: quote.estimatedSystemSizeKw.toNumber(),
      sector: quote.sector,
      serviceType: quote.serviceType,
      dcCableMeters: survey.dcCableMeters.toNumber(),
      acCableMeters: survey.acCableMeters.toNumber(),
      dataCableMeters: survey.dataCableMeters.toNumber(),
      structureChoice: survey.structureChoice,
      requiresDbUpgrade: survey.dbUpgradeRequired,
      equipmentSelections: parseEquipmentSelections(quote.equipmentSelections),
      finalBatteryCapacityKwh: parsed.data.finalBatteryCapacityKwh,
      targetBudgetTier: parseBudgetTier(quote.targetBudgetTier),
    });

    return NextResponse.json({ pricing });
  } catch (err) {
    if (err instanceof PricingConfigurationError) {
      console.error("[POST .../recalculate] pricing configuration error:", err.message);
      return NextResponse.json({ error: "Vendor cost / margin configuration is incomplete for this system." }, { status: 503 });
    }
    console.error("[POST /api/admin/checker/quotes/:quoteId/recalculate]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
