'use client'

import React, { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthContext'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { getSetupStatus, type SetupStatus } from '@/app/actions/setup'
import { Loader2, Send } from 'lucide-react'

const PUBLIC_ROUTES = ['/login', '/setup', '/auth/update-password', '/auth/callback']

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()

  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [setupLoading, setSetupLoading] = useState(true)

  useEffect(() => {
    let active = true
    getSetupStatus()
      .then((status) => {
        if (active) setSetupStatus(status)
      })
      .catch(() => {
        // Fail open: a transient check error must not lock an already-working
        // production deployment out — fall through to the normal auth flow.
      })
      .finally(() => {
        if (active) setSetupLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const setupIncomplete = setupStatus
    ? !(setupStatus.isConfigured && setupStatus.isDatabaseReady && setupStatus.hasAdminUser)
    : false

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  )

  useEffect(() => {
    if (setupLoading || loading) return

    if (setupIncomplete) {
      if (pathname !== '/setup') router.push('/setup')
      return
    }

    if (!isPublicRoute && !user) {
      router.push('/login')
    } else if (isPublicRoute && user && pathname === '/login') {
      router.push('/')
    }
  }, [setupIncomplete, setupLoading, user, loading, isPublicRoute, pathname, router])

  // Waiting on the setup-status check, or a redirect to /setup is in flight
  if (setupLoading || (setupIncomplete && pathname !== '/setup')) {
    return (
      <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 p-[1px] shadow-xl shadow-indigo-500/20 animate-pulse">
            <div className="w-full h-full bg-zinc-950 rounded-[15px] flex items-center justify-center">
              <Send className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Checking system configuration...</span>
          </div>
        </div>
      </div>
    )
  }

  // If on public pages (Login, Password Setup, Setup, etc.), render standalone layout
  if (isPublicRoute) {
    if (!user || pathname !== '/login') {
      return <div className="min-h-screen w-full">{children}</div>
    }
  }

  // Loading screen while evaluating session for protected pages
  if (loading) {
    return (
      <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 p-[1px] shadow-xl shadow-indigo-500/20 animate-pulse">
            <div className="w-full h-full bg-zinc-950 rounded-[15px] flex items-center justify-center">
              <Send className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Verifying secure session...</span>
          </div>
        </div>
      </div>
    )
  }

  // Unauthenticated user trying to access protected page
  if (!user) {
    return (
      <div className="min-h-screen w-full bg-zinc-950 flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Redirecting to sign in...</span>
        </div>
      </div>
    )
  }

  // Authenticated Dashboard Layout
  return (
    <div className="min-h-screen bg-zinc-950 flex">
      <Sidebar />
      <div className="flex-1 pl-64 flex flex-col min-w-0 min-h-screen">
        <Header />
        <main className="flex-1 pb-16">{children}</main>
      </div>
    </div>
  )
}
