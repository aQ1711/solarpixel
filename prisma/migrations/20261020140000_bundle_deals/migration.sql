-- CreateTable
CREATE TABLE "vendor_private"."bundle_deals" (
    "id" TEXT NOT NULL,
    "inverterCode" TEXT NOT NULL,
    "batteryCode" TEXT NOT NULL,
    "comboCostRs" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundle_deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bundle_deals_inverterCode_batteryCode_key" ON "vendor_private"."bundle_deals"("inverterCode", "batteryCode");
