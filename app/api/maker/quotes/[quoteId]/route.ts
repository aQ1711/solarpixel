import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { assertMakerAccess, InternalAuthError } from "@/lib/auth/internal-guard";
import { estimatedBatteryCapacityKwh, parseEquipmentSelections } from "@/lib/db/admin";

/** GET /api/maker/quotes/:quoteId — lookup for the Field Engineer to
 *  confirm they're surveying the right site before filling out the form. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ quoteId: string }> }) {
  try {
    assertMakerAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { quoteId } = await params;

  try {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { lead: { select: { fullName: true, city: true } } },
    });

    if (!quote) {
      return NextResponse.json({ error: "No quote found with that ID." }, { status: 404 });
    }

    // A survey can only be filed once, pre-Maker-submission. Revision
    // handling (Checker sends a quote back for a second visit) isn't
    // wired up yet — SiteSurvey.quoteId is 1:1, so that flow needs an
    // update-in-place path here rather than another create(). Flagging
    // as a follow-up, not silently allowed.
    if (quote.status !== "AUTOMATED_ESTIMATE" && quote.status !== "SURVEY_SCHEDULED") {
      return NextResponse.json(
        { error: `This quote is already at status "${quote.status}". It can't take a new survey submission.` },
        { status: 409 }
      );
    }

    // Battery capacity is only meaningful for HYBRID_BATTERY quotes — null
    // for ONGRID_ZERO_EXPORT so the mobile form knows to omit the field
    // entirely rather than show a 0.
    const estimatedBatteryKwh =
      quote.serviceType === "HYBRID_BATTERY"
        ? estimatedBatteryCapacityKwh(
            quote.estimatedSystemSizeKw.toNumber(),
            parseEquipmentSelections(quote.equipmentSelections)
          )
        : null;

    return NextResponse.json({
      quote: {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        sector: quote.sector,
        serviceType: quote.serviceType,
        systemKw: quote.estimatedSystemSizeKw.toNumber(),
        status: quote.status,
        leadName: quote.lead.fullName,
        leadCity: quote.lead.city,
        // Pre-fills the Field Engineer's "Client Requested Battery Capacity"
        // input — the original web estimate, overwritable on-site. Null for
        // ONGRID_ZERO_EXPORT.
        estimatedBatteryCapacityKwh: estimatedBatteryKwh,
      },
    });
  } catch (err) {
    console.error("[GET /api/maker/quotes/:quoteId]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
