import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { completeInputSchema, endSite, startSite } from "@/lib/siteProjects/server";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START"), engineerId: z.string().min(1) }),
  z.object({ action: z.literal("END"), engineerId: z.string().min(1) }).merge(completeInputSchema),
]);

/** POST /api/maker/projects/:projectId/site — START the site (once the Super
 *  Admin has approved it) or END it with a completion report. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = denyUnlessAllowed(req, "MAKER");
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const body = bodySchema.parse(await readJson(req));
    const project =
      body.action === "START"
        ? await startSite(body.engineerId, projectId)
        : await endSite(body.engineerId, projectId, body.completionNotes);
    return NextResponse.json({ project });
  } catch (err) {
    return siteProjectErrorResponse("POST /api/maker/projects/:projectId/site", err);
  }
}
