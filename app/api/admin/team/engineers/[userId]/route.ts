import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { assertSuperAdminAccess, InternalAuthError } from "@/lib/auth/internal-guard";

const updateEngineerSchema = z.object({
  isActive: z.boolean(),
});

/**
 * PATCH /api/admin/team/engineers/:userId — deactivate/reactivate a Field
 * Engineer. No delete — deactivating (not removing) matches the same
 * "gone vs. on hold, and existing SiteSurvey.engineerId FKs must stay
 * resolvable" reasoning /api/admin/team's Admin deactivation already
 * uses. Super-Admin-only, same boundary as every route in this file's
 * parent resource.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { userId } = await params;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const parsed = updateEngineerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!target || target.role !== "FIELD_ENGINEER") {
      return NextResponse.json({ error: "Field Engineer not found." }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: parsed.data.isActive },
      select: { id: true, name: true, phone: true, email: true, isActive: true, createdAt: true },
    });

    return NextResponse.json({ engineer: updated });
  } catch (err) {
    console.error("[PATCH /api/admin/team/engineers/:userId]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
