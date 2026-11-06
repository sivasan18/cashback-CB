import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Eye, EyeOff, Lock, Store, AlertTriangle, ShieldAlert,
  CheckCircle2, RefreshCw, Send,
  Apple, UtensilsCrossed, Flame, Pizza, Soup, Utensils,
  IceCream, Cookie, GlassWater, Coffee, Gamepad2, Snowflake,
  Disc, CookingPot, Sparkles, ShoppingBag, Tag, Printer
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'
import { cloudflareApi } from '@/lib/api'
import { getShopTheme } from '@/lib/shopThemes'
import toast from 'react-hot-toast'

export interface ShopOption {
  id: number
  name: string
  login: string
  icon: typeof Store
  badge: string
}

export const SHOPS_LIST: ShopOption[] = [
  { id: 1,  name: 'Fruit Shop',                      login: 'shop01', icon: Apple,           badge: 'Fresh Fruits & Juices' },
  { id: 2,  name: 'Biryani Shop',                    login: 'shop02', icon: UtensilsCrossed, badge: 'Biryani & Starters' },
  { id: 3,  name: 'Grill Shop',                      login: 'shop03', icon: Flame,           badge: 'Grill & Shawarma' },
  { id: 4,  name: 'Pizza Shop',                      login: 'shop04', icon: Pizza,           badge: 'Pizza, Pasta & Sides' },
  { id: 5,  name: 'Momos Shop',                      login: 'shop05', icon: Soup,            badge: 'Steamed & Fried Momos' },
  { id: 6,  name: 'Panipuri Shop',                   login: 'shop06', icon: Utensils,        badge: 'Chaat & Panipuri' },
  { id: 7,  name: 'Ice Cream Shop',                  login: 'shop07', icon: IceCream,        badge: 'Scoops & Sundaes' },
  { id: 8,  name: 'Snacks Items Shop',               login: 'shop08', icon: Cookie,          badge: 'Fried Snacks & Puffs' },
  { id: 9,  name: 'Ice Creams & Falooda Shop',       login: 'shop09', icon: GlassWater,      badge: 'Royal Falooda & Shakes' },
  { id: 10, name: 'Chai, Tea, Samosas & Bakery Shop',login: 'shop10', icon: Coffee,          badge: 'Tea, Coffee & Bakes' },
  { id: 11, name: 'Game Items Shop',                 login: 'shop11', icon: Gamepad2,        badge: 'VR & Arcade Games' },
  { id: 12, name: 'Ice Bay',                         login: 'shop12', icon: Snowflake,       badge: 'Popsicles & Ice Gola' },
  { id: 13, name: 'Idli & Dosa Shop',                login: 'shop13', icon: Disc,            badge: 'Idli, Dosa & Tiffin' },
  { id: 14, name: 'Biryani Shop 2',                  login: 'shop14', icon: CookingPot,      badge: 'Seeraga Samba Biryani' },
  { id: 15, name: 'Miscellaneous Shop 1',            login: 'shop15', icon: Sparkles,        badge: 'General Services' },
  { id: 16, name: 'Miscellaneous Shop 2',            login: 'shop16', icon: ShoppingBag,     badge: 'General Services' },
  { id: 17, name: 'Miscellaneous Shop 3',            login: 'shop17', icon: Tag,             badge: 'General Services' },
  { id: 18, name: 'Xerox & Printing Shop',           login: 'shop18', icon: Printer,         badge: 'Printing & Xerox Services' },
]

