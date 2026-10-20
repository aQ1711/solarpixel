import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listBundleDealsForAdmin,
  PricingConfigurationError,
  setBundleDealActive,
  upsertBundleDeal,
} from "@/lib/db/admin";
import { assertSuperAdminAccess, InternalAuthError } from "@/lib/auth/internal-guard";

/**
 * /api/admin/pricing/bundles — vendor inverter + battery combo deals. The
 * combo cost is a confidential purchase cost, so this is Super Admin only,
 * like every other /api/admin/pricing/* route.
 */

function unauthorized(err: unknown): NextResponse {
  if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  throw err;
}

export async function GET(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    return unauthorized(err);
  }
  try {
    return NextResponse.json({ deals: await listBundleDealsForAdmin() });
  } catch (err) {
    console.error("[GET /api/admin/pricing/bundles]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

const upsertSchema = z.object({
  inverterCode: z.string().min(1),
  batteryCode: z.string().min(1),
  comboCostRs: z.number().positive("Combo cost must be more than 0").max(100_000_000),
  note: z.string().trim().max(200).nullish(),
  isActive: z.boolean().optional(),
});

const toggleSchema = z.object({ id: z.string().min(1), isActive: z.boolean() });

/** PUT: create or update a deal for an inverter + battery pair. */
export async function PUT(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    return unauthorized(err);
  }
  const parsed = upsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
  }
  try {
    await upsertBundleDeal(parsed.data);
    return NextResponse.json({ deals: await listBundleDealsForAdmin() });
  } catch (err) {
    if (err instanceof PricingConfigurationError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[PUT /api/admin/pricing/bundles]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

/** PATCH: switch a deal on or off. */
export async function PATCH(req: NextRequest) {
  try {
    assertSuperAdminAccess(req);
  } catch (err) {
    return unauthorized(err);
  }
  const parsed = toggleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  try {
    await setBundleDealActive(parsed.data.id, parsed.data.isActive);
    return NextResponse.json({ deals: await listBundleDealsForAdmin() });
  } catch (err) {
    console.error("[PATCH /api/admin/pricing/bundles]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
