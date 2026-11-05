/**
 * Customer Display Store – Cross-tab/window communication via BroadcastChannel
 * with reliable localStorage storage-event fallback for dual monitor setups.
 */
import { create } from 'zustand'

// ─── 6 Official Display States ──────────────────────────────────────────────
export type DisplayMode =
  | 'welcome'               // State 1: Idle / Welcome Screen
  | 'customer-selected'     // State 2: Customer Selected & Service Details
  | 'payment-selection'     // State 3: Payment Selection (Cash / UPI QR)
  | 'waiting-payment'       // State 4: Waiting for UPI Payment
  | 'payment-success'       // State 5: Payment Successful
  | 'transaction-complete'  // State 6: Transaction Complete & Thank You
  // Legacy aliases
  | 'billing'
  | 'payment-pending'
  | 'thank-you'

export type PaymentMethod = 'cash' | 'upi'

export type PaymentVerificationStatus =
  | 'awaiting_payment'
  | 'payment_processing'
  | 'payment_successful'
  | 'payment_failed'
  | 'payment_expired'

export interface DisplaySession {
  sessionId: string
  mode: DisplayMode
  customerName: string
  customerMobile: string
  shopName: string

  // Billing info
  serviceCategory: string
  billAmount: number
  cashbackRedeemed: number
  amountPayable: number
  cashbackEarned: number
  availableBalance: number
  newWalletBalance: number
  cashbackPercentage: number

  // Payment info
  paymentMethod: PaymentMethod | null
  paymentStatus: PaymentVerificationStatus
  merchantUpiId: string
  merchantDisplayName: string
  upiLink: string | null
  upiQRUrl: string | null
  transactionId: string | null
  amountReceived?: number
  changeDue?: number
  upiRefNumber?: string

  // Config & Timing
  displayTimeoutSeconds: number
  updatedAt: number
}

export const EMPTY_SESSION: DisplaySession = {
  sessionId: '',
  mode: 'welcome',
  customerName: '',
  customerMobile: '',
  shopName: 'Smart Cashback',
  serviceCategory: '',
  billAmount: 0,
  cashbackRedeemed: 0,
  amountPayable: 0,
  cashbackEarned: 0,
  availableBalance: 0,
  newWalletBalance: 0,
  cashbackPercentage: 2,
  paymentMethod: null,
  paymentStatus: 'awaiting_payment',
  merchantUpiId: '7708481818@upi',
  merchantDisplayName: 'Smart Cashback Shop',
  upiLink: null,
  upiQRUrl: null,
  transactionId: null,
  displayTimeoutSeconds: 5,
  updatedAt: Date.now(),
}

const CHANNEL_NAME = 'smart-cashback-display'
const STORAGE_KEY = 'smart_cashback_display_state'

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  if (!channel && 'BroadcastChannel' in window) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME)
    } catch {
      channel = null
    }
  }
  return channel
}

function persistState(session: DisplaySession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Ignore storage quota/security issues
  }
}

function loadInitialState(): DisplaySession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DisplaySession>
      // Clean slate if session was welcome, failed, cancelled, expired, or stale (> 10 mins)
      const isStale = Date.now() - (parsed.updatedAt || 0) > 10 * 60 * 1000
      const isCleanMode =
        !parsed.customerName ||
        parsed.mode === 'welcome' ||
        parsed.mode === 'thank-you' ||
        parsed.mode === 'transaction-complete' ||
        parsed.paymentStatus === 'payment_failed' ||
        parsed.paymentStatus === 'payment_expired'

      if (isStale || isCleanMode) {
        return { ...EMPTY_SESSION }
      }
      return { ...EMPTY_SESSION, ...parsed }
    }
  } catch {
    // Ignore
  }
  return { ...EMPTY_SESSION }
}

interface DisplayStore {
  session: DisplaySession
  connected: boolean
  startNewSession: () => string
  broadcast: (update: Partial<DisplaySession>) => void
  resetDisplay: (targetSessionId?: string, reason?: string) => void
  cancelPayment: (targetSessionId?: string) => void
  startListening: () => () => void
  pingDisplay: () => void
}

