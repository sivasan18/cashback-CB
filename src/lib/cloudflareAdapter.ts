/**
 * Smart Cashback – Cloudflare Backend Adapter
 * Provides a drop-in API bridge for Cloudflare Workers & D1 so that all existing
 * application pages and stores continue functioning without any changes.
 */

import { cloudflareApi } from './api'
import type { Customer, Transaction, CashbackLedger, ShopSettings, ServiceCategory } from '@/types'

export class CloudflareQueryBuilder<T = any> {
  private table: string
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: any = null
  private filters: Array<{ type: string; col: string; val: any }> = []
  private sortCol?: string
  private sortAsc = true
  private limitCount?: number
  private isSingle = false

  constructor(table: string) {
    this.table = table
  }

  select(_columns = '*') {
    return this
  }

  insert(record: any) {
    this.action = 'insert'
    this.payload = record
    return this
  }

  update(record: any) {
    this.action = 'update'
    this.payload = record
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  upsert(record: any) {
    this.action = 'update'
    this.payload = record
    return this
  }

  eq(col: string, val: any) {
    this.filters.push({ type: 'eq', col, val })
    return this
  }

  neq(col: string, val: any) {
    this.filters.push({ type: 'neq', col, val })
    return this
  }

  gt(col: string, val: any) {
    this.filters.push({ type: 'gt', col, val })
    return this
  }

  gte(col: string, val: string) {
    this.filters.push({ type: 'gte', col, val })
    return this
  }

  lte(col: string, val: string) {
    this.filters.push({ type: 'lte', col, val })
    return this
  }

  or(expr: string) {
    this.filters.push({ type: 'or', col: 'or', val: expr })
    return this
  }

  not(_col: string, _op: string, _val: any) {
    return this
  }

  like(col: string, val: string) {
    this.filters.push({ type: 'like', col, val })
    return this
  }

  order(col: string, options?: { ascending?: boolean }) {
    this.sortCol = col
    this.sortAsc = options?.ascending !== false
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  single() {
    this.isSingle = true
    return this
  }

  maybeSingle() {
    this.isSingle = true
    return this
  }

  async then<TResult1 = { data: T | null; error: any }, TResult2 = never>(
    resolve?: ((value: { data: T | null; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const res = await this.execute()
      return resolve ? resolve(res) : (res as any)
    } catch (err) {
      if (reject) return reject(err)
      return resolve ? resolve({ data: null, error: err }) : ({ data: null, error: err } as any)
    }
  }

  private async execute(): Promise<{ data: any; error: any }> {
    const eqId = this.filters.find(f => f.type === 'eq' && f.col === 'id')

    // Handle INSERT
    if (this.action === 'insert') {
      if (this.table === 'customers') {
        const res = await cloudflareApi.customers.create(this.payload)
        return { data: this.isSingle ? res.data : (res.data ? [res.data] : null), error: res.error }
      }
      if (this.table === 'service_categories') {
        const res = await cloudflareApi.categories.create(this.payload)
        return { data: this.isSingle ? res.data : (res.data ? [res.data] : null), error: res.error }
      }
      return { data: null, error: null }
    }

    // Handle UPDATE
    if (this.action === 'update') {
      if (this.table === 'customers' && eqId) {
        const res = await cloudflareApi.customers.update(eqId.val, this.payload)
        return { data: this.isSingle ? res.data : (res.data ? [res.data] : null), error: res.error }
      }
      if (this.table === 'shop_settings') {
        const res = await cloudflareApi.settings.update(this.payload)
        return { data: res.data || null, error: res.error }
      }
      if (this.table === 'service_categories' && eqId) {
        const res = await cloudflareApi.categories.update(eqId.val, this.payload)
        return { data: this.isSingle ? res.data : (res.data ? [res.data] : null), error: res.error }
      }
      return { data: null, error: null }
    }

    // Handle DELETE
    if (this.action === 'delete') {
      if (this.table === 'customers' && eqId) {
        const res = await cloudflareApi.customers.delete(eqId.val)
        return { data: res.data ? [res.data] : null, error: res.error }
      }
      if (this.table === 'service_categories' && eqId) {
        const res = await cloudflareApi.categories.delete(eqId.val)
        return { data: res.data ? [res.data] : null, error: res.error }
      }
      if (this.table === 'cashback_ledger') {
        return { data: [], error: null }
      }
      return { data: null, error: null }
    }

    // Handle SELECT
    if (this.table === 'customers') {
      const prefixFilter = this.filters.find(f => f.type === 'like' && f.col === 'mobile')
      const eqMobile = this.filters.find(f => f.type === 'eq' && f.col === 'mobile')

      if (eqId) {
        const res = await cloudflareApi.customers.get(eqId.val)
        return { data: this.isSingle ? res.data : (res.data ? [res.data] : []), error: res.error }
      }

      const prefix = prefixFilter ? prefixFilter.val.replace(/%$/, '') : undefined
      const mobile = eqMobile ? eqMobile.val : undefined

      const orFilter = this.filters.find(f => f.type === 'or')
      let search: string | undefined
      if (orFilter && typeof orFilter.val === 'string') {
        const m = orFilter.val.match(/%([^%]+)%/)
        if (m) search = m[1]
      }

      const res = await cloudflareApi.customers.list({
        prefix,
        mobile,
        search,
        limit: this.limitCount
      })

      if (res.error) return { data: null, error: res.error }
      let data = res.data || []
      return { data: this.isSingle ? (data[0] || null) : data, error: null }
    }

    if (this.table === 'shop_settings') {
      const res = await cloudflareApi.settings.get()
      if (res.error) return { data: null, error: res.error }
      return { data: this.isSingle ? res.data : [res.data], error: null }
    }

    if (this.table === 'service_categories') {
      const res = await cloudflareApi.categories.list()
      if (res.error) return { data: null, error: res.error }
      let list = res.data || []
      if (this.sortCol === 'sort_order') {
        list = [...list].sort((a, b) => this.sortAsc ? a.sort_order - b.sort_order : b.sort_order - a.sort_order)
      }
      return { data: this.isSingle ? list[0] : list, error: null }
    }

    if (this.table === 'transactions') {
      const custFilter = this.filters.find(f => f.col === 'customer_id')
      const statusFilter = this.filters.find(f => f.col === 'status')
      const gteFilter = this.filters.find(f => f.type === 'gte' && f.col === 'created_at')
      const lteFilter = this.filters.find(f => f.type === 'lte' && f.col === 'created_at')

      const res = await cloudflareApi.transactions.list({
        customer_id: custFilter?.val,
        status: statusFilter?.val,
        start_date: gteFilter?.val,
        end_date: lteFilter?.val,
        limit: this.limitCount
      })

      if (res.error) return { data: null, error: res.error }
      let data = res.data || []
      return { data: this.isSingle ? (data[0] || null) : data, error: null }
    }

    if (this.table === 'cashback_ledger') {
      const custFilter = this.filters.find(f => f.col === 'customer_id')
      if (custFilter?.val) {
        const res = await cloudflareApi.ledger.list(custFilter.val)
        return { data: this.isSingle ? (res.data?.[0] || null) : (res.data || []), error: res.error }
      }
      return { data: [], error: null }
    }

    return { data: [], error: null }
  }
}

export const cloudflareAdapter = {
  auth: {
    signInWithPassword: cloudflareApi.auth.signInWithPassword,
    getSession: cloudflareApi.auth.getSession,
    signOut: cloudflareApi.auth.signOut,
    updateUser: cloudflareApi.auth.updateUser,
    onAuthStateChange: (cb: (event: string, session: any) => void) => {
      cloudflareApi.auth.getSession().then(({ data }) => {
        if (data?.session) {
          cb('SIGNED_IN', data.session)
        } else {
          cb('SIGNED_OUT', null)
        }
      })
      return {
        data: {
          subscription: {
            unsubscribe: () => {}
          }
        }
      }
    }
  },

  from<T = any>(table: string): CloudflareQueryBuilder<T> {
    return new CloudflareQueryBuilder<T>(table)
  },

  async rpc(funcName: string, params: Record<string, any> = {}) {
    if (funcName === 'process_billing') {
      const res = await cloudflareApi.billing.process({
        customer_id: params.p_customer_id,
        service_category: params.p_service_category,
        bill_amount: params.p_bill_amount,
        cashback_redeemed: params.p_cashback_redeemed,
        amount_paid: params.p_amount_paid,
        cashback_earned: params.p_cashback_earned,
        notes: params.p_notes,
        payment_method: params.payment_method || (params.p_notes?.includes('Payment: UPI') ? 'upi' : 'cash'),
        payment_verified: params.payment_verified ?? true,
        idempotency_key: params.p_idempotency_key
      })
      if (res.error) return { data: null, error: res.error }
      return { data: res.data?.transaction?.id, error: null }
    }

    if (funcName === 'cancel_transaction') {
      const res = await cloudflareApi.transactions.cancel(params.p_transaction_id)
      return { data: res.data, error: res.error }
    }

    if (funcName === 'delete_customer') {
      const res = await cloudflareApi.customers.delete(params.p_customer_id)
      return { data: res.data, error: res.error }
    }

    if (funcName === 'delete_all_customers') {
      const res = await cloudflareApi.customers.deleteAll()
      return { data: res.data, error: res.error }
    }

    return { data: null, error: { message: `Unknown RPC function: ${funcName}` } }
  }
}
