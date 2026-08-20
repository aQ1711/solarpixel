import { NextRequest, NextResponse } from "next/server";
import { Sector } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getPublicUnitPricesPKR } from "@/lib/db/admin";

const VALID_SECTORS: Sector[] = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL"];

/**
 * GET /api/equipment-options?sector=RESIDENTIAL — the public, cost-free
 * catalog for the Custom Equipment Builder. Uses the PUBLIC Prisma client
 * only (app_public_role) — EquipmentOption carries no price, so there's
 * nothing here that needs the admin boundary. See EquipmentOption's doc
 * comment in schema.prisma for how this pairs with the confidential
 * RawVendorCost rows in lib/db/admin.ts.
 *
 * `unitPricePKR` on each option is the ONE exception: a marked-up,
 * client-safe per-unit price sourced from getPublicUnitPricesPKR() (the
 * sanctioned lib/db/admin.ts boundary, never a direct RawVendorCost read
 * here) — powers the price/delta shown on each brand/model pill. `sector`
 * affects margin, so it's optional (defaults to Residential) rather than
 * required — this is a display nicety, not the authoritative price (the
 * live SOLAR_PREVIEW total is), so a missing/invalid sector degrading to
 * a default is fine.
 */
export async function GET(req: NextRequest) {
  try {
    const sectorParam = req.nextUrl.searchParams.get("sector");
    const sector: Sector = VALID_SECTORS.includes(sectorParam as Sector) ? (sectorParam as Sector) : "RESIDENTIAL";

    const [options, unitPrices] = await Promise.all([
      prisma.equipmentOption.findMany({
        where: { isActive: true },
        orderBy: [{ componentType: "asc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          componentType: true,
          code: true,
          label: true,
          brand: true,
          specValue: true,
          applicableServiceType: true,
          isOtherOption: true,
          // Google Drive brand-logo URL (see EquipmentOption.logoUrl's doc
          // comment) — client-safe, cost-free media, same reasoning as
          // everything else this route already exposes. Powers the Custom
          // Equipment Builder's visual brand cards.
          logoUrl: true,
        },
      }),
      getPublicUnitPricesPKR(sector),
    ]);

    const serialized = options.map((o) => ({
      ...o,
      specValue: o.specValue !== null ? o.specValue.toNumber() : null,
      // null for "Other / Specific Requirement" (no real catalog item to
      // price) or the rare data-entry gap — see getPublicUnitPricesPKR's
      // doc comment. Never a fabricated number.
      unitPricePKR: unitPrices[o.code] ?? null,
    }));

    // Group by componentType so the frontend doesn't have to.
    const grouped: Record<string, typeof serialized> = {};
    for (const option of serialized) {
      (grouped[option.componentType] ??= []).push(option);
    }

    return NextResponse.json({ options: grouped });
  } catch (err) {
    console.error("[GET /api/equipment-options]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