export const useDisplayStore = create<DisplayStore>((set, get) => ({
  session: loadInitialState(),
  connected: false,

  startNewSession: () => {
    const newSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const updated: DisplaySession = {
      ...EMPTY_SESSION,
      sessionId: newSessionId,
      shopName: get().session.shopName || 'Smart Cashback',
      merchantUpiId: get().session.merchantUpiId || '7708481818@upi',
      merchantDisplayName: get().session.merchantDisplayName || 'Smart Cashback Shop',
      updatedAt: Date.now(),
    }
    set({ session: updated })
    persistState(updated)
    return newSessionId
  },

  broadcast: (update: Partial<DisplaySession>) => {
    const current = get().session
    // Ensure every active session has a unique sessionId
    const sessionId =
      update.sessionId ||
      current.sessionId ||
      `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

    const merged: DisplaySession = {
      ...current,
      ...update,
      sessionId,
      updatedAt: Date.now(),
    }
    set({ session: merged })
    persistState(merged)

    // 1. Send via BroadcastChannel
    try {
      const ch = getChannel()
      if (ch) {
        ch.postMessage({ type: 'display-update', payload: merged })
      }
    } catch {
      // BroadcastChannel failed
    }

    // 2. Fallback: notify via storage event trigger
    try {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: JSON.stringify(merged),
        })
      )
    } catch {
      // StorageEvent fallback
    }
  },

  resetDisplay: (targetSessionId?: string, reason?: string) => {
    const current = get().session
    // Guard against stale cancellation: If targetSessionId was given and doesn't match current active session, ignore
    if (targetSessionId && current.sessionId && current.sessionId !== targetSessionId) {
      console.log(`[DisplayStore] Ignored stale reset for session ${targetSessionId} (active is ${current.sessionId})`)
      return
    }

    const reset: DisplaySession = {
      ...EMPTY_SESSION,
      sessionId: '',
      shopName: current.shopName || 'Smart Cashback',
      merchantUpiId: current.merchantUpiId || '7708481818@upi',
      merchantDisplayName: current.merchantDisplayName || 'Smart Cashback Shop',
      updatedAt: Date.now(),
    }
    set({ session: reset })
    persistState(reset)

    try {
      const ch = getChannel()
      if (ch) {
        ch.postMessage({
          type: 'display-reset',
          targetSessionId,
          reason: reason || 'reset',
          payload: reset,
        })
      }
    } catch {
      // Ignore
    }

    try {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: JSON.stringify(reset),
        })
      )
    } catch {
      // Ignore
    }
  },

  cancelPayment: (targetSessionId?: string) => {
    const current = get().session
    if (targetSessionId && current.sessionId && current.sessionId !== targetSessionId) {
      return
    }

    // Cancel immediately wipes the customer display back to Welcome
    get().resetDisplay(targetSessionId, 'cancelled')
  },

  pingDisplay: () => {
    try {
      const ch = getChannel()
      if (ch) ch.postMessage({ type: 'admin-ping' })
    } catch {
      // Ignore
    }
  },

  startListening: () => {
    // Load latest stored state immediately (clean Welcome if stale/failed)
    const initial = loadInitialState()
    set({ session: initial, connected: true })

    const ch = getChannel()

    const bcHandler = (event: MessageEvent) => {
      const current = get().session

      if (event.data?.type === 'display-reset') {
        const targetId = event.data?.targetSessionId
        // If cancellation is for an older session while we have already moved to a newer session, ignore
        if (targetId && current.sessionId && current.sessionId !== targetId) {
          return
        }
        set({ session: event.data.payload || EMPTY_SESSION, connected: true })
      } else if (event.data?.type === 'display-update' && event.data.payload) {
        set({ session: event.data.payload, connected: true })
      } else if (event.data?.type === 'admin-ping') {
        set({ connected: true })
        ch?.postMessage({ type: 'display-pong' })
      }
    }

    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as DisplaySession
          const current = get().session
          // If reset payload arrives
          if (parsed.mode === 'welcome' && !parsed.customerName) {
            set({ session: parsed, connected: true })
          } else {
            set({ session: parsed, connected: true })
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    if (ch) {
      ch.addEventListener('message', bcHandler)
      ch.postMessage({ type: 'display-connected' })
    }
    window.addEventListener('storage', storageHandler)

    return () => {
      if (ch) ch.removeEventListener('message', bcHandler)
      window.removeEventListener('storage', storageHandler)
      set({ connected: false })
    }
  },
}))

