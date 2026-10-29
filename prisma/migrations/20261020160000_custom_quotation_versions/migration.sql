-- Custom quotation versions: every existing quotation becomes version 1.
ALTER TABLE "public"."custom_quotations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "public"."custom_quotations" ADD COLUMN "versionNote" TEXT;

-- The quotation number is now shared by all versions, so it is unique only together with the version.
DROP INDEX "public"."custom_quotations_quotationNumber_key";
CREATE UNIQUE INDEX "custom_quotations_quotationNumber_version_key" ON "public"."custom_quotations"("quotationNumber", "version");
CREATE INDEX "custom_quotations_quotationNumber_idx" ON "public"."custom_quotations"("quotationNumber");
