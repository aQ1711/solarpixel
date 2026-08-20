-- "Site Works" add-on rates (civil blocks / earthing & boring / lightning
-- arrestor) on the GlobalPricingSettings singleton — see its doc comment
-- in schema.prisma. DEFAULT values below are a one-time backfill for any
-- row that already exists (this table has exactly one row in practice)
-- and match lib/db/admin.ts's FALLBACK_GLOBAL_PRICING_SETTINGS exactly,
-- same "never break pricing from an empty/pre-migration row" convention
-- as every other GlobalPricingSettings field — the Super Admin is
-- expected to set real rates via /admin/pricing immediately.
ALTER TABLE "vendor_private"."global_pricing_settings" ADD COLUMN "civilWorkCostPerBlock" DECIMAL(10,2) NOT NULL DEFAULT 3000;
ALTER TABLE "vendor_private"."global_pricing_settings" ADD COLUMN "earthingCostPerBore" DECIMAL(10,2) NOT NULL DEFAULT 5000;
ALTER TABLE "vendor_private"."global_pricing_settings" ADD COLUMN "lightningArrestorCostPerUnit" DECIMAL(10,2) NOT NULL DEFAULT 8000;
