import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { materialsInputSchema, submitMaterials } from "@/lib/siteProjects/server";

/** PUT /api/maker/projects/:projectId/materials — enter the quotation (materials,
 *  prices and the labour head's own service fee) for an assigned project and send them for approval. Also used to
 *  resubmit after the Super Admin asked for changes. Valid only while the
 *  project is ASSIGNED or REVISION_REQUESTED. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = denyUnlessAllowed(req, "MAKER");
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const { engineerId, materials, labourFeePKR } = materialsInputSchema
      .extend({ engineerId: z.string().min(1, "Choose who you are first") })
      .parse(await readJson(req));
    return NextResponse.json({ project: await submitMaterials(engineerId, projectId, materials, labourFeePKR) });
  } catch (err) {
    return siteProjectErrorResponse("PUT /api/maker/projects/:projectId/materials", err);
  }
}
