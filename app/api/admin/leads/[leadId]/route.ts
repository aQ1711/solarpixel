import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import {
  calculateSystemPricing,
  parseEquipmentSelections,
  PricingConfigurationError,
  type ResolvedEquipment,
  type ItemizedBreakdown,
} from "@/lib/db/admin";
import { assertAdminModuleAccess, InternalAuthError } from "@/lib/auth/internal-guard";

/**
 * GET /api/admin/leads/:leadId — full detail for the Lead Dossier (the
 * drawer's own quick-glance fetch, and the dedicated /admin/leads/:id
 * page, both use this same route): every captured contact field, the
 * Lead Intelligence fields captured at submission time, the Activity
 * Timeline, the exact equipment configuration the customer built, and
 * the full financial breakdown.
 *
 * Same "public Prisma client + assertAdminModuleAccess(req, 'LEADS')"
 * boundary as GET /api/admin/leads — see that route's doc comment. The
 * one place this route DOES cross into the admin-only boundary is the
 * fallback below:
 * `Quote.resolvedEquipmentSnapshot`/`breakdownSnapshot` are null for
 * quotes created before those columns existed, so this recomputes them
 * live via `calculateSystemPricing()` — the same sanctioned
 * vendor-cost-touching function every other pricing path in this app
 * already goes through (never a direct `adminPrisma` import here). A
 * recompute uses TODAY's catalog prices/margins, not what the customer
 * was actually quoted at the time — an unavoidable approximation for
 * pre-snapshot data only, flagged via `breakdownIsEstimate` in the
 * response so the sales rep isn't misled into treating it as exact.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const prisma = await getDb();
  try {
    await assertAdminModuleAccess(req, "LEADS");
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { leadId } = await params;

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        quotes: { orderBy: { createdAt: "desc" }, take: 1 },
        // Activity Timeline — oldest first, so the UI can render
        // top-to-bottom as a straightforward chronological log without
        // reversing it client-side.
        activities: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    const quote = lead.quotes[0] ?? null;

    let resolvedEquipment: ResolvedEquipment | null = (quote?.resolvedEquipmentSnapshot as ResolvedEquipment | null) ?? null;
    let breakdown: ItemizedBreakdown | null = (quote?.breakdownSnapshot as ItemizedBreakdown | null) ?? null;
    let breakdownIsEstimate = false;
    let breakdownError: string | null = null;

    if (quote && (!resolvedEquipment || !breakdown)) {
      breakdownIsEstimate = true;
      try {
        const recomputed = await calculateSystemPricing(
          quote.estimatedSystemSizeKw.toNumber(),
          quote.sector,
          quote.serviceType,
          parseEquipmentSelections(quote.equipmentSelections)
        );
        resolvedEquipment = recomputed.resolvedEquipment;
        breakdown = recomputed.breakdown;
      } catch (err) {
        if (err instanceof PricingConfigurationError) {
          console.error("[GET /api/admin/leads/:leadId] recompute pricing error:", err.message);
          breakdownError = "Vendor cost / margin configuration is incomplete. Cannot reconstruct this legacy quote's breakdown.";
        } else {
          throw err;
        }
      }
    }

    return NextResponse.json({
      lead: {
        id: lead.id,
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        city: lead.city,
        address: lead.address,
        sector: lead.sector,
        source: lead.source,
        status: lead.status,
        monthlyBillRs: lead.monthlyBillRs.toNumber(),
        createdAt: lead.createdAt,
        // ---- Lead Intelligence — see each column's doc comment in
        // schema.prisma. All best-effort/nullable by design. ----
        ipAddress: lead.ipAddress,
        userAgent: lead.userAgent,
        deviceType: lead.deviceType,
        browserName: lead.browserName,
        osName: lead.osName,
        detectedCity: lead.detectedCity,
        detectedRegion: lead.detectedRegion,
        detectedCountry: lead.detectedCountry,
        detectedCountryCode: lead.detectedCountryCode,
        detectedLatitude: lead.detectedLatitude,
        detectedLongitude: lead.detectedLongitude,
        referrerUrl: lead.referrerUrl,
      },
      activities: lead.activities.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        metadata: a.metadata,
        createdAt: a.createdAt,
      })),
      quote: quote && {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        serviceType: quote.serviceType,
        status: quote.status,
        systemKw: quote.estimatedSystemSizeKw.toNumber(),
        automatedEstimatePriceRs: quote.automatedEstimatePriceRs.toNumber(),
        finalPriceRs: quote.finalPriceRs?.toNumber() ?? null,
        billSource: quote.billSource,
        uploadedBillFileUrl: quote.uploadedBillFileUrl,
        createdAt: quote.createdAt,
        resolvedEquipment,
        breakdown,
        breakdownIsEstimate,
        breakdownError,
      },
    });
  } catch (err) {
    console.error("[GET /api/admin/leads/:leadId]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
