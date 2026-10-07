import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { denyUnlessAllowed, readJson, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { createProject, listProjectsForLabourHead, projectInputSchema } from "@/lib/siteProjects/server";

/** GET /api/maker/projects?engineerId=... — the labour head's own projects. */
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

/** POST /api/maker/projects — enter project details + materials for approval. */
export async function POST(req: NextRequest) {
  const denied = denyUnlessAllowed(req, "MAKER");
  if (denied) return denied;
  try {
    const { engineerId, ...input } = projectInputSchema
      .extend({ engineerId: z.string().min(1, "Choose who you are first") })
      .parse(await readJson(req));
    return NextResponse.json({ project: await createProject(engineerId, input) }, { status: 201 });
  } catch (err) {
    return siteProjectErrorResponse("POST /api/maker/projects", err);
  }
}
