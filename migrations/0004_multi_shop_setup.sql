-- ============================================================
-- Migration 0004: Multi-Shop Food Court Architecture (18 Shops)
-- ============================================================

PRAGMA foreign_keys = OFF;

-- ─── 1. shops Table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  login_id   TEXT NOT NULL UNIQUE,
  icon       TEXT NOT NULL DEFAULT 'Store',
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR REPLACE INTO shops (id, name, slug, login_id, icon, is_active) VALUES
  (1,  'Fruit Shop',                      'fruit-shop',                      'shop01', 'Apple',          1),
  (2,  'Biryani Shop',                    'biryani-shop',                    'shop02', 'UtensilsCrossed',1),
  (3,  'Grill Shop',                      'grill-shop',                      'shop03', 'Flame',          1),
  (4,  'Pizza Shop',                      'pizza-shop',                      'shop04', 'Pizza',          1),
  (5,  'Momos Shop',                      'momos-shop',                      'shop05', 'Soup',           1),
  (6,  'Panipuri Shop',                   'panipuri-shop',                   'shop06', 'Utensils',       1),
  (7,  'Ice Cream Shop',                  'ice-cream-shop',                  'shop07', 'IceCream',       1),
  (8,  'Snacks Items Shop',               'snacks-items-shop',               'shop08', 'Cookie',         1),
  (9,  'Ice Creams & Falooda Shop',       'ice-creams-falooda-shop',         'shop09', 'GlassWater',     1),
  (10, 'Chai, Tea, Samosas & Bakery Shop','chai-tea-samosas-bakery-shop',    'shop10', 'Coffee',         1),
  (11, 'Game Items Shop',                 'game-items-shop',                 'shop11', 'Gamepad2',       1),
  (12, 'Ice Bay',                         'ice-bay',                         'shop12', 'Snowflake',      1),
  (13, 'Idli & Dosa Shop',                'idli-dosa-shop',                  'shop13', 'Disc',           1),
  (14, 'Biryani Shop 2',                  'biryani-shop-2',                  'shop14', 'CookingPot',     1),
  (15, 'Miscellaneous Shop 1',            'miscellaneous-shop-1',            'shop15', 'Sparkles',       1),
  (16, 'Miscellaneous Shop 2',            'miscellaneous-shop-2',            'shop16', 'ShoppingBag',    1),
  (17, 'Miscellaneous Shop 3',            'miscellaneous-shop-3',            'shop17', 'Tag',            1),
  (18, 'Xerox & Printing Shop',           'xerox-printing-shop',             'shop18', 'Printer',        1);

-- ─── 2. shop_settings (Recreated with shop_id) ─────────────────
CREATE TABLE IF NOT EXISTS shop_settings_new (
  id                        TEXT PRIMARY KEY,
  shop_id                   INTEGER NOT NULL DEFAULT 18 REFERENCES shops(id),
  shop_name                 TEXT NOT NULL DEFAULT 'Smart Cashback Shop',
  shop_address              TEXT NOT NULL DEFAULT '',
  contact_number            TEXT NOT NULL DEFAULT '',
  cashback_percentage       REAL NOT NULL DEFAULT 2.00 CHECK (cashback_percentage >= 0 AND cashback_percentage <= 100),
  minimum_eligible_purchase REAL NOT NULL DEFAULT 99.00 CHECK (minimum_eligible_purchase >= 0),
  currency                  TEXT NOT NULL DEFAULT 'INR',
  date_format               TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  time_format               TEXT NOT NULL DEFAULT '12h',
  merchant_upi_id           TEXT NOT NULL DEFAULT '7708481818@upi',
  merchant_display_name     TEXT NOT NULL DEFAULT 'Smart Cashback',
  qr_payment_method         TEXT NOT NULL DEFAULT 'standard_upi',
  payment_expiry_seconds    INTEGER NOT NULL DEFAULT 300,
  display_timeout_seconds   INTEGER NOT NULL DEFAULT 5,
  updated_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(shop_id)
);

