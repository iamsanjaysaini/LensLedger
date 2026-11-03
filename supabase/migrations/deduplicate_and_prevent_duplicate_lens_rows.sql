-- Migration: Deduplicate custom_lens_rows and lens_stock, and enforce uniqueness
-- Narbada Eye Care / LensLedger

-- 1. Deduplicate custom_lens_rows (keep only the earliest row for each unique power)
DELETE FROM custom_lens_rows a
USING custom_lens_rows b
WHERE a.id > b.id
  AND a.material = b.material
  AND a.vision = b.vision
  AND (a.sign = b.sign OR (a.sign IS NULL AND b.sign IS NULL))
  AND a.power_type = b.power_type
  AND a.sph = b.sph
  AND a.cyl = b.cyl
  AND (a.addition = b.addition OR (a.addition IS NULL AND b.addition IS NULL))
  AND (a.coatings = b.coatings OR (a.coatings IS NULL AND b.coatings IS NULL));

-- 2. Deduplicate lens_stock (keep the row with latest updated_at or largest id)
DELETE FROM lens_stock a
USING lens_stock b
WHERE a.id < b.id
  AND a.shop_id = b.shop_id
  AND a.material = b.material
  AND a.vision = b.vision
  AND (a.sign = b.sign OR (a.sign IS NULL AND b.sign IS NULL))
  AND a.power_type = b.power_type
  AND a.sph = b.sph
  AND a.cyl = b.cyl
  AND (a.axis = b.axis OR (a.axis IS NULL AND b.axis IS NULL))
  AND (a.addition = b.addition OR (a.addition IS NULL AND b.addition IS NULL))
  AND (a.coatings = b.coatings OR (a.coatings IS NULL AND b.coatings IS NULL));

-- 3. Create unique index on custom_lens_rows with NULLS NOT DISTINCT (Postgres 15+)
-- If your Postgres version is 15+, NULLS NOT DISTINCT treats NULL as equal so duplicate rows with NULL sign/addition are prevented.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_custom_lens_rows_unique'
    ) THEN
        BEGIN
            CREATE UNIQUE INDEX idx_custom_lens_rows_unique
            ON custom_lens_rows (material, vision, sign, power_type, sph, cyl, addition, coatings)
            NULLS NOT DISTINCT;
        EXCEPTION WHEN syntax_error THEN
            -- Fallback for PostgreSQL < 15
            CREATE UNIQUE INDEX idx_custom_lens_rows_unique
            ON custom_lens_rows (
                material,
                vision,
                COALESCE(sign, ''),
                power_type,
                sph,
                cyl,
                COALESCE(addition, 0.00),
                COALESCE(coatings, ARRAY[]::TEXT[])
            );
        END;
    END IF;
END $$;
