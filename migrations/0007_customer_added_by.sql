-- ============================================================
-- Migration 0007: Add added_by Column to customers Table
-- ============================================================

ALTER TABLE customers ADD COLUMN added_by TEXT DEFAULT 'Shop';

