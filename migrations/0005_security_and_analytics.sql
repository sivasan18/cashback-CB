-- ============================================================
-- Migration 0005: Security Lockout, Default Password Reset & Analytics
-- ============================================================

-- Add lockout and security tracking columns to admin_users
ALTER TABLE admin_users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN lock_reason TEXT DEFAULT '';
ALTER TABLE admin_users ADD COLUMN locked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_users_is_locked ON admin_users (is_locked);

