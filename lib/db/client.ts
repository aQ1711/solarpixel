import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * The PUBLIC Prisma client — connects as `app_public_role`.
 *
 * Per prisma/migrations/20260815120000_vendor_isolation_lockdown, this
 * role has ZERO grants (not even USAGE) on the `vendor_private` schema.
 * This is the client every ordinary route (Client + Field Engineer
 * facing) should import.
 *
 * `rawVendorCost` and `marginRule` are stripped from the exported type
 * below as a compile-time guardrail on top of the runtime DB-permission
 * one: code that only ever imports `prisma` from this file cannot even
 * type-check a call to `prisma.rawVendorCost...`, let alone execute one.
 * The admin-only path is lib/db/admin.ts.
 */
type PublicSafeClient = Omit<PrismaClient, "rawVendorCost" | "marginRule">;

declare global {
  var __solarPixelPublicPrisma: PrismaClient | undefined;
}

function createPublicClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. This must be an app_public_role connection string — see .env.example."
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Reuse a single client across Next.js dev-mode hot reloads / warm lambda
// invocations instead of exhausting the connection pool on every request.
const publicPrisma = globalThis.__solarPixelPublicPrisma ?? createPublicClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__solarPixelPublicPrisma = publicPrisma;
}

export const prisma = publicPrisma as PublicSafeClient;
