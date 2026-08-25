import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getTickerSettings, updateTickerSettings } from "@/lib/db/tickerSettings";
import { assertSuperAdminAccess, InternalAuthError } from "@/lib/auth/internal-guard";

/**
 * /api/admin/ticker-settings — Market Watch ticker row visibility
 * toggles, edited from /admin/pricing. Same Super-Admin-only gate as
 * every other /api/admin/pricing/* route for consistency, even though
 * TickerSettings itself isn't confidential (see its doc comment in
 * schema.prisma) — the public read path is /api/equipment-options,
 * which bundles the current settings into its response for the
 * anonymous storefront ticker.
 */
const updateSchema = z.object({
  showSolarPanels: z.boolean().optional(),
  showOnGridInverters: z.boolean().optional(),
  showHybridInverters: z.boolean().optional(),
  showBatteries: z.boolean().optional(),
  updatedById: z.string().min(1, "updatedById is required"),
});

async function assertValidSuperAdmin(userId: string): Promise<boolean> {
  const prisma = await getDb();
  const admin = await prisma.user.findFirst({ where: { id: userId, role: "SUPER_ADMIN", isActive: true }, select: { id: true } });
  return admin !== null;
}

export async function GET(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const tickerSettings = await getTickerSettings();
  return NextResponse.json({ tickerSettings });
}

export async function POST(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  if (!(await assertValidSuperAdmin(input.updatedById))) {
    return NextResponse.json({ error: "Not a valid, active Super Admin." }, { status: 400 });
  }

  try {
    const tickerSettings = await updateTickerSettings(input);
    return NextResponse.json({ tickerSettings });
  } catch (err) {
    console.error("[POST /api/admin/ticker-settings]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
