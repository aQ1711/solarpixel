-- Replaces the LESCO-scraping-specific fields with a generic BillSource
-- provenance enum. Automated LESCO scraping was tried and abandoned — the
-- real portal gates bill data behind a CAPTCHA — in favor of the customer
-- uploading their own bill (PDF/photo), which app/api/bill-upload parses.
-- See BillSource's doc comment in schema.prisma.

-- CreateEnum
CREATE TYPE "BillSource" AS ENUM ('MANUAL', 'UPLOADED_PDF', 'UPLOADED_IMAGE');

-- AlterTable
ALTER TABLE "quotes" DROP COLUMN "lescoReferenceNumber",
DROP COLUMN "lescoVerified",
ADD COLUMN     "billSource" "BillSource" NOT NULL DEFAULT 'MANUAL';
