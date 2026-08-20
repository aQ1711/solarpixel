-- AlterTable: Google Drive media links + dynamic comparison specs for
-- the /admin/pricing catalog.
ALTER TABLE "equipment_options" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "equipment_options" ADD COLUMN "brochureUrl" TEXT;
ALTER TABLE "equipment_options" ADD COLUMN "specs" JSONB;
