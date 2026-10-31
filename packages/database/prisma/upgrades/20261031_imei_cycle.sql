-- Additive upgrade: Add imeiCycle and indexes for IMEI tracking
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imeiCycle" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS "products_imei1_idx" ON "products"("imei1");
CREATE INDEX IF NOT EXISTS "products_imei2_idx" ON "products"("imei2");
