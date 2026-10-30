import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { assertMakerAccess, assertSuperAdminAccess, InternalAuthError } from "@/lib/auth/internal-guard";
import { SiteProjectError } from "@/lib/siteProjects/server";

/** Returns a 401 response if the caller lacks access, else null.
 *  MAKER = the labour-head side (shared maker token, or the Super Admin's
 *  own); SUPER_ADMIN = review/payout, never delegable to an Admin. */
export function denyUnlessAllowed(req: NextRequest, kind: "MAKER" | "SUPER_ADMIN"): NextResponse | null {
  try {
    if (kind === "MAKER") assertMakerAccess(req);
    else assertSuperAdminAccess(req);
    return null;
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
}

/** Maps expected failures (bad input, business-rule conflicts) to clean
 *  responses and everything else to a generic 500. */
export function siteProjectErrorResponse(label: string, err: unknown): NextResponse {
  if (err instanceof ZodError) {
    const first = err.issues[0]?.message ?? "Please check the form and try again.";
    return NextResponse.json({ error: first, details: err.flatten().fieldErrors }, { status: 400 });
  }
  if (err instanceof SiteProjectError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(`[${label}]`, err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

/** Parses a JSON body, tolerating an empty/invalid one as `{}` so zod
 *  reports the missing fields rather than a raw SyntaxError. */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
