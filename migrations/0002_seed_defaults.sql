-- ============================================================
-- Migration 0002: Seed Default Shop Settings & Categories
-- ============================================================

INSERT OR REPLACE INTO shop_settings (
  id, shop_name, shop_address, contact_number,
  cashback_percentage, minimum_eligible_purchase, currency,
  date_format, time_format, merchant_upi_id, merchant_display_name,
  qr_payment_method, payment_expiry_seconds, display_timeout_seconds, updated_at
) VALUES (
  'settings_default',
  'Smart Cashback Shop',
  '',
  '',
  2.00,
  99.00,
  'INR',
  'DD/MM/YYYY',
  '12h',
  '7708481818@upi',
  'Smart Cashback',
  'standard_upi',
  300,
  5,
  datetime('now')
);

INSERT OR REPLACE INTO service_categories (id, name, is_active, sort_order, created_at) VALUES
  ('cat_1', 'Xerox / Photocopy',      1, 1, datetime('now')),
  ('cat_2', 'Black & White Printing', 1, 2, datetime('now')),
  ('cat_3', 'Colour Printing',        1, 3, datetime('now')),
  ('cat_4', 'Scanning',               1, 4, datetime('now')),
  ('cat_5', 'Lamination',             1, 5, datetime('now')),
  ('cat_6', 'Binding',                1, 6, datetime('now')),
  ('cat_7', 'Mobile Recharge',        1, 7, datetime('now')),
  ('cat_8', 'Other Services',         1, 8, datetime('now'));

