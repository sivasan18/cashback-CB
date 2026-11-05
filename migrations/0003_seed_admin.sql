-- ============================================================
-- Migration 0003: Seed Default Administrator Account
-- Account: sivar75@gmail.com
-- Hashing: PBKDF2-SHA256 (100,000 iterations)
-- ============================================================

INSERT OR REPLACE INTO admin_users (
  id, email, password_hash, salt, role, created_at, updated_at
) VALUES (
  'admin_primary_01',
  'sivar75@gmail.com',
  '0eec03650c6936e8c304d06b12e205bbb0f73edd04b974920696b669175e46b3',
  '6dc68d727c91a7c87408ec6480b57aac',
  'admin',
  datetime('now'),
  datetime('now')
);

