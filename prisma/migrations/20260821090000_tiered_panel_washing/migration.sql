-- Tiered "One-Time Visit" Panel Washing pricing -- replaces the single
-- flat washingCostPerPanel with 4 volume brackets + a minimum call-out
-- fee. DEFAULT values below are the brief's exact spec (Rs 200/150/125/
-- 100 per panel, Rs 2,000 minimum) and match
-- lib/db/admin.ts's FALLBACK_GLOBAL_PRICING_SETTINGS -- see its doc
-- comment on why a fallback default exists at all.
ALTER TABLE "vendor_private"."global_pricing_settings" DROP COLUMN "washingCostPerPanel";
ALTER TABLE "vendor_private"."global_pricing_settings" ADD COLUMN "washingRateTier1PerPanel" DECIMAL(10,2) NOT NULL DEFAULT 200;
ALTER TABLE "vendor_private"."global_pricing_settings" ADD COLUMN "washingRateTier2PerPanel" DECIMAL(10,2) NOT NULL DEFAULT 150;
ALTER TABLE "vendor_private"."global_pricing_settings" ADD COLUMN "washingRateTier3PerPanel" DECIMAL(10,2) NOT NULL DEFAULT 125;
ALTER TABLE "vendor_private"."global_pricing_settings" ADD COLUMN "washingRateTier4PerPanel" DECIMAL(10,2) NOT NULL DEFAULT 100;
ALTER TABLE "vendor_private"."global_pricing_settings" ADD COLUMN "washingMinimumVisitFeePKR" DECIMAL(10,2) NOT NULL DEFAULT 2000;
