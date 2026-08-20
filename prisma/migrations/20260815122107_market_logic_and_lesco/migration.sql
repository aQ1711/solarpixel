/*
  Warnings:

  - Added the required column `serviceType` to the `quotes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('HYBRID_BATTERY', 'ONGRID_ZERO_EXPORT');

-- AlterEnum
ALTER TYPE "ComponentType" ADD VALUE 'BATTERY';

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "lescoReferenceNumber" TEXT,
ADD COLUMN     "lescoVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceType" "ServiceType" NOT NULL;
