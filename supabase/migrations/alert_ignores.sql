-- Create alert_ignores table if not exists, and add columns if they don't exist
CREATE TABLE IF NOT EXISTS alert_ignores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    material TEXT NOT NULL,
    vision TEXT NOT NULL,
    sign TEXT,
    power_type TEXT NOT NULL,
    coatings TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE alert_ignores ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage alert_ignores
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read/write on alert_ignores') THEN
        CREATE POLICY "Allow authenticated read/write on alert_ignores" ON alert_ignores FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Add specific lens power columns to alert_ignores if they don't exist
ALTER TABLE alert_ignores ADD COLUMN IF NOT EXISTS sph DECIMAL(4,2);
ALTER TABLE alert_ignores ADD COLUMN IF NOT EXISTS cyl DECIMAL(4,2);
ALTER TABLE alert_ignores ADD COLUMN IF NOT EXISTS addition DECIMAL(4,2);
ALTER TABLE alert_ignores ADD COLUMN IF NOT EXISTS axis INTEGER;
