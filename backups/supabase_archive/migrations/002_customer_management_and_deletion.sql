-- ============================================================
-- Smart Cashback – Migration 002: Customer Management & Deletion
-- Run this in Supabase SQL Editor (Project → SQL Editor)
-- ============================================================

-- ─── 0. Allow Anonymized Mobile Numbers in Customer Check Constraint ──
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_mobile_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_mobile_check CHECK (mobile ~ '^[6-9][0-9]{9}$' OR mobile LIKE 'DEL%');

-- ─── 1. RLS Delete Policy for Authenticated Admins ──────────
DO $$
BEGIN
  -- Enable DELETE policy on customers for authenticated administrators
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'auth_delete_customers'
  ) THEN
    CREATE POLICY "auth_delete_customers" ON public.customers
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;

  -- Enable DELETE policy on cashback_ledger for authenticated administrators
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cashback_ledger' AND policyname = 'auth_delete_ledger'
  ) THEN
    CREATE POLICY "auth_delete_ledger" ON public.cashback_ledger
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;

  -- Enable DELETE policy on transactions for authenticated administrators
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'auth_delete_transactions'
  ) THEN
    CREATE POLICY "auth_delete_transactions" ON public.transactions
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ─── 2. Audit Log Table for Administrative Operations ─────────
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  action      TEXT        NOT NULL,
  performed_by TEXT       NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_audit_logs" ON public.admin_audit_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "auth_insert_audit_logs" ON public.admin_audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ─── 3. SECURE RPC: delete_customer ───────────────────────────
-- Securely deletes an individual customer while preserving historical
-- financial transactions for audit purposes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_customer(
  p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust_name    TEXT;
  v_cust_mobile  TEXT;
  v_tx_count     INTEGER;
  v_ledger_count INTEGER;
BEGIN
  -- Only authenticated admins can perform deletion
  IF auth.role() != 'authenticated' THEN
    RAISE EXCEPTION 'Unauthorized: only authenticated administrators can delete customers';
  END IF;

  -- Check customer exists
  SELECT name, mobile INTO v_cust_name, v_cust_mobile
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  -- Count associated transactions
  SELECT COUNT(*) INTO v_tx_count
  FROM public.transactions
  WHERE customer_id = p_customer_id;

  -- Delete associated ledger entries (rewards balance ceases to exist)
  DELETE FROM public.cashback_ledger
  WHERE customer_id = p_customer_id;

  GET DIAGNOSTICS v_ledger_count = ROW_COUNT;

  IF v_tx_count = 0 THEN
    -- Customer has no purchases: completely remove customer record
    DELETE FROM public.customers WHERE id = p_customer_id;
  ELSE
    -- Customer has financial transactions: anonymize personal data to maintain
    -- financial audit integrity without retaining personal information
    UPDATE public.customers SET
      name              = '[Deleted Customer]',
      mobile            = 'DEL' || SUBSTRING(id::text FROM 1 FOR 7),
      cashback_balance  = 0,
      total_purchases   = 0,
      cashback_earned   = 0,
      cashback_redeemed = 0,
      updated_at        = NOW()
    WHERE id = p_customer_id;

    -- Update transactions notes if necessary to remove personal references
    UPDATE public.transactions SET
      notes = COALESCE(notes, '') || ' (Customer account deleted)',
      updated_at = NOW()
    WHERE customer_id = p_customer_id;
  END IF;

  -- Record audit entry
  INSERT INTO public.admin_audit_logs (action, performed_by, details)
  VALUES (
    'DELETE_CUSTOMER',
    COALESCE(auth.email(), 'authenticated_admin'),
    jsonb_build_object(
      'customer_id', p_customer_id,
      'transactions_retained', v_tx_count,
      'ledger_entries_removed', v_ledger_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'customer_id', p_customer_id,
    'transactions_retained', v_tx_count,
    'completely_removed', (v_tx_count = 0)
  );
END;
$$;

-- ─── 4. SECURE RPC: delete_all_customers ──────────────────────
-- Bulk customer deletion: removes all customer records, wallets,
-- and personal information while preserving financial audit records.
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_all_customers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customers_deleted INTEGER := 0;
  v_ledger_deleted    INTEGER := 0;
  v_tx_count          INTEGER := 0;
BEGIN
  -- Only authenticated admins can perform deletion
  IF auth.role() != 'authenticated' THEN
    RAISE EXCEPTION 'Unauthorized: only authenticated administrators can perform bulk customer deletion';
  END IF;

  -- Delete all cashback ledger records
  DELETE FROM public.cashback_ledger;
  GET DIAGNOSTICS v_ledger_deleted = ROW_COUNT;

  -- Count transactions
  SELECT COUNT(*) INTO v_tx_count FROM public.transactions;

  IF v_tx_count = 0 THEN
    -- No transactions exist: remove all customer records directly
    DELETE FROM public.customers;
    GET DIAGNOSTICS v_customers_deleted = ROW_COUNT;
  ELSE
    -- Financial transactions exist: anonymize transactions and remove customers with 0 transactions
    -- For transactions, anonymize personal references
    UPDATE public.transactions SET
      notes = 'Financial record retained for audit (Customer data deleted)',
      updated_at = NOW();

    -- Delete customers with 0 transactions
    DELETE FROM public.customers
    WHERE id NOT IN (SELECT DISTINCT customer_id FROM public.transactions);

    -- Anonymize any customers referenced by historical transactions
    UPDATE public.customers SET
      name              = '[Deleted Customer]',
      mobile            = 'DEL' || SUBSTRING(id::text FROM 1 FOR 7),
      cashback_balance  = 0,
      total_purchases   = 0,
      cashback_earned   = 0,
      cashback_redeemed = 0,
      updated_at        = NOW();

    SELECT COUNT(*) INTO v_customers_deleted FROM public.customers;
  END IF;

  -- Record audit log
  INSERT INTO public.admin_audit_logs (action, performed_by, details)
  VALUES (
    'DELETE_ALL_CUSTOMERS',
    COALESCE(auth.email(), 'authenticated_admin'),
    jsonb_build_object(
      'customers_affected', v_customers_deleted,
      'ledger_records_deleted', v_ledger_deleted,
      'financial_transactions_retained', v_tx_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'customers_affected', v_customers_deleted,
    'ledger_records_deleted', v_ledger_deleted,
    'transactions_retained', v_tx_count
  );
END;
$$;
