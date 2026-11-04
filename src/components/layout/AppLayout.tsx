import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Receipt, Users, Wallet, Search, BarChart3,
  LayoutDashboard, Settings, LogOut, Menu, X,
  Zap, Sun, Moon, Laptop, Monitor
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useThemeStore, type ThemeMode } from '@/store/themeStore'
import toast from 'react-hot-toast'

// Exact requested menu order:
// 1. New Bill
// 2. Customers
// 3. Cashback Wallet
// 4. Wallet Lookup
// 5. Reports
// 6. Dashboard
// 7. Settings
const NAV_ITEMS = [
  { to: '/billing',       icon: Receipt,         label: 'New Bill' },
  { to: '/customers',     icon: Users,           label: 'Customers' },
  { to: '/wallet',        icon: Wallet,          label: 'Cashback Wallet', end: true },
  { to: '/wallet/lookup', icon: Search,          label: 'Wallet Lookup' },
  { to: '/reports',       icon: BarChart3,       label: 'Reports' },
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/settings',      icon: Settings,        label: 'Settings' },
]

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { signOut, user } = useAuthStore()
  const { settings } = useSettingsStore()
  const { theme, setTheme, resolvedTheme } = useThemeStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out successfully')
    navigate('/login')
  }

  const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: 'light',  label: 'Light',  icon: Sun },
    { value: 'dark',   label: 'Dark',   icon: Moon },
    { value: 'system', label: 'System', icon: Laptop },
  ]

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-dark-950 overflow-hidden text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* ── Mobile Overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 bg-white dark:bg-dark-900 border-r border-slate-200/80 dark:border-dark-800 flex flex-col
          transform transition-transform duration-300 ease-in-out shadow-xl lg:shadow-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-dark-800/80">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/20 flex-shrink-0">
            <Zap size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate tracking-tight">
              {settings?.shop_name || 'Smart Cashback'}
            </p>
            <p className="text-[11px] font-medium text-brand-600 dark:text-brand-400">
              Shop Management
            </p>
          </div>
          <button
            className="ml-auto lg:hidden btn-icon"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => {
            const isActive = end
              ? location.pathname === to
              : location.pathname.startsWith(to)

            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setSidebarOpen(false)}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={17} className="flex-shrink-0" />
                <span className="flex-1 text-[13px]">{label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Theme Switcher (Light / Dark / System) */}
        <div className="px-3 py-3 border-t border-slate-100 dark:border-dark-800/80">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Theme
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {theme === 'system' ? `Auto (${resolvedTheme})` : theme}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-dark-950 rounded-xl border border-slate-200/60 dark:border-dark-800">
            {themeOptions.map(({ value, label, icon: Icon }) => {
              const active = theme === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-white dark:bg-dark-800 text-brand-600 dark:text-brand-400 shadow-sm font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title={`${label} Theme`}
                >
                  <Icon size={13} />
                  <span className="hidden sm:inline text-[11px]">{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* User Footer */}
        <div className="px-3 py-3 border-t border-slate-100 dark:border-dark-800/80">
          <div className="flex items-center gap-3 px-2 py-2 mb-1 rounded-xl bg-slate-50 dark:bg-dark-950/60 border border-slate-100 dark:border-dark-800/60">
            <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300 flex items-center justify-center flex-shrink-0 font-bold text-xs">
              {user?.email?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                {user?.email || 'Admin'}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Administrator</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="sidebar-link w-full text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <LogOut size={15} />
            <span className="text-[13px]">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Layout ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="bg-white dark:bg-dark-900 border-b border-slate-200/80 dark:border-dark-800 px-4 lg:px-6 py-3 flex items-center justify-between gap-4 transition-colors duration-200">
          <button
            className="btn-icon lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>

          <div className="hidden sm:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Cashback System Online · 2% Cashback Active
            </span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={() => window.open('/customer-display', 'customer-display', 'popup,width=1200,height=800')}
              className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
              title="Open Customer Display on second monitor"
            >
              <Monitor size={14} className="text-brand-600 dark:text-brand-400" />
              <span className="hidden md:inline">Customer Display</span>
            </button>

            <NavLink
              to="/billing"
              className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5"
            >
              <Receipt size={14} />
              <span>New Bill</span>
            </NavLink>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 animate-fade-in bg-slate-50 dark:bg-dark-950 transition-colors duration-200">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
