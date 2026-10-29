-- CreateTable
CREATE TABLE "public"."custom_quotations" (
    "id" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerCity" TEXT NOT NULL,
    "customerAddress" TEXT,
    "sector" "public"."Sector" NOT NULL,
    "notes" TEXT,
    "totalPKR" DECIMAL(14,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."custom_quotation_items" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "componentType" "public"."ComponentType" NOT NULL,
    "itemCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "brand" TEXT,
    "unitLabel" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPricePKR" DECIMAL(14,2) NOT NULL,
    "lineTotalPKR" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "custom_quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_quotations_quotationNumber_key" ON "public"."custom_quotations"("quotationNumber");
CREATE INDEX "custom_quotations_createdById_idx" ON "public"."custom_quotations"("createdById");
CREATE INDEX "custom_quotations_createdAt_idx" ON "public"."custom_quotations"("createdAt");
CREATE INDEX "custom_quotation_items_quotationId_idx" ON "public"."custom_quotation_items"("quotationId");

-- AddForeignKey
ALTER TABLE "public"."custom_quotations" ADD CONSTRAINT "custom_quotations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."custom_quotation_items" ADD CONSTRAINT "custom_quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "public"."custom_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
