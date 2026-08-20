-- Dual customization paths (Recommended vs Custom Equipment Builder) and
-- dynamic per-watt structure/installation pricing. See EquipmentOption's
-- doc comment in schema.prisma for the public-catalog / confidential-cost
-- split this introduces.

-- AlterEnum
ALTER TYPE "ComponentType" ADD VALUE 'BREAKERS';

-- AlterEnum
ALTER TYPE "vendor_private"."CostUnit" ADD VALUE 'PER_KWH';

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "equipmentSelections" JSONB;

-- CreateTable
CREATE TABLE "equipment_options" (
    "id" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "brand" TEXT,
    "specValue" DECIMAL(10,2),
    "applicableServiceType" "ServiceType",
    "isOtherOption" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_options_componentType_isActive_idx" ON "equipment_options"("componentType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_options_componentType_code_key" ON "equipment_options"("componentType", "code");
