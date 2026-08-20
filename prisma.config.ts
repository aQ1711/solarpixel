import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7+: connection info for `prisma migrate` / `prisma studio` lives
// here, not in schema.prisma.
//
// IMPORTANT — this intentionally reads a DIFFERENT env var
// (MIGRATE_DATABASE_URL, the `solar_pixel_admin` owner role) than the
// app's runtime clients:
//   - lib/db/client.ts reads DATABASE_URL       -> app_public_role
//   - lib/db/admin.ts  reads ADMIN_DATABASE_URL -> app_admin_role
// `prisma migrate` needs full DDL rights (CREATE TABLE, CREATE SCHEMA,
// GRANT, etc.) that neither app role has — see the vendor-cost isolation
// note at the top of prisma/schema.prisma. Reusing DATABASE_URL here
// would silently make the restricted app role the one running
// migrations, which defeats the lockdown.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("MIGRATE_DATABASE_URL"),
  },
});
