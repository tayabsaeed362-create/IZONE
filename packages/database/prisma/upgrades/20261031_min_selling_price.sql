-- Additive upgrade: Add threshold / minimum selling price
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "minSellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "minSellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
