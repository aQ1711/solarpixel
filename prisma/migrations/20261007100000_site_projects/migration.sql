-- CreateEnum
CREATE TYPE "public"."SiteProjectStatus" AS ENUM ('SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."SiteProjectEventType" AS ENUM ('SUBMITTED', 'REVISION_REQUESTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'STARTED', 'COMPLETED', 'PAID');

-- CreateTable
CREATE TABLE "public"."site_projects" (
    "id" TEXT NOT NULL,
    "projectNumber" TEXT NOT NULL,
    "quoteId" TEXT,
    "labourHeadId" TEXT NOT NULL,
    "status" "public"."SiteProjectStatus" NOT NULL DEFAULT 'SUBMITTED',
    "clientName" TEXT NOT NULL,
    "siteAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "systemSizeKw" DECIMAL(8,3),
    "plannedStartDate" DATE,
    "crewSize" INTEGER,
    "estimatedDays" INTEGER,
    "scopeNotes" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "labourFeePKR" DECIMAL(12,2),
    "approvedMaterialsTotalPKR" DECIMAL(14,2),
    "payoutPKR" DECIMAL(14,2),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completionNotes" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."site_project_materials" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "proposedUnitPricePKR" DECIMAL(12,2) NOT NULL,
    "approvedQuantity" DECIMAL(10,2),
    "approvedUnitPricePKR" DECIMAL(12,2),

    CONSTRAINT "site_project_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."site_project_events" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "public"."SiteProjectEventType" NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_project_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_projects_projectNumber_key" ON "public"."site_projects"("projectNumber");

-- CreateIndex
CREATE INDEX "site_projects_labourHeadId_idx" ON "public"."site_projects"("labourHeadId");

-- CreateIndex
CREATE INDEX "site_projects_status_idx" ON "public"."site_projects"("status");

-- CreateIndex
CREATE INDEX "site_projects_quoteId_idx" ON "public"."site_projects"("quoteId");

-- CreateIndex
CREATE INDEX "site_project_materials_projectId_idx" ON "public"."site_project_materials"("projectId");

-- CreateIndex
CREATE INDEX "site_project_events_projectId_createdAt_idx" ON "public"."site_project_events"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."site_projects" ADD CONSTRAINT "site_projects_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "public"."quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."site_projects" ADD CONSTRAINT "site_projects_labourHeadId_fkey" FOREIGN KEY ("labourHeadId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."site_project_materials" ADD CONSTRAINT "site_project_materials_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."site_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."site_project_events" ADD CONSTRAINT "site_project_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."site_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
