import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, CheckCircle, Phone, ShoppingBag,
  Wallet, Calculator, Receipt, RefreshCw,
  UserPlus, Plus, QrCode, Banknote, CreditCard,
  Monitor, MonitorOff
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { calculateCashback, formatCurrency, validateMobile, normalizeMobile } from '@/lib/cashback'
import { useSettingsStore } from '@/store/settingsStore'
import { useDisplayStore, type PaymentMethod } from '@/store/displayStore'
import { buildUPILink, generateQRCodeURL, SHOP_UPI_CONFIG } from '@/lib/upi'
import { QRCodeSVG } from 'qrcode.react'
import { sendNotification } from '@/lib/notifications'
import toast from 'react-hot-toast'
import type { Customer, ServiceCategory } from '@/types'

type Step = 'mobile' | 'customer' | 'billing' | 'payment' | 'confirm' | 'done'

interface BillSummary {
  billAmount: number
  cashbackToRedeem: number
  amountPaid: number
  cashbackEarned: number
  newBalance: number
}

export default function BillingPage() {
  const { settings } = useSettingsStore()
  const navigate = useNavigate()

  // Step & Customer State
  const [step, setStep] = useState<Step>('mobile')
  const [mobile, setMobile] = useState('')
  const [mobileError, setMobileError] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [newName, setNewName] = useState('')

  // Prefix Autocomplete (Clean & Fast)
  const [suggestions, setSuggestions] = useState<Customer[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Billing inputs
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [serviceCategory, setServiceCategory] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [cashbackToRedeem, setCashbackToRedeem] = useState('')
  const [userEditedRedeem, setUserEditedRedeem] = useState(false)
  const [notes, setNotes] = useState('')

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')

  // Customer display
  const { broadcast, resetDisplay } = useDisplayStore()
  const [displayActive, setDisplayActive] = useState(false)

  // Confirmation & Save
  const [summary, setSummary] = useState<BillSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastSavedTxId, setLastSavedTxId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('service_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        const cats = (data as ServiceCategory[]) ?? []
        setCategories(cats)
        if (cats.length > 0) setServiceCategory(cats[0].name)
      })
  }, [])

  // ─────────────────────────────────────────────────────────────
  // PREFIX SEARCH: strictly prefix matching (e.g. 944 -> 944%)
  // ─────────────────────────────────────────────────────────────
  const fetchPrefixSuggestions = useCallback(async (query: string) => {
    const cleanPrefix = query.replace(/\D/g, '').slice(0, 10)
    if (!cleanPrefix || cleanPrefix.length < 1) {
      setSuggestions([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .like('mobile', `${cleanPrefix}%`)
        .not('name', 'eq', '[Deleted Customer]')
        .not('mobile', 'like', 'DEL%')
        .order('mobile')
        .limit(8)

      if (error) {
        setSuggestions([])
        setHighlightedIndex(-1)
      } else {
        const unique = (data as Customer[] || []).filter(
          (c, idx, arr) => arr.findIndex(item => item.id === c.id) === idx
        )
        setSuggestions(unique)
        setHighlightedIndex(unique.length > 0 ? 0 : -1)
        setShowSuggestions(true)
      }
    } catch {
      setSuggestions([])
      setHighlightedIndex(-1)
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleMobileChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 10)
    setMobile(clean)
    setMobileError('')

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    if (clean.length >= 1) {
      searchDebounceRef.current = setTimeout(() => {
        fetchPrefixSuggestions(clean)
      }, 120)
    } else {
      setSuggestions([])
      setHighlightedIndex(-1)
      setShowSuggestions(false)
    }
  }

  const handleSelectCustomer = (selected: Customer) => {
    setCustomer(selected)
    setMobile(selected.mobile)
    setSuggestions([])
    setHighlightedIndex(-1)
    setShowSuggestions(false)
    setIsNewCustomer(false)
    setStep('billing')

    setBillAmount('')
    setCashbackToRedeem('')
    setUserEditedRedeem(false)
    setNotes('')
    setSummary(null)
  }

  const handleMobileSearch = useCallback(async () => {
    const norm = normalizeMobile(mobile.trim())
    if (!validateMobile(norm)) {
      setMobileError('Enter a valid 10-digit mobile number')
      return
    }
    setMobileError('')
    setShowSuggestions(false)

    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('mobile', norm)
      .not('name', 'eq', '[Deleted Customer]')
      .not('mobile', 'like', 'DEL%')
      .maybeSingle()

    if (data) {
      handleSelectCustomer(data as Customer)
    } else {
      setCustomer(null)
      setIsNewCustomer(true)
      setStep('customer')
    }
  }, [mobile])

  const handleRegisterCustomer = async () => {
    if (!newName.trim()) {
      toast.error('Please enter customer name')
      return
    }
    const norm = normalizeMobile(mobile.trim())
    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: newName.trim(),
        mobile: norm,
        cashback_balance: 0,
        cashback_earned: 0,
        cashback_redeemed: 0,
        total_purchases: 0,
      })
      .select()
      .single()

    if (error) {
      toast.error('Failed to register customer: ' + error.message)
      return
    }

    toast.success('Customer registered successfully!')
    handleSelectCustomer(data as Customer)
  }

  // ─────────────────────────────────────────────────────────────
  // CASHBACK REDEMPTION: AUTO-SELECT MAXIMUM ELIGIBLE AMOUNT
  // ─────────────────────────────────────────────────────────────
  const availableBalance = customer?.cashback_balance ?? 0
  const billNum = parseFloat(billAmount) || 0
  const maxRedeemable = Math.max(0, Math.min(billNum, availableBalance))

  const handleBillAmountChange = (val: string) => {
    setBillAmount(val)
    const newBill = parseFloat(val) || 0
    const newMax = Math.max(0, Math.min(newBill, availableBalance))

    if (!userEditedRedeem) {
      setCashbackToRedeem(newMax > 0 ? newMax.toString() : '0')
    } else {
      const currentRedeem = parseFloat(cashbackToRedeem) || 0
      if (currentRedeem > newMax) {
        setCashbackToRedeem(newMax > 0 ? newMax.toString() : '0')
      }
    }
  }

  const handleRedeemChange = (val: string) => {
    setUserEditedRedeem(true)
    if (val === '') {
      setCashbackToRedeem('')
      return
    }
    const num = parseFloat(val)
    if (isNaN(num)) return

    if (num > maxRedeemable) {
      setCashbackToRedeem(maxRedeemable.toString())
      toast(`Redemption capped at maximum eligible ₹${maxRedeemable.toFixed(2)}`, { icon: 'ℹ️' })
    } else if (num < 0) {
      setCashbackToRedeem('0')
    } else {
      setCashbackToRedeem(val)
    }
  }

  const handleUseMaxRedemption = () => {
    setUserEditedRedeem(false)
    setCashbackToRedeem(maxRedeemable > 0 ? maxRedeemable.toString() : '0')
  }

  const handleClearRedemption = () => {
    setUserEditedRedeem(true)
    setCashbackToRedeem('0')
  }

  const currentRedeemNum = Math.min(maxRedeemable, Math.max(0, parseFloat(cashbackToRedeem) || 0))
  const liveAmountPaid = Math.max(0, billNum - currentRedeemNum)
  const minEligible = settings?.minimum_eligible_purchase ?? 99
  const cbPct = settings?.cashback_percentage ?? 2
  const liveCashbackEarned = billNum >= minEligible ? Math.round(liveAmountPaid * cbPct) / 100 : 0
  const liveProjectedBalance = availableBalance - currentRedeemNum + liveCashbackEarned

  // Real-time broadcast to customer display during billing input
  useEffect(() => {
    if (displayActive && step === 'billing' && customer) {
      broadcast({
        mode: 'billing',
        customerName: customer.name,
        customerMobile: customer.mobile,
        shopName: settings?.shop_name ?? 'Smart Cashback Shop',
        serviceCategory,
        billAmount: billNum,
        cashbackRedeemed: currentRedeemNum,
        amountPayable: liveAmountPaid,
        cashbackEarned: liveCashbackEarned,
        newWalletBalance: liveProjectedBalance,
        cashbackPercentage: cbPct,
      })
    }
  }, [
    displayActive,
    step,
    customer,
    serviceCategory,
    billNum,
    currentRedeemNum,
    liveAmountPaid,
    liveCashbackEarned,
    liveProjectedBalance,
    cbPct,
    settings?.shop_name,
    broadcast,
  ])

  const handleCalculate = () => {
    if (isNaN(billNum) || billNum <= 0) {
      toast.error('Enter a valid bill amount greater than zero')
      return
    }

    const result = calculateCashback({
      billAmount: billNum,
      cashbackToRedeem: currentRedeemNum,
      availableBalance: customer?.cashback_balance ?? 0,
      cashbackPercentage: cbPct,
      minimumEligiblePurchase: minEligible,
    })

    if (result.error) {
      toast.error(result.error)
      return
    }

    setSummary(result)
    setStep('payment')

    // Broadcast billing info to customer display
    if (displayActive) {
      broadcast({
        mode: 'billing',
        customerName: customer?.name ?? '',
        customerMobile: customer?.mobile ?? '',
        shopName: settings?.shop_name ?? 'Smart Cashback Shop',
        serviceCategory,
        billAmount: result.billAmount,
        cashbackRedeemed: result.cashbackToRedeem,
        amountPayable: result.amountPaid,
        cashbackEarned: result.cashbackEarned,
        newWalletBalance: result.newBalance,
        cashbackPercentage: cbPct,
        paymentMethod: null,
        upiLink: null,
        upiQRUrl: null,
        transactionId: null,
      })
    }
  }

  // ─── Payment Method Selection & QR Generation ──────────────────────
  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method)

    if (displayActive && summary && customer) {
      let upiLink: string | null = null
      let upiQRUrl: string | null = null

      if (method === 'upi') {
        upiLink = buildUPILink({
          payeeVPA: SHOP_UPI_CONFIG.payeeVPA,
          payeeName: settings?.shop_name ?? SHOP_UPI_CONFIG.payeeName,
          amount: summary.amountPaid,
          transactionNote: `Bill - ${customer.name} - ${serviceCategory}`,
        })
        upiQRUrl = generateQRCodeURL(upiLink, 300)
      }

      broadcast({
        mode: 'payment-pending',
        paymentMethod: method,
        upiLink,
        upiQRUrl,
      })
    }
  }

  const handleProceedToConfirm = () => {
    if (!summary) return

    // Generate UPI link if payment method is UPI
    let upiLink: string | null = null
    let upiQRUrl: string | null = null

    if (paymentMethod === 'upi' && customer) {
      upiLink = buildUPILink({
        payeeVPA: SHOP_UPI_CONFIG.payeeVPA,
        payeeName: settings?.shop_name ?? SHOP_UPI_CONFIG.payeeName,
        amount: summary.amountPaid,
        transactionNote: `Bill - ${customer.name} - ${serviceCategory}`,
      })
      upiQRUrl = generateQRCodeURL(upiLink, 300)
    }

    // Broadcast payment pending to customer display
    if (displayActive) {
      broadcast({
        mode: 'payment-pending',
        paymentMethod,
        upiLink,
        upiQRUrl,
      })
    }

    setStep('confirm')
  }

  // ─────────────────────────────────────────────────────────────
  // TRANSACTION SUBMISSION: Unique key per bill & Immediate refresh
  // ─────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!customer || !summary || saving) return
    setSaving(true)

    try {
      const transactionKey = `tx_${Date.now()}_${crypto.randomUUID()}`

      const { data, error } = await supabase.rpc('process_billing', {
        p_customer_id: customer.id,
        p_service_category: serviceCategory,
        p_bill_amount: summary.billAmount,
        p_cashback_redeemed: summary.cashbackToRedeem,
        p_amount_paid: summary.amountPaid,
        p_cashback_earned: summary.cashbackEarned,
        p_notes: notes.trim() || null,
        p_idempotency_key: transactionKey,
      })

      if (error) throw new Error(error.message)

      setLastSavedTxId(data as string)

      // Broadcast payment success to customer display
      if (displayActive) {
        broadcast({
          mode: 'payment-success',
          transactionId: data as string,
        })

        // Auto-switch to thank you after 5 seconds
        setTimeout(() => {
          broadcast({ mode: 'thank-you' })
        }, 5000)
      }

      await sendNotification({
        event: 'cashback_earned',
        customerId: customer.id,
        customerName: customer.name,
        mobile: customer.mobile,
        data: {
          earned: summary.cashbackEarned.toFixed(2),
          balance: summary.newBalance.toFixed(2),
        },
      })

      const { data: updatedCustomer } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customer.id)
        .single()

      if (updatedCustomer) {
        setCustomer(updatedCustomer as Customer)

        // Update customer display with real wallet balance
        if (displayActive) {
          broadcast({
            newWalletBalance: (updatedCustomer as Customer).cashback_balance,
          })
        }
      }

      setStep('done')
      toast.success('Bill saved successfully!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save transaction')
    } finally {
      setSaving(false)
    }
  }

  const resetBilling = () => {
    setStep('mobile')
    setMobile('')
    setCustomer(null)
    setIsNewCustomer(false)
    setNewName('')
    setBillAmount('')
    setCashbackToRedeem('')
    setUserEditedRedeem(false)
    setNotes('')
    setSummary(null)
    setSuggestions([])
    setShowSuggestions(false)
    setLastSavedTxId(null)
    setPaymentMethod('cash')

    // Reset customer display
    if (displayActive) {
      resetDisplay()
    }
  }

  const handleBillSameCustomerAgain = () => {
    setBillAmount('')
    setCashbackToRedeem('')
    setUserEditedRedeem(false)
    setNotes('')
    setSummary(null)
    setStep('billing')
  }

  const stepLabels: Step[] = ['mobile', 'customer', 'billing', 'payment', 'confirm', 'done']
  const stepDisplay = ['Search', 'Register', 'Billing', 'Payment', 'Review', 'Saved']

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Receipt size={22} className="text-brand-600 dark:text-brand-400" /> New Bill
          </h1>
          <p className="section-subtitle">Point of Sale</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Customer Display Toggle */}
          <button
            onClick={() => {
              setDisplayActive(!displayActive)
              if (!displayActive) {
                window.open('/customer-display', 'customer-display', 'popup,width=1024,height=768')
                toast.success('Customer display opened! Drag to second monitor.')
              } else {
                resetDisplay()
                toast('Customer display disconnected', { icon: '📺' })
              }
            }}
            className={`text-xs flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold transition-all ${
              displayActive
                ? 'bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800'
                : 'btn-secondary'
            }`}
            title={displayActive ? 'Disconnect customer display' : 'Open customer-facing display'}
          >
            {displayActive ? <Monitor size={14} /> : <MonitorOff size={14} />}
            {displayActive ? 'Display On' : 'Display'}
          </button>
          <button onClick={resetBilling} className="btn-secondary text-xs flex items-center gap-1.5">
            <RefreshCw size={14} /> Reset Form
          </button>
        </div>
      </div>

      {/* Progress Indicators */}
      <div className="flex items-center gap-2">
        {stepLabels.map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                step === s
                  ? 'bg-brand-600 dark:bg-brand-500 text-white ring-4 ring-brand-100 dark:ring-brand-950/70 shadow-sm'
                  : stepLabels.indexOf(step) > i
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 dark:bg-dark-800 text-slate-400 dark:text-slate-500'
              }`}
            >
              {stepLabels.indexOf(step) > i ? '✓' : i + 1}
            </div>
            <span
              className={`text-xs font-medium hidden sm:block ${
                step === s
                  ? 'text-brand-700 dark:text-brand-300 font-semibold'
                  : stepLabels.indexOf(step) > i
                  ? 'text-slate-600 dark:text-slate-400'
                  : 'text-slate-300 dark:text-dark-600'
              }`}
            >
              {stepDisplay[i]}
            </span>
            {i < stepLabels.length - 1 && (
              <div
                className={`flex-1 h-0.5 ${
                  stepLabels.indexOf(step) > i
                    ? 'bg-brand-400 dark:bg-brand-600'
                    : 'bg-slate-200 dark:bg-dark-800'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="page-card p-6 space-y-5 !overflow-visible">
        {/* ── Step 1: Clean Mobile Number Search (Strictly placeholder "Enter 10-digit mobile number") ── */}
        {step === 'mobile' && (
          <div className="space-y-4 animate-fade-in">
            <div className="relative">
              <label htmlFor="billing-mobile" className="form-label">
                Customer Mobile Number
              </label>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    id="billing-mobile"
                    type="tel"
                    value={mobile}
                    onChange={e => handleMobileChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        if (suggestions.length > 0) {
                          setShowSuggestions(true)
                          setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0))
                        }
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        if (suggestions.length > 0) {
                          setShowSuggestions(true)
                          setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1))
                        }
                      } else if (e.key === 'Escape') {
                        setShowSuggestions(false)
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        if (showSuggestions && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                          handleSelectCustomer(suggestions[highlightedIndex])
                        } else if (suggestions.length > 0 && showSuggestions) {
                          handleSelectCustomer(suggestions[0])
                        } else {
                          handleMobileSearch()
                        }
                      }
                    }}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true)
                    }}
                    placeholder="Enter 10-digit mobile number"
                    className={`form-input text-lg tracking-wider font-medium ${
                      mobileError ? 'border-rose-400 dark:border-rose-500' : ''
                    }`}
                    maxLength={10}
                    autoFocus
                    autoComplete="off"
                  />
                  {isSearching && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                      <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin inline-block" />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleMobileSearch}
                  className="btn-primary px-5 flex items-center gap-1.5"
                >
                  <Search size={16} /> Search
                </button>
              </div>

              {mobileError && <p className="form-error">{mobileError}</p>}

              {/* Autocomplete Dropdown (Clean, prefix-only suggestions, no clipping) */}
              {showSuggestions && mobile.length >= 1 && (
                <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-dark-800">
                  {suggestions.length > 0 ? (
                    <div className="max-h-72 overflow-y-auto">
                      {suggestions.map((cust, idx) => {
                        const isHighlighted = idx === highlightedIndex
                        return (
                          <div
                            key={cust.id}
                            onClick={() => handleSelectCustomer(cust)}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            className={`px-4 py-3 cursor-pointer transition-colors flex items-center justify-between group ${
                              isHighlighted
                                ? 'bg-brand-50/80 dark:bg-brand-950/60'
                                : 'hover:bg-slate-50 dark:hover:bg-dark-800/80'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center transition-colors ${
                                  isHighlighted
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300'
                                }`}
                              >
                                {cust.name[0]?.toUpperCase() || 'C'}
                              </div>
                              <div>
                                <p
                                  className={`font-semibold text-sm ${
                                    isHighlighted
                                      ? 'text-brand-700 dark:text-brand-300'
                                      : 'text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400'
                                  }`}
                                >
                                  {cust.name}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                  {cust.mobile}
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                                Wallet
                              </span>
                              <span className="text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/60 px-2 py-0.5 rounded-full">
                                {formatCurrency(cust.cashback_balance)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No customer found for <strong>{mobile}</strong>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSuggestions(false)
                          setIsNewCustomer(true)
                          setStep('customer')
                        }}
                        className="mt-2 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                      >
                        <UserPlus size={14} /> Register new customer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: New Customer Registration ── */}
        {step === 'customer' && isNewCustomer && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-semibold text-slate-900 dark:text-white text-base">
              Register New Customer
            </h2>
            <div className="bg-brand-50/70 dark:bg-brand-950/50 border border-brand-100 dark:border-brand-900/60 rounded-xl p-3.5 text-sm text-brand-800 dark:text-brand-300">
              New customer for mobile number <strong>{normalizeMobile(mobile)}</strong>.
            </div>
            <div>
              <label htmlFor="new-customer-name" className="form-label">
                Customer Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="new-customer-name"
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRegisterCustomer()}
                placeholder="Full name"
                className="form-input"
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('mobile')}
                className="btn-secondary flex-1"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleRegisterCustomer}
                className="btn-primary flex-1"
              >
                Register & Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Billing & Auto Maximum Cashback ── */}
        {step === 'billing' && customer && (
          <div className="space-y-5 animate-fade-in">
            {/* Customer Banner */}
            <div className="bg-slate-50 dark:bg-dark-950/80 border border-slate-200/80 dark:border-dark-800 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-950/80 border border-brand-200/60 dark:border-brand-800 text-brand-800 dark:text-brand-300 flex items-center justify-center flex-shrink-0 font-bold text-base">
                  {customer.name[0]?.toUpperCase() || 'C'}
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-sm">{customer.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{customer.mobile}</p>
                </div>
              </div>

              <div className="text-right flex-shrink-0 bg-white dark:bg-dark-900 px-3.5 py-1.5 rounded-xl border border-slate-200/60 dark:border-dark-700 shadow-sm">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Available Wallet</p>
                <p className="text-base font-extrabold text-brand-600 dark:text-brand-400">
                  {formatCurrency(customer.cashback_balance)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="service-cat" className="form-label">
                  Service Category
                </label>
                <select
                  id="service-cat"
                  value={serviceCategory}
                  onChange={e => setServiceCategory(e.target.value)}
                  className="form-input"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="bill-amount" className="form-label">
                  Bill Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="bill-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={billAmount}
                  onChange={e => handleBillAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="form-input text-lg font-semibold"
                  autoFocus
                />
              </div>

              {/* Auto-selected Maximum Redemption */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="cashback-redeem" className="form-label mb-0">
                    Redeem Cashback (₹)
                  </label>
                  {customer.cashback_balance > 0 && billNum > 0 && (
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        type="button"
                        onClick={handleUseMaxRedemption}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          !userEditedRedeem || currentRedeemNum === maxRedeemable
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Max (₹{maxRedeemable.toFixed(2)})
                      </button>
                      <button
                        type="button"
                        onClick={handleClearRedemption}
                        className="px-2 py-0.5 rounded text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-dark-800"
                      >
                        ₹0
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <Wallet
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-600 dark:text-brand-400 pointer-events-none"
                  />
                  <input
                    id="cashback-redeem"
                    type="number"
                    min="0"
                    step="0.01"
                    max={maxRedeemable}
                    value={cashbackToRedeem}
                    onChange={e => handleRedeemChange(e.target.value)}
                    placeholder="0.00"
                    className="form-input pl-9 font-semibold text-orange-600 dark:text-orange-400"
                    disabled={customer.cashback_balance === 0 || billNum === 0}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1 flex justify-between">
                  <span>Max eligible: {formatCurrency(maxRedeemable)}</span>
                  {!userEditedRedeem && maxRedeemable > 0 && (
                    <span className="text-brand-600 dark:text-brand-400 font-medium">Auto-selected</span>
                  )}
                </p>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="bill-notes" className="form-label">
                  Notes (optional)
                </label>
                <input
                  id="bill-notes"
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional billing remarks…"
                  className="form-input"
                />
              </div>
            </div>

            {/* Live Calculation Breakdown */}
            {billNum > 0 && (
              <div className="bg-slate-50 dark:bg-dark-950/70 border border-slate-200/80 dark:border-dark-800 rounded-2xl p-4 space-y-2 animate-fade-in">
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Bill Amount:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(billNum)}</span>
                </div>

                {currentRedeemNum > 0 && (
                  <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400">
                    <span>Less Cashback Redeemed:</span>
                    <span className="font-semibold">− {formatCurrency(currentRedeemNum)}</span>
                  </div>
                )}

                <div className="flex justify-between text-base font-bold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-dark-800">
                  <span>Final Payable Amount:</span>
                  <span className="text-brand-700 dark:text-brand-400 text-lg">{formatCurrency(liveAmountPaid)}</span>
                </div>

                <div className="flex justify-between text-xs text-brand-700 dark:text-brand-400 pt-1 border-t border-slate-200/60 dark:border-dark-800">
                  <span>New Cashback to Earn ({cbPct}%):</span>
                  <span className="font-bold">
                    {billNum >= minEligible
                      ? `+ ${formatCurrency(liveCashbackEarned)}`
                      : '₹0.00 (below threshold)'}
                  </span>
                </div>

                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Projected Wallet Balance:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {formatCurrency(liveProjectedBalance)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('mobile')}
                className="btn-secondary flex-1"
              >
                Change Customer
              </button>
              <button
                type="button"
                onClick={handleCalculate}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                disabled={billNum <= 0}
              >
                <Calculator size={16} /> Review & Confirm
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Payment Method Selection ── */}
        {step === 'payment' && customer && summary && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard size={16} className="text-brand-600 dark:text-brand-400" /> Select Payment Method
            </h2>

            {/* Bill Summary */}
            <div className="bg-slate-50 dark:bg-dark-950 p-4 rounded-xl text-sm flex items-center justify-between border border-slate-100 dark:border-dark-800">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{customer.name}</p>
                <p className="text-slate-500 dark:text-slate-400 font-mono text-xs">{customer.mobile}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Amount Payable</p>
                <p className="text-lg font-extrabold text-brand-700 dark:text-brand-400">
                  {formatCurrency(summary.amountPaid)}
                </p>
              </div>
            </div>

            {/* Payment Methods Grid */}
            <div className="grid grid-cols-2 gap-3">
              {([
                { method: 'cash' as PaymentMethod, icon: Banknote, label: 'Cash', desc: 'Pay with cash', color: 'text-emerald-600 dark:text-emerald-400' },
                { method: 'upi' as PaymentMethod, icon: QrCode, label: 'UPI', desc: 'GPay, PhonePe, Paytm', color: 'text-violet-600 dark:text-violet-400' },
                { method: 'card' as PaymentMethod, icon: CreditCard, label: 'Card', desc: 'Debit / Credit card', color: 'text-blue-600 dark:text-blue-400' },
                { method: 'wallet-only' as PaymentMethod, icon: Wallet, label: 'Wallet Only', desc: 'Pay with cashback', color: 'text-orange-600 dark:text-orange-400' },
              ]).map(({ method, icon: Icon, label, desc, color }) => {
                const isSelected = paymentMethod === method
                const isWalletDisabled = method === 'wallet-only' && summary.amountPaid > 0
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => handleSelectPaymentMethod(method)}
                    disabled={isWalletDisabled}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/40 ring-2 ring-brand-200 dark:ring-brand-800'
                        : 'border-slate-200 dark:border-dark-700 hover:border-slate-300 dark:hover:border-dark-600'
                    } ${isWalletDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <Icon size={22} className={color} />
                    <p className={`font-semibold text-sm mt-2 ${isSelected ? 'text-brand-700 dark:text-brand-300' : 'text-slate-900 dark:text-white'}`}>
                      {label}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
                  </button>
                )
              })}
            </div>

            {/* UPI QR Preview (admin side) */}
            {paymentMethod === 'upi' && summary.amountPaid > 0 && (
              <div className="bg-slate-50 dark:bg-dark-950/70 border border-slate-200/80 dark:border-dark-800 rounded-2xl p-5 text-center space-y-3">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">UPI QR Code Preview</p>
                <div className="inline-flex p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                  <QRCodeSVG
                    value={buildUPILink({
                      payeeVPA: SHOP_UPI_CONFIG.payeeVPA,
                      payeeName: settings?.shop_name ?? SHOP_UPI_CONFIG.payeeName,
                      amount: summary.amountPaid,
                      transactionNote: `Bill - ${customer.name} - ${serviceCategory}`,
                    })}
                    size={160}
                    level="M"
                    includeMargin={true}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  UPI ID: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{SHOP_UPI_CONFIG.payeeVPA}</span>
                </p>
                {displayActive && (
                  <p className="text-[11px] text-brand-600 dark:text-brand-400 font-medium">
                    ✓ QR code is displayed on customer screen
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('billing')}
                className="btn-secondary flex-1"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleProceedToConfirm}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} /> Review & Confirm
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Confirm ── */}
        {step === 'confirm' && customer && summary && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle size={16} className="text-brand-600 dark:text-brand-400" /> Review Bill Details
            </h2>

            <div className="bg-slate-50 dark:bg-dark-950 p-4 rounded-xl text-sm flex items-center justify-between border border-slate-100 dark:border-dark-800">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{customer.name}</p>
                <p className="text-slate-500 dark:text-slate-400 font-mono text-xs">{customer.mobile}</p>
              </div>
              <span className="text-xs bg-brand-100 dark:bg-brand-950/80 text-brand-800 dark:text-brand-300 font-semibold px-2.5 py-1 rounded-full border border-brand-200 dark:border-brand-800">
                {serviceCategory}
              </span>
            </div>

            <div className="border border-slate-200 dark:border-dark-800 rounded-xl overflow-hidden shadow-sm">
              {[
                { label: 'Bill Amount', value: formatCurrency(summary.billAmount), className: 'text-slate-900 dark:text-white font-medium' },
                {
                  label: 'Cashback Redeemed',
                  value: summary.cashbackToRedeem > 0 ? `− ${formatCurrency(summary.cashbackToRedeem)}` : '₹0.00',
                  className: summary.cashbackToRedeem > 0 ? 'text-orange-600 dark:text-orange-400 font-bold' : 'text-slate-400',
                },
                {
                  label: 'Amount Payable (Customer Pays)',
                  value: formatCurrency(summary.amountPaid),
                  className: 'font-extrabold text-slate-900 dark:text-white text-base',
                  highlight: true,
                },
                {
                  label: `New Cashback Earned (${cbPct}%)`,
                  value: `+ ${formatCurrency(summary.cashbackEarned)}`,
                  className: 'text-brand-600 dark:text-brand-400 font-bold',
                },
                {
                  label: 'Updated Customer Wallet Balance',
                  value: formatCurrency(summary.newBalance),
                  className: 'text-brand-700 dark:text-brand-300 font-extrabold text-base',
                  highlight: true,
                },
                {
                  label: 'Payment Method',
                  value: paymentMethod === 'upi' ? '💳 UPI' : paymentMethod === 'card' ? '💳 Card' : paymentMethod === 'wallet-only' ? '👛 Wallet Only' : '💵 Cash',
                  className: 'text-slate-900 dark:text-white font-semibold',
                },
              ].map(({ label, value, className, highlight }, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-4 py-3 text-sm ${
                    highlight
                      ? 'bg-brand-50/60 dark:bg-brand-950/40 border-t border-brand-100 dark:border-brand-900'
                      : i % 2 === 0
                      ? 'bg-white dark:bg-dark-900'
                      : 'bg-slate-50/60 dark:bg-dark-950/60'
                  }`}
                >
                  <span className="text-slate-600 dark:text-slate-400 font-medium">{label}</span>
                  <span className={className}>{value}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('payment')}
                className="btn-secondary flex-1"
                disabled={saving}
              >
                Back to Payment
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="btn-primary flex-1 py-3 text-base flex items-center justify-center gap-2"
                disabled={saving}
              >
                {saving ? 'Recording Transaction…' : '✓ Save Bill & Issue Cashback'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 6: Completed ── */}
        {step === 'done' && summary && customer && (
          <div className="text-center space-y-5 py-4 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-brand-100 dark:bg-brand-950/80 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle size={44} />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Bill Saved Successfully!</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Transaction recorded and customer wallet balance updated.
              </p>
              {lastSavedTxId && (
                <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-1">
                  ID: {lastSavedTxId}
                </p>
              )}
            </div>

            <div className="bg-slate-50 dark:bg-dark-950/80 border border-slate-200 dark:border-dark-800 rounded-2xl p-5 text-sm space-y-2.5 text-left max-w-md mx-auto">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Customer</span>
                <span className="font-semibold text-slate-900 dark:text-white">{customer.name} ({customer.mobile})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Bill Amount</span>
                <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(summary.billAmount)}</span>
              </div>
              {summary.cashbackToRedeem > 0 && (
                <div className="flex justify-between text-orange-600 dark:text-orange-400">
                  <span>Cashback Redeemed</span>
                  <span className="font-semibold">− {formatCurrency(summary.cashbackToRedeem)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Amount Paid</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(summary.amountPaid)}</span>
              </div>
              <div className="flex justify-between text-brand-600 dark:text-brand-400">
                <span className="font-medium">Cashback Earned</span>
                <span className="font-bold">+{formatCurrency(summary.cashbackEarned)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-dark-800 pt-2.5 mt-2">
                <span className="font-bold text-slate-900 dark:text-white">Current Wallet Balance</span>
                <span className="font-extrabold text-brand-600 dark:text-brand-400 text-lg">
                  {formatCurrency(customer.cashback_balance)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={handleBillSameCustomerAgain}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                <Plus size={16} /> Bill {customer.name} Again
              </button>
              <button
                type="button"
                onClick={() => navigate(`/customers/${customer.id}`)}
                className="btn-secondary flex-1"
              >
                View History
              </button>
              <button
                type="button"
                onClick={resetBilling}
                className="btn-secondary flex-1"
              >
                New Bill (Other)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
