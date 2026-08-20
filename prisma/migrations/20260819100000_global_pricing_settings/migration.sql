-- CreateTable: sector-specific installation rates + EV Charger/Panel
-- Washing add-on rates — a singleton settings row (see
-- GlobalPricingSettings's doc comment in schema.prisma). Lives in
-- vendor_private; app_admin_role already has SELECT/INSERT/UPDATE on
-- every table in this schema via the ALTER DEFAULT PRIVILEGES set in
-- migration 20260815115617_vendor_isolation_lockdown, so no additional
-- GRANT statements are needed here.
CREATE TABLE "vendor_private"."global_pricing_settings" (
    "id" TEXT NOT NULL,
    "installationCostPerWattResidential" DECIMAL(8,2) NOT NULL,
    "installationCostPerWattCommercial" DECIMAL(8,2) NOT NULL,
    "installationCostPerWattIndustrial" DECIMAL(8,2) NOT NULL,
    "evChargerInstallationFee" DECIMAL(12,2) NOT NULL,
    "washingCostPerPanel" DECIMAL(10,2) NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_pricing_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vendor_private"."global_pricing_settings"
  ADD CONSTRAINT "global_pricing_settings_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the one-and-only row. Residential/Commercial/Industrial all start
-- at the same 12 PKR/W the old flat installationCostPerWatt rate used,
-- so this migration doesn't silently change anyone's quote the moment
-- it's applied — the admin can differentiate them afterward from
-- /admin/pricing. evChargerInstallationFee/washingCostPerPanel are new
-- concepts with no prior figure to preserve, so they're seeded with
-- reasonable Pakistani-market placeholder rates for the admin to tune.
INSERT INTO "vendor_private"."global_pricing_settings"
  ("id", "installationCostPerWattResidential", "installationCostPerWattCommercial", "installationCostPerWattIndustrial",
   "evChargerInstallationFee", "washingCostPerPanel", "updatedById", "updatedAt")
SELECT
  'seed_global_pricing_settings',
  12.00, 12.00, 12.00,
  25000.00, 500.00,
  (SELECT "id" FROM "public"."users" WHERE "role" = 'SUPER_ADMIN' AND "isActive" = true ORDER BY "createdAt" ASC LIMIT 1),
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "public"."users" WHERE "role" = 'SUPER_ADMIN' AND "isActive" = true);
