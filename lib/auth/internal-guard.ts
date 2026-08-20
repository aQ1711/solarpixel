import "server-only";
import type { NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";

/**
 * ⚠️ TEMPORARY, INTERIM GUARD — NOT REAL AUTHENTICATION.
 *
 * There is no session/login system in this codebase yet (no NextAuth/
 * Clerk, no signed-in `User` with a real password check). Every internal
 * tool is protected by a bearer token sent as `x-internal-token`:
 *
 *   - Field Engineer (`/maker/*`): ONE shared secret, MAKER_ACCESS_TOKEN.
 *     Unchanged by the 2026-08-20 update below — anyone holding it can
 *     act as any Field Engineer.
 *   - Super Admin (`/admin/pricing/*`, and full access to `/admin/leads`
 *     + `/admin/checker`): ONE shared secret, ADMIN_ACCESS_TOKEN — there
 *     is exactly one Super Admin in practice, so a shared secret for them
 *     specifically is a deliberate, still-simple choice, not an oversight.
 *   - ADMIN (delegated access to `/admin/leads` and/or `/admin/checker`
 *     only, never `/admin/pricing`): a PER-USER access code, added
 *     2026-08-20 — see assertAdminModuleAccess() below. This is real
 *     multi-user delegation (each Admin's code is independently issued,
 *     rotated, and revoked), but it is still just "prove you hold this
 *     token" — not a signed session, no password, no MFA.
 *
 * Replace all of this with real session-based auth (verify a signed
 * session, then check `session.user.role` / `session.user`'s granted
 * modules from the DB) before any of this is anywhere near a real
 * deployment. Track this as its own task.
 */

export class InternalAuthError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

/** Client-side "which stored code applies here" grouping — used only by
 *  components/internal/AccessGate.tsx and lib/internal/access.ts to key
 *  sessionStorage, NOT a server-side authorization check (those are the
 *  assert*() functions below). "ADMIN" covers /admin/leads, /admin/checker,
 *  and /admin/pricing alike: whoever's logging in — the Super Admin or a
 *  delegated Admin — only ever has ONE code to type, and the SERVER (not
 *  this client-side key) decides which specific module(s) that code
 *  actually unlocks. A delegated Admin typing their code on a page they
 *  don't have a grant for still gets bounced by the first failed API call
 *  (see AccessGate's onUnauthorized), exactly like an invalid code today. */
export type InternalRole = "MAKER" | "ADMIN";

// ============================================================================
// Field Engineer — unchanged shared secret.
// ============================================================================

export function assertMakerAccess(req: NextRequest): void {
  const expected = process.env.MAKER_ACCESS_TOKEN;
  const provided = req.headers.get("x-internal-token");
  // Fail closed: an unconfigured token must never mean "open access".
  if (!expected || !provided || provided !== expected) throw new InternalAuthError();
}

// ============================================================================
// Super Admin — unchanged shared secret. Grants access to EVERY admin
// module unconditionally, including /admin/pricing, which no ADMIN-role
// user's grants can ever reach (see AdminModule's doc comment in
// schema.prisma).
// ============================================================================

function isSuperAdminSecret(provided: string | null): boolean {
  const expected = process.env.ADMIN_ACCESS_TOKEN;
  return Boolean(expected) && provided !== null && provided === expected;
}

/** Use for routes that must NEVER be delegable to an ADMIN user, however
 *  they're granted — currently only /api/admin/pricing/* and the
 *  Admin-management routes themselves (/api/admin/team/*, since only the
 *  Super Admin may create/modify other admins' access). */
export function assertSuperAdminAccess(req: NextRequest): void {
  if (!isSuperAdminSecret(req.headers.get("x-internal-token"))) throw new InternalAuthError();
}

// ============================================================================
// ADMIN — per-user access codes + per-module grants (2026-08-20).
// ============================================================================

export type AdminModule = "LEADS" | "CHECKER";

export interface AdminIdentity {
  kind: "SUPER_ADMIN" | "ADMIN";
  /** Null for the Super Admin — their auth never resolves to (or needs)
   *  a per-request User row lookup, see the module doc comment above. */
  userId: string | null;
  name: string;
}

/** SHA-256 hex digest — codes are looked up by this hash
 *  (`User.accessCodeHash`), never stored or compared in plaintext. A
 *  plain fast hash (not bcrypt/argon2) is deliberate here: this is an
 *  opaque, high-entropy, randomly-GENERATED bearer token (like an API
 *  key), not a human-chosen low-entropy password — there's no offline
 *  brute-force risk a slow hash would meaningfully mitigate, and a fast
 *  hash lets a valid code be looked up with one indexed `findUnique`
 *  instead of hashing-and-comparing against every ADMIN row. */
export function hashAccessCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

/** 32 hex chars — same shape as the existing MAKER_ACCESS_TOKEN/
 *  ADMIN_ACCESS_TOKEN env-var secrets, so all three "kinds" of internal
 *  credential look identical to whoever's handling them. */
export function generateAccessCode(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Authorizes a request against ONE specific admin module (Leads or
 * Checker). Passes if the request carries EITHER the Super Admin's
 * shared secret (always — Super Admin reaches everything) OR a valid,
 * active ADMIN user's access code that has actually been granted this
 * module. Throws InternalAuthError otherwise — including for a
 * genuinely valid Admin code that just isn't granted THIS module, which
 * deliberately looks identical to an invalid code from the caller's
 * perspective (no information about which modules exist/are granted
 * leaks to a request that fails auth).
 */
export async function assertAdminModuleAccess(req: NextRequest, module: AdminModule): Promise<AdminIdentity> {
  const provided = req.headers.get("x-internal-token");
  if (!provided) throw new InternalAuthError();

  if (isSuperAdminSecret(provided)) {
    return { kind: "SUPER_ADMIN", userId: null, name: "Super Admin" };
  }

  const user = await prisma.user.findUnique({
    where: { accessCodeHash: hashAccessCode(provided) },
    select: { id: true, name: true, role: true, isActive: true, adminModuleGrants: { select: { module: true } } },
  });
  if (!user || !user.isActive || user.role !== "ADMIN") throw new InternalAuthError();
  if (!user.adminModuleGrants.some((g) => g.module === module)) throw new InternalAuthError();

  return { kind: "ADMIN", userId: user.id, name: user.name };
}

// ============================================================================
// Super Admin attribution — for /api/admin/team's admin-management writes.
// ============================================================================

export class NoSuperAdminConfiguredError extends Error {
  constructor() {
    super("No active SUPER_ADMIN user exists in the database — run prisma/seed.ts (or seed one manually) first.");
  }
}

/**
 * Resolves the real seeded SUPER_ADMIN `User` row used to attribute
 * admin-management actions (creating an Admin, granting/revoking a
 * module — `User.createdByAdminId`, `AdminModuleGrant.grantedById`).
 * Needed because Super Admin login itself never touches the User table
 * (see Role's doc comment in schema.prisma) — this is ONLY for giving
 * those FK columns a real target, not for authorizing anything. Callers
 * must already have passed `assertSuperAdminAccess()` before reaching
 * this. Throws `NoSuperAdminConfiguredError` on a fresh/unseeded
 * database — callers should surface that as a clear 503, not a raw 500.
 */
export async function getSuperAdminActorId(): Promise<string> {
  const superAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!superAdmin) throw new NoSuperAdminConfiguredError();
  return superAdmin.id;
}
