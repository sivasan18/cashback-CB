/**
 * Smart Cashback – Cloudflare API Client
 * Typed client communicating with Cloudflare Workers / Pages Functions at /api/*
 */

import type { Customer, Transaction, CashbackLedger, ShopSettings, ServiceCategory, Shop } from '@/types'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const TOKEN_KEY = 'smart_cashback_cf_token'

export function getStoredAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<{ data?: T; error?: any }> {
  const token = getStoredAuthToken()
  const headers = new Headers(options.headers || {})
  headers.set('Content-Type', 'application/json')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    })

    const result = await res.json().catch(() => ({}))

    if (!res.ok) {
      return { error: { message: result.error || `HTTP error ${res.status}`, ...result } }
    }

    return { data: result.data !== undefined ? result.data : result }
  } catch (err: any) {
    return { error: { message: err.message || 'Network request failed' } }
  }
}

export const cloudflareApi = {
  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const { data, error } = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      })

      if (error || !data?.token) {
        return { data: null, error: error || { message: 'Authentication failed' } }
      }

      setStoredAuthToken(data.token)
      return {
        data: {
          session: { access_token: data.token },
          user: data.user
        },
        error: null
      }
    },

    async getSession() {
      const token = getStoredAuthToken()
      if (!token) return { data: { session: null, user: null }, error: null }

      const { data, error } = await request('/auth/session', { method: 'GET' })
      if (error || !data?.user) {
        setStoredAuthToken(null)
        return { data: { session: null, user: null }, error }
      }

      return {
        data: {
          session: { access_token: token },
          user: data.user
        },
        error: null
      }
    },

    async signOut() {
      setStoredAuthToken(null)
      await request('/auth/logout', { method: 'POST' })
      return { error: null }
    },

    async updateUser({ password }: { password: string }) {
      const { data, error } = await request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: password })
      })
      return { data, error }
    },

    async requestUnlock(payload: { shop_id?: number; login_id?: string }) {
      return request<{ success: boolean; message: string }>('/auth/request-unlock', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
    },

    async ownerRecovery(payload: { email: string; recovery_pin: string }) {
      return request<{ success: boolean; message: string }>('/auth/owner-recovery', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
    }
  },

  customers: {
    async list(params: { prefix?: string; search?: string; mobile?: string; limit?: number; offset?: number } = {}) {
      const qs = new URLSearchParams()
      if (params.prefix) qs.set('prefix', params.prefix)
      if (params.search) qs.set('search', params.search)
      if (params.mobile) qs.set('mobile', params.mobile)
      if (params.limit) qs.set('limit', params.limit.toString())
      if (params.offset) qs.set('offset', params.offset.toString())

      const res = await request<Customer[]>(`/customers?${qs.toString()}`)
      return { data: res.data || [], error: res.error }
    },

    async get(id: string) {
      return request<Customer>(`/customers/${id}`)
    },

    async create(cust: { name: string; mobile: string }) {
      return request<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify(cust)
      })
    },

    async update(id: string, updates: Partial<Customer>) {
      return request<Customer>(`/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      })
    },

    async delete(id: string) {
      return request<{ success: boolean; customer_id: string; transactions_retained: number }>(`/customers/${id}`, {
        method: 'DELETE'
      })
    },

    async deleteAll() {
      return request<{ success: boolean; hard_deleted: number; anonymized: number }>('/customers/delete-all', {
        method: 'POST'
      })
    },

    async lookupName(mobile: string) {
      return request<{ found: boolean; name: string | null }>(`/customers/lookup-name?mobile=${encodeURIComponent(mobile)}`)
    }
  },

  wallet: {
    async multiLookup(mobile: string) {
      return request<{
        mobile: string
        customer_name: string | null
        total_balance: number
        total_shops: number
        wallets: Array<{
          shop_id: number
          shop_name: string
          shop_icon?: string
          customer_name: string
          cashback_balance: number
          total_purchases: number
          cashback_earned: number
          cashback_redeemed: number
          updated_at: string
        }>
      }>(`/wallet/multi-lookup?mobile=${encodeURIComponent(mobile)}`)
    }
  },

  shops: {
    async list() {
      return request<Shop[]>('/shops')
    }
  },

  billing: {
    async process(payload: {
      customer_id: string
      service_category: string
      bill_amount: number
      cashback_redeemed: number
      amount_paid: number
      cashback_earned?: number
      notes?: string
      payment_method?: string
      payment_verified?: boolean
      idempotency_key?: string
    }) {
      return request<{ success: boolean; transaction: Transaction; customer: Customer }>('/billing/process', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
    }
  },

  transactions: {
    async list(filters: { customer_id?: string; status?: string; start_date?: string; end_date?: string; limit?: number; offset?: number } = {}) {
      const qs = new URLSearchParams()
      if (filters.customer_id) qs.set('customer_id', filters.customer_id)
      if (filters.status) qs.set('status', filters.status)
      if (filters.start_date) qs.set('start_date', filters.start_date)
      if (filters.end_date) qs.set('end_date', filters.end_date)
      if (filters.limit) qs.set('limit', filters.limit.toString())
      if (filters.offset) qs.set('offset', filters.offset.toString())

      return request<Transaction[]>(`/transactions?${qs.toString()}`)
    },

    async cancel(id: string) {
      return request<{ success: boolean; customer: Customer }>(`/transactions/${id}/cancel`, {
        method: 'POST'
      })
    }
  },

  ledger: {
    async list(customerId: string) {
      return request<CashbackLedger[]>(`/ledger?customer_id=${customerId}`)
    }
  },

  settings: {
    async get() {
      return request<ShopSettings>('/settings')
    },

    async update(updates: Partial<ShopSettings>) {
      return request<ShopSettings>('/settings', {
        method: 'PUT',
        body: JSON.stringify(updates)
      })
    }
  },

  categories: {
    async list() {
      return request<ServiceCategory[]>('/categories')
    },

    async create(cat: { name: string; is_active?: boolean; sort_order?: number }) {
      return request<ServiceCategory>('/categories', {
        method: 'POST',
        body: JSON.stringify(cat)
      })
    },

    async update(id: string, updates: Partial<ServiceCategory>) {
      return request<ServiceCategory>(`/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      })
    },

    async delete(id: string) {
      return request<{ success: boolean }>(`/categories/${id}`, {
        method: 'DELETE'
      })
    }
  },

  dashboard: {
    async getStats() {
      return request<any>('/dashboard/stats')
    }
  },

  display: {
    async getSession(shopId?: number) {
      const qs = shopId ? `?shop_id=${shopId}` : ''
      return request<any>(`/display/session${qs}`)
    },
    async updateSession(data: any, shopId?: number) {
      const qs = shopId ? `?shop_id=${shopId}` : ''
      return request<any>(`/display/session${qs}`, {
        method: 'POST',
        body: JSON.stringify({ ...data, shopId })
      })
    },
    async reset(shopId?: number) {
      const qs = shopId ? `?shop_id=${shopId}` : ''
      return request<any>(`/display/reset${qs}`, {
        method: 'POST',
        body: JSON.stringify({ shopId })
      })
    }
  },

  owner: {
    async getOverview() {
      return request<{
        totals: {
          total_sales: number
          total_transactions: number
          total_cashback_issued: number
          total_cashback_redeemed: number
          today_sales: number
          today_transactions: number
          unique_customers: number
          total_wallets: number
          total_wallet_liability: number
        }
        shops: Array<{
          id: number
          name: string
          slug: string
          login_id: string
          icon: string
          is_active: number
          total_sales: number
          total_transactions: number
          cashback_issued: number
          cashback_redeemed: number
          today_sales: number
          customer_count: number
          wallet_balance: number
        }>
        categoryBreakdown: Array<{
          category: string
          transaction_count: number
          total_sales: number
          cashback_earned: number
        }>
        securityAlerts: Array<{
          id: string
          shop_id: number
          shop_name: string
          login_id: string
          failed_attempts: number
          is_locked: number
          lock_reason: string
          locked_at: string | null
        }>
        hourlyDistribution: Array<{
          hour: number
          tx_count: number
          total_sales: number
        }>
        retention: {
          total_customers: number
          single_shop_customers: number
          multi_shop_customers: number
          three_plus_shop_customers: number
          cross_visit_rate: number
        }
      }>('/owner/overview')
    },
    async getShops() {
      return request<Shop[]>('/owner/shops')
    },
    async updateShop(id: number, data: { name?: string; is_active?: boolean; new_password?: string }) {
      return request<Shop>(`/owner/shops/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      })
    },
    async resetDefaultPassword(shopId: number) {
      return request<{ success: boolean; message: string; default_password: string }>(`/owner/shops/${shopId}/reset-default-password`, {
        method: 'POST'
      })
    },
    async getCustomers(params: { search?: string; shop_id?: number; mode?: 'customer' | 'shop' } = {}) {
      const qs = new URLSearchParams()
      if (params.search) qs.set('search', params.search)
      if (params.shop_id) qs.set('shop_id', params.shop_id.toString())
      if (params.mode) qs.set('mode', params.mode)
      return request<{
        data: any[]
        total: number
        mode: string
      }>(`/owner/customers?${qs.toString()}`)
    },
    async addCustomer(data: { name: string; mobile: string; shop_id?: number; initial_balance?: number }) {
      return request<{
        success: boolean
        message: string
        data: any
      }>('/owner/customers', {
        method: 'POST',
        body: JSON.stringify(data)
      })
    }
  },

  storage: {
    async backup() {
      return request<any>('/storage/backup', {
        method: 'POST'
      })
    }
  }
}

