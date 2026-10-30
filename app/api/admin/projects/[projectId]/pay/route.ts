import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { markPaid, paidInputSchema } from "@/lib/siteProjects/server";

/** POST /api/admin/projects/:projectId/pay — release the payout once the
 *  site has been completed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = denyUnlessAllowed(req, "SUPER_ADMIN");
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const { paymentReference } = paidInputSchema.parse(await readJson(req));
    return NextResponse.json({ project: await markPaid(projectId, paymentReference) });
  } catch (err) {
    return siteProjectErrorResponse("POST /api/admin/projects/:projectId/pay", err);
  }
}
