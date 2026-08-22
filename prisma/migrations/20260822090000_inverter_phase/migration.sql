-- Electrical phase (Single Phase / Three Phase) — meaningful only for
-- componentType=INVERTER, null for every other component. See
-- InverterPhase's doc comment in schema.prisma.
CREATE TYPE "public"."InverterPhase" AS ENUM ('SINGLE_PHASE', 'THREE_PHASE');

ALTER TABLE "public"."equipment_options" ADD COLUMN "phase" "public"."InverterPhase";
