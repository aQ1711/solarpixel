-- AlterTable: EquipmentOption gains an admin-editable "default" flag
ALTER TABLE "equipment_options" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "equipment_options_componentType_isDefault_idx" ON "equipment_options"("componentType", "isDefault");

-- AlterTable: RawVendorCost gains a per-item margin override
ALTER TABLE "vendor_private"."raw_vendor_costs" ADD COLUMN "marginPercentOverride" DECIMAL(5,2);

-- Backfill isDefault for the codes lib/db/admin.ts has always hardcoded
-- as the Recommended-path defaults, so /admin/pricing's "Default Switch"
-- reflects reality from the moment this migration lands, before anyone
-- has touched the new admin page.
UPDATE "equipment_options" SET "isDefault" = true WHERE "componentType" = 'SOLAR_PANEL' AND "code" = 'LONGI_TOPCON_610W';
UPDATE "equipment_options" SET "isDefault" = true WHERE "componentType" = 'INVERTER' AND "code" IN ('HUAWEI_HYBRID', 'HUAWEI_ONGRID');
UPDATE "equipment_options" SET "isDefault" = true WHERE "componentType" = 'BATTERY' AND "code" = 'PYLONTECH_LITHIUM';
UPDATE "equipment_options" SET "isDefault" = true WHERE "componentType" = 'DC_CABLE' AND "code" = 'PAKISTAN_CABLES';
UPDATE "equipment_options" SET "isDefault" = true WHERE "componentType" = 'BREAKERS' AND "code" = 'SCHNEIDER_DB_BOX';
UPDATE "equipment_options" SET "isDefault" = true WHERE "componentType" = 'MOUNTING_STRUCTURE' AND "code" = 'STANDARD_L1_L2';
