import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { customerPriceSchema, setCustomerPrice } from "@/lib/siteProjects/server";

/** POST /api/admin/projects/:projectId/customer-price — what the customer is
 *  charged for this job (Super Admin only). Null clears it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = denyUnlessAllowed(req, "SUPER_ADMIN");
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const { customerPricePKR } = customerPriceSchema.parse(await readJson(req));
    return NextResponse.json({ project: await setCustomerPrice(projectId, customerPricePKR) });
  } catch (err) {
    return siteProjectErrorResponse("POST /api/admin/projects/:projectId/customer-price", err);
  }
}