-- Copy existing settings to shop 18
INSERT OR IGNORE INTO shop_settings_new (
  id, shop_id, shop_name, shop_address, contact_number, cashback_percentage,
  minimum_eligible_purchase, currency, date_format, time_format, merchant_upi_id,
  merchant_display_name, qr_payment_method, payment_expiry_seconds, display_timeout_seconds, updated_at
)
SELECT
  id, 18, coalesce(shop_name, 'Xerox & Printing Shop'), shop_address, contact_number, cashback_percentage,
  minimum_eligible_purchase, currency, date_format, time_format, merchant_upi_id,
  coalesce(merchant_display_name, 'Xerox & Printing Shop'), qr_payment_method, payment_expiry_seconds, display_timeout_seconds, updated_at
FROM shop_settings LIMIT 1;

-- Seed default settings for shops 1 through 17
INSERT OR IGNORE INTO shop_settings_new (id, shop_id, shop_name, merchant_display_name, merchant_upi_id) VALUES
  ('set_shop_01', 1,  'Fruit Shop',                      'Fruit Shop',                      '7708481818@upi'),
  ('set_shop_02', 2,  'Biryani Shop',                    'Biryani Shop',                    '7708481818@upi'),
  ('set_shop_03', 3,  'Grill Shop',                      'Grill Shop',                      '7708481818@upi'),
  ('set_shop_04', 4,  'Pizza Shop',                      'Pizza Shop',                      '7708481818@upi'),
  ('set_shop_05', 5,  'Momos Shop',                      'Momos Shop',                      '7708481818@upi'),
  ('set_shop_06', 6,  'Panipuri Shop',                   'Panipuri Shop',                   '7708481818@upi'),
  ('set_shop_07', 7,  'Ice Cream Shop',                  'Ice Cream Shop',                  '7708481818@upi'),
  ('set_shop_08', 8,  'Snacks Items Shop',               'Snacks Items Shop',               '7708481818@upi'),
  ('set_shop_09', 9,  'Ice Creams & Falooda Shop',       'Ice Creams & Falooda Shop',       '7708481818@upi'),
  ('set_shop_10', 10, 'Chai, Tea, Samosas & Bakery Shop','Chai, Tea, Samosas & Bakery Shop','7708481818@upi'),
  ('set_shop_11', 11, 'Game Items Shop',                 'Game Items Shop',                 '7708481818@upi'),
  ('set_shop_12', 12, 'Ice Bay',                         'Ice Bay',                         '7708481818@upi'),
  ('set_shop_13', 13, 'Idli & Dosa Shop',                'Idli & Dosa Shop',                '7708481818@upi'),
  ('set_shop_14', 14, 'Biryani Shop 2',                  'Biryani Shop 2',                  '7708481818@upi'),
  ('set_shop_15', 15, 'Miscellaneous Shop 1',            'Miscellaneous Shop 1',            '7708481818@upi'),
  ('set_shop_16', 16, 'Miscellaneous Shop 2',            'Miscellaneous Shop 2',            '7708481818@upi'),
  ('set_shop_17', 17, 'Miscellaneous Shop 3',            'Miscellaneous Shop 3',            '7708481818@upi');

-- Fallback if shop 18 had no prior record
INSERT OR IGNORE INTO shop_settings_new (id, shop_id, shop_name, merchant_display_name, merchant_upi_id) VALUES
  ('set_shop_18', 18, 'Xerox & Printing Shop',           'Xerox & Printing Shop',           '7708481818@upi');

DROP TABLE IF EXISTS shop_settings;
ALTER TABLE shop_settings_new RENAME TO shop_settings;
CREATE INDEX IF NOT EXISTS idx_shop_settings_shop_id ON shop_settings (shop_id);

