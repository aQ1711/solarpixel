-- AlterEnum
-- LeadStatus's QUOTED/CONVERTED values are renamed to SURVEY_BOOKED/WON to
-- match the Internal Admin Lead Dashboard's pipeline (see schema.prisma's
-- doc comment on LeadStatus). Confirmed via `SELECT status, count(*) FROM
-- leads GROUP BY status` before writing this migration that every existing
-- row is "NEW" — QUOTED/CONVERTED were never actually written by any app
-- code — so this is a safe enum-recreation, not a data backfill. Postgres
-- has no `ALTER TYPE ... DROP VALUE`, so the standard rename-recreate-swap
-- pattern is used instead of a plain RENAME VALUE (which would leave the
-- old CONTACTED/LOST ordering/labels technically fine but keep QUOTED and
-- CONVERTED around as unwanted leftover labels).
ALTER TYPE "LeadStatus" RENAME TO "LeadStatus_old";
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'SURVEY_BOOKED', 'WON', 'LOST');
ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "leads" ALTER COLUMN "status" TYPE "LeadStatus" USING ("status"::text::"LeadStatus");
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'NEW';
DROP TYPE "LeadStatus_old";

-- AlterTable
-- Cost-free, client-safe snapshots of what was actually quoted — see the
-- doc comment on these two fields in schema.prisma. Nullable: existing
-- quotes predate this column and fall back to a live recompute at read
-- time (see app/api/admin/leads/[leadId]/route.ts).
ALTER TABLE "quotes" ADD COLUMN "resolvedEquipmentSnapshot" JSONB;
ALTER TABLE "quotes" ADD COLUMN "breakdownSnapshot" JSONB;
