import { NextRequest, NextResponse } from "next/server";
import { quotationErrorResponse, readJson, requireQuotesAccess } from "@/lib/customQuotation/http";
import { createQuotationVersion, editQuotationSchema, getCustomQuotation } from "@/lib/customQuotation/server";

/** GET /api/admin/custom-quotes/:id — one version of a quotation, with the
 *  full version history (own only, unless Super Admin). */
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

/** PUT /api/admin/custom-quotes/:id — edit = add a new version of this
 *  quotation (same number, version + 1). Earlier versions are never changed.
 *  Item codes and quantities only; the server re-prices from the catalog. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireQuotesAccess(req);
  if ("denied" in access) return access.denied;
  try {
    const { id } = await params;
    const input = editQuotationSchema.parse(await readJson(req));
    return NextResponse.json({ quotation: await createQuotationVersion(access.identity, id, input) });
  } catch (err) {
    return quotationErrorResponse("PUT /api/admin/custom-quotes/:id", err);
  }
}
