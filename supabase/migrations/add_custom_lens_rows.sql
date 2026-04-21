-- Create custom_lens_rows table
CREATE TABLE IF NOT EXISTS custom_lens_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material TEXT NOT NULL,
    vision TEXT NOT NULL,
    sign TEXT,
    power_type TEXT NOT NULL,
    compound_limit TEXT,
    sph DECIMAL(4,2) DEFAULT 0.00,
    cyl DECIMAL(4,2) DEFAULT 0.00,
    axis INTEGER,
    addition DECIMAL(4,2),
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE custom_lens_rows ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage custom lens rows
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read/write on custom_lens_rows') THEN
        CREATE POLICY "Allow authenticated read/write on custom_lens_rows" ON custom_lens_rows FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;
