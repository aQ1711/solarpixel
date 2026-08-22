-- CreateTable
CREATE TABLE "ticker_settings" (
    "id" TEXT NOT NULL,
    "showSolarPanels" BOOLEAN NOT NULL DEFAULT true,
    "showOnGridInverters" BOOLEAN NOT NULL DEFAULT true,
    "showHybridInverters" BOOLEAN NOT NULL DEFAULT true,
    "showBatteries" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticker_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ticker_settings" ADD CONSTRAINT "ticker_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
