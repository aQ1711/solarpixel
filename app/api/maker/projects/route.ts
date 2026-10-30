import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { denyUnlessAllowed, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { listProjectsForLabourHead } from "@/lib/siteProjects/server";

/** GET /api/maker/projects?engineerId=... — the projects the Super Admin
 *  assigned to this labour head. (Labour heads can't create projects; the
 *  Super Admin does that from /admin/projects.) */
export async function GET(req: NextRequest) {
  const denied = denyUnlessAllowed(req, "MAKER");
  if (denied) return denied;
  try {
    const engineerId = z.string().min(1, "Choose who you are first").parse(req.nextUrl.searchParams.get("engineerId"));
    return NextResponse.json({ projects: await listProjectsForLabourHead(engineerId) });
  } catch (err) {
    return siteProjectErrorResponse("GET /api/maker/projects", err);
  }
}
