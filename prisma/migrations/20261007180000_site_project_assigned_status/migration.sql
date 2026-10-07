-- Admin-created projects: a project now exists before the labour head has
-- entered any materials. Enum values are added in their own migration because
-- Postgres can't USE a newly added enum value in the same transaction.

-- AlterEnum
ALTER TYPE "public"."SiteProjectStatus" ADD VALUE 'ASSIGNED' BEFORE 'SUBMITTED';

-- AlterEnum
ALTER TYPE "public"."SiteProjectEventType" ADD VALUE 'CREATED' BEFORE 'SUBMITTED';
