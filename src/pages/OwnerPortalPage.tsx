import { useState, useEffect } from 'react'
import {
  ShieldCheck, Store, TrendingUp, Users, DollarSign,
  Receipt, ArrowUpRight, ArrowDownRight, RefreshCw, Lock,
  Eye, EyeOff, CheckCircle2, AlertCircle, Sparkles, LogOut,
  Edit2, KeyRound
} from 'lucide-react'
import { cloudflareApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
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
}

export default function OwnerPortalPage() {
  const { user, signIn, signOut, loading: authLoading } = useAuthStore()

  // Login form state
  const [email, setEmail] = useState('sivar75@gmail.com')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Dashboard state
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'shops' | 'categories'>('shops')

  // Edit shop modal state
  const [editingShop, setEditingShop] = useState<OverviewData['shops'][0] | null>(null)
  const [editName, setEditName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [updating, setUpdating] = useState(false)

  const isSuperAdmin = user?.role === 'super_admin'

  const fetchOverview = async () => {
    setLoading(true)
    const { data, error } = await cloudflareApi.owner.getOverview()
    setLoading(false)
    if (error) {
      toast.error(error.message || 'Failed to load master overview')
    } else if (data) {
      setOverview(data)
    }
  }

  useEffect(() => {
    if (isSuperAdmin) {
      fetchOverview()
    }
  }, [isSuperAdmin])

  const handleOwnerLogin = async (e: React.FormEvent) => {
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
      toast.success('Welcome to Food Court Master Vista!')
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

  // ─── 1. Login Screen (when not super_admin) ─────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-dark-950 to-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-dark-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-black/80">
            <div className="text-center mb-8">
              <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-600 items-center justify-center shadow-lg shadow-rose-600/30 mb-4">
                <ShieldCheck size={32} className="text-white" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-2">
                Secret Master Owner Portal
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Food Court Master Vista</h1>
              <p className="text-xs text-slate-400 mt-1">Multi-Tenant 18-Shop Administration</p>
            </div>

            <form onSubmit={handleOwnerLogin} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Owner Email Address
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
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Master Password
                </label>
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
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-lg shadow-rose-600/25 transition-all mt-4 disabled:opacity-50"
              >
                {authLoading ? 'Verifying Credentials…' : 'Access Master Portal'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-800 text-center">
              <p className="text-[11px] text-slate-500">
                Confidential • Unauthorized access prohibited
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── 2. Master Portal Dashboard ─────────────────────────────────────────────
  const t = overview?.totals

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
              <h1 className="text-lg font-bold text-white tracking-tight">Food Court Master Vista</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                18 Shops
              </span>
            </div>
            <p className="text-xs text-slate-400">Owner: sivar75@gmail.com</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => {
              signOut()
              toast.success('Signed out of Master Portal')
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 transition-colors"
          >
            <LogOut size={13} />
            Exit Portal
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Total Food Court Sales</span>
              <DollarSign size={16} className="text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-white">₹{(t?.total_sales || 0).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <ArrowUpRight size={12} /> Today: ₹{(t?.today_sales || 0).toLocaleString('en-IN')}
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Total Transactions</span>
              <Receipt size={16} className="text-sky-400" />
            </div>
            <p className="text-2xl font-bold text-white">{(t?.total_transactions || 0).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-sky-400 mt-1 flex items-center gap-1">
              <ArrowUpRight size={12} /> Today: {t?.today_transactions || 0} bills
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Unique Customers</span>
              <Users size={16} className="text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-white">{(t?.unique_customers || 0).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-indigo-400 mt-1">
              {t?.total_wallets || 0} active shop wallets
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Outstanding Liability</span>
              <Sparkles size={16} className="text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-400">₹{(t?.total_wallet_liability || 0).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Issued: ₹{(t?.total_cashback_issued || 0).toLocaleString('en-IN')} | Redeemed: ₹{(t?.total_cashback_redeemed || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Tabs & View Switcher */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('shops')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'shops'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              18 Shops Overview & Management
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'categories'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Category Revenue Breakdown
            </button>
          </div>
          <span className="text-xs text-slate-500">Live D1 Database Synchronization</span>
        </div>

        {/* Tab 1: 18 Shops Table */}
        {activeTab === 'shops' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Shop</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">Today's Sales</th>
                    <th className="py-3.5 px-4 font-semibold">Total Sales</th>
                    <th className="py-3.5 px-4 font-semibold">Transactions</th>
                    <th className="py-3.5 px-4 font-semibold">Customers</th>
                    <th className="py-3.5 px-4 font-semibold">Wallet Liability</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(overview?.shops || []).map(s => (
                    <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center font-bold text-[11px]">
                            {s.id.toString().padStart(2, '0')}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-100 text-sm">{s.name}</p>
                            <p className="text-[11px] text-slate-500">Login: {s.login_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            s.is_active === 1
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${s.is_active === 1 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {s.is_active === 1 ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        ₹{s.today_sales.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-emerald-400">
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
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenEdit(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                        >
                          <Edit2 size={11} />
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

        {/* Tab 2: Category Breakdown */}
        {activeTab === 'categories' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200 mb-4">Top Performing Menu Categories</h3>
            <div className="space-y-3">
              {(overview?.categoryBreakdown || []).map((cat, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div>
                    <p className="font-semibold text-slate-100 text-sm">{cat.category}</p>
                    <p className="text-xs text-slate-400">{cat.transaction_count} completed orders</p>
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
      </main>

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
                  Reset Password (leave blank to keep current)
                </label>
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    placeholder="New password (min 6 chars)"
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

