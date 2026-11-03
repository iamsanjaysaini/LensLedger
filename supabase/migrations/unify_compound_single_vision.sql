-- Unify Compound Single Vision list and consolidate custom_lens_rows & lens_stock
-- Narbada Eye Care Lens Management Migration

-- 1. Verify and update custom_lens_rows to remove dependence on compound_limit
-- Nullify or set default for compound_limit if the column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'custom_lens_rows'
        AND column_name = 'compound_limit'
    ) THEN
        -- Make compound_limit nullable and clear the column or set to null
        ALTER TABLE custom_lens_rows ALTER COLUMN compound_limit DROP NOT NULL;
        UPDATE custom_lens_rows SET compound_limit = NULL WHERE compound_limit IS NOT NULL;
    END IF;
END $$;

-- 2. Ensure lens_stock has no CHECK constraints restricting cyl to <= 2.0 or <= 4.0
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'lens_stock'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%cyl%'
    ) LOOP
        EXECUTE 'ALTER TABLE lens_stock DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 3. Ensure custom_lens_rows has no CHECK constraints restricting cyl to <= 2.0 or <= 4.0
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'custom_lens_rows'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%cyl%'
    ) LOOP
        EXECUTE 'ALTER TABLE custom_lens_rows DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 4. Verification queries
-- Check total counts
SELECT count(*) AS total_custom_rows FROM custom_lens_rows;
SELECT count(*) AS total_stock_rows FROM lens_stock;
