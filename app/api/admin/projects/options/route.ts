import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { getProjectOptions } from "@/lib/siteProjects/server";

/** GET /api/admin/projects/options — the labour heads and linkable quotes
 *  the New project form offers. */
export async function GET(req: NextRequest) {
  const denied = denyUnlessAllowed(req, "SUPER_ADMIN");
  if (denied) return denied;
  try {
    return NextResponse.json(await getProjectOptions());
  } catch (err) {
    return siteProjectErrorResponse("GET /api/admin/projects/options", err);
  }
}
