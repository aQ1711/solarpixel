import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { assertSuperAdminAccess, InternalAuthError, getSuperAdminActorId, NoSuperAdminConfiguredError } from "@/lib/auth/internal-guard";

const updateAdminSchema = z.object({
  isActive: z.boolean().optional(),
  /** Replaces the FULL set of granted modules — omit to leave grants
   *  untouched, `[]` to revoke everything without deactivating the
   *  account (e.g. "on hold" vs. "gone"). */
  modules: z.array(z.enum(["LEADS", "CHECKER"])).optional(),
});

/**
 * PATCH /api/admin/team/:userId — toggles an Admin's active status
 * and/or replaces their module grants. Super-Admin-only — same boundary
 * as GET/POST /api/admin/team.
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
    const parsed = updateAdminSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { isActive, modules } = parsed.data;
    if (isActive === undefined && modules === undefined) {
      return NextResponse.json({ error: "Nothing to update — pass isActive and/or modules." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!target || target.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin not found." }, { status: 404 });
    }

    // Only needed if we're about to WRITE new grant rows (grantedById is
    // a required FK) — an isActive-only update, or shrinking modules to
    // [], never touches this.
    let superAdminId: string | null = null;
    if (modules !== undefined && modules.length > 0) {
      try {
        superAdminId = await getSuperAdminActorId();
      } catch (err) {
        if (err instanceof NoSuperAdminConfiguredError) {
          return NextResponse.json(
            { error: "No Super Admin user is configured in the database — cannot attribute this action." },
            { status: 503 }
          );
        }
        throw err;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (isActive !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { isActive } });
      }
      if (modules !== undefined) {
        // Full-set replace — deliberately simpler and less error-prone
        // than diffing add/remove, and this table is small per user (at
        // most 2 rows today, LEADS + CHECKER).
        await tx.adminModuleGrant.deleteMany({ where: { userId } });
        if (modules.length > 0) {
          await tx.adminModuleGrant.createMany({
            data: modules.map((module) => ({ userId, module, grantedById: superAdminId! })),
          });
        }
      }
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isActive: true,
          adminModuleGrants: { select: { module: true } },
        },
      });
    });

    return NextResponse.json({
      admin: {
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        isActive: updated.isActive,
        modules: updated.adminModuleGrants.map((g) => g.module),
      },
    });
  } catch (err) {
    console.error("[PATCH /api/admin/team/:userId]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
