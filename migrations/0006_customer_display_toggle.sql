-- ============================================================
-- Migration 0006: Add Customer Display Toggle to shop_settings
-- ============================================================

ALTER TABLE shop_settings ADD COLUMN enable_customer_display INTEGER NOT NULL DEFAULT 1;

