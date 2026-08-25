import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import {
  calculateAdminBoqPricing,
  parseEquipmentSelections,
  parseBudgetTier,
  PricingConfigurationError,
  type AdminBoqPricingResult,
} from "@/lib/db/admin";
import { assertAdminModuleAccess, InternalAuthError, type AdminIdentity } from "@/lib/auth/internal-guard";

/**
 * GET /api/admin/checker/quotes — every quote awaiting Checker review,
 * with the exact BOQ pricing comparison and CONFIDENTIAL profit figures
 * attached.
 *
 * SECURITY: this is one of only two places in the codebase allowed to
 * forward `calculateAdminBoqPricing`'s raw-cost/profit output past its
 * own function boundary (the other is the approve route below) — both
 * gated by `assertAdminModuleAccess(req, "CHECKER")` (Super Admin always
 * passes; an ADMIN user only if granted the CHECKER module). Nothing here
 * is public or Field-Engineer reachable.
 */
export async function GET(req: NextRequest) {
  const prisma = await getDb();
  let viewer: AdminIdentity;
  try {
    viewer = await assertAdminModuleAccess(req, "CHECKER");
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const quotes = await prisma.quote.findMany({
      where: { status: "MAKER_SUBMITTED" },
      include: {
        lead: { select: { fullName: true, phone: true, city: true } },
        siteSurvey: { include: { engineer: { select: { name: true } } } },
      },
      orderBy: { makerSubmittedAt: "asc" },
    });

    const enriched = await Promise.all(
      quotes.map(async (quote) => {
        // Invariant: a MAKER_SUBMITTED quote must have a survey — the
        // maker route sets both in the same transaction. Skip
        // defensively rather than crash the whole list if it's ever
        // violated (e.g. manual DB edit).
        if (!quote.siteSurvey) return null;
        const survey = quote.siteSurvey;

        let pricing: AdminBoqPricingResult | null = null;
        let pricingError: string | null = null;
        try {
          pricing = await calculateAdminBoqPricing({
            systemKw: quote.estimatedSystemSizeKw.toNumber(),
            sector: quote.sector,
            serviceType: quote.serviceType,
            dcCableMeters: survey.dcCableMeters.toNumber(),
            acCableMeters: survey.acCableMeters.toNumber(),
            dataCableMeters: survey.dataCableMeters.toNumber(),
            structureChoice: survey.structureChoice,
            requiresDbUpgrade: survey.dbUpgradeRequired,
            equipmentSelections: parseEquipmentSelections(quote.equipmentSelections),
            // The Field Engineer's on-site confirmed request takes priority
            // over the pre-survey web estimate for pre-filling the
            // Checker's editable "Final Approved Battery Capacity" — no
            // Quote.finalBatteryCapacityKwh exists yet at this stage (the
            // quote hasn't been approved), so this is the only source that
            // can win here. See SiteSurvey.surveyedBatteryCapacityKwh's doc
            // comment in schema.prisma.
            finalBatteryCapacityKwh: survey.surveyedBatteryCapacityKwh?.toNumber() ?? undefined,
            // The Target Budget tier this quote was ACTUALLY priced under
            // at submission time (Quote.targetBudgetTier) — critical so
            // this exact-BOQ pass can't silently re-add a battery the
            // customer was never quoted for. See AdminBoqPricingInput's
            // doc comment.
            targetBudgetTier: parseBudgetTier(quote.targetBudgetTier),
          });
        } catch (err) {
          if (err instanceof PricingConfigurationError) {
            console.error("[GET /api/admin/checker/quotes] pricing config error:", err.message);
            pricingError = "Vendor cost / margin configuration is incomplete for this system.";
          } else {
            throw err;
          }
        }

        return {
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          sector: quote.sector,
          systemKw: quote.estimatedSystemSizeKw.toNumber(),
          automatedEstimatePriceRs: quote.automatedEstimatePriceRs.toNumber(),
          makerSubmittedAt: quote.makerSubmittedAt,
          billSource: quote.billSource,
          uploadedBillFileUrl: quote.uploadedBillFileUrl,
          lead: { fullName: quote.lead.fullName, phone: quote.lead.phone, city: quote.lead.city },
          survey: {
            engineerName: survey.engineer.name,
            roofType: survey.roofType,
            structureChoice: survey.structureChoice,
            dcCableMeters: survey.dcCableMeters.toNumber(),
            acCableMeters: survey.acCableMeters.toNumber(),
            dataCableMeters: survey.dataCableMeters.toNumber(),
            requiresDbUpgrade: survey.dbUpgradeRequired,
            // The engineer's on-site request, distinct from the editable
            // "Final Approved" figure below it — shown for context so the
            // Super Admin can see what the customer asked for on-site vs.
            // what's about to be contractually confirmed.
            surveyedBatteryCapacityKwh: survey.surveyedBatteryCapacityKwh?.toNumber() ?? null,
            photos: survey.photos,
            engineerNotes: survey.engineerNotes,
          },
          pricing,
          pricingError,
        };
      })
    );

    return NextResponse.json({ quotes: enriched.filter((q) => q !== null), viewer });
  } catch (err) {
    console.error("[GET /api/admin/checker/quotes]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
