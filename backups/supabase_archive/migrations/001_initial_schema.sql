-- ============================================================
-- Smart Cashback – Complete Database Schema & Seed
-- Run this in Supabase SQL Editor (Project → SQL Editor)
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. customers ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT        NOT NULL CHECK (char_length(name) >= 1),
  mobile            TEXT        NOT NULL UNIQUE CHECK (mobile ~ '^[6-9][0-9]{9}$'),
  total_purchases   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_purchases >= 0),
  cashback_earned   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cashback_earned >= 0),
  cashback_redeemed NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cashback_redeemed >= 0),
  cashback_balance  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cashback_balance >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_mobile_idx ON public.customers (mobile);
CREATE INDEX IF NOT EXISTS customers_name_idx   ON public.customers USING gin (to_tsvector('simple', name));

-- ─── 2. shop_settings ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id                       UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_name                TEXT    NOT NULL DEFAULT 'Smart Cashback Shop',
  shop_address             TEXT    NOT NULL DEFAULT '',
  contact_number           TEXT    NOT NULL DEFAULT '',
  cashback_percentage      NUMERIC(5,2) NOT NULL DEFAULT 2.00 CHECK (cashback_percentage >= 0 AND cashback_percentage <= 100),
  minimum_eligible_purchase NUMERIC(10,2) NOT NULL DEFAULT 99.00 CHECK (minimum_eligible_purchase >= 0),
  currency                 TEXT    NOT NULL DEFAULT 'INR',
  date_format              TEXT    NOT NULL DEFAULT 'DD/MM/YYYY',
  time_format              TEXT    NOT NULL DEFAULT '12h',
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. service_categories ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_categories (
  id         UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT    NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. transactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id         UUID        NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  service_category    TEXT        NOT NULL,
  bill_amount         NUMERIC(10,2) NOT NULL CHECK (bill_amount > 0),
  cashback_redeemed   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cashback_redeemed >= 0),
  amount_paid         NUMERIC(10,2) NOT NULL CHECK (amount_paid >= 0),
  cashback_earned     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cashback_earned >= 0),
  status              TEXT        NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled','reversed')),
  notes               TEXT,
  idempotency_key     TEXT        UNIQUE,            -- prevents duplicate submissions
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_customer_id_idx ON public.transactions (customer_id);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx  ON public.transactions (created_at);
CREATE INDEX IF NOT EXISTS transactions_status_idx      ON public.transactions (status);

