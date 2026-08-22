-- AlterTable
ALTER TABLE "vendor_private"."global_pricing_settings" ALTER COLUMN "civilWorkCostPerBlock" DROP DEFAULT,
ALTER COLUMN "earthingCostPerBore" DROP DEFAULT,
ALTER COLUMN "lightningArrestorCostPerUnit" DROP DEFAULT,
ALTER COLUMN "washingRateTier1PerPanel" DROP DEFAULT,
ALTER COLUMN "washingRateTier2PerPanel" DROP DEFAULT,
ALTER COLUMN "washingRateTier3PerPanel" DROP DEFAULT,
ALTER COLUMN "washingRateTier4PerPanel" DROP DEFAULT,
ALTER COLUMN "washingMinimumVisitFeePKR" DROP DEFAULT;

-- CreateTable
CREATE TABLE "vendor_private"."market_price_snapshots" (
    "id" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "searchBrand" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "itemName" TEXT NOT NULL,
    "priceRs" DECIMAL(12,2) NOT NULL,
    "oldPriceRs" DECIMAL(12,2),
    "sourceUrl" TEXT NOT NULL,
    "sourceSite" TEXT NOT NULL DEFAULT 'w11stop.com',
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_price_snapshots_componentType_fetchedAt_idx" ON "vendor_private"."market_price_snapshots"("componentType", "fetchedAt");

-- CreateIndex
CREATE INDEX "market_price_snapshots_searchBrand_idx" ON "vendor_private"."market_price_snapshots"("searchBrand");
