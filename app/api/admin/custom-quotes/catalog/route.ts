import { NextRequest, NextResponse } from "next/server";
import { quotationErrorResponse, requireQuotesAccess } from "@/lib/customQuotation/http";
import { getCatalog, sectorSchema } from "@/lib/customQuotation/server";

/** GET /api/admin/custom-quotes/catalog?sector= — in-stock catalog items with
 *  their locked selling prices for the picker. */
export async function GET(req: NextRequest) {
  const access = await requireQuotesAccess(req);
  if ("denied" in access) return access.denied;
  try {
    const sector = sectorSchema.catch("RESIDENTIAL").parse(req.nextUrl.searchParams.get("sector"));
    return NextResponse.json({ items: await getCatalog(sector) });
  } catch (err) {
    return quotationErrorResponse("GET /api/admin/custom-quotes/catalog", err);
  }
}
