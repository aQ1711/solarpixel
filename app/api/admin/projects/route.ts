import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { listProjectsForAdmin } from "@/lib/siteProjects/server";

/** GET /api/admin/projects — every site project, newest first. Super Admin
 *  only: this is where payouts are decided. */
export async function GET(req: NextRequest) {
  const denied = denyUnlessAllowed(req, "SUPER_ADMIN");
  if (denied) return denied;
  try {
    return NextResponse.json({ projects: await listProjectsForAdmin() });
  } catch (err) {
    return siteProjectErrorResponse("GET /api/admin/projects", err);
  }
}
