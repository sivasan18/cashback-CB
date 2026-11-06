/* ─────────────────────────────────────────────
   Smart Cashback – Shared TypeScript Types
   ───────────────────────────────────────────── */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Database row shapes (mirrors Supabase tables) ───────────────────────────

export interface Shop {
  id: number
  name: string
  slug: string
  login_id: string
  icon?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface Customer {
  id: string
  shop_id?: number
  name: string
  mobile: string
  total_purchases: number
  cashback_earned: number
  cashback_redeemed: number
  cashback_balance: number
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  shop_id?: number
  customer_id: string
  customer_name?: string
  customer_mobile?: string
  service_category: string
  bill_amount: number
  cashback_redeemed: number
  amount_paid: number
  cashback_earned: number
  status: 'completed' | 'cancelled' | 'reversed'
  notes?: string
  created_at: string
  updated_at: string
}

export interface CashbackLedger {
  id: string
  shop_id?: number
  customer_id: string
  transaction_id?: string
  credit: number
  debit: number
  balance_after: number
  description: string
  created_at: string
}

export interface ServiceCategory {
  id: string
  shop_id?: number
  name: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface ShopSettings {
  id: string
  shop_id?: number
  shop_name: string
  shop_address: string
  contact_number: string
  cashback_percentage: number
  minimum_eligible_purchase: number
  currency: string
  date_format: string
  time_format: string
  merchant_upi_id?: string
  merchant_display_name?: string
  qr_payment_method?: 'standard_upi' | 'payment_gateway'
  payment_expiry_seconds?: number
  display_timeout_seconds?: number
  enable_customer_display?: boolean | number
  updated_at: string
}

// ─── UI / Form types ──────────────────────────────────────────────────────────

export interface BillingFormData {
  mobile: string
  customerName: string
  serviceCategory: string
  billAmount: string
  cashbackToRedeem: string
  notes: string
}

export interface BillingCalculation {
  billAmount: number
  cashbackAvailable: number
  cashbackToRedeem: number
  amountPaid: number
  cashbackEarned: number
  newBalance: number
}

export interface DashboardStats {
  todaySales: number
  totalCustomers: number
  todayNewCustomers: number
  totalCashbackIssued: number
  totalCashbackRedeemed: number
  outstandingCashback: number
}

export interface DateRange {
  from: Date
  to: Date
}

export interface ReportRow {
  date: string
  customerName: string
  customerMobile: string
  serviceCategory: string
  billAmount: number
  cashbackRedeemed: number
  amountPaid: number
  cashbackEarned: number
  status: string
}

// ─── Notification stub (future SMS) ──────────────────────────────────────────

export type NotificationEvent =
  | 'cashback_earned'
  | 'cashback_redeemed'
  | 'balance_inquiry'
  | 'monthly_summary'
  | 'promotional'

export interface NotificationPayload {
  event: NotificationEvent
  customerId: string
  customerName: string
  mobile: string
  data: Record<string, string | number>
}
