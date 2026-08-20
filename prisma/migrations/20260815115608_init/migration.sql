-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "vendor_private";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'FIELD_ENGINEER', 'CLIENT');

-- CreateEnum
CREATE TYPE "Sector" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'WHATSAPP', 'FACEBOOK_ADS', 'GOOGLE_ADS', 'REFERRAL', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('AUTOMATED_ESTIMATE', 'SURVEY_SCHEDULED', 'MAKER_SUBMITTED', 'CHECKER_APPROVED', 'REVISION_REQUESTED', 'DISPATCHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RoofType" AS ENUM ('RCC_CONCRETE', 'CORRUGATED_METALLIC', 'GROUND_MOUNT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('QUOTE_MAKER_SUBMITTED', 'QUOTE_CHECKER_APPROVED', 'QUOTE_REVISION_REQUESTED', 'QUOTE_REJECTED', 'QUOTE_DISPATCHED');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('SOLAR_PANEL', 'INVERTER', 'DC_CABLE', 'AC_CABLE', 'MOUNTING_STRUCTURE', 'DB_UPGRADE', 'CT_COIL', 'EARTHING', 'LABOR', 'TRANSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "vendor_private"."CostUnit" AS ENUM ('PER_WATT', 'PER_METER', 'PER_UNIT', 'PER_PIECE', 'LUMP_SUM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "sector" "Sector" NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'WEBSITE',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "monthlyBillRs" DECIMAL(12,2) NOT NULL,
    "clientUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sector" "Sector" NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'AUTOMATED_ESTIMATE',
    "monthlyBillRs" DECIMAL(12,2) NOT NULL,
    "blendedTariffRsPerUnit" DECIMAL(8,2) NOT NULL,
    "estimatedDaytimeLoadKw" DECIMAL(8,3) NOT NULL,
    "estimatedSystemSizeKw" DECIMAL(8,3) NOT NULL,
    "automatedEstimatePriceRs" DECIMAL(14,2) NOT NULL,
    "finalSystemSizeKw" DECIMAL(8,3),
    "makerSubmittedAt" TIMESTAMP(3),
    "makerSubmittedById" TEXT,
    "finalPriceRs" DECIMAL(14,2),
    "checkerApprovedAt" TIMESTAMP(3),
    "checkerApprovedById" TEXT,
    "revisionNotes" TEXT,
    "rejectionReason" TEXT,
    "contractPdfUrl" TEXT,
    "whatsappDispatchedAt" TIMESTAMP(3),
    "whatsappMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_surveys" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "engineerId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "dcCableMeters" DECIMAL(8,2) NOT NULL,
    "dcCableSpec" TEXT,
    "acCableMeters" DECIMAL(8,2) NOT NULL,
    "acCableSpec" TEXT,
    "dataCableMeters" DECIMAL(8,2) NOT NULL,
    "roofType" "RoofType" NOT NULL,
    "structureChoice" TEXT NOT NULL,
    "roofAreaSqft" DECIMAL(10,2),
    "tiltAngleDegrees" DECIMAL(5,2),
    "shadingIssues" BOOLEAN NOT NULL DEFAULT false,
    "shadingNotes" TEXT,
    "dbUpgradeRequired" BOOLEAN NOT NULL DEFAULT false,
    "dbUpgradeDetails" TEXT,
    "ctCoilRating" TEXT,
    "ctCoilQty" INTEGER,
    "earthingPitsRequired" INTEGER,
    "photos" JSONB,
    "engineerNotes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boq_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "description" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "clientUnitPriceRs" DECIMAL(12,2) NOT NULL,
    "clientLineTotalRs" DECIMAL(14,2) NOT NULL,
    "rawVendorCostId" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "quoteId" TEXT,
    "quoteNumber" TEXT,
    "actorId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_private"."raw_vendor_costs" (
    "id" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "vendorName" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "model" TEXT,
    "unitCostRs" DECIMAL(12,2) NOT NULL,
    "unit" "vendor_private"."CostUnit" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_vendor_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_private"."margin_rules" (
    "id" TEXT NOT NULL,
    "sector" "Sector" NOT NULL,
    "componentType" "ComponentType",
    "minMarginPercent" DECIMAL(5,2) NOT NULL,
    "targetMarginPercent" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_sector_idx" ON "leads"("sector");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quoteNumber_key" ON "quotes"("quoteNumber");

-- CreateIndex
CREATE INDEX "quotes_leadId_idx" ON "quotes"("leadId");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_sector_idx" ON "quotes"("sector");

-- CreateIndex
CREATE UNIQUE INDEX "site_surveys_quoteId_key" ON "site_surveys"("quoteId");

-- CreateIndex
CREATE INDEX "site_surveys_engineerId_idx" ON "site_surveys"("engineerId");

-- CreateIndex
CREATE INDEX "boq_items_quoteId_idx" ON "boq_items"("quoteId");

-- CreateIndex
CREATE INDEX "boq_items_componentType_idx" ON "boq_items"("componentType");

-- CreateIndex
CREATE INDEX "audit_logs_quoteId_idx" ON "audit_logs"("quoteId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "raw_vendor_costs_componentType_idx" ON "vendor_private"."raw_vendor_costs"("componentType");

-- CreateIndex
CREATE INDEX "raw_vendor_costs_isActive_idx" ON "vendor_private"."raw_vendor_costs"("isActive");

-- CreateIndex
CREATE INDEX "margin_rules_sector_idx" ON "vendor_private"."margin_rules"("sector");

-- CreateIndex
CREATE INDEX "margin_rules_isActive_idx" ON "vendor_private"."margin_rules"("isActive");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_makerSubmittedById_fkey" FOREIGN KEY ("makerSubmittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_checkerApprovedById_fkey" FOREIGN KEY ("checkerApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_rawVendorCostId_fkey" FOREIGN KEY ("rawVendorCostId") REFERENCES "vendor_private"."raw_vendor_costs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_private"."raw_vendor_costs" ADD CONSTRAINT "raw_vendor_costs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_private"."margin_rules" ADD CONSTRAINT "margin_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