-- ─── 3. service_categories (Recreated with shop_id) ────────────
CREATE TABLE IF NOT EXISTS service_categories_new (
  id         TEXT PRIMARY KEY,
  shop_id    INTEGER NOT NULL DEFAULT 18 REFERENCES shops(id),
  name       TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(shop_id, name)
);

-- Copy existing categories into shop 18
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, is_active, sort_order, created_at)
SELECT id, 18, name, is_active, sort_order, created_at FROM service_categories;

-- Seed default categories for all shops
-- Shop 1: Fruit Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s01_1', 1, 'Fresh Fruits', 1),
  ('cat_s01_2', 1, 'Fruit Salad',  2),
  ('cat_s01_3', 1, 'Fresh Juices', 3),
  ('cat_s01_4', 1, 'Cut Fruits',   4);

-- Shop 2: Biryani Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s02_1', 2, 'Chicken Biryani', 1),
  ('cat_s02_2', 2, 'Mutton Biryani',  2),
  ('cat_s02_3', 2, 'Egg/Veg Biryani', 3),
  ('cat_s02_4', 2, 'Starters',        4),
  ('cat_s02_5', 2, 'Combo',           5);

-- Shop 3: Grill Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s03_1', 3, 'Grilled Chicken', 1),
  ('cat_s03_2', 3, 'Shawarma',        2),
  ('cat_s03_3', 3, 'BBQ',             3),
  ('cat_s03_4', 3, 'Tandoori',        4),
  ('cat_s03_5', 3, 'Kuboos/Sides',    5);

-- Shop 4: Pizza Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s04_1', 4, 'Veg Pizza',       1),
  ('cat_s04_2', 4, 'Non-Veg Pizza',   2),
  ('cat_s04_3', 4, 'Garlic Bread',    3),
  ('cat_s04_4', 4, 'Pasta',           4),
  ('cat_s04_5', 4, 'Beverages',       5);

-- Shop 5: Momos Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s05_1', 5, 'Steamed Momos',   1),
  ('cat_s05_2', 5, 'Fried Momos',     2),
  ('cat_s05_3', 5, 'Tandoori Momos',  3),
  ('cat_s05_4', 5, 'Rolls',           4);

-- Shop 6: Panipuri Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s06_1', 6, 'Panipuri',        1),
  ('cat_s06_2', 6, 'Bhelpuri',        2),
  ('cat_s06_3', 6, 'Dahi Puri',       3),
  ('cat_s06_4', 6, 'Masala Puri',     4),
  ('cat_s06_5', 6, 'Pav Bhaji',       5),
  ('cat_s06_6', 6, 'Chaat',           6);

-- Shop 7: Ice Cream Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s07_1', 7, 'Scoops',          1),
  ('cat_s07_2', 7, 'Cones',           2),
  ('cat_s07_3', 7, 'Sundaes',         3),
  ('cat_s07_4', 7, 'Family Packs',    4),
  ('cat_s07_5', 7, 'Toppings',        5);

-- Shop 8: Snacks Items Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s08_1', 8, 'Fried Snacks',    1),
  ('cat_s08_2', 8, 'Bajji/Bonda',     2),
  ('cat_s08_3', 8, 'Puffs',           3),
  ('cat_s08_4', 8, 'Sandwich',        4),
  ('cat_s08_5', 8, 'Fries',           5);

-- Shop 9: Ice Creams & Falooda Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s09_1', 9, 'Royal Falooda',    1),
  ('cat_s09_2', 9, 'Kulfi',            2),
  ('cat_s09_3', 9, 'Milkshakes',       3),
  ('cat_s09_4', 9, 'Thickshakes',      4),
  ('cat_s09_5', 9, 'Ice Cream Sodas',  5);

-- Shop 10: Chai, Tea, Samosas & Bakery Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s10_1', 10, 'Masala Chai',     1),
  ('cat_s10_2', 10, 'Filter Coffee',   2),
  ('cat_s10_3', 10, 'Samosa',          3),
  ('cat_s10_4', 10, 'Puffs',           4),
  ('cat_s10_5', 10, 'Cakes & Biscuits',5);

