-- Migration: add_coatings_table
-- Coating list ab database me rahegi (mobile aur PC dono same list dekhenge).
-- SAFE: sirf NAYI table banati hai. lens_stock / sales / orders / custom_lens_rows ko
-- koi change nahi karti, aur kuch bhi DELETE ya UPDATE nahi karti. Dobara chalane par bhi safe hai.

CREATE TABLE IF NOT EXISTS coatings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE = deleted (row hatti nahi, sirf chhupi hai)
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE coatings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read/write on coatings') THEN
        CREATE POLICY "Allow authenticated read/write on coatings" ON coatings FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Default coatings
INSERT INTO coatings (name, sort_order)
SELECT n, ord
FROM unnest(ARRAY['HC', 'HMC', 'Bluecut', 'Bluecut Dual coat', 'Bluecut Blue', 'Photo Grey']) WITH ORDINALITY AS t(n, ord)
ON CONFLICT (name) DO NOTHING;

-- Jin coatings ka stock lens_stock me abhi bacha hai (quantity > 0), wo bhi list me aa jayengi
-- taaki koi stock "chhupa" na rahe. (lens_stock sirf PADHI jati hai, badli nahi jati.)
INSERT INTO coatings (name, sort_order)
SELECT c, 100 + (ROW_NUMBER() OVER (ORDER BY c))::int
FROM (
    SELECT DISTINCT unnest(coatings) AS c
    FROM lens_stock
    WHERE coatings IS NOT NULL AND quantity > 0
) s
WHERE c IS NOT NULL AND btrim(c) <> ''
ON CONFLICT (name) DO NOTHING;
