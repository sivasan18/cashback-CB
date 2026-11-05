/**
 * CustomerDisplayPage – Full-screen customer-facing dual monitor display.
 *
 * Route: /customer-display
 * No authentication required.
 * Real-time synchronization via BroadcastChannel with localStorage storage-event fallback.
 * Implements the 6 distinct display states required by Smart Cashback specification.
 */
import { useEffect, useState, useMemo } from 'react'
import {
  Zap, Wifi, WifiOff, ShoppingBag, CreditCard, QrCode,
  CheckCircle, Heart, Clock, Maximize2, Minimize2,
  Banknote, ArrowRight, ShieldCheck, Sparkles, RefreshCw
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useDisplayStore, type DisplaySession } from '@/store/displayStore'
import { formatCurrency } from '@/lib/cashback'

export default function CustomerDisplayPage() {
  const { session, startListening, resetDisplay } = useDisplayStore()
  const [connected, setConnected] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Start cross-window listener (BroadcastChannel + storage event fallback)
  useEffect(() => {
    const cleanup = startListening()
    setConnected(true)
    return cleanup
  }, [startListening])

  // Live digital clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  // Auto-reset timer when in State 6 (Transaction Complete)
  useEffect(() => {
    if (session.mode === 'transaction-complete' || session.mode === 'thank-you') {
      const timeoutMs = (session.displayTimeoutSeconds || 5) * 1000
      const timer = setTimeout(() => {
        resetDisplay()
      }, timeoutMs)
      return () => clearTimeout(timer)
    }
  }, [session.mode, session.displayTimeoutSeconds, resetDisplay])

  const shopName = session.shopName || 'Smart Cashback'

  // Map modes to active state
  const isWelcome = session.mode === 'welcome' || (!session.customerName && session.mode !== 'payment-success' && session.mode !== 'transaction-complete')
  const isCustomerSelected = session.mode === 'customer-selected' || session.mode === 'billing'
  const isPaymentSelection = session.mode === 'payment-selection' || session.mode === 'payment-pending'
  const isWaitingPayment = session.mode === 'waiting-payment' || session.paymentStatus === 'awaiting_payment'
  const isPaymentSuccess = session.mode === 'payment-success' || session.paymentStatus === 'payment_successful'
  const isTransactionComplete = session.mode === 'transaction-complete' || session.mode === 'thank-you'

  return (
    <div className="relative min-h-screen bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* ── Ambient Background Glows ── */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 bg-brand-500/15 rounded-full blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-brand-950/40 rounded-full blur-3xl" />

      {/* ── Top Header ── */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-4 bg-slate-900/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/30 ring-1 ring-white/20">
            <Zap size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
              {shopName}
              <span className="text-[11px] font-semibold uppercase tracking-wider bg-brand-500/20 text-brand-200 px-2.5 py-0.5 rounded-full border border-brand-400/30">
                Live POS
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">Customer Display</p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* Connection status */}
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 text-xs">
            {connected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-ping" />
                <span className="text-brand-200 font-medium">Synced</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-rose-400" />
                <span className="text-rose-300 font-medium">Connecting…</span>
              </>
            )}
          </div>

          {/* Clock */}
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold font-mono tracking-wide text-white">
              {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </p>
            <p className="text-[10px] text-slate-400 font-medium">
              {currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
          </div>

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* ── Main Dynamic Stage ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6 sm:p-10">
        {/* State 1: Welcome Screen */}
        {isWelcome && <State1WelcomeScreen shopName={shopName} />}

        {/* State 2: Customer Selected & Live Billing */}
        {isCustomerSelected && <State2CustomerSelected session={session} />}

        {/* State 3 & 4: Payment Selection & Waiting for Payment */}
        {(isPaymentSelection || (isWaitingPayment && !isPaymentSuccess && !isTransactionComplete)) && (
          <State3And4PaymentSelection session={session} />
        )}

        {/* State 5: Payment Successful */}
        {isPaymentSuccess && !isTransactionComplete && <State5PaymentSuccessful session={session} />}

        {/* State 6: Transaction Complete & Thank You */}
        {isTransactionComplete && <State6TransactionComplete session={session} />}
      </main>

      {/* ── Bottom Footer ── */}
      <footer className="relative z-10 px-8 py-3.5 bg-slate-900/80 backdrop-blur-md border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand-300" />
          <span>
            {session.cashbackPercentage || 2}% Cashback on orders of ₹99+
          </span>
        </div>
        <div className="flex items-center gap-3 text-slate-500 font-medium">
          <span>UPI · Cash · Wallet</span>
          <span>•</span>
          <span>Smart Cashback</span>
        </div>
      </footer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE 1: WELCOME SCREEN (When no customer is selected)
// ─────────────────────────────────────────────────────────────────────────────
function State1WelcomeScreen({ shopName }: { shopName: string }) {
  return (
    <div className="text-center space-y-8 animate-fade-in max-w-2xl">
      <div className="relative inline-block">
        <div className="w-28 h-28 rounded-3xl bg-brand-600 flex items-center justify-center mx-auto shadow-2xl shadow-brand-600/40 ring-4 ring-brand-400/20">
          <Zap size={56} className="text-brand-100" />
        </div>
        <span className="absolute -bottom-2 -right-2 bg-brand-500 text-brand-100 text-[11px] font-extrabold px-3 py-1 rounded-full shadow-lg border border-slate-900">
          2% CASHBACK
        </span>
      </div>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-brand-300 font-bold">
          {shopName}
        </p>
        <h2 className="text-5xl sm:text-6xl font-black tracking-tight text-white">
          Welcome!
        </h2>
        <p className="text-lg sm:text-xl text-slate-300 font-medium">
          Ready for your order
        </p>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-3 gap-4 pt-4 max-w-lg mx-auto">
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-brand-600/20 text-brand-300 flex items-center justify-center">
            <ShoppingBag size={20} />
          </div>
          <p className="text-xs font-semibold text-slate-200">Xerox & Print</p>
        </div>

        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-brand-600/20 text-brand-300 flex items-center justify-center">
            <CreditCard size={20} />
          </div>
          <p className="text-xs font-semibold text-slate-200">Recharge</p>
        </div>

        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-brand-600/20 text-brand-300 flex items-center justify-center">
            <QrCode size={20} />
          </div>
          <p className="text-xs font-semibold text-slate-200">UPI Pay</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE 2: CUSTOMER SELECTED & LIVE BILLING DETAILS
// ─────────────────────────────────────────────────────────────────────────────
function State2CustomerSelected({ session }: { session: DisplaySession }) {
  return (
    <div className="w-full max-w-xl animate-fade-in space-y-6">
      {/* Customer Header */}
      <div className="text-center space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">
          Billing in Progress
        </p>
        <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
          {session.customerName || 'Customer'}
        </h2>
        <p className="text-base text-slate-400 font-mono font-medium">
          {session.customerMobile}
        </p>
      </div>

      {/* Bill Card */}
      <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-2xl space-y-4">
        {/* Service */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 text-sm">
          <span className="text-slate-400">Service:</span>
          <span className="font-semibold text-white bg-white/10 px-3 py-1 rounded-full text-xs">
            {session.serviceCategory || 'Standard Services'}
          </span>
        </div>

        {/* Bill Rows */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center text-slate-300">
            <span>Bill Amount:</span>
            <span className="font-bold text-white text-base">
              {formatCurrency(session.billAmount)}
            </span>
          </div>

          {session.cashbackRedeemed > 0 && (
            <div className="flex justify-between items-center text-rose-300 font-semibold">
              <span>Cashback Redeemed:</span>
              <span className="text-base">
                − {formatCurrency(session.cashbackRedeemed)}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t border-white/10">
            <span className="text-base font-bold text-white">Final Payable:</span>
            <span className="text-3xl font-black text-brand-200">
              {formatCurrency(session.amountPayable)}
            </span>
          </div>
        </div>

        {/* Cashback highlight banner */}
        <div className="mt-4 p-4 rounded-2xl bg-brand-950/60 border border-brand-500/30 flex items-center justify-between">
          <div>
            <p className="text-xs text-brand-200 font-medium">Cashback on this bill:</p>
            <p className="text-xl font-black text-brand-300">
              +{formatCurrency(session.cashbackEarned)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 font-medium">Wallet Balance:</p>
            <p className="text-lg font-bold text-brand-100">
              {formatCurrency(session.availableBalance || session.newWalletBalance)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
        <Clock size={14} className="text-brand-300" />
        <span>Please verify details before payment</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE 3 & 4: PAYMENT SELECTION & WAITING FOR PAYMENT (CASH / UPI QR)
// ─────────────────────────────────────────────────────────────────────────────
function State3And4PaymentSelection({ session }: { session: DisplaySession }) {
  const isUPI = session.paymentMethod === 'upi'

  return (
    <div className="w-full max-w-3xl animate-fade-in space-y-6">
      {/* Title */}
      <div className="text-center space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-300">
          Payment: {isUPI ? 'UPI QR Pay' : 'Cash Payment'}
        </p>
        <h2 className="text-3xl sm:text-4xl font-black text-white">
          {session.customerName}
        </h2>
        <p className="text-sm text-slate-400 font-mono">{session.customerMobile}</p>
      </div>

      {isUPI ? (
        /* UPI QR Interface */
        <div className="flex flex-col md:flex-row gap-6 items-center justify-center">
          {/* Dynamic QR Code Card */}
          <div className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center ring-4 ring-brand-500/30">
            <div className="p-3 bg-white rounded-2xl border-2 border-slate-100">
              {session.upiLink ? (
                <QRCodeSVG
                  value={session.upiLink}
                  size={240}
                  level="M"
                  includeMargin={false}
                />
              ) : (
                <div className="w-60 h-60 flex items-center justify-center bg-slate-100 text-slate-400 text-sm">
                  Generating QR…
                </div>
              )}
            </div>

            <div className="mt-4 text-center space-y-1">
              <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Scan with any UPI App
              </p>
              <p className="text-[11px] text-slate-500 font-medium">
                GPay · PhonePe · Paytm · BHIM
              </p>
            </div>
          </div>

          {/* Amount & Status Card */}
          <div className="flex-1 bg-slate-900/80 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-md space-y-5 max-w-md w-full">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Payable Amount
              </p>
              <p className="text-5xl font-black text-brand-300 mt-1">
                {formatCurrency(session.amountPayable)}
              </p>
            </div>

            <div className="space-y-2 py-3 border-y border-white/10 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>UPI ID:</span>
                <span className="font-mono font-bold text-brand-200">{session.merchantUpiId || '7708481818@upi'}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Merchant:</span>
                <span className="font-semibold text-white">{session.merchantDisplayName || session.shopName}</span>
              </div>
            </div>

            {/* Pulsing Awaiting Payment Indicator */}
            <div className="p-3.5 rounded-2xl bg-brand-950/70 border border-brand-500/30 flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500" />
              </span>
              <p className="text-xs font-semibold text-brand-200">
                Awaiting UPI payment confirmation…
              </p>
            </div>

            {session.cashbackEarned > 0 && (
              <p className="text-xs text-brand-200 font-semibold text-center">
                ✨ +{formatCurrency(session.cashbackEarned)} cashback on this bill
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Cash Payment Interface */
        <div className="max-w-md mx-auto bg-slate-900/80 border border-white/10 rounded-3xl p-8 backdrop-blur-md shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-brand-600/20 text-brand-300 flex items-center justify-center mx-auto">
            <Banknote size={36} />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Pay in Cash at Counter
            </p>
            <p className="text-5xl font-black text-brand-300 mt-1">
              {formatCurrency(session.amountPayable)}
            </p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 space-y-2 text-xs text-left">
            <div className="flex justify-between text-slate-300">
              <span>Bill Amount:</span>
              <span className="font-semibold text-white">{formatCurrency(session.billAmount)}</span>
            </div>
            {session.cashbackRedeemed > 0 && (
              <div className="flex justify-between text-rose-300">
                <span>Cashback Redeemed:</span>
                <span className="font-semibold">− {formatCurrency(session.cashbackRedeemed)}</span>
              </div>
            )}
            <div className="flex justify-between text-brand-300 font-bold pt-2 border-t border-white/10">
              <span>Cashback to Earn:</span>
              <span>+{formatCurrency(session.cashbackEarned)}</span>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Please pay cash at counter
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE 5: PAYMENT SUCCESSFUL
// ─────────────────────────────────────────────────────────────────────────────
function State5PaymentSuccessful({ session }: { session: DisplaySession }) {
  return (
    <div className="text-center space-y-6 animate-fade-in max-w-lg w-full">
      <div className="w-24 h-24 rounded-full bg-brand-600/20 flex items-center justify-center mx-auto ring-8 ring-brand-500/20 text-brand-300 animate-bounce duration-1000">
        <CheckCircle size={56} />
      </div>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-brand-300 font-bold">
          Transaction Confirmed
        </p>
        <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
          PAYMENT SUCCESSFUL
        </h2>
        <p className="text-base text-slate-300">
          Thank you, <strong>{session.customerName}</strong>!
        </p>
      </div>

      <div className="bg-slate-900/90 border border-brand-500/30 rounded-3xl p-6 backdrop-blur-md shadow-2xl space-y-3.5 text-left text-sm">
        <div className="flex justify-between text-slate-300">
          <span>Amount Paid:</span>
          <span className="text-xl font-black text-white">{formatCurrency(session.amountPayable)}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Payment Method:</span>
          <span className="font-semibold text-white uppercase text-xs bg-white/10 px-2.5 py-0.5 rounded-full">
            {session.paymentMethod === 'upi' ? 'UPI' : 'CASH'}
          </span>
        </div>

        <div className="pt-3 border-t border-white/10 space-y-2">
          <div className="flex justify-between text-brand-300 font-bold">
            <span>Cashback Earned:</span>
            <span className="text-lg">+{formatCurrency(session.cashbackEarned)}</span>
          </div>

          <div className="flex justify-between text-slate-200">
            <span>Updated Wallet Balance:</span>
            <span className="text-2xl font-black text-brand-200">
              {formatCurrency(session.newWalletBalance)}
            </span>
          </div>
        </div>

        {session.transactionId && (
          <p className="text-[11px] font-mono text-slate-500 pt-2 border-t border-white/5 truncate">
            Tx Ref: {session.transactionId}
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE 6: TRANSACTION COMPLETE & THANK YOU
// ─────────────────────────────────────────────────────────────────────────────
function State6TransactionComplete({ session }: { session: DisplaySession }) {
  return (
    <div className="text-center space-y-6 animate-fade-in max-w-lg w-full">
      <div className="w-24 h-24 rounded-full bg-brand-600/20 flex items-center justify-center mx-auto text-brand-300 ring-4 ring-brand-500/20">
        <Heart size={48} className="fill-brand-400" />
      </div>

      <div className="space-y-2">
        <h2 className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-brand-200 via-brand-100 to-white bg-clip-text text-transparent">
          Thank You!
        </h2>
        <p className="text-lg text-slate-300 font-medium">
          {session.shopName || 'Smart Cashback'}
        </p>
        <p className="text-sm text-brand-200 font-semibold">
          Cashback added to your wallet
        </p>
      </div>

      {session.newWalletBalance > 0 && (
        <div className="p-6 rounded-3xl bg-brand-950/60 border border-brand-500/30 text-center space-y-1 shadow-xl">
          <p className="text-xs uppercase tracking-wider text-brand-300 font-bold">
            Available Cashback
          </p>
          <p className="text-5xl font-black text-brand-100">
            {formatCurrency(session.newWalletBalance)}
          </p>
          <p className="text-xs text-slate-400 pt-2">
            Redeem on your next purchase
          </p>
        </div>
      )}

      {/* Auto-reset notice */}
      <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
        <RefreshCw size={12} className="animate-spin" />
        <span>Ready for next customer in {session.displayTimeoutSeconds || 5}s…</span>
      </div>
    </div>
  )
}
