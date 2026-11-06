import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Eye, EyeOff, Lock, Store,
  Apple, UtensilsCrossed, Flame, Pizza, Soup, Utensils,
  IceCream, Cookie, GlassWater, Coffee, Gamepad2, Snowflake,
  Disc, CookingPot, Sparkles, ShoppingBag, Tag, Printer
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'
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

  // Default redirect after login is strictly New Bill (/billing)
  if (session) return <Navigate to="/billing" replace />

  const currentShop = SHOPS_LIST.find(s => s.id === selectedShopId) || SHOPS_LIST[17]
  const ShopIcon = currentShop.icon

  const handleShopChange = (id: number) => {
    setSelectedShopId(id)
    localStorage.setItem('last_selected_shop_id', id.toString())
    setPassword('')
    setErrors({})
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!password) {
      setErrors({ password: 'Password is required' })
      return
    }

    const { error } = await signIn(currentShop.login, password)
    if (error) {
      toast.error(error)
      setErrors({ password: 'Invalid credentials. Please verify your shop password.' })
    } else {
      await fetchSettings()
      toast.success(`Welcome to ${currentShop.name}!`)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-950 flex items-center justify-center p-4 transition-colors duration-200">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white dark:bg-dark-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-dark-950 border border-slate-200/80 dark:border-dark-800 p-8 animate-fade-in transition-colors duration-200">
          {/* Dynamic Header */}
          <div className="text-center mb-8">
            <div className="inline-flex w-16 h-16 rounded-2xl bg-brand-600 items-center justify-center shadow-lg shadow-brand-600/30 mb-4 transition-all duration-300">
              <ShopIcon size={30} className="text-white" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300 border border-brand-200 dark:border-brand-800/80 mb-2">
              Shop {currentShop.id.toString().padStart(2, '0')} • {currentShop.badge}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {currentShop.name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Shopkeeper Terminal Sign In
            </p>
          </div>

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
                  disabled={loading}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  tabIndex={-1}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password}</p>}
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-3 text-base mt-2 shadow-md shadow-brand-600/20"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Authenticating Shop…
                </span>
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
