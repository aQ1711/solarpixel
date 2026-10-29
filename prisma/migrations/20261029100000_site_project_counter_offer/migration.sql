-- Counter-offer step: the Super Admin can edit the labour head's quotation and
-- send it back; the labour head accepts (prices fixed) or declines. Enum values
-- are added in their own migration because Postgres can't USE a newly added
-- enum value in the same transaction.

-- AlterEnum
ALTER TYPE "public"."SiteProjectStatus" ADD VALUE 'COUNTER_OFFERED' BEFORE 'APPROVED';

-- AlterEnum
ALTER TYPE "public"."SiteProjectEventType" ADD VALUE 'COUNTER_OFFERED' BEFORE 'APPROVED';
ALTER TYPE "public"."SiteProjectEventType" ADD VALUE 'ACCEPTED' BEFORE 'APPROVED';
ALTER TYPE "public"."SiteProjectEventType" ADD VALUE 'DECLINED' BEFORE 'APPROVED';
