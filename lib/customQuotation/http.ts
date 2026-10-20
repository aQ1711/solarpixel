import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { assertAdminModuleAccess, InternalAuthError, type AdminIdentity } from "@/lib/auth/internal-guard";
import { CustomQuotationError } from "@/lib/customQuotation/server";

/** Requires the QUOTES permission (the Super Admin always has it). */
export async function requireQuotesAccess(req: NextRequest): Promise<{ identity: AdminIdentity } | { denied: NextResponse }> {
  try {
    return { identity: await assertAdminModuleAccess(req, "QUOTES") };
  } catch (err) {
    if (err instanceof InternalAuthError) return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    throw err;
  }
}

export function quotationErrorResponse(label: string, err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json({ error: err.issues[0]?.message ?? "Please check the form and try again." }, { status: 400 });
  }
  if (err instanceof CustomQuotationError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(`[${label}]`, err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
