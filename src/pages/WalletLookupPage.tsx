import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import {
  Search, Wallet, Receipt, Gift, ShoppingBag,
  Users, ChevronRight
} from 'lucide-react'
import { db } from '@/lib/db'
import { formatCurrency, validateMobile, normalizeMobile } from '@/lib/cashback'
import { format } from 'date-fns'
import type { Customer, Transaction } from '@/types'

export default function WalletLookupPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Determine active view: 'overview' (Cashback Wallet) vs 'lookup' (Wallet Lookup)
  const isLookupPath = location.pathname.includes('/lookup') || searchParams.get('tab') === 'lookup'
  const [activeTab, setActiveTab] = useState<'overview' | 'lookup'>(isLookupPath ? 'lookup' : 'overview')

  // Overview State
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [overviewSearch, setOverviewSearch] = useState('')
  const [loadingOverview, setLoadingOverview] = useState(false)
  const [walletStats, setWalletStats] = useState({
    outstandingBalance: 0,
    totalIssued: 0,
    totalRedeemed: 0,
    walletsWithBalance: 0,
  })

  // Individual Lookup State
  const [mobile, setMobile] = useState(searchParams.get('mobile') ?? '')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [searched, setSearched] = useState(false)
  const [loadingLookup, setLoadingLookup] = useState(false)
  const [mobileError, setMobileError] = useState('')

  useEffect(() => {
    if (location.pathname.includes('/lookup')) {
      setActiveTab('lookup')
    }
  }, [location.pathname])

  // ─────────────────────────────────────────────────────────────
  // 1. CASHBACK WALLET OVERVIEW DATA
  // ─────────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true)
    const { data } = await db
      .from('customers')
      .select('*')
      .not('name', 'eq', '[Deleted Customer]')
      .not('mobile', 'like', 'DEL%')
      .order('cashback_balance', { ascending: false })

    const list = (data as Customer[]) ?? []
    setAllCustomers(list)

    const outstanding = list.reduce((sum, c) => sum + (c.cashback_balance || 0), 0)
    const issued = list.reduce((sum, c) => sum + (c.cashback_earned || 0), 0)
    const redeemed = list.reduce((sum, c) => sum + (c.cashback_redeemed || 0), 0)
    const activeCount = list.filter(c => (c.cashback_balance || 0) > 0).length

    setWalletStats({
      outstandingBalance: outstanding,
      totalIssued: issued,
      totalRedeemed: redeemed,
      walletsWithBalance: activeCount,
    })
    setLoadingOverview(false)
  }, [])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  // ─────────────────────────────────────────────────────────────
  // 2. INDIVIDUAL WALLET LOOKUP
  // ─────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async (searchMobile?: string) => {
    const m = normalizeMobile((searchMobile ?? mobile).trim())
    if (!validateMobile(m)) {
      setMobileError('Enter a valid 10-digit mobile number')
      return
    }
    setMobileError('')
    setLoadingLookup(true)
    setSearched(true)

    const { data: cust } = await db
      .from('customers')
      .select('*')
      .eq('mobile', m)
      .maybeSingle()

    setCustomer(cust as Customer | null)

    if (cust) {
      const { data: txs } = await db
        .from('transactions')
        .select('*')
        .eq('customer_id', cust.id)
        .order('created_at', { ascending: false })
        .limit(50)

      setTransactions((txs as Transaction[]) ?? [])
    } else {
      setTransactions([])
    }
    setLoadingLookup(false)
  }, [mobile])

  useEffect(() => {
    const m = searchParams.get('mobile')
    if (m) {
      setMobile(m)
      setActiveTab('lookup')
      handleSearch(m)
    }
  }, [searchParams, handleSearch])

  const filteredCustomers = allCustomers.filter(c => {
    if (!overviewSearch.trim()) return true
    const q = overviewSearch.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.mobile.includes(q)
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Wallet size={22} className="text-brand-600 dark:text-brand-400" />
            {activeTab === 'overview' ? 'Cashback Wallet' : 'Wallet Lookup'}
          </h1>
          <p className="section-subtitle">
            {activeTab === 'overview'
              ? 'Customer wallet liability, balances, and reward overview'
              : 'Search individual customer wallet passbook & history'}
          </p>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex p-1 bg-slate-100 dark:bg-dark-900 rounded-xl border border-slate-200/80 dark:border-dark-800">
          <button
            onClick={() => {
              setActiveTab('overview')
              navigate('/wallet')
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'overview'
                ? 'bg-white dark:bg-dark-800 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Cashback Wallet
          </button>
          <button
            onClick={() => {
              setActiveTab('lookup')
              navigate('/wallet/lookup')
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'lookup'
                ? 'bg-white dark:bg-dark-800 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Wallet Lookup
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: CASHBACK WALLET OVERVIEW
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Outstanding Liability
                </span>
                <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950/70 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <Wallet size={16} />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
                {formatCurrency(walletStats.outstandingBalance)}
              </p>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Total Cashback Issued
                </span>
                <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950/70 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <Gift size={16} />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-brand-600 dark:text-brand-400">
                {formatCurrency(walletStats.totalIssued)}
              </p>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Total Cashback Used
                </span>
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
                  <Receipt size={16} />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-slate-800 dark:text-slate-200">
                {formatCurrency(walletStats.totalRedeemed)}
              </p>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Active Wallets
                </span>
                <div className="w-8 h-8 rounded-lg bg-brand-100/60 dark:bg-brand-950/70 text-brand-700 dark:text-brand-300 flex items-center justify-center">
                  <Users size={16} />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
                {walletStats.walletsWithBalance} / {allCustomers.length}
              </p>
            </div>
          </div>

          {/* Search and Table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={overviewSearch}
                  onChange={e => setOverviewSearch(e.target.value)}
                  placeholder="Filter by customer name or mobile number…"
                  className="form-input pl-10 text-xs py-2"
                />
              </div>
              <span className="text-xs text-slate-400">
                {filteredCustomers.length} wallets
              </span>
            </div>

            <div className="page-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Mobile</th>
                    <th>Total Purchases</th>
                    <th>Cashback Earned</th>
                    <th>Redeemed</th>
                    <th>Available Balance</th>
                    <th className="text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingOverview && (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-400">
                        Loading wallets…
                      </td>
                    </tr>
                  )}
                  {!loadingOverview && filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 text-sm">
                        No customer wallets found.
                      </td>
                    </tr>
                  )}
                  {filteredCustomers.map(c => (
                    <tr key={c.id}>
                      <td className="font-semibold text-slate-900 dark:text-white">
                        {c.name}
                      </td>
                      <td className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {c.mobile}
                      </td>
                      <td className="text-slate-700 dark:text-slate-300">
                        {formatCurrency(c.total_purchases)}
                      </td>
                      <td className="text-brand-600 dark:text-brand-400 font-medium">
                        {formatCurrency(c.cashback_earned)}
                      </td>
                      <td className="text-orange-600 dark:text-orange-400 font-medium">
                        {formatCurrency(c.cashback_redeemed)}
                      </td>
                      <td>
                        <span className={`font-bold text-sm ${c.cashback_balance > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>
                          {formatCurrency(c.cashback_balance)}
                        </span>
                      </td>
                      <td className="text-right pr-4">
                        <button
                          onClick={() => {
                            setMobile(c.mobile)
                            setActiveTab('lookup')
                            navigate(`/wallet/lookup?mobile=${c.mobile}`)
                            handleSearch(c.mobile)
                          }}
                          className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1"
                        >
                          <span>Passbook</span>
                          <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: INDIVIDUAL WALLET LOOKUP (Phone search)
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'lookup' && (
        <div className="space-y-6 animate-fade-in max-w-3xl">
          {/* Search Box */}
          <div className="page-card p-5">
            <form
              onSubmit={e => {
                e.preventDefault()
                handleSearch()
              }}
              className="flex gap-3"
            >
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="tel"
                  value={mobile}
                  onChange={e => setMobile(e.target.value)}
                  placeholder="Enter 10-digit mobile number"
                  className={`form-input pl-10 text-lg tracking-wider ${
                    mobileError ? 'border-rose-400 dark:border-rose-500' : ''
                  }`}
                  maxLength={10}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn-primary px-6"
                disabled={loadingLookup}
              >
                {loadingLookup ? 'Searching…' : 'Search Wallet'}
              </button>
            </form>
            {mobileError && <p className="form-error mt-1.5">{mobileError}</p>}
          </div>

          {/* Not found */}
          {searched && !loadingLookup && !customer && (
            <div className="page-card p-8 text-center animate-fade-in">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">No customer found</p>
              <p className="text-sm text-slate-400 mt-1">
                No active account found for mobile <strong>{normalizeMobile(mobile)}</strong>
              </p>
              <button
                onClick={() => navigate('/billing')}
                className="btn-primary mt-4 text-xs"
              >
                Create Bill & Register
              </button>
            </div>
          )}

          {/* Customer Wallet Found */}
          {customer && (
            <div className="space-y-5 animate-fade-in">
              {/* Header card */}
              <div className="page-card p-5 bg-gradient-to-r from-slate-50 to-brand-50/50 dark:from-dark-900 dark:to-brand-950/40 border border-brand-200/60 dark:border-brand-900/60 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {customer.name}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    {customer.mobile}
                  </p>
                </div>
                <div className="text-right bg-white dark:bg-dark-950 px-4 py-2 rounded-xl border border-slate-200/70 dark:border-dark-800 shadow-sm">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Available Balance</p>
                  <p className="text-2xl font-extrabold text-brand-600 dark:text-brand-400">
                    {formatCurrency(customer.cashback_balance)}
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Purchases', value: formatCurrency(customer.total_purchases), icon: ShoppingBag, color: 'text-slate-700 dark:text-slate-300' },
                  { label: 'Cashback Earned', value: formatCurrency(customer.cashback_earned), icon: Gift, color: 'text-brand-600 dark:text-brand-400' },
                  { label: 'Cashback Used', value: formatCurrency(customer.cashback_redeemed), icon: Receipt, color: 'text-slate-600 dark:text-slate-400' },
                  { label: 'Wallet Balance', value: formatCurrency(customer.cashback_balance), icon: Wallet, color: 'text-brand-700 dark:text-brand-300' },
                ].map(({ label, value, icon: Icon, color }, i) => (
                  <div key={i} className="stat-card p-4">
                    <Icon size={16} className={`${color} mb-1`} />
                    <p className="text-xs text-slate-400 font-medium">{label}</p>
                    <p className={`text-base font-bold ${color} mt-0.5`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Recent Transactions */}
              <div className="page-card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-dark-800 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Recent Purchase Transactions
                  </h3>
                  <button
                    onClick={() => navigate(`/customers/${customer.id}`)}
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-semibold"
                  >
                    View Full Ledger →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Category</th>
                        <th>Bill Amount</th>
                        <th>Redeemed</th>
                        <th>Amount Paid</th>
                        <th>Cashback Earned</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-6 text-slate-400 text-sm">
                            No transactions recorded yet.
                          </td>
                        </tr>
                      )}
                      {transactions.map(tx => (
                        <tr key={tx.id}>
                          <td className="text-xs text-slate-500 font-mono">
                            {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                          </td>
                          <td className="font-medium text-slate-800 dark:text-slate-200">{tx.service_category}</td>
                          <td>{formatCurrency(tx.bill_amount)}</td>
                          <td className="text-orange-600 dark:text-orange-400 font-medium">
                            {tx.cashback_redeemed > 0 ? `− ${formatCurrency(tx.cashback_redeemed)}` : '—'}
                          </td>
                          <td className="font-bold text-slate-900 dark:text-white">{formatCurrency(tx.amount_paid)}</td>
                          <td className="text-brand-600 dark:text-brand-400 font-semibold">
                            +{formatCurrency(tx.cashback_earned)}
                          </td>
                          <td>
                            <span className="badge badge-green capitalize text-[11px]">
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
          )}
        </div>
      )}
    </div>
  )
}
