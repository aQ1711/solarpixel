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
 * one: code that only ever calls `getDb()` from this file cannot even
 * type-check a call to `db.rawVendorCost...`, let alone execute one.
 * The admin-only path is lib/db/admin.ts.
 */
type PublicSafeClient = Omit<PrismaClient, "rawVendorCost" | "marginRule">;

declare global {
  var __solarPixelPublicPrisma: PrismaClient | undefined;
}

function createPublicClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/**
 * Resolves the PUBLIC Prisma client for the CURRENT request.
 *
 * `prisma` used to be a plain module-level singleton, created once at
 * import time from `process.env.DATABASE_URL` and reused across warm
 * invocations — that still happens below, unchanged, for Netlify/
 * localhost. It stopped being enough once Cloudflare (2026-08-25,
 * production leg of the localhost -> Netlify staging -> Cloudflare
 * production pipeline) entered the picture: Cloudflare Hyperdrive
 * bindings (this app's two DB roles each get their own — see
 * wrangler.jsonc's HYPERDRIVE_PUBLIC/HYPERDRIVE_ADMIN) are only
 * reachable from INSIDE a request's execution context via
 * `getCloudflareContext()`, never at module load time the old
 * singleton relied on — there is no request yet when a Worker's
 * top-level module code first runs. Every one of this function's ~23
 * call sites (grep for `getDb()` — all of them already inside an async
 * route handler or Server Component) was updated together with this
 * file, per official OpenNext/Prisma guidance for exactly this
 * combination (a fresh client per request on Cloudflare, `maxUses: 1`
 * so a connection is never reused across requests — see
 * https://opennext.js.org/cloudflare/howtos/db).
 *
 * `@opennextjs/cloudflare` is a real `dependencies` entry (not
 * devDependencies) specifically so this dynamic import always resolves
 * in every build, including Netlify's — it's simply never USED there,
 * since `getCloudflareContext()` throws (caught below) when no
 * Cloudflare Worker request context exists, which is every non-
 * Cloudflare environment.
 */
export async function getDb(): Promise<PublicSafeClient> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    // A minimal LOCAL shape for the one binding this file actually
    // touches, deliberately NOT relying on the globally-ambient
    // `CloudflareEnv` interface `wrangler types` generates into
    // cloudflare-env.d.ts — that file bundles the entire Cloudflare
    // Workers runtime type library (15,000+ lines) and, being a
    // project-root .d.ts, was silently redefining global Web API types
    // (Response, fetch, ...) more strictly for the WHOLE app, breaking
    // `res.json()` type inference project-wide the moment it existed.
    // Excluded from tsconfig.json entirely (see its own comment there)
    // — this narrow local cast is the tradeoff for that, and the only
    // thing lost is autocomplete on binding names, not runtime safety.
    const hyperdrivePublic = (env as { HYPERDRIVE_PUBLIC?: { connectionString: string } }).HYPERDRIVE_PUBLIC;
    if (hyperdrivePublic) {
      const adapter = new PrismaPg({ connectionString: hyperdrivePublic.connectionString, maxUses: 1 });
      return new PrismaClient({ adapter }) as PublicSafeClient;
    }
  } catch {
    // Not running on Cloudflare (no Worker request context available) —
    // fall through to the standard env-var-based singleton below. This
    // is the expected, normal path on Netlify and localhost, not an
    // error condition.
  }

  // Reuse a single client across Next.js dev-mode hot reloads / warm
  // lambda invocations instead of exhausting the connection pool on
  // every request — unchanged Netlify/localhost behavior.
  if (!globalThis.__solarPixelPublicPrisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. This must be an app_public_role connection string. See .env.example.");
    }
    globalThis.__solarPixelPublicPrisma = createPublicClient(connectionString);
  }
  return globalThis.__solarPixelPublicPrisma as PublicSafeClient;
}
