import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { assertMakerAccess, InternalAuthError } from "@/lib/auth/internal-guard";

/** GET /api/maker/engineers — active Field Engineers, for the survey
 *  form's "surveyed by" selector (no login system yet, see internal-guard.ts). */
export async function GET(req: NextRequest) {
  try {
    assertMakerAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const engineers = await prisma.user.findMany({
      where: { role: "FIELD_ENGINEER", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ engineers });
  } catch (err) {
    console.error("[GET /api/maker/engineers]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
