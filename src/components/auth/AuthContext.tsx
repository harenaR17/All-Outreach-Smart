'use client'

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseBrowserClient, setBrowserSupabaseCredentials } from '@/lib/supabase/client'
import { getPublicSupabaseConfig } from '@/app/actions/setup'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  refreshSession: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const refreshSession = async () => {
    let supabase = getSupabaseBrowserClient()
    if (!supabase) {
      try {
        const config = await getPublicSupabaseConfig()
        if (config?.supabaseUrl && config?.supabaseAnonKey) {
          setBrowserSupabaseCredentials(config.supabaseUrl, config.supabaseAnonKey)
          supabase = getSupabaseBrowserClient()
        }
      } catch {}
    }
    if (!supabase) return

    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error('Error fetching session:', error)
      setUser(null)
      setSession(null)
    } else {
      setSession(data.session)
      setUser(data.session?.user ?? null)
    }
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    let unsubscribeAuth: (() => void) | null = null

    async function initAuth() {
      let supabase = getSupabaseBrowserClient()

      // If client-side env variables were not baked in at build time, fetch public config from server action
      if (!supabase) {
        try {
          const config = await getPublicSupabaseConfig()
          if (config?.supabaseUrl && config?.supabaseAnonKey) {
            setBrowserSupabaseCredentials(config.supabaseUrl, config.supabaseAnonKey)
            supabase = getSupabaseBrowserClient()
          }
        } catch {
          // Failed to fetch public config
        }
      }

      if (!supabase || !active) {
        if (active) setLoading(false)
        return
      }

      // 1. Initial session check
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (!error && session && active) {
          setSession(session)
          setUser(session.user)
        }
      } catch (err) {
        console.error('Session check error:', err)
      } finally {
        if (active) setLoading(false)
      }

      // 2. Listen for auth changes (sign in, sign out, token refresh, password recovery)
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, newSession) => {
        if (!active) return
        setSession(newSession)
        setUser(newSession?.user ?? null)
        setLoading(false)

        if (event === 'SIGNED_OUT') {
          router.push('/login')
          router.refresh()
        } else if (event === 'PASSWORD_RECOVERY') {
          router.push('/auth/update-password')
        }
      })

      unsubscribeAuth = () => {
        subscription.unsubscribe()
      }
    }

    initAuth()

    return () => {
      active = false
      if (unsubscribeAuth) {
        unsubscribeAuth()
      }
    }
  }, [router])

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient()
    if (supabase) {
      await supabase.auth.signOut()
    }
    setUser(null)
    setSession(null)
    router.push('/login')
    router.refresh()
  }

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      signOut,
      refreshSession,
    }),
    [user, session, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
