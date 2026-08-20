import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { assertAdminModuleAccess, InternalAuthError } from "@/lib/auth/internal-guard";

/** GET /api/admin/checker/admins — active Super Admins, for the "approving
 *  as" selector (no login system yet, see lib/auth/internal-guard.ts).
 *  Reachable by anyone with CHECKER module access (Super Admin or a
 *  delegated Admin) — the LIST returned still only ever contains real
 *  SUPER_ADMIN-role users, since maker-checker approval attribution
 *  (Quote.checkerApprovedById) stays a Super-Admin-only business rule
 *  regardless of who operates the dashboard day to day. */
export async function GET(req: NextRequest) {
  try {
    await assertAdminModuleAccess(req, "CHECKER");
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const admins = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ admins });
  } catch (err) {
    console.error("[GET /api/admin/checker/admins]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