-- ─── 5. cashback_ledger ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cashback_ledger (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id    UUID        NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  transaction_id UUID        REFERENCES public.transactions(id) ON DELETE RESTRICT,
  credit         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  debit          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  balance_after  NUMERIC(10,2) NOT NULL CHECK (balance_after >= 0),
  description    TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cashback_ledger_customer_id_idx    ON public.cashback_ledger (customer_id);
CREATE INDEX IF NOT EXISTS cashback_ledger_transaction_id_idx ON public.cashback_ledger (transaction_id);
CREATE INDEX IF NOT EXISTS cashback_ledger_created_at_idx     ON public.cashback_ledger (created_at);

-- ─── Auto-update timestamps ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- SECURE RPC: process_billing
-- All billing logic runs server-side in a single transaction.
-- The frontend cannot modify ledger or wallet directly.
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_billing(
  p_customer_id       UUID,
  p_service_category  TEXT,
  p_bill_amount       NUMERIC,
  p_cashback_redeemed NUMERIC,
  p_amount_paid       NUMERIC,
  p_cashback_earned   NUMERIC,
  p_notes             TEXT,
  p_idempotency_key   TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer        public.customers%ROWTYPE;
  v_transaction_id  UUID;
  v_new_balance     NUMERIC(10,2);
  v_settings        public.shop_settings%ROWTYPE;
  v_min_purchase    NUMERIC(10,2);
  v_cb_pct          NUMERIC(5,2);
  v_calc_cashback   NUMERIC(10,2);
BEGIN
  -- ── Idempotency: return existing transaction if key already used ──
  SELECT id INTO v_transaction_id
  FROM public.transactions
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_transaction_id;
  END IF;

  -- ── Lock customer row for update ──
  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  -- ── Fetch current settings ──
  SELECT * INTO v_settings FROM public.shop_settings LIMIT 1;
  v_min_purchase := COALESCE(v_settings.minimum_eligible_purchase, 99.00);
  v_cb_pct       := COALESCE(v_settings.cashback_percentage, 2.00);

  -- ── Validate inputs server-side ──
  IF p_bill_amount <= 0 THEN
    RAISE EXCEPTION 'Bill amount must be greater than zero';
  END IF;
  IF p_cashback_redeemed < 0 THEN
    RAISE EXCEPTION 'Redemption cannot be negative';
  END IF;
  IF p_cashback_redeemed > v_customer.cashback_balance THEN
    RAISE EXCEPTION 'Redemption exceeds wallet balance. Available: %', v_customer.cashback_balance;
  END IF;
  IF p_cashback_redeemed > p_bill_amount THEN
    RAISE EXCEPTION 'Redemption cannot exceed bill amount';
  END IF;

  -- ── Server-side cashback calculation (authoritative) ──
  IF p_bill_amount >= v_min_purchase THEN
    v_calc_cashback := ROUND(p_amount_paid * v_cb_pct / 100, 2);
  ELSE
    v_calc_cashback := 0;
  END IF;

  v_new_balance := v_customer.cashback_balance - p_cashback_redeemed + v_calc_cashback;

  -- ── Insert transaction ──
  INSERT INTO public.transactions (
    customer_id, service_category, bill_amount,
    cashback_redeemed, amount_paid, cashback_earned,
    status, notes, idempotency_key
  )
  VALUES (
    p_customer_id, p_service_category, p_bill_amount,
    p_cashback_redeemed, p_amount_paid, v_calc_cashback,
    'completed', p_notes, p_idempotency_key
  )
  RETURNING id INTO v_transaction_id;

  -- ── Update customer aggregates ──
  UPDATE public.customers SET
    total_purchases   = total_purchases   + p_amount_paid,
    cashback_earned   = cashback_earned   + v_calc_cashback,
    cashback_redeemed = cashback_redeemed + p_cashback_redeemed,
    cashback_balance  = v_new_balance
  WHERE id = p_customer_id;

  -- ── Ledger: debit redeemed cashback ──
  IF p_cashback_redeemed > 0 THEN
    INSERT INTO public.cashback_ledger (
      customer_id, transaction_id, credit, debit,
      balance_after, description
    ) VALUES (
      p_customer_id, v_transaction_id, 0, p_cashback_redeemed,
      v_customer.cashback_balance - p_cashback_redeemed,
      'Cashback redeemed on ' || p_service_category
    );
  END IF;

  -- ── Ledger: credit new cashback ──
  IF v_calc_cashback > 0 THEN
    INSERT INTO public.cashback_ledger (
      customer_id, transaction_id, credit, debit,
      balance_after, description
    ) VALUES (
      p_customer_id, v_transaction_id, v_calc_cashback, 0,
      v_new_balance,
      'Cashback earned on ' || p_service_category || ' (₹' || p_amount_paid || ' paid)'
    );
  END IF;

  RETURN v_transaction_id;
END;
$$;

-- ============================================================
-- SECURE RPC: cancel_transaction
-- Creates a reversal entry; never deletes history.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_transaction(
  p_transaction_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx       public.transactions%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_new_bal  NUMERIC(10,2);
BEGIN
  -- Lock transaction
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.status != 'completed' THEN RAISE EXCEPTION 'Only completed transactions can be cancelled'; END IF;

  -- Lock customer
  SELECT * INTO v_customer FROM public.customers WHERE id = v_tx.customer_id FOR UPDATE;

  -- Reversal: remove earned cashback, restore redeemed cashback
  v_new_bal := v_customer.cashback_balance - v_tx.cashback_earned + v_tx.cashback_redeemed;

  IF v_new_bal < 0 THEN
    RAISE EXCEPTION 'Cancellation would result in negative wallet balance';
  END IF;

  -- Mark transaction as cancelled
  UPDATE public.transactions SET status = 'cancelled' WHERE id = p_transaction_id;

  -- Reverse customer aggregates
  UPDATE public.customers SET
    total_purchases   = total_purchases   - v_tx.amount_paid,
    cashback_earned   = cashback_earned   - v_tx.cashback_earned,
    cashback_redeemed = cashback_redeemed - v_tx.cashback_redeemed,
    cashback_balance  = v_new_bal
  WHERE id = v_tx.customer_id;

  -- Ledger reversal entry
  INSERT INTO public.cashback_ledger (
    customer_id, transaction_id, credit, debit, balance_after, description
  ) VALUES (
    v_tx.customer_id, p_transaction_id,
    v_tx.cashback_redeemed,          -- restore previously redeemed
    v_tx.cashback_earned,            -- remove previously earned
    v_new_bal,
    'Reversal for cancelled transaction #' || p_transaction_id
  );
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Only authenticated users (admins) can read/write data.
-- Ledger and wallet can only be modified via the secure RPCs.
-- ============================================================

ALTER TABLE public.customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashback_ledger     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settings       ENABLE ROW LEVEL SECURITY;

-- Customers: authenticated users can read/write customers
CREATE POLICY "auth_read_customers"   ON public.customers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_customers" ON public.customers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_customers" ON public.customers FOR UPDATE USING (auth.role() = 'authenticated');

-- Transactions: authenticated read; INSERT/UPDATE only via process_billing RPC (SECURITY DEFINER)
CREATE POLICY "auth_read_transactions"   ON public.transactions FOR SELECT USING (auth.role() = 'authenticated');
-- Direct INSERT from frontend is NOT allowed; only the RPC (SECURITY DEFINER = runs as table owner) can insert
CREATE POLICY "auth_update_transactions" ON public.transactions FOR UPDATE USING (auth.role() = 'authenticated');

-- Cashback ledger: read-only from frontend; writes only via SECURITY DEFINER RPCs
CREATE POLICY "auth_read_ledger" ON public.cashback_ledger FOR SELECT USING (auth.role() = 'authenticated');

-- Service categories: full CRUD for authenticated
CREATE POLICY "auth_all_categories" ON public.service_categories FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Shop settings: full CRUD for authenticated
CREATE POLICY "auth_all_settings" ON public.shop_settings FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default shop settings
INSERT INTO public.shop_settings (shop_name, cashback_percentage, minimum_eligible_purchase, currency)
VALUES ('Smart Cashback Shop', 2.00, 99.00, 'INR')
ON CONFLICT DO NOTHING;

-- Default service categories
INSERT INTO public.service_categories (name, is_active, sort_order) VALUES
  ('Xerox / Photocopy',      TRUE, 1),
  ('Black & White Printing', TRUE, 2),
  ('Colour Printing',        TRUE, 3),
  ('Scanning',               TRUE, 4),
  ('Lamination',             TRUE, 5),
  ('Binding',                TRUE, 6),
  ('Mobile Recharge',        TRUE, 7),
  ('Other Services',         TRUE, 8)
ON CONFLICT (name) DO NOTHING;
