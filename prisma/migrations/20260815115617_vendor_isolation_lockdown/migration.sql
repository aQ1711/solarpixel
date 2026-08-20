-- ============================================================================
-- Solar Pixel — Vendor Cost Isolation & Access Lockdown
-- ============================================================================
-- Business Rule #2: raw vendor costs / margins must be UNREACHABLE by the
-- client-facing app, at the database level — not just hidden in the UI.
--
-- Runs AFTER the baseline migration (…_init) that creates the "public"
-- and "vendor_private" schemas and all tables via Prisma. This migration
-- owns security policy only — roles + GRANT/REVOKE — never schema DDL,
-- since Prisma Migrate doesn't model roles/grants itself and would flag
-- them as drift if mixed into a schema-generated migration.
--
-- ROLES CREATED
--   app_admin_role  — used ONLY by the secure Checker/Calculation Admin
--                      API (lib/db/admin.ts). Read/write on public AND
--                      vendor_private.
--   app_public_role — used by the default Next.js app (CLIENT +
--                      FIELD_ENGINEER facing routes, lib/db/client.ts).
--                      Read/write on public. ZERO privileges — not even
--                      USAGE — on vendor_private.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROLES (idempotent — safe to re-run against a cluster where they exist)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin_role') THEN
    CREATE ROLE app_admin_role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_public_role') THEN
    CREATE ROLE app_public_role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Passwords are intentionally NOT set here — never commit credentials to
-- version control. Set them once, out-of-band, from your secrets manager
-- (in local dev with `trust` auth, this step can be skipped entirely):
--   ALTER ROLE app_admin_role  WITH PASSWORD '<from-secrets-manager>';
--   ALTER ROLE app_public_role WITH PASSWORD '<from-secrets-manager>';

-- ----------------------------------------------------------------------------
-- 2. LOCKDOWN — deny-by-default, then explicitly allow
-- ----------------------------------------------------------------------------

-- 2a. Strip the implicit PUBLIC pseudo-role grant Postgres adds by default,
--     and defensively strip app_public_role even though it was never
--     granted anything here — self-documenting + safe against future drift.
REVOKE ALL ON SCHEMA "vendor_private" FROM PUBLIC;
REVOKE ALL ON SCHEMA "vendor_private" FROM "app_public_role";
REVOKE ALL ON ALL TABLES IN SCHEMA "vendor_private" FROM "app_public_role";

-- 2b. app_public_role: full working access to public schema ONLY.
--     No sequence grants needed — Prisma's cuid() ids are app-generated,
--     not DB sequences.
GRANT USAGE ON SCHEMA "public" TO "app_public_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "app_public_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "app_public_role";

-- 2c. app_admin_role: read/write on public (approve quotes, dispatch
--     contracts, etc.) PLUS read/write on vendor_private. No DELETE on
--     vendor_private — cost/margin history is retired via isActive /
--     effectiveTo, never hard-deleted.
GRANT USAGE ON SCHEMA "public" TO "app_admin_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "app_admin_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "app_admin_role";

GRANT USAGE ON SCHEMA "vendor_private" TO "app_admin_role";
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA "vendor_private" TO "app_admin_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA "vendor_private"
  GRANT SELECT, INSERT, UPDATE ON TABLES TO "app_admin_role";

-- ----------------------------------------------------------------------------
-- Verification (run manually after apply, not part of the migration):
--   SET ROLE app_public_role;
--   SELECT * FROM vendor_private.raw_vendor_costs;
--   -- ERROR: permission denied for schema vendor_private
--   RESET ROLE;
-- ----------------------------------------------------------------------------
