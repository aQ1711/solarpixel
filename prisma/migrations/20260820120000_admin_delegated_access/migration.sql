-- AlterEnum
-- New ADMIN role for the delegated internal-tool access model — see
-- Role's doc comment in schema.prisma. Adding a value is safe/additive
-- (unlike the LeadStatus rename migration before this one); no existing
-- row's role changes.
ALTER TYPE "Role" ADD VALUE 'ADMIN';

-- CreateEnum
CREATE TYPE "AdminModule" AS ENUM ('LEADS', 'CHECKER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "accessCodeHash" TEXT;
ALTER TABLE "users" ADD COLUMN "createdByAdminId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_accessCodeHash_key" ON "users"("accessCodeHash");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "admin_module_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" "AdminModule" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT NOT NULL,

    CONSTRAINT "admin_module_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_module_grants_userId_idx" ON "admin_module_grants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_module_grants_userId_module_key" ON "admin_module_grants"("userId", "module");

-- AddForeignKey
ALTER TABLE "admin_module_grants" ADD CONSTRAINT "admin_module_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_module_grants" ADD CONSTRAINT "admin_module_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
