import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, ShoppingBag, Gift, Receipt, Wallet,
  Search, ArrowRight, Sparkles
} from 'lucide-react'
import { db } from '@/lib/db'
import { formatCurrency, normalizeMobile } from '@/lib/cashback'
import { useSettingsStore } from '@/store/settingsStore'
import { useAuthStore } from '@/store/authStore'
import { getShopTheme } from '@/lib/shopThemes'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import type { Transaction, Customer } from '@/types'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Title, Tooltip, Legend
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function DashboardPage() {
  const { settings } = useSettingsStore()
  const { user } = useAuthStore()
  const shopTheme = getShopTheme(user?.shop_id)
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    todaySales: 0, totalCustomers: 0, todayNewCustomers: 0,
    totalCashbackIssued: 0, totalCashbackRedeemed: 0, outstandingCashback: 0,
  })
  const [recentTx, setRecentTx] = useState<(Transaction & { customer_name: string; customer_mobile: string })[]>([])
  const [dailySales, setDailySales] = useState<{ labels: string[]; data: number[] }>({ labels: [], data: [] })
  const [searchMobile, setSearchMobile] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    const today = new Date()
    const todayStart = startOfDay(today).toISOString()
    const todayEnd = endOfDay(today).toISOString()

    const [txRes, customersRes, todayTxRes, last7Res] = await Promise.all([
      db.from('transactions').select('amount_paid, cashback_earned, cashback_redeemed, status').eq('status', 'completed'),
      db.from('customers').select('id, created_at, cashback_balance').not('name', 'eq', '[Deleted Customer]').not('mobile', 'like', 'DEL%'),
      db.from('transactions').select('amount_paid').eq('status', 'completed').gte('created_at', todayStart).lte('created_at', todayEnd),
      db.from('transactions')
        .select('amount_paid, created_at, status')
        .eq('status', 'completed')
        .gte('created_at', subDays(today, 6).toISOString())
        .order('created_at', { ascending: true }),
    ])

    const txRows = (txRes.data as Transaction[]) ?? []
    const customers = (customersRes.data as Customer[]) ?? []
    const todayRows = (todayTxRes.data as Transaction[]) ?? []
    const last7 = (last7Res.data as Transaction[]) ?? []

    const todayNewCust = customers.filter((c: Customer) =>
      new Date(c.created_at) >= startOfDay(today)
    ).length

    const outstanding = customers.reduce((s: number, c: Customer) => s + (c.cashback_balance ?? 0), 0)

    setStats({
      todaySales: todayRows.reduce((s: number, t: Transaction) => s + t.amount_paid, 0),
      totalCustomers: customers.length,
      todayNewCustomers: todayNewCust,
      totalCashbackIssued: txRows.reduce((s: number, t: Transaction) => s + (t.cashback_earned ?? 0), 0),
      totalCashbackRedeemed: txRows.reduce((s: number, t: Transaction) => s + (t.cashback_redeemed ?? 0), 0),
      outstandingCashback: outstanding,
    })

    // Build daily chart (last 7 days)
    const dayMap: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      dayMap[format(subDays(today, i), 'dd MMM')] = 0
    }
    last7.forEach((t: Transaction) => {
      const day = format(new Date(t.created_at), 'dd MMM')
      dayMap[day] = (dayMap[day] ?? 0) + t.amount_paid
    })
    setDailySales({ labels: Object.keys(dayMap), data: Object.values(dayMap) })

    // Recent transactions
    const { data: recentData } = await db
      .from('transactions')
      .select('*, customers(name, mobile)')
      .order('created_at', { ascending: false })
      .limit(8)

    setRecentTx(
      (recentData ?? []).map((t: Record<string, unknown>) => ({
        ...t,
        customer_name: (t.customers as Customer | null)?.name ?? 'Unknown',
        customer_mobile: (t.customers as Customer | null)?.mobile ?? '',
      })) as (Transaction & { customer_name: string; customer_mobile: string })[]
    )

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const statCards = [
    { label: "Today's Sales", value: formatCurrency(stats.todaySales), icon: ShoppingBag, color: 'text-brand-700 dark:text-brand-300', bg: 'bg-brand-50/70 dark:bg-brand-950/40 border border-brand-100 dark:border-brand-900/60', iconBg: 'bg-brand-100 dark:bg-brand-900/60' },
    { label: 'Total Customers', value: stats.totalCustomers.toString(), icon: Users, color: 'text-brand-800 dark:text-brand-200', bg: 'bg-brand-50/50 dark:bg-brand-950/30 border border-brand-100 dark:border-brand-900/50', iconBg: 'bg-brand-100 dark:bg-brand-900/50' },
    { label: 'New Today', value: stats.todayNewCustomers.toString(), icon: Users, color: 'text-brand-700 dark:text-brand-300', bg: 'bg-brand-50/70 dark:bg-brand-950/40 border border-brand-100 dark:border-brand-900/60', iconBg: 'bg-brand-100 dark:bg-brand-900/60' },
    { label: 'Cashback Issued', value: formatCurrency(stats.totalCashbackIssued), icon: Gift, color: 'text-brand-700 dark:text-brand-300', bg: 'bg-brand-50/70 dark:bg-brand-950/40 border border-brand-100 dark:border-brand-900/60', iconBg: 'bg-brand-100 dark:bg-brand-900/60' },
    { label: 'Cashback Used', value: formatCurrency(stats.totalCashbackRedeemed), icon: Receipt, color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50/70 dark:bg-dark-950/40 border border-slate-200 dark:border-dark-800', iconBg: 'bg-slate-100 dark:bg-dark-900' },
    { label: 'Wallet Liability', value: formatCurrency(stats.outstandingCashback), icon: Wallet, color: 'text-brand-800 dark:text-brand-200', bg: 'bg-brand-100/60 dark:bg-brand-950/70 border border-brand-200 dark:border-brand-800', iconBg: 'bg-brand-200 dark:bg-brand-900' },
  ]

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: 'index' as const } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
      y: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, ticks: { font: { size: 11 }, color: '#94a3b8', callback: (v: number | string) => `₹${v}` } },
    },
  }

  const handleWalletSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchMobile.trim()) return
    navigate(`/wallet/lookup?mobile=${normalizeMobile(searchMobile.trim())}`)
  }

  return (
    <div className="space-y-6">
      {/* Dynamic Shop Hero Banner */}
      <div className={`relative overflow-hidden rounded-2xl p-5 border ${shopTheme.cardBorder} bg-gradient-to-r ${shopTheme.heroGradient} bg-white dark:bg-dark-900 shadow-sm transition-all`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${shopTheme.badgeBg} ${shopTheme.badgeText} border ${shopTheme.badgeBorder}`}>
                <Sparkles size={12} />
                Food Court Shop #{user?.shop_id || 18}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {format(new Date(), 'EEEE, dd MMMM yyyy')}
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {settings?.shop_name || shopTheme.name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {shopTheme.tagline}
            </p>
          </div>
          <button onClick={() => navigate('/billing')} className="btn-primary shadow-md hover:scale-[1.02] transition-transform">
            <Receipt size={16} />
            New Bill
          </button>
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="stat-card h-24 animate-pulse bg-slate-100 dark:bg-dark-800" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, bg, iconBg }) => (
            <div key={label} className={`rounded-2xl p-4 flex items-center gap-3.5 shadow-sm ${bg}`}>
              <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={color} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5 leading-tight font-medium">{label}</p>
                <p className={`text-xl font-extrabold ${color} truncate`}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick search + Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick wallet search */}
        <div className="page-card p-5 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Search size={15} className="text-brand-600 dark:text-brand-400" /> Quick Wallet Lookup
            </h2>
            <p className="text-xs text-slate-400 mt-1">Enter a mobile number to view customer wallet and history.</p>
          </div>
          <form onSubmit={handleWalletSearch} className="flex gap-2">
            <input
              type="tel"
              value={searchMobile}
              onChange={e => setSearchMobile(e.target.value)}
              placeholder="Enter mobile number"
              className="form-input flex-1"
              maxLength={10}
            />
            <button type="submit" className="btn-primary px-3.5">
              <ArrowRight size={16} />
            </button>
          </form>
        </div>

        {/* Daily sales chart */}
        <div className="page-card p-5 col-span-1 lg:col-span-2">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">Sales – Last 7 Days</h2>
          <div className="h-44">
            <Bar
              data={{
                labels: dailySales.labels,
                datasets: [{
                  label: 'Sales (₹)',
                  data: dailySales.data,
                  backgroundColor: shopTheme.glowColor,
                  borderColor: shopTheme.accentColor,
                  borderWidth: 2,
                  borderRadius: 6,
                }],
              }}
              options={chartOptions}
            />
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="page-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-dark-800">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">Recent Transactions</h2>
          <button
            onClick={() => navigate('/reports')}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-semibold flex items-center gap-1"
          >
            View all reports <ArrowRight size={13} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Service</th>
                <th>Bill</th>
                <th>Redeemed</th>
                <th>Paid</th>
                <th>Cashback</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400 text-sm">
                    No transactions yet.{' '}
                    <button onClick={() => navigate('/billing')} className="text-brand-600 dark:text-brand-400 hover:underline">
                      Create the first bill
                    </button>
                  </td>
                </tr>
              )}
              {recentTx.map(tx => (
                <tr key={tx.id}>
                  <td>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white text-xs">{tx.customer_name}</p>
                      <p className="text-slate-400 text-xs font-mono">{tx.customer_mobile}</p>
                    </div>
                  </td>
                  <td className="text-xs text-slate-700 dark:text-slate-300 font-medium">{tx.service_category}</td>
                  <td className="font-medium text-xs">{formatCurrency(tx.bill_amount)}</td>
                  <td className="text-xs text-orange-600 dark:text-orange-400 font-medium">{tx.cashback_redeemed > 0 ? `−${formatCurrency(tx.cashback_redeemed)}` : '—'}</td>
                  <td className="font-bold text-slate-900 dark:text-white text-xs">{formatCurrency(tx.amount_paid)}</td>
                  <td className="text-xs text-brand-600 dark:text-brand-400 font-semibold">+{formatCurrency(tx.cashback_earned)}</td>
                  <td className="text-xs text-slate-400 font-mono">{format(new Date(tx.created_at), 'hh:mm a')}</td>
                  <td>
                    <span className={`badge ${tx.status === 'completed' ? 'badge-green' : tx.status === 'cancelled' ? 'badge-red' : 'badge-yellow'}`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
