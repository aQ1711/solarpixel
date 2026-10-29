import { NextRequest, NextResponse } from "next/server";
import { denyUnlessAllowed, siteProjectErrorResponse } from "@/lib/siteProjects/http";
import { getItemCatalog } from "@/lib/siteProjects/server";

/** GET /api/maker/projects/catalog — the items the labour head can pick for
 *  their quotation, grouped like the admin pricing page. Names only: no
 *  prices, costs or margins ever leave this route. */
export async function GET(req: NextRequest) {
  const denied = denyUnlessAllowed(req, "MAKER");
  if (denied) return denied;
  try {
    return NextResponse.json({ groups: await getItemCatalog() });
  } catch (err) {
    return siteProjectErrorResponse("GET /api/maker/projects/catalog", err);
  }
}