-- Shop 11: Game Items Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s11_1', 11, 'VR Games',        1),
  ('cat_s11_2', 11, 'Arcade Tokens',   2),
  ('cat_s11_3', 11, 'Kids Rides',      3),
  ('cat_s11_4', 11, 'Board/Indoor Games', 4);

-- Shop 12: Ice Bay
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s12_1', 12, 'Popsicles',       1),
  ('cat_s12_2', 12, 'Ice Gola',        2),
  ('cat_s12_3', 12, 'Slushies',        3),
  ('cat_s12_4', 12, 'Cold Desserts',   4),
  ('cat_s12_5', 12, 'Sundaes',         5);

-- Shop 13: Idli & Dosa Shop
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s13_1', 13, 'Idli',            1),
  ('cat_s13_2', 13, 'Variety Dosa',    2),
  ('cat_s13_3', 13, 'Vada',            3),
  ('cat_s13_4', 13, 'Pongal',          4),
  ('cat_s13_5', 13, 'Mini Tiffin',     5);

-- Shop 14: Biryani Shop 2
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s14_1', 14, 'Seeraga Samba Biryani', 1),
  ('cat_s14_2', 14, 'Bucket Biryani',        2),
  ('cat_s14_3', 14, 'Kebab',                 3),
  ('cat_s14_4', 14, 'Gravy',                 4),
  ('cat_s14_5', 14, 'Breads',                5);

-- Shop 15: Miscellaneous Shop 1
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s15_1', 15, 'General Item 1',  1),
  ('cat_s15_2', 15, 'General Item 2',  2),
  ('cat_s15_3', 15, 'Special Service', 3);

-- Shop 16: Miscellaneous Shop 2
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s16_1', 16, 'General Item 1',  1),
  ('cat_s16_2', 16, 'General Item 2',  2),
  ('cat_s16_3', 16, 'Special Service', 3);

-- Shop 17: Miscellaneous Shop 3
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s17_1', 17, 'General Item 1',  1),
  ('cat_s17_2', 17, 'General Item 2',  2),
  ('cat_s17_3', 17, 'Special Service', 3);

-- Shop 18: Xerox & Printing Shop (fallback if no existing rows)
INSERT OR IGNORE INTO service_categories_new (id, shop_id, name, sort_order) VALUES
  ('cat_s18_1', 18, 'Xerox',           1),
  ('cat_s18_2', 18, 'B&W Printout',    2),
  ('cat_s18_3', 18, 'Color Printout',  3),
  ('cat_s18_4', 18, 'Lamination',      4),
  ('cat_s18_5', 18, 'Spiral Binding',  5),
  ('cat_s18_6', 18, 'Scanning',        6),
  ('cat_s18_7', 18, 'Project Report',  7);

DROP TABLE IF EXISTS service_categories;
ALTER TABLE service_categories_new RENAME TO service_categories;
CREATE INDEX IF NOT EXISTS idx_service_categories_shop_id ON service_categories (shop_id);

-- ─── 4. customers (Recreated with shop_id) ─────────────────────
CREATE TABLE IF NOT EXISTS customers_new (
  id                TEXT PRIMARY KEY,
  shop_id           INTEGER NOT NULL DEFAULT 18 REFERENCES shops(id),
  name              TEXT NOT NULL CHECK (length(name) >= 1),
  mobile            TEXT NOT NULL CHECK (mobile GLOB '[6-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' OR mobile LIKE 'DEL%'),
  total_purchases   REAL NOT NULL DEFAULT 0.0 CHECK (total_purchases >= 0),
  cashback_earned   REAL NOT NULL DEFAULT 0.0 CHECK (cashback_earned >= 0),
  cashback_redeemed REAL NOT NULL DEFAULT 0.0 CHECK (cashback_redeemed >= 0),
  cashback_balance  REAL NOT NULL DEFAULT 0.0 CHECK (cashback_balance >= 0),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(shop_id, mobile)
);

