import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  assertSuperAdminAccess,
  InternalAuthError,
  generateAccessCode,
  hashAccessCode,
  getSuperAdminActorId,
  NoSuperAdminConfiguredError,
} from "@/lib/auth/internal-guard";

const createAdminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"),
  email: z.string().trim().email().optional(),
  modules: z.array(z.enum(["LEADS", "CHECKER"])).min(1, "Grant at least one module"),
});

/**
 * GET /api/admin/team — every ADMIN-role user + their module grants, for
 * the Super Admin's "Manage Admins" page (app/admin/team).
 *
 * `assertSuperAdminAccess` (not `assertAdminModuleAccess`) — deliberately
 * Super-Admin-only, unconditionally. A regular Admin can never see or
 * manage OTHER admins' access, however many modules they themselves have
 * been granted; delegating LEADS/CHECKER access does not delegate the
 * ability to create more admins or change anyone's grants.
 */
export async function GET(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        isActive: true,
        createdAt: true,
        adminModuleGrants: { select: { module: true } },
      },
    });
    return NextResponse.json({
      admins: admins.map((a) => ({
        id: a.id,
        name: a.name,
        phone: a.phone,
        email: a.email,
        isActive: a.isActive,
        createdAt: a.createdAt,
        modules: a.adminModuleGrants.map((g) => g.module),
      })),
    });
  } catch (err) {
    console.error("[GET /api/admin/team]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

/**
 * POST /api/admin/team — creates a new delegated Admin account and
 * issues its access code in one step.
 *
 * The plaintext `accessCode` is returned ONCE, in this response only —
 * only its SHA-256 hash (`User.accessCodeHash`) is ever persisted, so it
 * genuinely cannot be recovered later, only reset (see
 * POST .../regenerate-code). The Super Admin must copy it now and hand
 * it to the Admin out of band (this app has no email/SMS dispatch to do
 * that automatically — see [[solar-pixel-open-gaps]] gap #3 on manual
 * WhatsApp dispatch for the same "no automated messaging yet" reason).
 */
export async function POST(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const parsed = createAdminSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { name, phone, email, modules } = parsed.data;

    let superAdminId: string;
    try {
      superAdminId = await getSuperAdminActorId();
    } catch (err) {
      if (err instanceof NoSuperAdminConfiguredError) {
        console.error("[POST /api/admin/team]", err.message);
        return NextResponse.json(
          { error: "No Super Admin user is configured in the database. Cannot attribute this action." },
          { status: 503 }
        );
      }
      throw err;
    }

    const existingPhone = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (existingPhone) {
      return NextResponse.json({ error: "A user with this phone number already exists." }, { status: 409 });
    }

    const accessCode = generateAccessCode();
    const accessCodeHash = hashAccessCode(accessCode);

    const admin = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          phone,
          email,
          role: "ADMIN",
          // Legacy/unused column (see User.passwordHash's doc comment in
          // schema.prisma) — never checked for this account. Its real
          // credential is accessCodeHash below; this is just a harmless,
          // unguessable filler so the NOT NULL column is satisfied.
          passwordHash: hashAccessCode(generateAccessCode()),
          accessCodeHash,
          createdByAdminId: superAdminId,
        },
      });
      await tx.adminModuleGrant.createMany({
        data: modules.map((module) => ({ userId: created.id, module, grantedById: superAdminId })),
      });
      return created;
    });

    return NextResponse.json({
      admin: { id: admin.id, name: admin.name, phone: admin.phone, email: admin.email, isActive: admin.isActive, modules },
      accessCode,
    });
  } catch (err) {
    console.error("[POST /api/admin/team]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
