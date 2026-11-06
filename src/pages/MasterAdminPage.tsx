import { useState, useEffect } from 'react'
import {
  ShieldCheck, Store, Users,
  RefreshCw, Eye, EyeOff, KeyRound, Search, Download, ChevronDown, ChevronRight,
  Clock, X, UserPlus, Phone, User, Wallet
} from 'lucide-react'
import { cloudflareApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

interface OverviewData {
  totals: {
    total_sales: number
    total_transactions: number
    total_cashback_issued: number
    total_cashback_redeemed: number
    today_sales: number
    today_transactions: number
    unique_customers: number
    total_wallets: number
    total_wallet_liability: number
  }
  shops: Array<{
    id: number
    name: string
    slug: string
    login_id: string
    icon: string
    is_active: number
    total_sales: number
    total_transactions: number
    cashback_issued: number
    cashback_redeemed: number
    today_sales: number
    customer_count: number
    wallet_balance: number
  }>
  categoryBreakdown: Array<{
    category: string
    transaction_count: number
    total_sales: number
    cashback_earned: number
  }>
  securityAlerts: Array<{
    id: string
    shop_id: number
    shop_name: string
    login_id: string
    failed_attempts: number
    is_locked: number
    lock_reason: string
    locked_at: string | null
  }>
  hourlyDistribution: Array<{
    hour: number
    tx_count: number
    total_sales: number
  }>
  retention: {
    total_customers: number
    single_shop_customers: number
    multi_shop_customers: number
    three_plus_shop_customers: number
    cross_visit_rate: number
  }
}

export default function MasterAdminPage() {
  const { user, signIn, signOut, loading: authLoading } = useAuthStore()

  // Login form state
  const [email, setEmail] = useState('sivar75@gmail.com')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Self-recovery modal
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [recoveryPin, setRecoveryPin] = useState('')
  const [recovering, setRecovering] = useState(false)

  // Dashboard state
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'shops' | 'customers' | 'categories' | 'analytics'>('shops')

  // Edit shop modal state
  const [editingShop, setEditingShop] = useState<OverviewData['shops'][0] | null>(null)
  const [editName, setEditName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [, setResettingDefaultId] = useState<number | null>(null)

  // Customer Explorer State
  const [customerMode, setCustomerMode] = useState<'customer' | 'shop'>('customer')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedShopFilter, setSelectedShopFilter] = useState<string>('')
  const [customersData, setCustomersData] = useState<any[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [expandedCustomerMobiles, setExpandedCustomerMobiles] = useState<Record<string, boolean>>({})

  // Add Customer Modal State
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [newCustName, setNewCustName] = useState('')
  const [newCustMobile, setNewCustMobile] = useState('')
  const [newCustShopId, setNewCustShopId] = useState<number>(18)
  const [newCustBalance, setNewCustBalance] = useState<string>('')
  const [addingCustomer, setAddingCustomer] = useState(false)

  const isSuperAdmin = user?.role === 'super_admin'

  const fetchOverview = async () => {
    setLoading(true)
    const { data, error } = await cloudflareApi.owner.getOverview()
    setLoading(false)
    if (error) {
      toast.error(error.message || 'Failed to load master admin overview')
    } else if (data) {
      setOverview(data as any)
    }
  }

  const fetchCustomers = async (modeOverride?: 'customer' | 'shop', shopOverride?: string, searchOverride?: string) => {
    const activeMode = modeOverride || customerMode
    const activeShop = shopOverride !== undefined ? shopOverride : selectedShopFilter
    const activeSearch = searchOverride !== undefined ? searchOverride : customerSearch

    setLoadingCustomers(true)
    const { data, error } = await cloudflareApi.owner.getCustomers({
      search: activeSearch.trim() || undefined,
      shop_id: activeShop ? parseInt(activeShop, 10) : undefined,
      mode: activeMode
    })
    setLoadingCustomers(false)
    if (error) {
      toast.error(error.message || 'Failed to load customer directory')
    } else if (data?.data) {
      setCustomersData(data.data)
    }
  }

  const handleToggleShopActive = async (shop: OverviewData['shops'][0]) => {
    const nextActive = shop.is_active !== 1
    const { error } = await cloudflareApi.owner.updateShop(shop.id, {
      is_active: nextActive
    })
    if (error) {
      toast.error(error.message || 'Failed to update shop status')
    } else {
      toast.success(`Shop ${shop.id} (${shop.name}) marked as ${nextActive ? 'Active' : 'Disabled'}`)
      fetchOverview()
    }
  }

  useEffect(() => {
    document.title = 'Master Admin | Smart Cashback Food Court'
    if (isSuperAdmin) {
      fetchOverview()
    }
  }, [isSuperAdmin])

  useEffect(() => {
    if (isSuperAdmin && activeTab === 'customers') {
      fetchCustomers()
    }
  }, [isSuperAdmin, activeTab, customerMode, selectedShopFilter])

  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    if (!password) {
      setLoginError('Password is required')
      return
    }

    const { error } = await signIn(email.trim(), password)
    if (error) {
      setLoginError(error)
      toast.error('Access denied. Invalid credentials.')
    } else {
      toast.success('Welcome to Master Admin!')
    }
  }

  const handleMasterRecovery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recoveryPin.trim()) {
      toast.error('Please enter the 4-digit recovery PIN')
      return
    }

    setRecovering(true)
    const { data, error } = await cloudflareApi.auth.ownerRecovery({
      email: 'sivar75@gmail.com',
      recovery_pin: recoveryPin.trim()
    })
    setRecovering(false)

    if (error) {
      toast.error(error.message || 'Master Admin recovery failed. Incorrect PIN.')
    } else {
      toast.success(data?.message || 'Password restored to San@1818!')
      setShowRecoveryModal(false)
      setPassword('San@1818')
      setRecoveryPin('')
    }
  }

  const handle1ClickDefaultReset = async (shopId: number) => {
    setResettingDefaultId(shopId)
    const { data, error } = await cloudflareApi.owner.resetDefaultPassword(shopId)
    setResettingDefaultId(null)

    if (error) {
      toast.error(error.message || 'Failed to reset shop password')
    } else {
      toast.success(data?.message || `Shop ${shopId} password reset to default!`)
      fetchOverview()
    }
  }

  const handleOpenEdit = (shop: OverviewData['shops'][0]) => {
    setEditingShop(shop)
    setEditName(shop.name)
    setEditActive(shop.is_active === 1)
    setNewPassword('')
  }

  const handleSaveShop = async () => {
    if (!editingShop) return
    setUpdating(true)
    const { error } = await cloudflareApi.owner.updateShop(editingShop.id, {
      name: editName,
      is_active: editActive,
      new_password: newPassword || undefined
    })
    setUpdating(false)

    if (error) {
      toast.error(error.message || 'Failed to update shop')
    } else {
      toast.success(`Shop ${editingShop.id} updated successfully!`)
      setEditingShop(null)
      fetchOverview()
    }
  }

  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustName.trim()) {
      toast.error('Customer name is required')
      return
    }
    const cleanMob = newCustMobile.trim().replace(/\D/g, '')
    if (!/^[6-9]\d{9}$/.test(cleanMob)) {
      toast.error('Please enter a valid 10-digit mobile number starting with 6-9')
      return
    }

    const initBal = newCustBalance.trim() ? parseFloat(newCustBalance) : 0
    if (isNaN(initBal) || initBal < 0) {
      toast.error('Initial cashback balance must be a non-negative number')
      return
    }

    setAddingCustomer(true)
    const { data, error } = await cloudflareApi.owner.addCustomer({
      name: newCustName.trim(),
      mobile: cleanMob,
      shop_id: newCustShopId,
      initial_balance: initBal
    })
    setAddingCustomer(false)

    if (error) {
      toast.error(error.message || 'Failed to add customer')
    } else {
      toast.success(data?.message || 'Customer added successfully by Master Admin!')
      setShowAddCustomerModal(false)
      setNewCustName('')
      setNewCustMobile('')
      setNewCustBalance('')
      setNewCustShopId(18)
      fetchCustomers()
    }
  }

  const toggleCustomerExpand = (mob: string) => {
    setExpandedCustomerMobiles(prev => ({
      ...prev,
      [mob]: !prev[mob]
    }))
  }

  const exportCustomersToExcel = () => {
    if (customersData.length === 0) {
      toast.error('No customer data to export')
      return
    }

    let rows: any[] = []
    if (customerMode === 'customer') {
      rows = customersData.map(c => ({
        'Customer Name': c.name,
        'Mobile Number': c.mobile,
        'Combined Wallet Balance (₹)': c.total_combined_balance,
        'Total Purchases (₹)': c.total_combined_purchases,
        'Total Cashback Earned (₹)': c.total_combined_earned,
        'Total Cashback Redeemed (₹)': c.total_combined_redeemed,
        'Shops Visited Count': c.total_shops_visited,
        'Added By / Source': c.added_by || 'Shop',
        'Visited Shops List': (c.shops || []).map((s: any) => `${s.shop_name} (₹${s.cashback_balance})`).join(', '),
        'Most Recent Activity': c.most_recent_activity ? new Date(c.most_recent_activity).toLocaleString('en-IN') : 'N/A'
      }))
    } else {
      rows = customersData.map(c => ({
        'Shop Number': c.shop_id,
        'Shop Name': c.shop_name,
        'Customer Name': c.name,
        'Mobile Number': c.mobile,
        'Wallet Balance (₹)': c.cashback_balance,
        'Total Purchases (₹)': c.total_purchases,
        'Cashback Earned (₹)': c.cashback_earned,
        'Cashback Redeemed (₹)': c.cashback_redeemed,
        'Added By / Source': c.added_by || 'Shop',
        'Recent Category': c.recent_category || 'N/A',
        'Last Purchase Date': c.last_purchase_date ? new Date(c.last_purchase_date).toLocaleString('en-IN') : 'N/A'
      }))
    }

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'FoodCourt_Customers')
    const fileName = `FoodCourt_Customers_${customerMode}_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, fileName)
    toast.success(`Exported ${rows.length} records to Excel!`)
  }

  // ─── 1. Login Screen (when not super_admin) ─────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-dark-950 to-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-dark-900/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-black/90">
            <div className="text-center mb-8">
              <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-600 items-center justify-center shadow-lg shadow-rose-600/30 mb-4">
                <ShieldCheck size={32} className="text-white" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-2">
                Secret Master Admin Portal
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">Master Admin</h1>
              <p className="text-xs text-slate-400 mt-1">Multi-Tenant 18-Shop Administration</p>
            </div>

            <form onSubmit={handleMasterLogin} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Master Admin Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-rose-500 transition-colors"
                  placeholder="sivar75@gmail.com"
                  disabled={authLoading}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Master Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowRecoveryModal(true)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value)
                      if (loginError) setLoginError('')
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-rose-500 transition-colors pr-10"
                    placeholder="••••••••"
                    disabled={authLoading}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {loginError && <p className="text-xs text-rose-400 mt-1">{loginError}</p>}
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-lg shadow-rose-600/25 transition-all mt-4 disabled:opacity-50"
              >
                {authLoading ? 'Verifying Master Credentials…' : 'Access Master Admin Portal'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-800 text-center">
              <p className="text-[11px] text-slate-500">
                Confidential Master Admin URL • Unauthorized Access Strictly Prohibited
              </p>
            </div>
          </div>
        </div>

        {/* Self-Recovery Modal */}
        {showRecoveryModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl animate-fade-in">
              <div className="flex items-center gap-2.5 text-amber-400 mb-2">
                <KeyRound size={20} />
                <h3 className="text-sm font-bold text-white">Master Admin Self-Recovery</h3>
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Restore the master admin account (<span className="text-slate-200 font-mono">sivar75@gmail.com</span>) back to default password <span className="text-amber-400 font-mono">San@1818</span> using your secret recovery PIN.
              </p>

              <form onSubmit={handleMasterRecovery} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Master Recovery PIN
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="Enter 4-digit PIN (1818)"
                    value={recoveryPin}
                    onChange={e => setRecoveryPin(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-center tracking-widest font-mono text-base focus:outline-none focus:border-amber-500"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRecoveryModal(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={recovering}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/30 disabled:opacity-50"
                  >
                    {recovering ? 'Resetting…' : 'Restore Default Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── 2. Master Portal Dashboard ─────────────────────────────────────────────
  const t = overview?.totals
  const alerts = overview?.securityAlerts || []

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center shadow-md shadow-rose-600/30">
            <ShieldCheck size={22} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Master Admin</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                18 Shops
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                Master Admin Portal
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Food Court Multi-Tenant Control System • Logged in as <span className="text-slate-200 font-medium">Master Admin</span> ({user?.email})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchOverview()
              if (activeTab === 'customers') fetchCustomers()
            }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-rose-400' : ''} />
            Refresh Data
          </button>
          <button
            onClick={() => {
              signOut()
              toast.success('Signed out from Master Admin')
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition-all"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Security Lockout Alerts Banner (if any) */}
        {alerts.length > 0 && (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/80 shadow-lg shadow-rose-950/50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-rose-600 text-white">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-rose-200">
                    Security Alerts: {alerts.length} {alerts.length === 1 ? 'Shop Account Locked' : 'Shop Accounts Locked'}
                  </h3>
                  <p className="text-xs text-rose-300/80 mt-0.5">
                    The following shops have exceeded 5 failed password attempts or requested a Master Admin password reset:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {alerts.map(a => (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-900/60 border border-rose-700 text-xs">
                        <span className="font-bold text-white">Shop {a.shop_id.toString().padStart(2, '0')}: {a.shop_name}</span>
                        <span className="text-[10px] text-rose-300 font-mono">({a.failed_attempts} fails)</span>
                        <button
                          onClick={() => handle1ClickDefaultReset(a.shop_id)}
                          className="ml-1 px-2 py-0.5 rounded-lg bg-white text-rose-900 font-bold text-[10px] hover:bg-rose-100 transition-colors"
                        >
                          Reset Default Pwd
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <p className="text-xs text-slate-400 font-medium">Total Food Court Sales</p>
            <p className="text-2xl font-black text-white mt-1">₹{(t?.total_sales || 0).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-emerald-400 mt-0.5">₹{(t?.today_sales || 0).toLocaleString('en-IN')} today</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <p className="text-xs text-slate-400 font-medium">Completed Orders</p>
            <p className="text-2xl font-black text-white mt-1">{(t?.total_transactions || 0).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{t?.today_transactions || 0} today</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <p className="text-xs text-slate-400 font-medium">Unique Customers</p>
            <p className="text-2xl font-black text-white mt-1">{(t?.unique_customers || 0).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-indigo-400 mt-0.5">{t?.total_wallets || 0} active shop wallets</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <p className="text-xs text-slate-400 font-medium">Total Cashback Liability</p>
            <p className="text-2xl font-black text-amber-400 mt-1">₹{(t?.total_wallet_liability || 0).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">₹{(t?.total_cashback_redeemed || 0).toLocaleString('en-IN')} redeemed</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 space-x-2">
          <button
            onClick={() => setActiveTab('shops')}
            className={`py-3 px-4 font-bold text-xs rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'shops'
                ? 'border-rose-500 text-rose-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Store size={15} />
            18 Food Court Shops
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`py-3 px-4 font-bold text-xs rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'customers'
                ? 'border-rose-500 text-rose-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={15} />
            Customers & Wallets Explorer
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`py-3 px-4 font-bold text-xs rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'categories'
                ? 'border-rose-500 text-rose-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Categories Breakdown
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-3 px-4 font-bold text-xs rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'analytics'
                ? 'border-rose-500 text-rose-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Traffic & Rush Hours
          </button>
        </div>

        {/* ─── TAB 1: 18 SHOPS LEADERBOARD & MANAGEMENT ─── */}
        {activeTab === 'shops' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Shop</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">Today's Sales</th>
                    <th className="py-3.5 px-4 font-semibold">Total Revenue</th>
                    <th className="py-3.5 px-4 font-semibold">Orders</th>
                    <th className="py-3.5 px-4 font-semibold">Customers</th>
                    <th className="py-3.5 px-4 font-semibold">Wallet Liability</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(overview?.shops || []).map(s => (
                    <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center font-bold text-xs">
                            {s.id.toString().padStart(2, '0')}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-100 text-sm">{s.name}</p>
                            <p className="text-[11px] text-slate-500">ID: {s.login_id} • Default: shop@{s.id.toString().padStart(2, '0')}{s.id.toString().padStart(2, '0')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleShopActive(s)}
                          title={`Click to ${s.is_active === 1 ? 'Disable' : 'Enable'} Shop ${s.id}`}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-all hover:scale-105 ${
                            s.is_active === 1
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${s.is_active === 1 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {s.is_active === 1 ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        ₹{s.today_sales.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-400">
                        ₹{s.total_sales.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {s.total_transactions}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {s.customer_count}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-amber-400">
                        ₹{s.wallet_balance.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => handle1ClickDefaultReset(s.id)}
                          title="Restore default password pattern"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/80 transition-colors"
                        >
                          <KeyRound size={11} />
                          Default Pwd
                        </button>
                        <button
                          onClick={() => handleOpenEdit(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── TAB 2: CUSTOMERS & WALLETS EXPLORER ─── */}
        {activeTab === 'customers' && (
          <div className="space-y-4 animate-fade-in">
            {/* Control & Search Bar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setCustomerMode('customer')
                    fetchCustomers('customer', selectedShopFilter, customerSearch)
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    customerMode === 'customer'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Mode A: Customer-Wise (Grouped)
                </button>
                <button
                  onClick={() => {
                    setCustomerMode('shop')
                    fetchCustomers('shop', selectedShopFilter, customerSearch)
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    customerMode === 'shop'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Mode B: Shop-Wise View
                </button>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by name or mobile number…"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') fetchCustomers(customerMode, selectedShopFilter, e.currentTarget.value)
                    }}
                    className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                  {customerSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerSearch('')
                        fetchCustomers(customerMode, selectedShopFilter, '')
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                      title="Clear search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => fetchCustomers(customerMode, selectedShopFilter, customerSearch)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white border border-slate-700"
                >
                  Search
                </button>
              </div>

              {/* Action Buttons & Shop Filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedShopFilter}
                  onChange={e => {
                    const val = e.target.value
                    setSelectedShopFilter(val)
                    fetchCustomers(customerMode, val, customerSearch)
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 cursor-pointer focus:outline-none focus:border-rose-500"
                >
                  <option value="">All 18 Shops</option>
                  {(overview?.shops || []).map(s => (
                    <option key={s.id} value={s.id.toString()}>
                      Shop {s.id.toString().padStart(2, '0')}: {s.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setShowAddCustomerModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/25 transition-all"
                >
                  <UserPlus size={13} />
                  + Add Customer
                </button>

                <button
                  onClick={exportCustomersToExcel}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all"
                >
                  <Download size={13} />
                  Export Excel
                </button>
              </div>
            </div>

            {/* Customer Directory Table */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              {loadingCustomers ? (
                <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <RefreshCw size={20} className="animate-spin text-rose-500" />
                  Loading customers from Cloudflare D1…
                </div>
              ) : customersData.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  No customer records found matching current filters.
                </div>
              ) : customerMode === 'customer' ? (
                /* Mode A Table: Grouped by Mobile */
                <div className="divide-y divide-slate-800/80 text-xs">
                  <div className="grid grid-cols-12 bg-slate-950/80 px-4 py-3 font-semibold text-slate-400 border-b border-slate-800">
                    <div className="col-span-3">Customer & Mobile</div>
                    <div className="col-span-2 text-right">Combined Balance</div>
                    <div className="col-span-2 text-right">Total Purchases</div>
                    <div className="col-span-1 text-center">Shops</div>
                    <div className="col-span-2 text-center">Source</div>
                    <div className="col-span-1 text-right">Activity</div>
                    <div className="col-span-1 text-center">Breakdown</div>
                  </div>

                  {customersData.map((c: any) => {
                    const isExpanded = !!expandedCustomerMobiles[c.mobile]
                    return (
                      <div key={c.mobile} className="hover:bg-slate-800/30 transition-colors">
                        <div
                          onClick={() => toggleCustomerExpand(c.mobile)}
                          className="grid grid-cols-12 px-4 py-3.5 items-center cursor-pointer"
                        >
                          <div className="col-span-3">
                            <p className="font-bold text-sm text-white">{c.name}</p>
                            <p className="font-mono text-[11px] text-slate-400">{c.mobile}</p>
                          </div>
                          <div className="col-span-2 text-right">
                            <span className="font-bold text-sm text-emerald-400">
                              ₹{(c.total_combined_balance || 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="col-span-2 text-right text-slate-300">
                            ₹{(c.total_combined_purchases || 0).toFixed(2)}
                          </div>
                          <div className="col-span-1 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                              {c.total_shops_visited}
                            </span>
                          </div>
                          <div className="col-span-2 text-center">
                            {c.added_by === 'Master Admin' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                <ShieldCheck size={11} />
                                Master Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                <Store size={11} />
                                Shop
                              </span>
                            )}
                          </div>
                          <div className="col-span-1 text-right text-slate-400 text-[11px]">
                            {c.most_recent_activity ? new Date(c.most_recent_activity).toLocaleDateString('en-IN') : 'N/A'}
                          </div>
                          <div className="col-span-1 text-center text-slate-400">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </div>

                        {/* Expanded Shop Breakdown Drawer */}
                        {isExpanded && (
                          <div className="bg-slate-950/70 border-t border-slate-800/60 p-4 space-y-2">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                              Shop-Wise Wallet Breakdown & Purchase History:
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {(c.shops || []).map((s: any) => (
                                <div key={s.shop_id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="font-bold text-xs text-white">
                                      Shop {s.shop_id.toString().padStart(2, '0')}: {s.shop_name}
                                    </span>
                                    <span className="text-xs font-bold text-emerald-400">
                                      ₹{s.cashback_balance.toFixed(2)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400">
                                    Purchased: ₹{s.total_purchases.toFixed(2)} | Earned: ₹{s.cashback_earned.toFixed(2)}
                                  </p>
                                  <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                                    <span>
                                      Source:{' '}
                                      <span className={s.added_by === 'Master Admin' ? 'text-purple-300 font-bold' : 'text-slate-400'}>
                                        {s.added_by || 'Shop'}
                                      </span>
                                    </span>
                                    {s.recent_category && (
                                      <span className="text-amber-400 font-medium">{s.recent_category}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Mode B Table: Shop-Wise Flat List */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Shop</th>
                        <th className="py-3 px-4">Customer Name</th>
                        <th className="py-3 px-4">Mobile</th>
                        <th className="py-3 px-4">Wallet Balance</th>
                        <th className="py-3 px-4">Total Purchases</th>
                        <th className="py-3 px-4">Added By / Source</th>
                        <th className="py-3 px-4">Recent Category</th>
                        <th className="py-3 px-4">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {customersData.map((c: any) => (
                        <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-semibold text-white">
                            Shop {c.shop_id.toString().padStart(2, '0')}: {c.shop_name}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-100">{c.name}</td>
                          <td className="py-3 px-4 font-mono text-slate-400">{c.mobile}</td>
                          <td className="py-3 px-4 font-bold text-emerald-400">
                            ₹{(c.cashback_balance || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            ₹{(c.total_purchases || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4">
                            {c.added_by === 'Master Admin' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                <ShieldCheck size={11} />
                                Master Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                <Store size={11} />
                                Shop {c.shop_id ? c.shop_id.toString().padStart(2, '0') : '18'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-amber-400 font-medium">
                            {c.recent_category || 'General Service'}
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            {c.last_purchase_date ? new Date(c.last_purchase_date).toLocaleString('en-IN') : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 3: CATEGORY PERFORMANCE ─── */}
        {activeTab === 'categories' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl animate-fade-in space-y-4">
            <h3 className="text-sm font-bold text-slate-200">
              Top Selling Food Court Menu Categories & Revenue
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(overview?.categoryBreakdown || []).map((cat, idx) => (
                <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-md bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold text-xs">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-100 text-sm">{cat.category}</p>
                      <p className="text-xs text-slate-400">{cat.transaction_count} completed orders</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-400 text-sm">₹{cat.total_sales.toLocaleString('en-IN')}</p>
                    <p className="text-[11px] text-amber-400">₹{cat.cashback_earned.toLocaleString('en-IN')} cashback</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAB 4: PEAK HOURS & CROSS-SHOP RETENTION ─── */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-fade-in">
            {/* Customer Retention Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
                <Users size={16} className="text-indigo-400" />
                Cross-Shop Customer Retention & Footfall
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-xs text-slate-400">Total Unique Visitors</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {overview?.retention.total_customers || 0}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-xs text-slate-400">Single-Shop Customers</p>
                  <p className="text-2xl font-bold text-slate-300 mt-1">
                    {overview?.retention.single_shop_customers || 0}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-xs text-slate-400">Multi-Shop Customers (2+)</p>
                  <p className="text-2xl font-bold text-indigo-400 mt-1">
                    {overview?.retention.multi_shop_customers || 0}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <p className="text-xs text-slate-400">Cross-Shop Retention Rate</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">
                    {overview?.retention.cross_visit_rate || 0}%
                  </p>
                </div>
              </div>
            </div>

            {/* Hourly Rush Distribution */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
                <Clock size={16} className="text-amber-400" />
                Hourly Order Traffic Distribution (00:00 to 23:00)
              </h3>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
                {Array.from({ length: 24 }).map((_, h) => {
                  const dataForHour = (overview?.hourlyDistribution || []).find(d => d.hour === h)
                  const count = dataForHour?.tx_count || 0
                  return (
                    <div key={h} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-center flex flex-col items-center justify-between">
                      <span className="text-[10px] text-slate-500 font-mono">{h.toString().padStart(2, '0')}:00</span>
                      <span className={`text-sm font-bold my-1 ${count > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                        {count}
                      </span>
                      <span className="text-[9px] text-slate-400">{count === 1 ? 'order' : 'orders'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ─── ADD CUSTOMER MODAL (Master Admin) ─── */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Add Customer directly</h3>
                  <p className="text-[11px] text-slate-400">Added with Source: <span className="text-purple-300 font-semibold">Master Admin</span></p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddCustomerSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Customer Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="Enter customer name"
                    value={newCustName}
                    onChange={e => setNewCustName(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Mobile Number (10 digits) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="9876543210"
                    value={newCustMobile}
                    onChange={e => setNewCustMobile(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Target Shop
                </label>
                <div className="relative">
                  <Store size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <select
                    value={newCustShopId}
                    onChange={e => setNewCustShopId(parseInt(e.target.value, 10))}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    {(overview?.shops || []).map(s => (
                      <option key={s.id} value={s.id}>
                        Shop {s.id.toString().padStart(2, '0')}: {s.name}
                      </option>
                    ))}
                    {(!overview?.shops || overview.shops.length === 0) && (
                      <option value={18}>Shop 18: Xerox & Printing Shop</option>
                    )}
                  </select>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Default: Shop 18 (Xerox & Printing Shop)</p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Initial Cashback Balance (₹, optional)
                </label>
                <div className="relative">
                  <Wallet size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newCustBalance}
                    onChange={e => setNewCustBalance(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
                  disabled={addingCustomer}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingCustomer}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30 disabled:opacity-50"
                >
                  {addingCustomer ? 'Adding Customer…' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Shop Modal */}
      {editingShop && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">
              Manage Shop {editingShop.id.toString().padStart(2, '0')}: {editingShop.name}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Shop Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Set Custom Password (min 6 chars)
                </label>
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    placeholder="Leave blank to keep unchanged"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="active-toggle"
                  checked={editActive}
                  onChange={e => setEditActive(e.target.checked)}
                  className="rounded border-slate-800 text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="active-toggle" className="text-xs text-slate-300 cursor-pointer">
                  Shop is Active and accepting customer orders
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingShop(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
                  disabled={updating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveShop}
                  disabled={updating}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 disabled:opacity-50"
                >
                  {updating ? 'Saving Changes…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

