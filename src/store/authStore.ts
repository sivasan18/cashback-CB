import { create } from 'zustand'
import { cloudflareApi } from '@/lib/api'

export interface User {
  id: string
  email: string
  role?: string
}

export interface Session {
  access_token: string
  user?: User
}

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  initialized: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    try {
      const { data } = await cloudflareApi.auth.getSession()
      set({
        session: data?.session ? { access_token: data.session.access_token, user: data.user } : null,
        user: data?.user ?? null,
        initialized: true,
      })
    } catch {
      set({ session: null, user: null, initialized: true })
    }
  },

  signIn: async (email, password) => {
    set({ loading: true })
    const { data, error } = await cloudflareApi.auth.signInWithPassword({ email, password })
    set({ loading: false })

    if (error || !data) return { error: error?.message || 'Login failed' }
    set({
      session: { access_token: data.session.access_token, user: data.user },
      user: data.user
    })
    return { error: null }
  },

  signOut: async () => {
    await cloudflareApi.auth.signOut()
    set({ session: null, user: null })
  },
}))
