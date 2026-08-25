import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { assertSuperAdminAccess, InternalAuthError, hashAccessCode, generateAccessCode } from "@/lib/auth/internal-guard";

/**
 * GET/POST /api/admin/team/engineers — Field Engineer (role: FIELD_ENGINEER)
 * management, added 2026-08-20 alongside /api/admin/team's existing
 * delegated-Admin management. Reported as a real gap: before this, the
 * ONLY way to add a Field Engineer was a direct database write (only the
 * two prisma/seed.ts rows existed). Deliberately a separate resource from
 * /api/admin/team (which is scoped to role: "ADMIN" throughout) rather
 * than overloading that route with a `role` discriminator — Field
 * Engineers have no access code or module-grant concept at all (see
 * User.accessCodeHash's doc comment — /maker/* is still ONE shared
 * secret, MAKER_ACCESS_TOKEN, unaffected by this), so the shapes barely
 * overlap beyond name/phone/email/isActive.
 *
 * Super-Admin-only (assertSuperAdminAccess, not assertAdminModuleAccess)
 * — same boundary as /api/admin/team: a delegated Admin, however many
 * modules they've been granted, can never create or manage staff.
 */
const createEngineerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"),
  email: z.string().trim().email().optional(),
});

export async function GET(req: NextRequest) {
  const prisma = await getDb();
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const engineers = await prisma.user.findMany({
      where: { role: "FIELD_ENGINEER" },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true, email: true, isActive: true, createdAt: true },
    });
    return NextResponse.json({ engineers });
  } catch (err) {
    console.error("[GET /api/admin/team/engineers]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const prisma = await getDb();
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
    const parsed = createEngineerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { name, phone, email } = parsed.data;

    const existingPhone = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (existingPhone) {
      return NextResponse.json({ error: "A user with this phone number already exists." }, { status: 409 });
    }

    const engineer = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        role: "FIELD_ENGINEER",
        // Legacy/unused column (see User.passwordHash's doc comment in
        // schema.prisma) — Field Engineers have no login/credential of
        // their own at all, same as before this route existed (they're
        // just picked by name from /maker/survey's dropdown once someone
        // holding MAKER_ACCESS_TOKEN or the Super Admin's own token is
        // already past the page gate). A harmless, unguessable filler so
        // the NOT NULL column is satisfied, nothing more.
        passwordHash: hashAccessCode(generateAccessCode()),
      },
      select: { id: true, name: true, phone: true, email: true, isActive: true, createdAt: true },
    });

    return NextResponse.json({ engineer });
  } catch (err) {
    console.error("[POST /api/admin/team/engineers]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
