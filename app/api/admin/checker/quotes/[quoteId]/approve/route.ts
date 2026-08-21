import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { calculateAdminBoqPricing, parseEquipmentSelections, parseBudgetTier, PricingConfigurationError } from "@/lib/db/admin";
import { assertAdminModuleAccess, InternalAuthError } from "@/lib/auth/internal-guard";
import { buildWaLink, buildContractMessage } from "@/lib/whatsapp";
import { DAYS_TO_DEPLOY_DEFAULT } from "@/lib/constants";

const approveSchema = z.object({
  approvedById: z.string().min(1, "approvedById is required"),
  /** The Checker's confirmed/edited battery capacity (HYBRID_BATTERY
   *  quotes only) — see Quote.finalBatteryCapacityKwh's doc comment.
   *  Omitted = use the pre-survey estimate, same as before this field
   *  existed. Ignored entirely for ONGRID_ZERO_EXPORT quotes. */
  finalBatteryCapacityKwh: z.number().positive().max(500).optional(),
});

/**
 * POST /api/admin/checker/quotes/:quoteId/approve
 *
 * Recomputes the exact BOQ price (never trusts a client-supplied number),
 * moves the quote to CHECKER_APPROVED, writes an audit log entry (client-
 * safe fields only — see AuditAction's doc comment in schema.prisma), and
 * returns a wa.me link pre-filled with the binding contract message.
 *
 * Reachable by anyone with CHECKER module access (Super Admin, or an
 * ADMIN user granted CHECKER), but WHO gets recorded as the approver
 * (`approvedById`, validated below against real SUPER_ADMIN-role users
 * only) is a separate, unchanged business rule — see
 * lib/auth/internal-guard.ts's Role doc comment: delegating dashboard
 * access to an Admin does not delegate approval authority itself.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ quoteId: string }> }) {
  try {
    await assertAdminModuleAccess(req, "CHECKER");
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { quoteId } = await params;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { approvedById, finalBatteryCapacityKwh } = parsed.data;

    const approver = await prisma.user.findFirst({
      where: { id: approvedById, role: "SUPER_ADMIN", isActive: true },
      select: { id: true },
    });
    if (!approver) {
      return NextResponse.json({ error: "Selected approver is not a valid, active Super Admin." }, { status: 400 });
    }

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { lead: { select: { fullName: true, phone: true } }, siteSurvey: true },
    });
    if (!quote) {
      return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    }
    if (quote.status !== "MAKER_SUBMITTED") {
      return NextResponse.json(
        { error: `Quote is at status "${quote.status}", not awaiting Checker approval.` },
        { status: 409 }
      );
    }
    if (!quote.siteSurvey) {
      return NextResponse.json({ error: "No site survey on file for this quote." }, { status: 409 });
    }
    const survey = quote.siteSurvey;

    let pricing;
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
        finalBatteryCapacityKwh,
        targetBudgetTier: parseBudgetTier(quote.targetBudgetTier),
      });
    } catch (err) {
      if (err instanceof PricingConfigurationError) {
        console.error("[POST .../approve] pricing configuration error:", err.message);
        return NextResponse.json(
          { error: "Vendor cost / margin configuration is incomplete for this system." },
          { status: 503 }
        );
      }
      throw err;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const q = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: "CHECKER_APPROVED",
          finalPriceRs: pricing.exactClientPricePKR,
          finalSystemSizeKw: quote.estimatedSystemSizeKw,
          // pricing.batteryCapacityKwh (not the raw request field) —
          // whatever calculateAdminBoqPricing actually priced with,
          // whether the Checker edited it or left the pre-survey
          // estimate, so this always reflects the true contracted value.
          finalBatteryCapacityKwh: pricing.batteryCapacityKwh,
          checkerApprovedAt: new Date(),
          checkerApprovedById: approvedById,
        },
      });

      // Client-safe fields only — deliberately NOT logging
      // exactRawCostPKR / profitPKR / profitPercent. See AuditAction's
      // doc comment in schema.prisma.
      await tx.auditLog.create({
        data: {
          action: "QUOTE_CHECKER_APPROVED",
          quoteId,
          quoteNumber: quote.quoteNumber,
          actorId: approvedById,
          metadata: {
            previousStatus: "MAKER_SUBMITTED",
            automatedEstimatePriceRs: quote.automatedEstimatePriceRs.toNumber(),
            finalPriceRs: pricing.exactClientPricePKR,
          },
        },
      });

      return q;
    });

    const contractMessage = buildContractMessage({
      fullName: quote.lead.fullName,
      quoteNumber: quote.quoteNumber,
      systemKw: quote.estimatedSystemSizeKw.toNumber(),
      finalPriceRs: pricing.exactClientPricePKR,
      daysToDeploy: DAYS_TO_DEPLOY_DEFAULT,
      lineItems: pricing.markedUpBreakdown,
    });
    const waHref = buildWaLink(quote.lead.phone, contractMessage);

    return NextResponse.json({
      quote: { id: updated.id, status: updated.status, finalPriceRs: pricing.exactClientPricePKR },
      whatsapp: { href: waHref, toPhone: quote.lead.phone, message: contractMessage },
    });
  } catch (err) {
    console.error("[POST /api/admin/checker/quotes/:quoteId/approve]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
