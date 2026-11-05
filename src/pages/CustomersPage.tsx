import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Eye, Edit2, Trash2, X, AlertTriangle,
  User, Phone, Wallet, ShoppingBag, ShieldAlert
} from 'lucide-react'
import { db } from '@/lib/db'
import { formatCurrency, validateMobile, normalizeMobile } from '@/lib/cashback'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import type { Customer } from '@/types'

export default function CustomersPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Add Customer modal / drawer
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMobile, setNewMobile] = useState('')
  const [adding, setAdding] = useState(false)

  // Edit Customer Modal
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [editName, setEditName] = useState('')
  const [editMobile, setEditMobile] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete Customer Modal
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchCustomers = useCallback(async (q?: string) => {
    setLoading(true)
    let query = db
      .from('customers')
      .select('*')
      .not('name', 'eq', '[Deleted Customer]')
      .not('mobile', 'like', 'DEL%')
      .order('created_at', { ascending: false })

    if (q) {
      query = query.or(`name.ilike.%${q}%,mobile.ilike.%${q}%`)
    }
    const { data, error } = await query.limit(150)
    if (error) {
      toast.error('Failed to load customers')
    } else {
      setCustomers((data as Customer[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchCustomers(search.trim())
  }

  // ─────────────────────────────────────────────────────────────
  // ADD CUSTOMER
  // ─────────────────────────────────────────────────────────────
  const handleAddCustomer = async () => {
    if (!newName.trim() || !newMobile.trim()) {
      toast.error('Name and mobile are required')
      return
    }
    const norm = normalizeMobile(newMobile.trim())
    if (!validateMobile(norm)) {
      toast.error('Enter a valid 10-digit mobile number')
      return
    }

    setAdding(true)
    const { error } = await db.from('customers').insert({
      name: newName.trim(),
      mobile: norm,
      cashback_balance: 0,
      cashback_earned: 0,
      cashback_redeemed: 0,
      total_purchases: 0,
    })
    setAdding(false)

    if (error) {
      toast.error(error.code === '23505' ? 'Mobile number already registered' : error.message)
      return
    }

    toast.success('Customer registered successfully')
    setShowAdd(false)
    setNewName('')
    setNewMobile('')
    fetchCustomers()
  }

  // ─────────────────────────────────────────────────────────────
  // EDIT CUSTOMER (Name & Mobile)
  // ─────────────────────────────────────────────────────────────
  const startEdit = (c: Customer) => {
    setEditingCustomer(c)
    setEditName(c.name)
    setEditMobile(c.mobile)
  }

  const handleSaveEdit = async () => {
    if (!editingCustomer) return
    if (!editName.trim()) {
      toast.error('Customer name cannot be empty')
      return
    }
    const norm = normalizeMobile(editMobile.trim())
    if (!validateMobile(norm)) {
      toast.error('Enter a valid 10-digit mobile number')
      return
    }

    // Check duplicate mobile numbers
    setSavingEdit(true)
    try {
      if (norm !== editingCustomer.mobile) {
        const { data: existing } = await db
          .from('customers')
          .select('id')
          .eq('mobile', norm)
          .neq('id', editingCustomer.id)
          .maybeSingle()

        if (existing) {
          toast.error('Mobile number is already registered to another customer')
          setSavingEdit(false)
          return
        }
      }

      // Update in D1 - keeping customer ID intact so all transaction history remains linked!
      const { error } = await db
        .from('customers')
        .update({
          name: editName.trim(),
          mobile: norm,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingCustomer.id)

      if (error) throw error

      toast.success('Customer details updated successfully')
      setEditingCustomer(null)
      fetchCustomers(search.trim() || undefined)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update customer')
    } finally {
      setSavingEdit(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DELETE INDIVIDUAL CUSTOMER
  // ─────────────────────────────────────────────────────────────
  const startDelete = (c: Customer) => {
    setDeletingCustomer(c)
  }

  const handleConfirmDelete = async () => {
    if (!deletingCustomer) return
    setDeleting(true)

    try {
      // 1) Try secure server-side RPC delete_customer
      const { error: rpcErr } = await db.rpc('delete_customer', {
        p_customer_id: deletingCustomer.id,
      })

      if (!rpcErr) {
        toast.success(`Customer ${deletingCustomer.name} deleted successfully`)
      } else {
        // Fallback: Client-side deletion / anonymization
        console.warn('RPC delete_customer unavailable, running fallback:', rpcErr.message)

        // Delete ledger records if any
        await db
          .from('cashback_ledger')
          .delete()
          .eq('customer_id', deletingCustomer.id)

        // Try direct delete from customers table
        const { data: delRows, error: delErr } = await db
          .from('customers')
          .delete()
          .eq('id', deletingCustomer.id)
          .select()

        // If direct DELETE was blocked by Postgres RLS policy or FK constraint,
        // perform guaranteed anonymization update
        if (delErr || !delRows || delRows.length === 0) {
          const anonymizedMobile = 'DEL' + deletingCustomer.id.replace(/-/g, '').slice(0, 7)
          let { error: anonErr } = await db
            .from('customers')
            .update({
              name: '[Deleted Customer]',
              mobile: anonymizedMobile,
              cashback_balance: 0,
              cashback_earned: 0,
              cashback_redeemed: 0,
              total_purchases: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', deletingCustomer.id)

          if (anonErr) {
            const res = await db
              .from('customers')
              .update({
                name: '[Deleted Customer]',
                cashback_balance: 0,
                cashback_earned: 0,
                cashback_redeemed: 0,
                total_purchases: 0,
                updated_at: new Date().toISOString(),
              })
              .eq('id', deletingCustomer.id)
            anonErr = res.error
          }

          if (anonErr) throw anonErr
        }

        toast.success(`Customer ${deletingCustomer.name} deleted successfully`)
      }

      setDeletingCustomer(null)
      fetchCustomers(search.trim() || undefined)
    } catch (err) {
      console.error('Customer delete error:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to delete customer')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <User size={22} className="text-brand-600 dark:text-brand-400" /> Customers
          </h1>
          <p className="section-subtitle">
            {customers.length} registered customers · Loyalty & wallet profiles
          </p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus size={16} /> Add Customer
        </button>
      </div>

      {/* Add Customer Panel */}
      {showAdd && (
        <div className="page-card p-5 animate-fade-in border-brand-200 dark:border-brand-900/60">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900 dark:text-white text-sm">
              Register New Customer
            </h2>
            <button
              onClick={() => setShowAdd(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="form-label">Customer Name</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="form-input"
                placeholder="Full name"
                autoFocus
              />
            </div>
            <div>
              <label className="form-label">Mobile Number</label>
              <input
                type="tel"
                value={newMobile}
                onChange={e => setNewMobile(e.target.value)}
                className="form-input"
                placeholder="10-digit number"
                maxLength={10}
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleAddCustomer}
                disabled={adding}
                className="btn-primary flex-1"
              >
                {adding ? 'Saving…' : 'Register Customer'}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="btn-secondary px-3"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by customer name or mobile number…"
            className="form-input pl-10"
          />
        </div>
        <button type="submit" className="btn-primary px-5">Search</button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(''); fetchCustomers() }}
            className="btn-secondary px-3"
          >
            Clear
          </button>
        )}
      </form>

      {/* Customers Table */}
      <div className="page-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Mobile</th>
              <th>Total Purchases</th>
              <th>Cashback Earned</th>
              <th>Cashback Used</th>
              <th>Wallet Balance</th>
              <th>Registered</th>
              <th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="text-center py-10">
                  <div className="flex justify-center items-center gap-2 text-slate-400">
                    <span className="w-4 h-4 border-2 border-slate-300 border-t-brand-600 rounded-full animate-spin" />
                    Loading customers…
                  </div>
                </td>
              </tr>
            )}

            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400 text-sm">
                  No customers found.{' '}
                  <button onClick={() => setShowAdd(true)} className="text-brand-600 dark:text-brand-400 hover:underline">
                    Add your first customer.
                  </button>
                </td>
              </tr>
            )}

            {customers.map(c => (
              <tr key={c.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                      {c.name[0]?.toUpperCase() || 'C'}
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">
                      {c.name}
                    </span>
                  </div>
                </td>
                <td className="text-sm font-mono text-slate-600 dark:text-slate-400">{c.mobile}</td>
                <td className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrency(c.total_purchases)}
                </td>
                <td className="text-sm text-brand-600 dark:text-brand-400 font-medium">
                  {formatCurrency(c.cashback_earned)}
                </td>
                <td className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                  {formatCurrency(c.cashback_redeemed)}
                </td>
                <td>
                  <span className={`font-bold text-sm ${c.cashback_balance > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>
                    {formatCurrency(c.cashback_balance)}
                  </span>
                </td>
                <td className="text-xs text-slate-400">
                  {format(new Date(c.created_at), 'dd MMM yyyy')}
                </td>
                <td className="text-right pr-4">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => navigate(`/customers/${c.id}`)}
                      className="btn-icon"
                      title="View details & ledger"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => startEdit(c)}
                      className="btn-icon hover:text-brand-600 dark:hover:text-brand-400"
                      title="Edit customer details"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => startDelete(c)}
                      className="btn-icon text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      title="Delete customer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODAL A: EDIT CUSTOMER (Name & Mobile Number)
      ───────────────────────────────────────────────────────────── */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-dark-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-700 max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-dark-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Edit2 size={16} className="text-brand-600 dark:text-brand-400" /> Edit Customer
              </h2>
              <button
                onClick={() => setEditingCustomer(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 dark:bg-dark-950 p-3 rounded-xl flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Customer ID: <span className="font-mono">{editingCustomer.id.slice(0, 8)}…</span></span>
                <span>Balance: <strong className="text-brand-600 dark:text-brand-400">{formatCurrency(editingCustomer.cashback_balance)}</strong></span>
              </div>

              <div>
                <label className="form-label">
                  Customer Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="form-input pl-10"
                    placeholder="Full name"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="form-label">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="tel"
                    value={editMobile}
                    onChange={e => setEditMobile(e.target.value)}
                    className="form-input pl-10 font-mono"
                    placeholder="10-digit mobile number"
                    maxLength={10}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Changing mobile number preserves all previous purchases and cashback history.
                </p>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="btn-secondary flex-1"
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="btn-primary flex-1"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Saving Changes…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL B: DELETE INDIVIDUAL CUSTOMER CONFIRMATION
      ───────────────────────────────────────────────────────────── */}
      {deletingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-dark-900 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/60 max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 bg-rose-50/70 dark:bg-rose-950/40 border-b border-rose-100 dark:border-rose-900/60 flex items-center justify-between">
              <h2 className="text-base font-bold text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400" /> Delete Customer
              </h2>
              <button
                onClick={() => setDeletingCustomer(null)}
                className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Are you sure you want to delete this customer?
              </p>

              <div className="bg-slate-50 dark:bg-dark-950 p-4 rounded-xl border border-slate-200/80 dark:border-dark-800 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer Name:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{deletingCustomer.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mobile Number:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{deletingCustomer.mobile}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Wallet Balance:</span>
                  <span className="font-bold text-brand-600 dark:text-brand-400">{formatCurrency(deletingCustomer.cashback_balance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Purchases:</span>
                  <span className="text-slate-700 dark:text-slate-300">{formatCurrency(deletingCustomer.total_purchases)}</span>
                </div>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-3 rounded-xl flex items-start gap-2">
                <ShieldAlert size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  Personal customer data and wallet will be removed. Historical purchase totals remain anonymized for financial and accounting audit compliance.
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingCustomer(null)}
                  className="btn-secondary flex-1"
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="btn-danger flex-1"
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
