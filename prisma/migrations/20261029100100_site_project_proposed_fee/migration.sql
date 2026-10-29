-- The labour head's own service fee, entered with their materials quotation.
ALTER TABLE "public"."site_projects" ADD COLUMN "proposedLabourFeePKR" DECIMAL(12,2) NOT NULL DEFAULT 0;
