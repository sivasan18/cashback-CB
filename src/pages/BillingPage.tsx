import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, CheckCircle, Phone, ShoppingBag,
  Wallet, Calculator, Receipt, RefreshCw,
  UserPlus, Plus, QrCode, Banknote, CreditCard,
  Monitor, MonitorOff, ArrowLeft, X
} from 'lucide-react'
import { db } from '@/lib/db'
import { cloudflareApi } from '@/lib/api'
import { calculateCashback, formatCurrency, validateMobile, normalizeMobile } from '@/lib/cashback'
import { useSettingsStore } from '@/store/settingsStore'
import { useDisplayStore, type PaymentMethod, type PaymentVerificationStatus } from '@/store/displayStore'
import { buildUPILink, generateQRCodeURL, SHOP_UPI_CONFIG } from '@/lib/upi'
import { QRCodeSVG } from 'qrcode.react'
import { sendNotification } from '@/lib/notifications'
import toast from 'react-hot-toast'
import type { Customer, ServiceCategory } from '@/types'

type Step = 'mobile' | 'customer' | 'billing' | 'payment' | 'done'

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

  // Payment method & verification
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [upiVerified, setUpiVerified] = useState(false)
  const [upiRef, setUpiRef] = useState('')
  const [showAdminQR, setShowAdminQR] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<PaymentVerificationStatus>('awaiting_payment')

  // Customer display
  const { session: displaySession, broadcast, resetDisplay, startNewSession, cancelPayment } = useDisplayStore()
  const [currentSessionId, setCurrentSessionId] = useState<string>('')
  const [displayActive, setDisplayActive] = useState(false)

  // Confirmation & Save
  const [summary, setSummary] = useState<BillSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastSavedTxId, setLastSavedTxId] = useState<string | null>(null)

  useEffect(() => {
    db
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
      const { data, error } = await db
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
    const sid = startNewSession()
    setCurrentSessionId(sid)

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
    setCashReceived('')
    setUpiVerified(false)
    setUpiRef('')
    setPaymentStatus('awaiting_payment')

    // Broadcast customer info to display immediately
    broadcast({
      sessionId: sid,
      mode: 'customer-selected',
      customerName: selected.name,
      customerMobile: selected.mobile,
      shopName: settings?.shop_name || 'Smart Cashback',
      serviceCategory: serviceCategory || 'Standard Services',
      billAmount: 0,
      cashbackRedeemed: 0,
      amountPayable: 0,
      cashbackEarned: 0,
      availableBalance: selected.cashback_balance,
      newWalletBalance: selected.cashback_balance,
      cashbackPercentage: settings?.cashback_percentage || 2,
      paymentMethod: null,
      paymentStatus: 'awaiting_payment',
      merchantUpiId: settings?.merchant_upi_id || '7708481818@upi',
      merchantDisplayName: settings?.merchant_display_name || settings?.shop_name || 'Smart Cashback',
      upiLink: null,
      upiQRUrl: null,
      transactionId: null,
    })
  }

  const handleMobileSearch = useCallback(async () => {
    const norm = normalizeMobile(mobile.trim())
    if (!validateMobile(norm)) {
      setMobileError('Enter a valid 10-digit mobile number')
      return
    }
    setMobileError('')
    setShowSuggestions(false)

    const { data } = await db
      .from('customers')
      .select('*')
      .eq('mobile', norm)
      .not('name', 'eq', '[Deleted Customer]')
      .not('mobile', 'like', 'DEL%')
      .maybeSingle()

    if (data) {
      handleSelectCustomer(data as Customer)
    } else {
      // Global Customer Name Lookup across Food Court
      try {
        const lookup = await cloudflareApi.customers.lookupName(norm)
        if (lookup.data?.found && lookup.data.name) {
          setNewName(lookup.data.name)
          toast.success(`Recognized customer: "${lookup.data.name}" from Food Court!`)
        } else {
          setNewName('')
        }
      } catch {
        setNewName('')
      }
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
    const { data, error } = await db
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
    if (step === 'billing' && customer) {
      broadcast({
        mode: 'customer-selected',
        customerName: customer.name,
        customerMobile: customer.mobile,
        shopName: settings?.shop_name || 'Smart Cashback',
        serviceCategory: serviceCategory || 'Standard Services',
        billAmount: billNum,
        cashbackRedeemed: currentRedeemNum,
        amountPayable: liveAmountPaid,
        cashbackEarned: liveCashbackEarned,
        availableBalance: customer.cashback_balance,
        newWalletBalance: liveProjectedBalance,
        cashbackPercentage: cbPct,
        merchantUpiId: settings?.merchant_upi_id || '7708481818@upi',
        merchantDisplayName: settings?.merchant_display_name || settings?.shop_name || 'Smart Cashback',
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
    settings?.merchant_upi_id,
    settings?.merchant_display_name,
    broadcast,
  ])

  const handleOpenCustomerDisplay = () => {
    setDisplayActive(true)
    window.open(
      '/customer-display',
      'smart-cashback-customer-display',
      'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no'
    )
    toast.success('Customer display opened! Move to your external monitor.')
  }

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
    setPaymentMethod('cash')
    setPaymentStatus('awaiting_payment')
    setCashReceived('')
    setUpiVerified(false)
    setUpiRef('')
    setShowAdminQR(false)
    setStep('payment')

    // Broadcast payment selection (default Cash)
    broadcast({
      sessionId: currentSessionId,
      mode: 'payment-selection',
      customerName: customer?.name ?? '',
      customerMobile: customer?.mobile ?? '',
      shopName: settings?.shop_name || 'Smart Cashback',
      serviceCategory: serviceCategory || 'Standard Services',
      billAmount: result.billAmount,
      cashbackRedeemed: result.cashbackToRedeem,
      amountPayable: result.amountPaid,
      cashbackEarned: result.cashbackEarned,
      availableBalance: customer?.cashback_balance ?? 0,
      newWalletBalance: result.newBalance,
      cashbackPercentage: cbPct,
      paymentMethod: 'cash',
      paymentStatus: 'awaiting_payment',
      merchantUpiId: settings?.merchant_upi_id || '7708481818@upi',
      merchantDisplayName: settings?.merchant_display_name || settings?.shop_name || 'Smart Cashback',
      upiLink: null,
      upiQRUrl: null,
      transactionId: null,
    })
  }

  // ─── Payment Method Selection & QR Generation ──────────────────────
  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method)
    setPaymentStatus('awaiting_payment')
    setUpiVerified(false)

    if (summary && customer) {
      let upiLink: string | null = null

      if (method === 'upi') {
        const vpa = settings?.merchant_upi_id || '7708481818@upi'
        const merchantName = settings?.merchant_display_name || settings?.shop_name || 'Smart Cashback'
        upiLink = buildUPILink({
          payeeVPA: vpa,
          payeeName: merchantName,
          amount: summary.amountPaid,
          transactionNote: `Bill - ${customer.name} - ${serviceCategory}`,
        })
      }

      broadcast({
        sessionId: currentSessionId,
        mode: 'payment-selection',
        paymentMethod: method,
        paymentStatus: 'awaiting_payment',
        merchantUpiId: settings?.merchant_upi_id || '7708481818@upi',
        merchantDisplayName: settings?.merchant_display_name || settings?.shop_name || 'Smart Cashback',
        upiLink,
        amountPayable: summary.amountPaid,
        cashbackEarned: summary.cashbackEarned,
      })
    }
  }

  const handleBackFromPayment = () => {
    // TEST 1: Enter customer details and generate a UPI QR code. Click Back.
    // Expected: Customer display immediately returns to Welcome.
    resetDisplay(currentSessionId, 'back')
    setPaymentStatus('awaiting_payment')
    setUpiVerified(false)
    setStep('billing')
  }

  const handleCancelPayment = () => {
    // TEST 2: Generate a QR code but do not pay. Click Cancel.
    // Expected: QR code and previous customer information disappear.
    setPaymentStatus('payment_failed')
    setUpiVerified(false)
    resetDisplay(currentSessionId, 'cancelled')
    resetBilling()
    toast('Payment cancelled. Customer display reset.', { icon: 'ℹ️' })
  }

  const handlePaymentFailed = () => {
    setPaymentStatus('payment_failed')
    setUpiVerified(false)
    resetDisplay(currentSessionId, 'payment_failed')
    toast.error('Payment marked as Failed / Cancelled. Transaction was NOT saved and cashback was NOT credited.')
  }

  // ─────────────────────────────────────────────────────────────
  // TRANSACTION SUBMISSION: Verified execution & Customer display updates
  // ─────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!customer || !summary || saving) return

    // Verification check for UPI
    if (paymentMethod === 'upi' && !upiVerified) {
      const confirmed = window.confirm(
        `Please confirm: Have you verified receipt of ₹${summary.amountPaid.toFixed(2)} in your merchant UPI app or bank statement?`
      )
      if (!confirmed) return
    }

    setSaving(true)
    setPaymentStatus('payment_processing')

    try {
      const transactionKey = `tx_${Date.now()}_${crypto.randomUUID()}`
      const paymentNote = `Payment: ${paymentMethod.toUpperCase()}${upiRef.trim() ? ` (UTR: ${upiRef.trim()})` : ''}`
      const combinedNotes = [notes.trim(), paymentNote].filter(Boolean).join(' | ')

      const { data, error } = await db.rpc('process_billing', {
        p_customer_id: customer.id,
        p_service_category: serviceCategory,
        p_bill_amount: summary.billAmount,
        p_cashback_redeemed: summary.cashbackToRedeem,
        p_amount_paid: summary.amountPaid,
        p_cashback_earned: summary.cashbackEarned,
        p_notes: combinedNotes,
        p_idempotency_key: transactionKey,
        payment_method: paymentMethod,
        payment_verified: paymentMethod === 'upi' ? upiVerified : true,
      })

      if (error) throw new Error(error.message)

      const txId = data as string
      setLastSavedTxId(txId)
      setPaymentStatus('payment_successful')

      // Broadcast State 5: payment-success
      broadcast({
        mode: 'payment-success',
        paymentStatus: 'payment_successful',
        amountPayable: summary.amountPaid,
        cashbackEarned: summary.cashbackEarned,
        newWalletBalance: summary.newBalance,
        transactionId: txId,
      })

      // Broadcast State 6: transaction-complete after 3 seconds
      setTimeout(() => {
        broadcast({
          mode: 'transaction-complete',
          newWalletBalance: summary.newBalance,
          displayTimeoutSeconds: settings?.display_timeout_seconds || 5,
        })
      }, 3000)

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

      const { data: updatedCustomer } = await db
        .from('customers')
        .select('*')
        .eq('id', customer.id)
        .single()

      if (updatedCustomer) {
        setCustomer(updatedCustomer as Customer)
      }

      setStep('done')
      toast.success('Bill saved & cashback credited successfully!')
    } catch (err) {
      setPaymentStatus('payment_failed')
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
    setCashReceived('')
    setUpiVerified(false)
    setUpiRef('')
    setPaymentStatus('awaiting_payment')
    setShowAdminQR(false)

    // Reset customer display back to Welcome state
    resetDisplay(currentSessionId, 'reset')
    setCurrentSessionId('')
  }

  const handleBillSameCustomerAgain = () => {
    setBillAmount('')
    setCashbackToRedeem('')
    setUserEditedRedeem(false)
    setNotes('')
    setSummary(null)
    setCashReceived('')
    setUpiVerified(false)
    setUpiRef('')
    setPaymentStatus('awaiting_payment')
    setShowAdminQR(false)
    setStep('billing')

    if (customer) {
      const sid = startNewSession()
      setCurrentSessionId(sid)
      broadcast({
        sessionId: sid,
        mode: 'customer-selected',
        customerName: customer.name,
        customerMobile: customer.mobile,
        billAmount: 0,
        cashbackRedeemed: 0,
        amountPayable: 0,
        cashbackEarned: 0,
        availableBalance: customer.cashback_balance,
        newWalletBalance: customer.cashback_balance,
      })
    }
  }

  const stepLabels: Step[] = ['mobile', 'customer', 'billing', 'payment', 'done']
  const stepDisplay = ['Search', 'Register', 'Billing', 'Payment', 'Saved']

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
          {/* OPEN CUSTOMER DISPLAY */}
          <button
            type="button"
            onClick={handleOpenCustomerDisplay}
            className="btn-primary text-xs flex items-center gap-1.5 px-3.5 py-2 font-bold uppercase tracking-wider shadow-sm"
            title="Open Customer Display in separate window for second monitor"
          >
            <Monitor size={15} />
            <span>OPEN CUSTOMER DISPLAY</span>
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
                onClick={resetBilling}
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
                onClick={resetBilling}
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

        {/* ── Step 4: Payment Method Selection & Manual Verification ── */}
        {step === 'payment' && customer && summary && (
          <div className="space-y-5 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                  <CreditCard size={18} className="text-brand-600 dark:text-brand-400" />
                  Payment Method & Verification
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select payment mode and verify payment receipt before recording bill
                </p>
              </div>

              <span className="text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/70 border border-brand-200 dark:border-brand-800 px-3 py-1 rounded-full">
                Payable: {formatCurrency(summary.amountPaid)}
              </span>
            </div>

            {/* Customer & Bill Overview Card */}
            <div className="bg-slate-50 dark:bg-dark-950/80 p-4 rounded-2xl border border-slate-200/80 dark:border-dark-800 text-sm flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{customer.name}</p>
                <p className="text-slate-500 dark:text-slate-400 font-mono text-xs">{customer.mobile}</p>
              </div>
              <div className="text-right">
                <span className="text-xs bg-slate-200/70 dark:bg-dark-800 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded-full font-medium">
                  {serviceCategory}
                </span>
                <p className="text-xs text-brand-600 dark:text-brand-400 font-semibold mt-1">
                  Cashback to Earn: +{formatCurrency(summary.cashbackEarned)}
                </p>
              </div>
            </div>

            {/* Payment Method Selector (CASH vs UPI) */}
            <div className="grid grid-cols-2 gap-3.5">
              {/* CASH Option */}
              <button
                type="button"
                onClick={() => handleSelectPaymentMethod('cash')}
                className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                  paymentMethod === 'cash'
                    ? 'border-brand-600 bg-brand-50/70 dark:bg-brand-950/40 ring-4 ring-brand-500/10 shadow-sm'
                    : 'border-slate-200 dark:border-dark-700 hover:border-slate-300 dark:hover:border-dark-600 bg-white dark:bg-dark-900'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    paymentMethod === 'cash'
                      ? 'bg-brand-600 text-white'
                      : 'bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300'
                  }`}>
                    <Banknote size={22} />
                  </div>
                  {paymentMethod === 'cash' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />
                  )}
                </div>
                <div className="mt-3">
                  <p className="font-extrabold text-sm text-slate-900 dark:text-white">
                    CASH PAYMENT
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Pay at counter
                  </p>
                </div>
              </button>

              {/* UPI Option */}
              <button
                type="button"
                onClick={() => handleSelectPaymentMethod('upi')}
                className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                  paymentMethod === 'upi'
                    ? 'border-brand-600 bg-brand-50/70 dark:bg-brand-950/40 ring-4 ring-brand-500/10 shadow-sm'
                    : 'border-slate-200 dark:border-dark-700 hover:border-slate-300 dark:hover:border-dark-600 bg-white dark:bg-dark-900'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    paymentMethod === 'upi'
                      ? 'bg-brand-600 text-white'
                      : 'bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300'
                  }`}>
                    <QrCode size={22} />
                  </div>
                  {paymentMethod === 'upi' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-ping" />
                  )}
                </div>
                <div className="mt-3">
                  <p className="font-extrabold text-sm text-slate-900 dark:text-white">
                    UPI QR PAYMENT
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    QR on customer display
                  </p>
                </div>
              </button>
            </div>

            {/* CASH Flow */}
            {paymentMethod === 'cash' && (
              <div className="bg-slate-50 dark:bg-dark-950/70 border border-slate-200/80 dark:border-dark-800 rounded-2xl p-5 space-y-4 animate-fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 dark:border-dark-800">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total to Collect</p>
                    <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                      {formatCurrency(summary.amountPaid)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Cashback</p>
                    <p className="text-base font-bold text-brand-600 dark:text-brand-400">
                      +{formatCurrency(summary.cashbackEarned)}
                    </p>
                  </div>
                </div>

                {/* Cash Calculator */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="form-label text-xs">Cash Received (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      placeholder={summary.amountPaid.toString()}
                      className="form-input text-base font-bold"
                    />
                  </div>

                  <div>
                    <label className="form-label text-xs">Change to Return</label>
                    <div className="form-input bg-slate-100/70 dark:bg-dark-900 font-extrabold text-base flex items-center">
                      {parseFloat(cashReceived) > summary.amountPaid
                        ? formatCurrency(parseFloat(cashReceived) - summary.amountPaid)
                        : '₹0.00'}
                    </div>
                  </div>
                </div>

                <div className="flex gap-1.5 pt-1">
                  {[summary.amountPaid, 100, 200, 500].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCashReceived(amt.toString())}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300"
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* UPI Flow */}
            {paymentMethod === 'upi' && (
              <div className="bg-slate-50 dark:bg-dark-950/70 border border-slate-200/80 dark:border-dark-800 rounded-2xl p-5 space-y-4 animate-fade-in">
                {/* Status Indicator */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-brand-50/70 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-900/60">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-600" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-brand-900 dark:text-brand-200">
                        {paymentStatus === 'payment_failed'
                          ? 'Payment Cancelled'
                          : `Awaiting UPI: ${formatCurrency(summary.amountPaid)}`}
                      </p>
                      <p className="text-[11px] text-brand-700 dark:text-brand-400">
                        Dynamic QR on customer screen
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold bg-white dark:bg-dark-900 px-2.5 py-1 rounded-lg border border-brand-200 dark:border-brand-800 text-brand-800 dark:text-brand-300">
                    {settings?.merchant_upi_id || '7708481818@upi'}
                  </span>
                </div>

                {/* Collapsible QR Preview (hidden on admin screen by default per spec) */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowAdminQR(!showAdminQR)}
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-semibold"
                  >
                    {showAdminQR ? 'Hide QR Code on admin screen' : 'Preview QR Code on admin screen'}
                  </button>

                  {showAdminQR && (
                    <div className="mt-3 p-4 bg-white dark:bg-dark-900 rounded-2xl border border-slate-200 dark:border-dark-700 inline-block shadow-md">
                      <QRCodeSVG
                        value={buildUPILink({
                          payeeVPA: settings?.merchant_upi_id || '7708481818@upi',
                          payeeName: settings?.merchant_display_name || settings?.shop_name || 'Smart Cashback',
                          amount: summary.amountPaid,
                          transactionNote: `Bill - ${customer.name} - ${serviceCategory}`,
                        })}
                        size={160}
                        level="M"
                        includeMargin={true}
                      />
                      <p className="text-[11px] text-slate-500 mt-2 font-mono">
                        {settings?.merchant_upi_id || '7708481818@upi'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Manual Payment Verification Workflow (Section 5) */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-dark-800 space-y-3">
                  <div>
                    <label className="form-label text-xs">
                      UPI UTR / Reference Number (Optional for audit)
                    </label>
                    <input
                      type="text"
                      value={upiRef}
                      onChange={e => setUpiRef(e.target.value)}
                      placeholder="e.g. 431289123456 from UPI SMS or Soundbox"
                      className="form-input text-xs font-mono"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer bg-white dark:bg-dark-900 p-3 rounded-xl border border-slate-200 dark:border-dark-700">
                    <input
                      type="checkbox"
                      checked={upiVerified}
                      onChange={e => {
                        setUpiVerified(e.target.checked)
                        if (e.target.checked) setPaymentStatus('awaiting_payment')
                      }}
                      className="mt-0.5 rounded text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                      I have verified receipt of <strong>{formatCurrency(summary.amountPaid)}</strong> in my merchant UPI application or bank account
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={handleBackFromPayment}
                className="btn-secondary flex-1 py-2.5 flex items-center justify-center gap-1.5"
                disabled={saving}
                title="Return to edit bill and clear customer display"
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleCancelPayment}
                className="btn-secondary text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 flex-1 py-2.5 flex items-center justify-center gap-1.5"
                disabled={saving}
                title="Cancel payment and return to New Bill"
              >
                <X size={16} />
                <span>Cancel</span>
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                className="btn-primary flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2"
                disabled={saving}
              >
                <CheckCircle size={18} />
                {saving
                  ? 'Recording Transaction…'
                  : paymentMethod === 'upi'
                  ? 'Verify & Confirm'
                  : 'Confirm Cash & Save'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Completed ── */}
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
