-- AlterTable: Field-Engineer-confirmed battery request, captured on-site
-- and used to pre-fill (not replace) the Checker's editable final capacity.
ALTER TABLE "site_surveys" ADD COLUMN "surveyedBatteryCapacityKwh" DECIMAL(8,3);