INSERT OR IGNORE INTO customers_new (
  id, shop_id, name, mobile, total_purchases, cashback_earned, cashback_redeemed, cashback_balance, created_at, updated_at
)
SELECT id, 18, name, mobile, total_purchases, cashback_earned, cashback_redeemed, cashback_balance, created_at, updated_at FROM customers;

DROP TABLE IF EXISTS customers;
ALTER TABLE customers_new RENAME TO customers;
CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON customers (shop_id);
CREATE INDEX IF NOT EXISTS idx_customers_mobile  ON customers (mobile);
CREATE INDEX IF NOT EXISTS idx_customers_name    ON customers (name);

-- ─── 5. transactions (Recreated with shop_id) ──────────────────
CREATE TABLE IF NOT EXISTS transactions_new (
  id                  TEXT PRIMARY KEY,
  shop_id             INTEGER NOT NULL DEFAULT 18 REFERENCES shops(id),
  customer_id         TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  service_category    TEXT NOT NULL,
  bill_amount         REAL NOT NULL CHECK (bill_amount > 0),
  cashback_redeemed   REAL NOT NULL DEFAULT 0.0 CHECK (cashback_redeemed >= 0),
  amount_paid         REAL NOT NULL CHECK (amount_paid >= 0),
  cashback_earned     REAL NOT NULL DEFAULT 0.0 CHECK (cashback_earned >= 0),
  status              TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled', 'reversed')),
  notes               TEXT,
  payment_method      TEXT DEFAULT 'cash',
  idempotency_key     TEXT UNIQUE,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO transactions_new (
  id, shop_id, customer_id, service_category, bill_amount, cashback_redeemed, amount_paid, cashback_earned, status, notes, payment_method, idempotency_key, created_at, updated_at
)
SELECT id, 18, customer_id, service_category, bill_amount, cashback_redeemed, amount_paid, cashback_earned, status, notes, payment_method, idempotency_key, created_at, updated_at FROM transactions;

DROP TABLE IF EXISTS transactions;
ALTER TABLE transactions_new RENAME TO transactions;
CREATE INDEX IF NOT EXISTS idx_transactions_shop_id     ON transactions (shop_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at  ON transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_status      ON transactions (status);

-- ─── 6. cashback_ledger (Recreated with shop_id) ───────────────
CREATE TABLE IF NOT EXISTS cashback_ledger_new (
  id             TEXT PRIMARY KEY,
  shop_id        INTEGER NOT NULL DEFAULT 18 REFERENCES shops(id),
  customer_id    TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  transaction_id TEXT REFERENCES transactions(id) ON DELETE RESTRICT,
  credit         REAL NOT NULL DEFAULT 0.0 CHECK (credit >= 0),
  debit          REAL NOT NULL DEFAULT 0.0 CHECK (debit >= 0),
  balance_after  REAL NOT NULL CHECK (balance_after >= 0),
  description    TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO cashback_ledger_new (
  id, shop_id, customer_id, transaction_id, credit, debit, balance_after, description, created_at
)
SELECT id, 18, customer_id, transaction_id, credit, debit, balance_after, description, created_at FROM cashback_ledger;

DROP TABLE IF EXISTS cashback_ledger;
ALTER TABLE cashback_ledger_new RENAME TO cashback_ledger;
CREATE INDEX IF NOT EXISTS idx_cashback_ledger_shop_id        ON cashback_ledger (shop_id);
CREATE INDEX IF NOT EXISTS idx_cashback_ledger_customer_id    ON cashback_ledger (customer_id);
CREATE INDEX IF NOT EXISTS idx_cashback_ledger_transaction_id ON cashback_ledger (transaction_id);
CREATE INDEX IF NOT EXISTS idx_cashback_ledger_created_at     ON cashback_ledger (created_at);

-- ─── 7. admin_users (Recreated with shop_id and Food Court Auth) ────────
CREATE TABLE IF NOT EXISTS admin_users_new (
  id            TEXT PRIMARY KEY,
  shop_id       INTEGER REFERENCES shops(id),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

DROP TABLE IF EXISTS admin_users;
ALTER TABLE admin_users_new RENAME TO admin_users;
CREATE INDEX IF NOT EXISTS idx_admin_users_shop_id ON admin_users (shop_id);

-- Master Owner Account (sivar75@gmail.com, password San@1818, role super_admin, shop_id NULL)
INSERT OR REPLACE INTO admin_users (id, shop_id, email, password_hash, salt, role) VALUES
  ('usr_owner_01', NULL, 'sivar75@gmail.com', '0eec03650c6936e8c304d06b12e205bbb0f73edd04b974920696b669175e46b3', '6dc68d727c91a7c87408ec6480b57aac', 'super_admin');

-- 18 Shop Login Accounts (shop01 .. shop18)
INSERT OR REPLACE INTO admin_users (id, shop_id, email, password_hash, salt, role) VALUES
  ('usr_shop_01', 1,  'shop01', 'a13d8ae43f396402cd36c6bec24eaf74607754a6c21687facf4ad19505c6283f', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_02', 2,  'shop02', 'd577ca8a9c1e1387d03203e45899c627005be8e3ccbc59a0dd6e440c8569acc1', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_03', 3,  'shop03', 'a42f446a2559d9e0e23fd747a33c050c00afcabf8f2a310dbf3ef8a3f78b9e4f', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_04', 4,  'shop04', 'f56965152457cd6bfacc1ef54f290b869b00f38333036f99d1fcf086a25d56c9', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_05', 5,  'shop05', '0d624079982a3bf0e07c90dccd140f9b8f4616b5313839e9c26dde8e5c707077', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_06', 6,  'shop06', 'ffa471772522eb36169de8b13b26ebed10c4d3f6ddf37f84cc3cd5bae4ed57d9', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_07', 7,  'shop07', 'd486eb125b691dfc84ff0f05d5d317b5a30c38e188742aafe9b8472d88a04b70', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_08', 8,  'shop08', '22ada54f1d120305efd2f1a152122c1eb439d35e0ded595a9d92a60af1b8e620', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_09', 9,  'shop09', 'c290b39321a3354c30bbc8433abddfb471be95b30a69f1eb26d0c5d71c80bf2d', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_10', 10, 'shop10', '4e59134982aab3cd989cfebd3e18c5d2a9e608f97a3044175afeddde095e7152', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_11', 11, 'shop11', 'a7f86c2b5e77d716b02a5f5dced9c58df6fc12d4fc74db4642d9f1e9f4e404de', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_12', 12, 'shop12', 'de3c964f513b4006d2015833c294cff26c26e88fe3763f1ee400c030c04a13b3', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_13', 13, 'shop13', '1cff50dd1599c8593f786a14945e037665801dffc4349bd21ab7ab34e0252ac6', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_14', 14, 'shop14', 'd8ffa9a4fab59fea8b8c878613bfe970e3ca21cd59424050c8e4c46827e6ca0f', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_15', 15, 'shop15', 'ed628044266e559d3592663888d38537f77afcb29e79e9aa899b75662a92f83f', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_16', 16, 'shop16', 'dea2d7e57478937d62effc33e7e208729440fa49f0fa80ec03164a94036717fa', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_17', 17, 'shop17', '4880d22cac1df47ba530e172be1be7de21b7d841480c59958f90d0094a148dd5', '6dc68d727c91a7c87408ec6480b57aac', 'admin'),
  ('usr_shop_18', 18, 'shop18', 'b43b17c9317ff7658a9b2931344d71ca129b9e7983d00fe857a35f38ed5d2c64', '6dc68d727c91a7c87408ec6480b57aac', 'admin');

PRAGMA foreign_keys = ON;

