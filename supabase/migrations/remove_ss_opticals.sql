-- SQL Script to permanently remove SS Opticals shop and associated data
-- Execute this script in your Supabase SQL Editor

-- 1. Get SS Opticals shop ID and store in a temporary context, then delete related data

-- Delete stock entries associated with SS Opticals
DELETE FROM lens_stock
WHERE shop_id IN (
    SELECT id FROM shops WHERE name ILIKE '%SS Optical%' OR name ILIKE '%SS Opticals%'
);

-- Delete order entries associated with SS Opticals
DELETE FROM orders
WHERE shop_id IN (
    SELECT id FROM shops WHERE name ILIKE '%SS Optical%' OR name ILIKE '%SS Opticals%'
);

-- Delete sale entries associated with SS Opticals
DELETE FROM sales
WHERE shop_id IN (
    SELECT id FROM shops WHERE name ILIKE '%SS Optical%' OR name ILIKE '%SS Opticals%'
);

-- Delete alert ignores associated with SS Opticals
DELETE FROM alert_ignores
WHERE shop_id IN (
    SELECT id FROM shops WHERE name ILIKE '%SS Optical%' OR name ILIKE '%SS Opticals%'
);

-- 2. Finally, delete SS Opticals from shops table
DELETE FROM shops
WHERE name ILIKE '%SS Optical%' OR name ILIKE '%SS Opticals%';
