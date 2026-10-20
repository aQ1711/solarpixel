import { NextRequest, NextResponse } from "next/server";
import { quotationErrorResponse, requireQuotesAccess } from "@/lib/customQuotation/http";
import { getCustomQuotation } from "@/lib/customQuotation/server";

/** GET /api/admin/custom-quotes/:id — one quotation (own only, unless Super Admin). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireQuotesAccess(req);
  if ("denied" in access) return access.denied;
  try {
    const { id } = await params;
    return NextResponse.json({ quotation: await getCustomQuotation(access.identity, id) });
  } catch (err) {
    return quotationErrorResponse("GET /api/admin/custom-quotes/:id", err);
  }
}
