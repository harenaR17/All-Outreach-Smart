'use client'

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
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
    const supabase = getSupabaseBrowserClient()
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
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }

    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!error && session) {
        setSession(session)
        setUser(session.user)
      }
      setLoading(false)
    })

    // 2. Listen for auth changes (sign in, sign out, token refresh, password recovery)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)

      if (event === 'SIGNED_OUT') {
        router.push('/login')
        router.refresh()
      } else if (event === 'PASSWORD_RECOVERY') {
        router.push('/auth/update-password')
      }
    })

    return () => {
      subscription.unsubscribe()
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
