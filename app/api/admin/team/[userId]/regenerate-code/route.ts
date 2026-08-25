import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { assertSuperAdminAccess, InternalAuthError, generateAccessCode, hashAccessCode } from "@/lib/auth/internal-guard";

/**
 * POST /api/admin/team/:userId/regenerate-code — issues a brand-new
 * access code for an existing Admin, immediately invalidating their old
 * one (overwriting `accessCodeHash` means the previous code's hash no
 * longer matches anything — no separate revoke step needed). Returns the
 * new plaintext code ONCE, same "copy it now, it's gone after this
 * response" contract as POST /api/admin/team — see that route's doc
 * comment.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const prisma = await getDb();
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { userId } = await params;

  try {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!target || target.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin not found." }, { status: 404 });
    }

    const accessCode = generateAccessCode();
    await prisma.user.update({ where: { id: userId }, data: { accessCodeHash: hashAccessCode(accessCode) } });

    return NextResponse.json({ accessCode });
  } catch (err) {
    console.error("[POST /api/admin/team/:userId/regenerate-code]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
