/**
 * Smart Cashback – Cloudflare API Client
 * Typed client communicating with Cloudflare Workers / Pages Functions at /api/*
 */

import type { Customer, Transaction, CashbackLedger, ShopSettings, ServiceCategory } from '@/types'

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
      return { error: { message: result.error || `HTTP error ${res.status}` } }
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
    async getSession() {
      return request<any>('/display/session')
    },
    async updateSession(data: any) {
      return request<any>('/display/session', {
        method: 'POST',
        body: JSON.stringify(data)
      })
    },
    async reset() {
      return request<any>('/display/reset', {
        method: 'POST'
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

