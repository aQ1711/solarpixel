-- Inventory guardrail: EquipmentOption.inStock, distinct from isActive
-- (discontinued vs. temporarily unavailable) -- see its doc comment in
-- schema.prisma. Defaults true so every already-seeded row stays exactly
-- as buyable as before this column existed.
ALTER TABLE "equipment_options" ADD COLUMN "inStock" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "equipment_options_componentType_inStock_idx" ON "equipment_options"("componentType", "inStock");
