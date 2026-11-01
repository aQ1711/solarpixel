-- Money the customer has paid for a site project (admin only).
CREATE TABLE "public"."customer_payments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountPKR" DECIMAL(14,2) NOT NULL,
    "receivedOn" DATE NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_payments_projectId_idx" ON "public"."customer_payments"("projectId");

-- AddForeignKey
ALTER TABLE "public"."customer_payments" ADD CONSTRAINT "customer_payments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."site_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
