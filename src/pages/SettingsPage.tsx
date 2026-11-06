import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Save, Plus, Trash2, GripVertical, KeyRound,
  AlertOctagon, AlertTriangle, ShieldCheck, Lock, CheckCircle2, X,
  QrCode, Monitor, Search
} from 'lucide-react'
import { db } from '@/lib/db'
import { useSettingsStore } from '@/store/settingsStore'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import type { ServiceCategory } from '@/types'

export default function SettingsPage() {
  const { settings, updateSettings } = useSettingsStore()
  const { user } = useAuthStore()

  const [form, setForm] = useState({
    shop_name: '', shop_address: '', contact_number: '',
    cashback_percentage: 2, minimum_eligible_purchase: 99,
    currency: 'INR', date_format: 'DD/MM/YYYY', time_format: '12h',
    merchant_upi_id: '7708481818@upi',
    merchant_display_name: 'Smart Cashback',
    qr_payment_method: 'standard_upi' as 'standard_upi' | 'payment_gateway',
    payment_expiry_seconds: 300,
    display_timeout_seconds: 5,
  })
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [catFilter, setCatFilter] = useState('')
  const [newCat, setNewCat] = useState('')
  const [saving, setSaving] = useState(false)
  const [pwdForm, setPwdForm] = useState({ newPwd: '', confirmPwd: '' })
  const [changingPwd, setChangingPwd] = useState(false)

  // ─────────────────────────────────────────────────────────────
  // DANGER ZONE STATE (Multi-step modal)
  // ─────────────────────────────────────────────────────────────
  const [showDangerModal, setShowDangerModal] = useState(false)
  const [dangerStep, setDangerStep] = useState<1 | 2 | 3 | 4>(1)
  const [typedPhrase, setTypedPhrase] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [authChecking, setAuthChecking] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)

  const REQUIRED_PHRASE = 'DELETE ALL CUSTOMER DATA'

  useEffect(() => {
    if (settings) {
      setForm({
        shop_name: settings.shop_name,
        shop_address: settings.shop_address,
        contact_number: settings.contact_number,
        cashback_percentage: settings.cashback_percentage,
        minimum_eligible_purchase: settings.minimum_eligible_purchase,
        currency: settings.currency,
        date_format: settings.date_format,
        time_format: settings.time_format,
        merchant_upi_id: settings.merchant_upi_id || '7708481818@upi',
        merchant_display_name: settings.merchant_display_name || settings.shop_name || 'Smart Cashback',
        qr_payment_method: settings.qr_payment_method || 'standard_upi',
        payment_expiry_seconds: settings.payment_expiry_seconds || 300,
        display_timeout_seconds: settings.display_timeout_seconds || 5,
      })
    }
  }, [settings])

  const fetchCategories = useCallback(async () => {
    const { data } = await db.from('service_categories').select('*').order('sort_order')
    setCategories((data as ServiceCategory[]) ?? [])
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const handleSaveSettings = async () => {
    if (!form.shop_name.trim()) {
      toast.error('Shop name is required')
      return
    }
    if (form.cashback_percentage < 0 || form.cashback_percentage > 100) {
      toast.error('Cashback % must be between 0 and 100')
      return
    }
    if (form.minimum_eligible_purchase < 0) {
      toast.error('Minimum purchase must be positive')
      return
    }

    setSaving(true)
    await updateSettings(form)
    setSaving(false)
    toast.success('Settings saved successfully')
  }

  const handleAddCategory = async () => {
    if (!newCat.trim()) return
    const sortOrder = categories.length
    const { error } = await db.from('service_categories').insert({
      name: newCat.trim(), is_active: true, sort_order: sortOrder,
    })
    if (error) {
      toast.error('Failed to add category: ' + error.message)
      return
    }
    toast.success('Category added')
    setNewCat('')
    fetchCategories()
  }

  const handleToggleCategory = async (cat: ServiceCategory) => {
    await db.from('service_categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    fetchCategories()
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category? This will not affect existing transactions.')) return
    await db.from('service_categories').delete().eq('id', id)
    fetchCategories()
    toast.success('Category removed')
  }

  const handleChangePassword = async () => {
    if (!pwdForm.newPwd) {
      toast.error('Enter a new password')
      return
    }
    if (pwdForm.newPwd !== pwdForm.confirmPwd) {
      toast.error('Passwords do not match')
      return
    }
    if (pwdForm.newPwd.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setChangingPwd(true)
    const { error } = await db.auth.updateUser({ password: pwdForm.newPwd })
    setChangingPwd(false)

    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Password updated successfully')
    setPwdForm({ newPwd: '', confirmPwd: '' })
  }

  // ─────────────────────────────────────────────────────────────
  // DANGER ZONE: BULK DELETE CUSTOMER DATA
  // ─────────────────────────────────────────────────────────────
  const openDangerZone = () => {
    setDangerStep(1)
    setTypedPhrase('')
    setAdminPassword('')
    setShowDangerModal(true)
  }

  const closeDangerZone = () => {
    setShowDangerModal(false)
    setDangerStep(1)
    setTypedPhrase('')
    setAdminPassword('')
  }

  // Verify Admin Password before proceeding to final step
  const handleVerifyPassword = async () => {
    if (!adminPassword) {
      toast.error('Please enter your administrator password')
      return
    }

    setAuthChecking(true)
    try {
      const email = user?.email || 'sivar75@gmail.com'
      const { error } = await db.auth.signInWithPassword({
        email,
        password: adminPassword,
      })

      if (error) {
        toast.error('Administrator authentication failed: incorrect password')
        setAuthChecking(false)
        return
      }

      setAuthChecking(false)
      setDangerStep(4) // Proceed to final confirmation
    } catch {
      toast.error('Authentication verification error')
      setAuthChecking(false)
    }
  }

  // Execute bulk deletion
  const handleExecuteBulkDeletion = async () => {
    setIsDeletingAll(true)
    try {
      // 1) Try secure server-side RPC
      const { data: rpcData, error: rpcErr } = await db.rpc('delete_all_customers')

      if (!rpcErr) {
        console.log('Bulk deletion RPC result:', rpcData)
        toast.success('All customer data has been deleted and anonymized.')
      } else {
        // Fallback: Delete ledger, anonymize customers with transactions, delete zero-tx customers
        console.warn('RPC not present, executing client fallback:', rpcErr.message)

        // Delete all ledger records
        await db.from('cashback_ledger').delete().neq('id', '00000000-0000-0000-0000-000000000000')

        // Get customers with transactions
        const { data: txs } = await db.from('transactions').select('customer_id')
        const referencedCustIds = new Set((txs || []).map((t: any) => t.customer_id))

        // Fetch all customers
        const { data: allCusts } = await db.from('customers').select('id')

        for (const c of ((allCusts as any[]) || [])) {
          let deleted = false
          if (!referencedCustIds.has(c.id)) {
            const { data: delData } = await db.from('customers').delete().eq('id', c.id).select()
            if (delData && delData.length > 0) {
              deleted = true
            }
          }

          if (!deleted) {
            // Anonymize personal info and zero out wallet
            const anonymizedMobile = 'DEL' + c.id.replace(/-/g, '').slice(0, 7)
            const { error: anonErr } = await db.from('customers').update({
              name: '[Deleted Customer]',
              mobile: anonymizedMobile,
              cashback_balance: 0,
              cashback_earned: 0,
              cashback_redeemed: 0,
              total_purchases: 0,
              updated_at: new Date().toISOString(),
            }).eq('id', c.id)

            if (anonErr) {
              await db.from('customers').update({
                name: '[Deleted Customer]',
                cashback_balance: 0,
                cashback_earned: 0,
                cashback_redeemed: 0,
                total_purchases: 0,
                updated_at: new Date().toISOString(),
              }).eq('id', c.id)
            }
          }
        }

        toast.success('All customer data has been deleted and anonymized.')
      }

      closeDangerZone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete customer data')
    } finally {
      setIsDeletingAll(false)
    }
  }

  return (
    <div className="space-y-8 max-w-2xl pb-12">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Settings size={22} className="text-brand-600 dark:text-brand-400" /> Settings
        </h1>
        <p className="section-subtitle">
          Manage shop configuration, categories, account security, and data policies
        </p>
      </div>

      {/* ── Shop Settings ── */}
      <div className="page-card p-6 space-y-5">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
          Shop Information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="form-label">Shop Name <span className="text-rose-500">*</span></label>
            <input
              type="text"
              value={form.shop_name}
              onChange={e => setForm(f => ({ ...f, shop_name: e.target.value }))}
              className="form-input"
              placeholder="Your Shop Name"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">Shop Address</label>
            <input
              type="text"
              value={form.shop_address}
              onChange={e => setForm(f => ({ ...f, shop_address: e.target.value }))}
              className="form-input"
              placeholder="Full address"
            />
          </div>
          <div>
            <label className="form-label">Contact Number</label>
            <input
              type="tel"
              value={form.contact_number}
              onChange={e => setForm(f => ({ ...f, contact_number: e.target.value }))}
              className="form-input"
              placeholder="Phone number"
            />
          </div>
          <div>
            <label className="form-label">Currency</label>
            <select
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className="form-input"
            >
              <option value="INR">INR (₹)</option>
            </select>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-dark-800 pt-5">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide mb-4">
            Cashback Rules
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Cashback Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.cashback_percentage}
                onChange={e => setForm(f => ({ ...f, cashback_percentage: parseFloat(e.target.value) || 0 }))}
                className="form-input"
              />
              <p className="text-xs text-slate-400 mt-1">Currently: {form.cashback_percentage}% per ₹100</p>
            </div>
            <div>
              <label className="form-label">Minimum Eligible Purchase (₹)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.minimum_eligible_purchase}
                onChange={e => setForm(f => ({ ...f, minimum_eligible_purchase: parseFloat(e.target.value) || 0 }))}
                className="form-input"
              />
              <p className="text-xs text-slate-400 mt-1">Bills below ₹{form.minimum_eligible_purchase} earn no cashback</p>
            </div>
          </div>
        </div>

        {/* ── UPI Payment Settings & Dual Display ── */}
        <div className="border-t border-slate-100 dark:border-dark-800 pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <QrCode size={18} className="text-brand-600 dark:text-brand-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
              UPI Payment & Customer Display Settings
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">
                Merchant UPI ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={form.merchant_upi_id}
                onChange={e => setForm(f => ({ ...f, merchant_upi_id: e.target.value.trim() }))}
                placeholder="e.g. 7708481818@upi"
                className="form-input font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">Configured payee UPI VPA for customer QR payments</p>
            </div>

            <div>
              <label className="form-label">Merchant Display Name</label>
              <input
                type="text"
                value={form.merchant_display_name}
                onChange={e => setForm(f => ({ ...f, merchant_display_name: e.target.value }))}
                placeholder="e.g. Smart Cashback Shop"
                className="form-input"
              />
              <p className="text-xs text-slate-400 mt-1">Displayed in customer UPI apps and QR request</p>
            </div>

            <div>
              <label className="form-label">QR Payment Method</label>
              <select
                value={form.qr_payment_method}
                onChange={e => setForm(f => ({ ...f, qr_payment_method: e.target.value as any }))}
                className="form-input"
              >
                <option value="standard_upi">Standard NPCI UPI QR (Direct to Bank)</option>
                <option value="payment_gateway">Payment Gateway (Webhook verified)</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">NPCI standard dynamic deep link URI</p>
            </div>

            <div>
              <label className="form-label">Payment Expiry Duration (seconds)</label>
              <input
                type="number"
                min="60"
                step="30"
                value={form.payment_expiry_seconds}
                onChange={e => setForm(f => ({ ...f, payment_expiry_seconds: parseInt(e.target.value) || 300 }))}
                className="form-input"
              />
              <p className="text-xs text-slate-400 mt-1">Validity window for dynamic QR codes (default: 300s)</p>
            </div>

            <div className="sm:col-span-2">
              <label className="form-label">Customer Display Auto-Reset Delay (seconds)</label>
              <input
                type="number"
                min="2"
                max="30"
                step="1"
                value={form.display_timeout_seconds}
                onChange={e => setForm(f => ({ ...f, display_timeout_seconds: parseInt(e.target.value) || 5 }))}
                className="form-input"
              />
              <p className="text-xs text-slate-400 mt-1">
                Delay after transaction completion before returning to Welcome screen (default: 5s)
              </p>
            </div>
          </div>
        </div>

        <button onClick={handleSaveSettings} disabled={saving} className="btn-primary w-full sm:w-auto">
          <Save size={16} />
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* ── Service Categories ── */}
      <div className="page-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
              Service Categories ({categories.length} total)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Supports 100+ menu and service items with instant search
            </p>
          </div>
          {categories.length > 5 && (
            <div className="relative w-48 sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter categories…"
                value={catFilter}
                onChange={e => setCatFilter(e.target.value)}
                className="form-input pl-8 text-xs py-1"
              />
            </div>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          {categories
            .filter(c => !catFilter.trim() || c.name.toLowerCase().includes(catFilter.toLowerCase()))
            .map(cat => (
              <div
                key={cat.id}
                className="flex items-center gap-3 py-2 px-3 rounded-xl border border-slate-100 dark:border-dark-800 hover:border-slate-200 dark:hover:border-dark-700 bg-white dark:bg-dark-900 transition-colors"
              >
                <GripVertical size={14} className="text-slate-300 dark:text-dark-600 flex-shrink-0" />
                <span className={`flex-1 text-sm font-medium ${cat.is_active ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 line-through'}`}>
                  {cat.name}
                </span>
                <button
                  onClick={() => handleToggleCategory(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    cat.is_active
                      ? 'bg-brand-50 dark:bg-brand-950/70 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800'
                      : 'bg-slate-100 dark:bg-dark-800 text-slate-500'
                  }`}
                >
                  {cat.is_active ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="btn-icon text-rose-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>

        <div className="flex gap-2 pt-2">
          <input
            type="text"
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
            placeholder="Add new service or menu category name…"
            className="form-input flex-1"
          />
          <button onClick={handleAddCategory} className="btn-primary px-4">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* ── Change Password ── */}
      <div className="page-card p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
          <KeyRound size={14} className="text-brand-600 dark:text-brand-400" /> Change Administrator Password
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">New Password</label>
            <input
              type="password"
              value={pwdForm.newPwd}
              onChange={e => setPwdForm(f => ({ ...f, newPwd: e.target.value }))}
              className="form-input"
              placeholder="Min. 8 characters"
              minLength={8}
            />
          </div>
          <div>
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              value={pwdForm.confirmPwd}
              onChange={e => setPwdForm(f => ({ ...f, confirmPwd: e.target.value }))}
              className="form-input"
              placeholder="Repeat new password"
            />
          </div>
        </div>
        <button onClick={handleChangePassword} disabled={changingPwd} className="btn-primary">
          {changingPwd ? 'Updating…' : 'Update Password'}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          DANGER ZONE – CUSTOMER DATA MANAGEMENT
      ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border-2 border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-6 space-y-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
            <AlertOctagon size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold text-rose-900 dark:text-rose-200">
              Danger Zone – Customer Data Management
            </h2>
            <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-1 leading-relaxed">
              Permanently purge customer records, mobile numbers, and wallet balances from the system.
              Shop configuration, services, and admin accounts are never touched.
            </p>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={openDangerZone}
            className="btn-danger w-full sm:w-auto font-bold tracking-wide"
          >
            DELETE ALL CUSTOMER DATA
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MULTI-STEP DANGER ZONE MODAL
      ───────────────────────────────────────────────────────────── */}
      {showDangerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-dark-900 rounded-3xl shadow-2xl border border-rose-200 dark:border-rose-900/70 max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-rose-50/80 dark:bg-rose-950/50 border-b border-rose-100 dark:border-rose-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle size={20} className="text-rose-600 dark:text-rose-400" />
                <h3 className="text-base font-bold text-rose-950 dark:text-rose-200">
                  Delete All Customer Data
                </h3>
              </div>
              <button
                type="button"
                onClick={closeDangerZone}
                className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Step indicator */}
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>Step {dangerStep} of 4</span>
                <span className="text-rose-600 dark:text-rose-400">
                  {dangerStep === 1 && 'Impact Assessment'}
                  {dangerStep === 2 && 'Phrase Confirmation'}
                  {dangerStep === 3 && 'Admin Re-Authentication'}
                  {dangerStep === 4 && 'Final Authorization'}
                </span>
              </div>

              {/* STEP 1: WARNING & SCOPE */}
              {dangerStep === 1 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="p-4 bg-rose-100/70 dark:bg-rose-950/80 rounded-2xl border border-rose-200 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200 leading-relaxed font-medium">
                    ⚠️ <strong>WARNING:</strong> This action will permanently remove all customer records and associated customer-related information. This operation cannot be undone.
                  </div>

                  <div className="space-y-2 text-xs">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">What will be removed:</p>
                    <ul className="list-disc pl-5 text-slate-600 dark:text-slate-400 space-y-1">
                      <li>All customer names, mobile numbers, and records</li>
                      <li>All customer wallet balances and cashback accounts</li>
                      <li>Customer cashback reward ledger entries</li>
                    </ul>

                    <p className="font-semibold text-slate-700 dark:text-slate-300 pt-2">What is strictly preserved:</p>
                    <ul className="list-disc pl-5 text-brand-700 dark:text-brand-300 space-y-1">
                      <li>Administrator credentials & login access</li>
                      <li>Shop settings & cashback rules</li>
                      <li>Service categories & POS configurations</li>
                      <li>Historical accounting transaction totals (fully anonymized)</li>
                    </ul>
                  </div>

                  <div className="flex gap-3 pt-3">
                    <button type="button" onClick={closeDangerZone} className="btn-secondary flex-1">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => setDangerStep(2)}
                      className="btn-danger flex-1"
                    >
                      I Understand, Proceed →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: REQUIRED PHRASE MATCH */}
              {dangerStep === 2 && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    To prevent accidental deletion, please type the following confirmation phrase in uppercase:
                  </p>

                  <div className="p-3 bg-slate-100 dark:bg-dark-950 rounded-xl font-mono text-center font-bold text-rose-600 dark:text-rose-400 text-sm tracking-wider select-all border border-slate-200 dark:border-dark-800">
                    {REQUIRED_PHRASE}
                  </div>

                  <div>
                    <input
                      type="text"
                      value={typedPhrase}
                      onChange={e => setTypedPhrase(e.target.value)}
                      placeholder="Type confirmation phrase here"
                      className="form-input font-mono text-sm tracking-wider"
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setDangerStep(1)} className="btn-secondary flex-1">
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={typedPhrase !== REQUIRED_PHRASE}
                      onClick={() => setDangerStep(3)}
                      className="btn-danger flex-1"
                    >
                      Verify Phrase →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: ADMINISTRATOR RE-AUTHENTICATION */}
              {dangerStep === 3 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                    <Lock size={16} className="text-brand-600 dark:text-brand-400" />
                    Administrator Re-Authentication
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Confirm your administrator password for <strong>{user?.email || 'sivar75@gmail.com'}</strong> to proceed.
                  </p>

                  <div>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      placeholder="Administrator Password"
                      className="form-input"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleVerifyPassword()}
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setDangerStep(2)} className="btn-secondary flex-1">
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={!adminPassword || authChecking}
                      onClick={handleVerifyPassword}
                      className="btn-primary flex-1"
                    >
                      {authChecking ? 'Verifying…' : 'Authenticate →'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: FINAL EXECUTION */}
              {dangerStep === 4 && (
                <div className="space-y-4 animate-fade-in text-center">
                  <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-inner">
                    <ShieldCheck size={36} />
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">
                      Final Authorization
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                      Administrator identity verified. Click below to permanently purge all customer data from the database.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-3">
                    <button
                      type="button"
                      onClick={closeDangerZone}
                      className="btn-secondary flex-1"
                      disabled={isDeletingAll}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteBulkDeletion}
                      disabled={isDeletingAll}
                      className="btn-danger flex-1 py-3 text-sm font-bold tracking-wide shadow-lg shadow-rose-600/30"
                    >
                      {isDeletingAll ? 'Executing Deletion…' : 'PURGE ALL CUSTOMER DATA NOW'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
