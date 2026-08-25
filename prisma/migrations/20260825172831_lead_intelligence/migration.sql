-- CreateEnum
CREATE TYPE "public"."DeviceType" AS ENUM ('MOBILE', 'TABLET', 'DESKTOP', 'BOT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."LeadActivityType" AS ENUM ('QUOTE_GENERATED', 'STATUS_CHANGED', 'QUOTE_APPROVED');

-- AlterTable
ALTER TABLE "public"."leads" ADD COLUMN "ipAddress" TEXT,
ADD COLUMN "userAgent" TEXT,
ADD COLUMN "deviceType" "public"."DeviceType",
ADD COLUMN "browserName" TEXT,
ADD COLUMN "osName" TEXT,
ADD COLUMN "detectedCity" TEXT,
ADD COLUMN "detectedRegion" TEXT,
ADD COLUMN "detectedCountry" TEXT,
ADD COLUMN "detectedCountryCode" TEXT,
ADD COLUMN "detectedLatitude" DOUBLE PRECISION,
ADD COLUMN "detectedLongitude" DOUBLE PRECISION,
ADD COLUMN "referrerUrl" TEXT;

-- CreateTable
CREATE TABLE "public"."lead_activities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "public"."LeadActivityType" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_activities_leadId_createdAt_idx" ON "public"."lead_activities"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
