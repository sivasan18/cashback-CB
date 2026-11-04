-- ==============================================================================
-- SMART CASHBACK – MIGRATION 003: UPI PAYMENT SETTINGS & DUAL DISPLAY CONFIG
-- ==============================================================================

-- 1. Extend shop_settings with UPI & Display fields
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS merchant_upi_id TEXT NOT NULL DEFAULT '7708481818@upi',
  ADD COLUMN IF NOT EXISTS merchant_display_name TEXT NOT NULL DEFAULT 'Smart Cashback',
  ADD COLUMN IF NOT EXISTS qr_payment_method TEXT NOT NULL DEFAULT 'standard_upi',
  ADD COLUMN IF NOT EXISTS payment_expiry_seconds INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS display_timeout_seconds INTEGER NOT NULL DEFAULT 5;

-- 2. Optional: Add payment_method to transactions if not already present
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

-- 3. Update existing shop_settings default row if present
UPDATE public.shop_settings
SET
  merchant_upi_id = COALESCE(merchant_upi_id, '7708481818@upi'),
  merchant_display_name = COALESCE(merchant_display_name, 'Smart Cashback')
WHERE id IS NOT NULL;

