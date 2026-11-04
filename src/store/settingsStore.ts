import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { ShopSettings } from '@/types'

interface SettingsState {
  settings: ShopSettings | null
  loading: boolean
  fetchSettings: () => Promise<void>
  updateSettings: (updates: Partial<ShopSettings>) => Promise<void>
}

const LOCAL_UPI_STORAGE_KEY = 'smart_cashback_upi_settings'

const DEFAULT_SETTINGS: Omit<ShopSettings, 'id' | 'updated_at'> = {
  shop_name: 'Smart Cashback Shop',
  shop_address: '',
  contact_number: '',
  cashback_percentage: 2,
  minimum_eligible_purchase: 99,
  currency: 'INR',
  date_format: 'DD/MM/YYYY',
  time_format: '12h',
  merchant_upi_id: '7708481818@upi',
  merchant_display_name: 'Smart Cashback',
  qr_payment_method: 'standard_upi',
  payment_expiry_seconds: 300,
  display_timeout_seconds: 5,
}

function getStoredLocalUPISettings(): Partial<ShopSettings> {
  try {
    const raw = localStorage.getItem(LOCAL_UPI_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLocalUPISettings(updates: Partial<ShopSettings>) {
  try {
    const existing = getStoredLocalUPISettings()
    const merged = { ...existing, ...updates }
    localStorage.setItem(LOCAL_UPI_STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // Ignore storage issues
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,

  fetchSettings: async () => {
    set({ loading: true })
    const localUPI = getStoredLocalUPISettings()
    const { data, error } = await supabase
      .from('shop_settings')
      .select('*')
      .limit(1)
      .single()

    if (error || !data) {
      // Return defaults if no settings row yet
      set({
        settings: {
          id: '',
          updated_at: new Date().toISOString(),
          ...DEFAULT_SETTINGS,
          ...localUPI,
        } as ShopSettings,
        loading: false,
      })
    } else {
      set({
        settings: {
          ...DEFAULT_SETTINGS,
          ...data,
          ...localUPI,
        } as ShopSettings,
        loading: false,
      })
    }
  },

  updateSettings: async (updates) => {
    const current = get().settings
    if (!current) return

    saveLocalUPISettings(updates)

    // Separate standard database fields from extended settings
    const standardFields = {
      shop_name: updates.shop_name ?? current.shop_name,
      shop_address: updates.shop_address ?? current.shop_address,
      contact_number: updates.contact_number ?? current.contact_number,
      cashback_percentage: updates.cashback_percentage ?? current.cashback_percentage,
      minimum_eligible_purchase: updates.minimum_eligible_purchase ?? current.minimum_eligible_purchase,
      currency: updates.currency ?? current.currency,
      date_format: updates.date_format ?? current.date_format,
      time_format: updates.time_format ?? current.time_format,
    }

    // Try saving base settings to Supabase
    try {
      const { data } = await supabase
        .from('shop_settings')
        .upsert({ ...current, ...standardFields, updated_at: new Date().toISOString() })
        .select()
        .single()

      set({
        settings: {
          ...current,
          ...(data || {}),
          ...updates,
          updated_at: new Date().toISOString(),
        } as ShopSettings,
      })
    } catch {
      // If Supabase update fails, maintain state locally
      set({
        settings: {
          ...current,
          ...updates,
          updated_at: new Date().toISOString(),
        } as ShopSettings,
      })
    }
  },
}))
