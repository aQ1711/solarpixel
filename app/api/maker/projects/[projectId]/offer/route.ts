import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { offerResponseSchema, respondToOffer } from "@/lib/siteProjects/server";

/** POST /api/maker/projects/:projectId/offer — accept the Super Admin's
 *  counter-offer (fixes the prices) or decline it with a note. Valid only
 *  while the project is COUNTER_OFFERED. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = denyUnlessAllowed(req, "MAKER");
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const body = await readJson(req);
    const { engineerId } = z.object({ engineerId: z.string().min(1, "Choose who you are first") }).parse(body);
    const input = offerResponseSchema.parse(body);
    return NextResponse.json({ project: await respondToOffer(engineerId, projectId, input) });
  } catch (err) {
    return siteProjectErrorResponse("POST /api/maker/projects/:projectId/offer", err);
  }
}
