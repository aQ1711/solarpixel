-- New projects start as ASSIGNED (waiting for the labour head's materials),
-- and submittedAt is only set once materials are actually submitted.
ALTER TABLE "public"."site_projects" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';
ALTER TABLE "public"."site_projects" ALTER COLUMN "submittedAt" DROP NOT NULL;
ALTER TABLE "public"."site_projects" ALTER COLUMN "submittedAt" DROP DEFAULT;
