-- Rename "Bluecut green" to "Bluecut" in lens_stock table
UPDATE lens_stock
SET coatings = array_replace(coatings, 'Bluecut green', 'Bluecut')
WHERE 'Bluecut green' = ANY(coatings);

-- Rename "Bluecut green" to "Bluecut" in custom_lens_rows table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'custom_lens_rows' AND column_name = 'coatings') THEN
        UPDATE custom_lens_rows
        SET coatings = array_replace(coatings, 'Bluecut green', 'Bluecut')
        WHERE 'Bluecut green' = ANY(coatings);
    END IF;
END $$;
