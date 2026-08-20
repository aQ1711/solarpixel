-- AlterTable: Checker-confirmed battery capacity, set at approval time
ALTER TABLE "quotes" ADD COLUMN "finalBatteryCapacityKwh" DECIMAL(8,3);
