import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { listLinkableQuotes } from "@/lib/siteProjects/server";

/** GET /api/maker/project-quotes — approved quotes a site project can be
 *  linked to. Carries no prices (see LinkableQuoteDTO). */
export async function GET(req: NextRequest) {
  const denied = denyUnlessAllowed(req, "MAKER");
  if (denied) return denied;
  try {
    return NextResponse.json({ quotes: await listLinkableQuotes() });
  } catch (err) {
    return siteProjectErrorResponse("GET /api/maker/project-quotes", err);
  }
}
