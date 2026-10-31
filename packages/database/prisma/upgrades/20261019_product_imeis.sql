-- Additive upgrade: preserve all existing products and relationships.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imei1" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imei2" TEXT;
