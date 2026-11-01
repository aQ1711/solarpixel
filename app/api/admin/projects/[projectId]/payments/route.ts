import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { addCustomerPayment, customerPaymentSchema } from "@/lib/siteProjects/server";

/** POST /api/admin/projects/:projectId/payments — record money received from
 *  the customer (Super Admin only; never visible to the labour head). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = denyUnlessAllowed(req, "SUPER_ADMIN");
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const input = customerPaymentSchema.parse(await readJson(req));
    return NextResponse.json({ project: await addCustomerPayment(projectId, input) });
  } catch (err) {
    return siteProjectErrorResponse("POST /api/admin/projects/:projectId/payments", err);
  }
}
