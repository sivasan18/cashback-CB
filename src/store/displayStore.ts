/**
 * Customer Display Store – Cross-tab communication via BroadcastChannel.
 *
 * The admin BillingPage broadcasts billing state updates.
 * The CustomerDisplayPage listens and renders accordingly.
 */
import { create } from 'zustand'

// ─── Display States ─────────────────────────────────────────────────────────
export type DisplayMode =
  | 'welcome'         // Idle / welcome screen
  | 'billing'         // Showing bill being prepared
  | 'payment-pending' // QR code / payment awaiting
  | 'payment-success' // Payment confirmed
  | 'thank-you'       // Transaction complete

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'wallet-only'

export interface DisplaySession {
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
  newWalletBalance: number
  cashbackPercentage: number

  // Payment
  paymentMethod: PaymentMethod | null
  upiLink: string | null
  upiQRUrl: string | null
  transactionId: string | null

  // Timestamps
  updatedAt: number
}

export const EMPTY_SESSION: DisplaySession = {
  mode: 'welcome',
  customerName: '',
  customerMobile: '',
  shopName: 'Smart Cashback Shop',
  serviceCategory: '',
  billAmount: 0,
  cashbackRedeemed: 0,
  amountPayable: 0,
  cashbackEarned: 0,
  newWalletBalance: 0,
  cashbackPercentage: 2,
  paymentMethod: null,
  upiLink: null,
  upiQRUrl: null,
  transactionId: null,
  updatedAt: Date.now(),
}

// ─── BroadcastChannel name (shared between tabs) ────────────────────────────
const CHANNEL_NAME = 'smart-cashback-display'

// ─── Zustand Store ──────────────────────────────────────────────────────────
interface DisplayStore {
  session: DisplaySession
  connected: boolean

  // Admin actions (broadcast to display)
  broadcast: (update: Partial<DisplaySession>) => void
  resetDisplay: () => void

  // Listener setup (called by customer display page)
  startListening: () => () => void
}

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
  }
  return channel
}

export const useDisplayStore = create<DisplayStore>((set, get) => ({
  session: { ...EMPTY_SESSION },
  connected: false,

  broadcast: (update: Partial<DisplaySession>) => {
    const current = get().session
    const merged: DisplaySession = {
      ...current,
      ...update,
      updatedAt: Date.now(),
    }
    set({ session: merged })

    try {
      const ch = getChannel()
      ch.postMessage({ type: 'display-update', payload: merged })
    } catch (err) {
      console.warn('[DisplayStore] BroadcastChannel error:', err)
    }
  },

  resetDisplay: () => {
    const reset = { ...EMPTY_SESSION, updatedAt: Date.now() }
    set({ session: reset })
    try {
      const ch = getChannel()
      ch.postMessage({ type: 'display-update', payload: reset })
    } catch (err) {
      console.warn('[DisplayStore] BroadcastChannel error:', err)
    }
  },

  startListening: () => {
    const ch = getChannel()

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'display-update') {
        set({ session: event.data.payload, connected: true })
      }
    }

    ch.addEventListener('message', handler)
    set({ connected: true })

    // Send a ping so admin knows display is listening
    ch.postMessage({ type: 'display-connected' })

    return () => {
      ch.removeEventListener('message', handler)
      set({ connected: false })
    }
  },
}))

