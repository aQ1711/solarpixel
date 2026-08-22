import { NextRequest, NextResponse } from "next/server";
import { resolveAdminIdentity, InternalAuthError } from "@/lib/auth/internal-guard";

/**
 * GET /api/admin/whoami — identity + module grants for whoever's token
 * is currently stored, used ONLY by app/admin/layout.tsx's unified shell
 * (AdminSidebar's link filtering + the client-side route guard). Not a
 * data route — returns no business data, just who you are, so every
 * /admin/* page's own API calls remain the REAL per-module authorization
 * boundary (this route existing doesn't change what any other route
 * allows). Same interim shared-secret/access-code auth as everything
 * else under /admin — see lib/auth/internal-guard.ts's top doc comment
 * for why this isn't real session-based auth.
 */
export async function GET(req: NextRequest) {
  try {
    const viewer = await resolveAdminIdentity(req);
    return NextResponse.json({ viewer });
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
}
