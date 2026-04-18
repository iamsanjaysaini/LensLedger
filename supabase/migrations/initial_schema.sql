-- Enable uuid-ossp extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create shops table
CREATE TABLE IF NOT EXISTS shops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed shops
INSERT INTO shops (name) VALUES ('SS Opticals'), ('Narbada Eye Care') ON CONFLICT (name) DO NOTHING;

-- Create lens_stock table
CREATE TABLE IF NOT EXISTS lens_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    material TEXT NOT NULL, -- CR, Poly, Glass
    vision TEXT NOT NULL, -- single vision, KT, Prograssive
    sign TEXT, -- +, - (null for 0 power)
    power_type TEXT NOT NULL, -- SPH, CYL, Compound, Cross Compound
    sph DECIMAL(4,2) DEFAULT 0.00,
    cyl DECIMAL(4,2) DEFAULT 0.00,
    axis INTEGER,
    coatings TEXT[], -- Array of coatings
    quantity DECIMAL(6,2) DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(shop_id, material, vision, sign, power_type, sph, cyl, axis, coatings)
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    lens_details JSONB NOT NULL,
    quantity DECIMAL(6,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Simple policies (allow authenticated users for all operations)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read/write on shops') THEN
        CREATE POLICY "Allow authenticated read/write on shops" ON shops FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read/write on lens_stock') THEN
        CREATE POLICY "Allow authenticated read/write on lens_stock" ON lens_stock FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read/write on orders') THEN
        CREATE POLICY "Allow authenticated read/write on orders" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;
