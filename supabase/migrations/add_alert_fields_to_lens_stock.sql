-- Add alert_qty and alert_status columns to lens_stock
ALTER TABLE lens_stock
ADD COLUMN IF NOT EXISTS alert_qty DECIMAL(6,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS alert_status TEXT DEFAULT 'ON';
