import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { voidCustomerPayment } from "@/lib/siteProjects/server";

/** POST /api/admin/projects/:projectId/payments/:paymentId/void — cancel a
 *  payment entered by mistake. It stays on record but no longer counts. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; paymentId: string }> },
) {
  const denied = denyUnlessAllowed(req, "SUPER_ADMIN");
  if (denied) return denied;
  try {
    const { projectId, paymentId } = await params;
    return NextResponse.json({ project: await voidCustomerPayment(projectId, paymentId) });
  } catch (err) {
    return siteProjectErrorResponse("POST /api/admin/projects/:projectId/payments/:paymentId/void", err);
  }
}
