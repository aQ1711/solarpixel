import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { assertAdminModuleAccess, InternalAuthError } from "@/lib/auth/internal-guard";

const updateStatusSchema = z.object({
  status: z.nativeEnum(LeadStatus),
});

/**
 * PATCH /api/admin/leads/:leadId/status — moves a Lead through the sales
 * pipeline (New / Contacted / Survey Booked / Won / Lost). Same
 * `assertAdminModuleAccess(req, "LEADS")` + public-client boundary as the
 * rest of this feature — see GET /api/admin/leads's doc comment.
 *
 * Deliberately does NOT write an AuditLog entry, even now that
 * `assertAdminModuleAccess` resolves a real actor identity (unlike
 * before the 2026-08-20 delegated-access update, when there was none at
 * all): AuditLog.actorId is a FK to a real `User` row, and the Super
 * Admin's identity specifically has no such row (see Role's doc comment
 * in schema.prisma) — so a Super-Admin-made status change still couldn't
 * be logged this way without first deciding how to represent that
 * identity in a FK-backed table. Worth revisiting now that real ADMIN
 * user identities exist, but out of scope for this pass.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    await assertAdminModuleAccess(req, "LEADS");
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { leadId } = await params;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: { status: parsed.data.status },
      select: { id: true, status: true },
    });

    return NextResponse.json({ lead });
  } catch (err) {
    // Prisma throws a recognizable "record not found" error (P2025) on an
    // update against a missing row — surfaced as a clean 404 rather than
    // falling through to the generic 500 below.
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    console.error("[PATCH /api/admin/leads/:leadId/status]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
