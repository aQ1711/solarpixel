import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { reviewInputSchema, reviewProject } from "@/lib/siteProjects/server";

/** POST /api/admin/projects/:projectId/review — approve (with approved
 *  quantities/prices + labour fee), send back with a note, or reject. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = denyUnlessAllowed(req, "SUPER_ADMIN");
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const input = reviewInputSchema.parse(await readJson(req));
    return NextResponse.json({ project: await reviewProject(projectId, input) });
  } catch (err) {
    return siteProjectErrorResponse("POST /api/admin/projects/:projectId/review", err);
  }
}
