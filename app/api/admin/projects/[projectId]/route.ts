import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { projectDetailsSchema, updateProjectDetails } from "@/lib/siteProjects/server";

/** PATCH /api/admin/projects/:projectId — correct a project's details.
 *  Allowed until the prices are approved. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = denyUnlessAllowed(req, "SUPER_ADMIN");
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const input = projectDetailsSchema.parse(await readJson(req));
    return NextResponse.json({ project: await updateProjectDetails(projectId, input) });
  } catch (err) {
    return siteProjectErrorResponse("PATCH /api/admin/projects/:projectId", err);
  }
}
