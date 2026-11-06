import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import BillingPage from '@/pages/BillingPage'
import CustomersPage from '@/pages/CustomersPage'
import CustomerDetailPage from '@/pages/CustomerDetailPage'
import WalletLookupPage from '@/pages/WalletLookupPage'
import ReportsPage from '@/pages/ReportsPage'
import SettingsPage from '@/pages/SettingsPage'
import CustomerDisplayPage from '@/pages/CustomerDisplayPage'
import MasterAdminPage from '@/pages/MasterAdminPage'

import { useThemeStore } from '@/store/themeStore'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, initialized } = useAuthStore()
  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading Smart Cashback…</p>
        </div>
      </div>
    )
  }
  return session ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { initialize } = useAuthStore()
  const { fetchSettings } = useSettingsStore()
  const { initialize: initTheme } = useThemeStore()

  useEffect(() => {
    initTheme()
    initialize().then(() => fetchSettings())
  }, [initialize, fetchSettings, initTheme])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/customer-display" element={<CustomerDisplayPage />} />
        <Route path="/master-admin" element={<MasterAdminPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/billing" replace />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="wallet" element={<WalletLookupPage />} />
          <Route path="wallet/lookup" element={<WalletLookupPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/billing" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