export default function LoginPage() {
  const { session, signIn, loading } = useAuthStore()
  const { fetchSettings } = useSettingsStore()
  const [selectedShopId, setSelectedShopId] = useState<number>(() => {
    const saved = localStorage.getItem('last_selected_shop_id')
    return saved ? parseInt(saved, 10) : 18
  })
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [errors, setErrors] = useState<{ password?: string }>({})
  const [isLocked, setIsLocked] = useState(false)
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null)
  const [requestingUnlock, setRequestingUnlock] = useState(false)
  const [unlockRequested, setUnlockRequested] = useState(false)

  // Default redirect after login is strictly New Bill (/billing)
  if (session) return <Navigate to="/billing" replace />

  const currentShop = SHOPS_LIST.find(s => s.id === selectedShopId) || SHOPS_LIST[17]
  const shopTheme = getShopTheme(currentShop.id)
  const ShopIcon = currentShop.icon

  const handleShopChange = (id: number) => {
    setSelectedShopId(id)
    localStorage.setItem('last_selected_shop_id', id.toString())
    setPassword('')
    setErrors({})
    setIsLocked(false)
    setRemainingAttempts(null)
    setUnlockRequested(false)
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!password) {
      setErrors({ password: 'Password is required' })
      return
    }

    const res = await signIn(currentShop.login, password)
    if (res.error) {
      if (res.is_locked || res.error.toLowerCase().includes('locked')) {
        setIsLocked(true)
        setRemainingAttempts(0)
        setErrors({ password: res.error })
        toast.error('Shop account is locked!')
      } else {
        if (typeof res.remaining_attempts === 'number') {
          setRemainingAttempts(res.remaining_attempts)
        }
        setErrors({ password: res.error })
        toast.error(res.error)
      }
    } else {
      await fetchSettings()
      toast.success(`Welcome to ${currentShop.name}!`)
    }
  }

  const handleRequestOwnerReset = async () => {
    setRequestingUnlock(true)
    const { error } = await cloudflareApi.auth.requestUnlock({
      shop_id: currentShop.id,
      login_id: currentShop.login
    })
    setRequestingUnlock(false)

    if (error) {
      toast.error(error.message || 'Failed to submit reset request')
    } else {
      setUnlockRequested(true)
      toast.success('Food Court Owner has been alerted to reset your password!')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-950 flex items-center justify-center p-4 transition-colors duration-200 relative overflow-hidden">
      {/* Decorative ambient backdrop based on shop palette */}
      <div
        className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20 dark:opacity-30 transition-all duration-700"
        style={{ backgroundColor: shopTheme.accentColor }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20 dark:opacity-30 transition-all duration-700"
        style={{ backgroundColor: shopTheme.accentColor }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Card */}
        <div className={`bg-white dark:bg-dark-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-dark-950 border ${shopTheme.cardBorder} p-8 animate-fade-in transition-all duration-300`}>
          {/* Dynamic Header */}
          <div className="text-center mb-7">
            <div
              className={`inline-flex w-16 h-16 rounded-2xl bg-gradient-to-tr ${shopTheme.primaryGradient} items-center justify-center shadow-lg mb-3.5 transition-all duration-300`}
              style={{ boxShadow: `0 10px 25px -5px ${shopTheme.glowColor}` }}
            >
              <ShopIcon size={30} className="text-white" />
            </div>

            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${shopTheme.badgeBg} ${shopTheme.badgeText} border ${shopTheme.badgeBorder} mb-2`}>
              Shop {currentShop.id.toString().padStart(2, '0')} • {currentShop.badge}
            </div>

            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {currentShop.name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
              {shopTheme.tagline}
            </p>
          </div>

          {/* Account Locked Alert Box */}
          {isLocked && (
            <div className="mb-5 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-left animate-shake">
              <div className="flex items-start gap-2.5">
                <ShieldAlert size={20} className="text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-rose-800 dark:text-rose-200 uppercase tracking-wide">
                    Terminal Locked (5 Failed Attempts)
                  </h3>
                  <p className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
                    Account locked after 5 wrong password attempts. Please contact the Food Court Owner to reset your password to the default pattern.
                  </p>

                  {unlockRequested ? (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-950/60 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800">
                      <CheckCircle2 size={14} />
                      Reset request sent to Food Court Owner!
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequestOwnerReset}
                      disabled={requestingUnlock}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/30 transition-all disabled:opacity-50"
                    >
                      {requestingUnlock ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          Sending Alert…
                        </>
                      ) : (
                        <>
                          <Send size={12} />
                          Request Owner Password Reset
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Remaining Attempts Warning */}
          {!isLocked && remainingAttempts !== null && remainingAttempts > 0 && remainingAttempts < 5 && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-200 animate-fade-in">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span>
                <strong>Warning:</strong> {remainingAttempts} {remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining before shop account is locked.
              </span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="shop-select" className="form-label">
                Select Your Shop
              </label>
              <div className="relative">
                <Store size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  id="shop-select"
                  value={selectedShopId}
                  onChange={e => handleShopChange(parseInt(e.target.value, 10))}
                  className="form-input pl-10 pr-8 appearance-none bg-no-repeat bg-[right_0.75rem_center] cursor-pointer font-medium text-slate-800 dark:text-slate-100"
                  disabled={loading}
                >
                  {SHOPS_LIST.map(shop => (
                    <option key={shop.id} value={shop.id}>
                      Shop {shop.id.toString().padStart(2, '0')} – {shop.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="login-password" className="form-label mb-0">
                  Shop Password
                </label>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Default: shop@{currentShop.id.toString().padStart(2, '0')}{currentShop.id.toString().padStart(2, '0')}
                </span>
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value)
                    if (errors.password) setErrors({})
                  }}
                  className={`form-input pl-10 pr-10 ${errors.password ? 'border-rose-400 dark:border-rose-500' : ''}`}
                  placeholder="••••••••"
                  disabled={loading || isLocked}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  tabIndex={-1}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  disabled={isLocked}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && !isLocked && <p className="form-error">{errors.password}</p>}
            </div>

            <button
              type="submit"
              className={`w-full py-3 text-base mt-2 font-bold text-white rounded-xl bg-gradient-to-r ${shopTheme.primaryGradient} hover:opacity-95 shadow-lg transition-all duration-200 disabled:opacity-50`}
              style={{ boxShadow: `0 8px 20px -4px ${shopTheme.glowColor}` }}
              disabled={loading || isLocked}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Authenticating Shop…
                </span>
              ) : isLocked ? (
                'Terminal Locked'
              ) : (
                `Enter ${currentShop.name}`
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-dark-800 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Each shop operates its own independent cashback wallet and inventory ledger
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
          Food Court Cashback System © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
