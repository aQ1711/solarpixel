import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { createProject, listProjectsForAdmin, projectDetailsSchema } from "@/lib/siteProjects/server";

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

/** POST /api/admin/projects — create a project and assign it to a labour
 *  head, who then only enters the materials. */
export async function POST(req: NextRequest) {
  const denied = denyUnlessAllowed(req, "SUPER_ADMIN");
  if (denied) return denied;
  try {
    const input = projectDetailsSchema.parse(await readJson(req));
    return NextResponse.json({ project: await createProject(input) }, { status: 201 });
  } catch (err) {
    return siteProjectErrorResponse("POST /api/admin/projects", err);
  }
}
