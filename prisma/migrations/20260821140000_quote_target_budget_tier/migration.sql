-- Persists the Target Budget tier a quote was ACTUALLY priced under at
-- submission time ("UNDER_1M" | "1M_TO_1_5M" | "1_5M_PLUS"), so the
-- Checker's exact-BOQ pricing (calculateAdminBoqPricing) can resolve the
-- SAME equipment defaults the customer was originally quoted with,
-- instead of silently re-adding a battery cost on approval. Nullable
-- (existing rows, and every reader treats null the same as "UNDER_1M" —
-- see Quote.targetBudgetTier's doc comment in schema.prisma). A plain
-- string column, not a Postgres enum, since two of the three real tier
-- values start with a digit.
ALTER TABLE "public"."quotes" ADD COLUMN "targetBudgetTier" TEXT;
