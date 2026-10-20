import { NextRequest, NextResponse } from "next/server";
import { quotationErrorResponse, readJson, requireQuotesAccess } from "@/lib/customQuotation/http";
import { createCustomQuotation, createQuotationSchema, listCustomQuotations } from "@/lib/customQuotation/server";

/** GET /api/admin/custom-quotes — the viewer's custom quotations (the Super
 *  Admin sees all; a delegated Admin sees only their own). */
export async function GET(req: NextRequest) {
  const access = await requireQuotesAccess(req);
  if ("denied" in access) return access.denied;
  try {
    return NextResponse.json({ quotations: await listCustomQuotations(access.identity) });
  } catch (err) {
    return quotationErrorResponse("GET /api/admin/custom-quotes", err);
  }
}

/** POST /api/admin/custom-quotes — create a quotation. The body carries item
 *  codes and quantities only; prices are looked up server-side. */
export async function POST(req: NextRequest) {
  const access = await requireQuotesAccess(req);
  if ("denied" in access) return access.denied;
  try {
    const input = createQuotationSchema.parse(await readJson(req));
    return NextResponse.json({ quotation: await createCustomQuotation(access.identity, input) }, { status: 201 });
  } catch (err) {
    return quotationErrorResponse("POST /api/admin/custom-quotes", err);
  }
}
