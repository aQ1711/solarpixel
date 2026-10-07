import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { projectInputSchema, resubmitProject } from "@/lib/siteProjects/server";

/** PUT /api/maker/projects/:projectId — edit and resubmit after the Super
 *  Admin asked for changes (only valid while REVISION_REQUESTED). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = denyUnlessAllowed(req, "MAKER");
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const { engineerId, ...input } = projectInputSchema
      .extend({ engineerId: z.string().min(1, "Choose who you are first") })
      .parse(await readJson(req));
    return NextResponse.json({ project: await resubmitProject(engineerId, projectId, input) });
  } catch (err) {
    return siteProjectErrorResponse("PUT /api/maker/projects/:projectId", err);
  }
}
