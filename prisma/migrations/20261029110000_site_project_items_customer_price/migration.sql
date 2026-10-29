-- Quotation lines can point at a catalog item (same name everywhere), and a
-- project carries the customer price the Super Admin sets.
ALTER TABLE "public"."site_project_materials" ADD COLUMN "itemGroup" TEXT;
ALTER TABLE "public"."site_project_materials" ADD COLUMN "itemCode" TEXT;
ALTER TABLE "public"."site_projects" ADD COLUMN "customerPricePKR" DECIMAL(14,2);
