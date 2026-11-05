import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff, Zap, Lock, Mail } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { session, signIn, loading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  // Default redirect after login is strictly New Bill (/billing)
  if (session) return <Navigate to="/billing" replace />

  const validate = () => {
    const e: typeof errors = {}
    if (!email.trim()) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Invalid email address'
    if (!password) e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validate()) return
    const { error } = await signIn(email.trim(), password)
    if (error) {
      toast.error(error)
      setErrors({ password: 'Invalid credentials. Please try again.' })
    } else {
      toast.success('Welcome back!')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-950 flex items-center justify-center p-4 transition-colors duration-200">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white dark:bg-dark-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-dark-950 border border-slate-200/80 dark:border-dark-800 p-8 animate-fade-in transition-colors duration-200">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex w-16 h-16 rounded-2xl bg-brand-600 items-center justify-center shadow-lg shadow-brand-600/30 mb-4">
              <Zap size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Smart Cashback</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Administrator Sign In</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="login-email" className="form-label">
                Email Address
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={`form-input pl-10 ${errors.email ? 'border-rose-400 dark:border-rose-500' : ''}`}
                  placeholder="admin@yourshop.com"
                  disabled={loading}
                  autoFocus
                />
              </div>
              {errors.email && <p className="form-error">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="login-password" className="form-label">
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={`form-input pl-10 pr-10 ${errors.password ? 'border-rose-400 dark:border-rose-500' : ''}`}
                  placeholder="••••••••"
                  disabled={loading}
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
              className="btn-primary w-full py-3 text-base mt-2"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-dark-800 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Protected administrator access only
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
          Smart Cashback © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
