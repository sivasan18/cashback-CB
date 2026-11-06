-- ============================================================
-- Smart Cashback – Cloudflare D1 Database Schema (SQLite)
-- Multi-Tenant 18-Shop Food Court Architecture
-- ============================================================

PRAGMA foreign_keys = ON;

-- ─── 0. shops ────────────────────────────────────────────────
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

-- ─── 1. customers ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                TEXT PRIMARY KEY,
  shop_id           INTEGER NOT NULL DEFAULT 18 REFERENCES shops(id),
  name              TEXT NOT NULL CHECK (length(name) >= 1),
  mobile            TEXT NOT NULL CHECK (mobile GLOB '[6-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' OR mobile LIKE 'DEL%'),
  total_purchases   REAL NOT NULL DEFAULT 0.0 CHECK (total_purchases >= 0),
  cashback_earned   REAL NOT NULL DEFAULT 0.0 CHECK (cashback_earned >= 0),
  cashback_redeemed REAL NOT NULL DEFAULT 0.0 CHECK (cashback_redeemed >= 0),
  cashback_balance  REAL NOT NULL DEFAULT 0.0 CHECK (cashback_balance >= 0),
  added_by          TEXT DEFAULT 'Shop',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(shop_id, mobile)
);

CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON customers (shop_id);
CREATE INDEX IF NOT EXISTS idx_customers_mobile  ON customers (mobile);
CREATE INDEX IF NOT EXISTS idx_customers_name    ON customers (name);

-- ─── 2. shop_settings ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_settings (
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
  enable_customer_display   INTEGER NOT NULL DEFAULT 1,
  updated_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(shop_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_settings_shop_id ON shop_settings (shop_id);

-- ─── 3. service_categories ────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_categories (
  id         TEXT PRIMARY KEY,
  shop_id    INTEGER NOT NULL DEFAULT 18 REFERENCES shops(id),
  name       TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(shop_id, name)
);

CREATE INDEX IF NOT EXISTS idx_service_categories_shop_id ON service_categories (shop_id);

-- ─── 4. transactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
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

CREATE INDEX IF NOT EXISTS idx_transactions_shop_id     ON transactions (shop_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at  ON transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_status      ON transactions (status);

-- ─── 5. cashback_ledger ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashback_ledger (
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

CREATE INDEX IF NOT EXISTS idx_cashback_ledger_shop_id        ON cashback_ledger (shop_id);
CREATE INDEX IF NOT EXISTS idx_cashback_ledger_customer_id    ON cashback_ledger (customer_id);
CREATE INDEX IF NOT EXISTS idx_cashback_ledger_transaction_id ON cashback_ledger (transaction_id);
CREATE INDEX IF NOT EXISTS idx_cashback_ledger_created_at     ON cashback_ledger (created_at);

-- ─── 6. admin_users (Food Court & Shop Authentication) ────────
CREATE TABLE IF NOT EXISTS admin_users (
  id              TEXT PRIMARY KEY,
  shop_id         INTEGER REFERENCES shops(id),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  salt            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'admin',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  is_locked       INTEGER NOT NULL DEFAULT 0,
  lock_reason     TEXT DEFAULT '',
  locked_at       TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_users_shop_id   ON admin_users (shop_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_locked ON admin_users (is_locked);

-- ─── 7. admin_audit_logs ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id           TEXT PRIMARY KEY,
  shop_id      INTEGER REFERENCES shops(id),
  action       TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  details      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_shop_id ON admin_audit_logs (shop_id);
