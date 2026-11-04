/**
 * CustomerDisplayPage – Full-screen customer-facing display.
 *
 * Opens on a second monitor at /customer-display.
 * No authentication required.
 * Receives real-time updates via BroadcastChannel from admin BillingPage.
 */
import { useEffect, useState } from 'react'
import { Zap, Wifi, WifiOff, ShoppingBag, CreditCard, QrCode, CheckCircle, Heart, Clock } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useDisplayStore, type DisplaySession } from '@/store/displayStore'
import { formatCurrency } from '@/lib/cashback'

export default function CustomerDisplayPage() {
  const { session, startListening } = useDisplayStore()
  const [connected, setConnected] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  // Start listening for admin broadcasts
  useEffect(() => {
    const cleanup = startListening()
    setConnected(true)
    return cleanup
  }, [startListening])

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const shopName = session.shopName || 'Smart Cashback Shop'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col overflow-hidden select-none">
      {/* ── Top Bar ── */}
      <header className="flex items-center justify-between px-8 py-4 bg-black/30 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">{shopName}</h1>
            <p className="text-xs text-emerald-400 font-medium">Smart Cashback System</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi size={16} className="text-emerald-400" />
            ) : (
              <WifiOff size={16} className="text-red-400" />
            )}
            <span className="text-xs text-slate-400">
              {connected ? 'Connected' : 'Waiting for connection…'}
            </span>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-white font-mono">
              {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </p>
            <p className="text-[10px] text-slate-400">
              {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 flex items-center justify-center p-8">
        {session.mode === 'welcome' && <WelcomeScreen shopName={shopName} />}
        {session.mode === 'billing' && <BillingScreen session={session} />}
        {session.mode === 'payment-pending' && <PaymentPendingScreen session={session} />}
        {session.mode === 'payment-success' && <PaymentSuccessScreen session={session} />}
        {session.mode === 'thank-you' && <ThankYouScreen session={session} />}
      </main>

      {/* ── Bottom Bar ── */}
      <footer className="px-8 py-3 bg-black/30 border-t border-white/5 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Earn {session.cashbackPercentage || 2}% cashback on every purchase of ₹99 or more
        </p>
        <p className="text-xs text-slate-600">
          Powered by Smart Cashback
        </p>
      </footer>
    </div>
  )
}

// ─── Welcome Screen (Idle) ─────────────────────────────────────────────────
function WelcomeScreen({ shopName }: { shopName: string }) {
  return (
    <div className="text-center space-y-8 animate-fade-in max-w-2xl">
      <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center mx-auto shadow-2xl shadow-emerald-500/30">
        <Zap size={56} className="text-white" />
      </div>
      <div>
        <h2 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
          Welcome to
        </h2>
        <h3 className="text-4xl font-bold text-emerald-400 mt-2">{shopName}</h3>
      </div>
      <p className="text-xl text-slate-400 font-medium">
        Earn cashback rewards on every purchase!
      </p>
      <div className="flex items-center justify-center gap-8 pt-4">
        <FeatureCard icon={ShoppingBag} label="Xerox & Print" />
        <FeatureCard icon={CreditCard} label="Mobile Recharge" />
        <FeatureCard icon={QrCode} label="UPI Payments" />
      </div>
    </div>
  )
}

function FeatureCard({ icon: Icon, label }: { icon: typeof ShoppingBag; label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm min-w-[140px]">
      <Icon size={28} className="text-emerald-400" />
      <span className="text-sm font-medium text-slate-300">{label}</span>
    </div>
  )
}

