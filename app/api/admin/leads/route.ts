import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { assertAdminModuleAccess, InternalAuthError, type AdminIdentity } from "@/lib/auth/internal-guard";

/**
 * GET /api/admin/leads — every lead for the Internal Admin Lead
 * Dashboard's data grid (app/admin/leads), newest first.
 *
 * SECURITY BOUNDARY NOTE: this reads through the PUBLIC Prisma client
 * (`app_public_role`, lib/db/client.ts) — the same one the storefront
 * itself uses to create Lead/Quote rows — not the vendor-cost-capable
 * admin client in lib/db/admin.ts. That's deliberate, not a shortcut:
 * Lead/Quote have always lived in the "public" Postgres schema (see the
 * vendor-isolation note at the top of schema.prisma), and the ONLY thing
 * ever isolated behind app_admin_role is raw_vendor_costs/margin_rules —
 * this route never touches either. What actually keeps this dashboard
 * "internal-only, isolated from the edge storefront" is the
 * `assertAdminModuleAccess(req, "LEADS")` gate below (Super Admin always
 * passes; a delegated ADMIN user only if granted the LEADS module — see
 * lib/auth/internal-guard.ts), not a different Postgres role.
 *
 * Each Lead currently has at most one Quote in practice (every SOLAR
 * submission creates a brand-new Lead row, never reuses one by phone —
 * see app/api/quote/calculate/route.ts) but the schema allows more, so
 * this takes the most recently created Quote per Lead rather than
 * assuming exactly one.
 */
export async function GET(req: NextRequest) {
  const prisma = await getDb();
  let viewer: AdminIdentity;
  try {
    viewer = await assertAdminModuleAccess(req, "LEADS");
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        quotes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            quoteNumber: true,
            serviceType: true,
            status: true,
            estimatedSystemSizeKw: true,
            automatedEstimatePriceRs: true,
            finalPriceRs: true,
          },
        },
      },
    });

    const rows = leads.map((lead) => {
      const quote = lead.quotes[0] ?? null;
      return {
        id: lead.id,
        createdAt: lead.createdAt,
        fullName: lead.fullName,
        phone: lead.phone,
        sector: lead.sector,
        status: lead.status,
        quote: quote && {
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          serviceType: quote.serviceType,
          status: quote.status,
          systemKw: quote.estimatedSystemSizeKw.toNumber(),
          // Prefer the Checker-approved contract price once one exists;
          // the automated web estimate is all that's available before
          // that (same "most authoritative figure on hand" precedent as
          // the Checker dashboard's own variance comparison).
          turnkeyPricePKR: (quote.finalPriceRs ?? quote.automatedEstimatePriceRs).toNumber(),
        },
      };
    });

    return NextResponse.json({ leads: rows, viewer });
  } catch (err) {
    console.error("[GET /api/admin/leads]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