// ─── Billing Screen ─────────────────────────────────────────────────────────
function BillingScreen({ session }: { session: DisplaySession }) {
  return (
    <div className="w-full max-w-xl animate-fade-in space-y-6">
      {/* Customer greeting */}
      <div className="text-center space-y-2">
        <p className="text-lg text-slate-400">Hello,</p>
        <h2 className="text-4xl font-extrabold text-white">{session.customerName}</h2>
        <p className="text-sm text-slate-500 font-mono">{session.customerMobile}</p>
      </div>

      {/* Bill details card */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-300">Your Bill</h3>
          {session.serviceCategory && (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-medium border border-emerald-500/30">
              {session.serviceCategory}
            </span>
          )}
        </div>

        <div className="space-y-3 text-base">
          <BillRow label="Bill Amount" value={formatCurrency(session.billAmount)} />
          {session.cashbackRedeemed > 0 && (
            <BillRow
              label="Cashback Applied"
              value={`− ${formatCurrency(session.cashbackRedeemed)}`}
              className="text-orange-400"
            />
          )}
          <div className="border-t border-white/10 pt-3">
            <BillRow
              label="Amount to Pay"
              value={formatCurrency(session.amountPayable)}
              className="text-2xl font-extrabold text-emerald-400"
              labelClassName="text-lg font-semibold"
            />
          </div>
        </div>

        {session.cashbackEarned > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
            <p className="text-sm text-emerald-300">You'll earn</p>
            <p className="text-2xl font-bold text-emerald-400">
              +{formatCurrency(session.cashbackEarned)} cashback
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-slate-500">
        <Clock size={14} />
        <span className="text-sm">Preparing your payment…</span>
      </div>
    </div>
  )
}

// ─── Payment Pending Screen (QR Code) ───────────────────────────────────────
function PaymentPendingScreen({ session }: { session: DisplaySession }) {
  return (
    <div className="w-full max-w-2xl animate-fade-in space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-extrabold text-white">
          {session.paymentMethod === 'upi' ? 'Scan to Pay' : 'Payment'}
        </h2>
        <p className="text-slate-400 text-lg">{session.customerName}</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-center justify-center">
        {/* QR Code */}
        {session.paymentMethod === 'upi' && session.upiLink && (
          <div className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center">
            <div className="p-2 bg-white rounded-2xl">
              <QRCodeSVG
                value={session.upiLink}
                size={240}
                level="M"
                includeMargin={true}
              />
            </div>
            <p className="text-center text-slate-800 text-sm font-semibold mt-3">
              Scan with any UPI App (GPay, PhonePe, Paytm)
            </p>
          </div>
        )}

        {/* Payment Summary */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm space-y-5 min-w-[320px]">
          <div className="text-center space-y-1">
            <p className="text-sm text-slate-400 uppercase tracking-wider">Amount to Pay</p>
            <p className="text-5xl font-extrabold text-emerald-400">
              {formatCurrency(session.amountPayable)}
            </p>
          </div>

          {session.paymentMethod === 'upi' && (
            <div className="space-y-2 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Pay to UPI ID</p>
              <p className="text-lg font-mono font-semibold text-white bg-white/10 px-4 py-2 rounded-xl">
                {session.upiLink ? new URL(session.upiLink).searchParams.get('pa') : ''}
              </p>
            </div>
          )}

          {session.paymentMethod === 'cash' && (
            <div className="text-center space-y-2">
              <CreditCard size={48} className="text-emerald-400 mx-auto" />
              <p className="text-lg text-slate-300">Please pay cash at the counter</p>
            </div>
          )}

          {session.paymentMethod === 'card' && (
            <div className="text-center space-y-2">
              <CreditCard size={48} className="text-blue-400 mx-auto" />
              <p className="text-lg text-slate-300">Please tap/insert your card</p>
            </div>
          )}

          {session.cashbackEarned > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
              <p className="text-sm text-emerald-300">
                You'll earn <span className="font-bold">+{formatCurrency(session.cashbackEarned)}</span> cashback
              </p>
            </div>
          )}
        </div>
      </div>

      {session.paymentMethod === 'upi' && (
        <div className="flex items-center justify-center gap-2 animate-pulse">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-amber-400 text-sm font-medium">Waiting for payment…</span>
        </div>
      )}
    </div>
  )
}

// ─── Payment Success Screen ────────────────────────────────────────────────
function PaymentSuccessScreen({ session }: { session: DisplaySession }) {
  return (
    <div className="text-center space-y-8 animate-fade-in max-w-lg">
      <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto ring-4 ring-emerald-500/30">
        <CheckCircle size={56} className="text-emerald-400" />
      </div>

      <div className="space-y-2">
        <h2 className="text-4xl font-extrabold text-white">Payment Received!</h2>
        <p className="text-xl text-slate-400">Thank you, {session.customerName}</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm space-y-4 text-left">
        <BillRow label="Bill Amount" value={formatCurrency(session.billAmount)} />
        {session.cashbackRedeemed > 0 && (
          <BillRow label="Cashback Used" value={`− ${formatCurrency(session.cashbackRedeemed)}`} className="text-orange-400" />
        )}
        <BillRow label="Amount Paid" value={formatCurrency(session.amountPayable)} className="font-bold text-white text-lg" />
        <div className="border-t border-white/10 pt-4 space-y-3">
          {session.cashbackEarned > 0 && (
            <BillRow
              label="Cashback Earned"
              value={`+${formatCurrency(session.cashbackEarned)}`}
              className="text-emerald-400 font-bold text-lg"
            />
          )}
          <BillRow
            label="Wallet Balance"
            value={formatCurrency(session.newWalletBalance)}
            className="text-emerald-300 font-extrabold text-xl"
            labelClassName="font-semibold"
          />
        </div>
      </div>

      {session.transactionId && (
        <p className="text-xs text-slate-600 font-mono">Ref: {session.transactionId}</p>
      )}
    </div>
  )
}

// ─── Thank You Screen ──────────────────────────────────────────────────────
function ThankYouScreen({ session }: { session: DisplaySession }) {
  return (
    <div className="text-center space-y-8 animate-fade-in max-w-lg">
      <div className="w-24 h-24 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto">
        <Heart size={48} className="text-rose-400" />
      </div>
      <div className="space-y-3">
        <h2 className="text-5xl font-extrabold bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
          Thank You!
        </h2>
        <p className="text-xl text-slate-400">
          See you again, {session.customerName}!
        </p>
      </div>
      {session.newWalletBalance > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
          <p className="text-sm text-emerald-300 mb-1">Your cashback balance</p>
          <p className="text-4xl font-extrabold text-emerald-400">
            {formatCurrency(session.newWalletBalance)}
          </p>
          <p className="text-xs text-emerald-300/60 mt-2">Redeem on your next visit!</p>
        </div>
      )}
    </div>
  )
}

// ─── Shared Components ─────────────────────────────────────────────────────
function BillRow({
  label,
  value,
  className = '',
  labelClassName = '',
}: {
  label: string
  value: string
  className?: string
  labelClassName?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-slate-400 ${labelClassName}`}>{label}</span>
      <span className={`font-semibold ${className || 'text-white'}`}>{value}</span>
    </div>
  )
}

