'use client'

import { Shield, Server, LogOut, User as UserIcon } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthContext'
import { useState } from 'react'

export function Header() {
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
  }

  return (
    <header className="h-16 px-8 border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <span className="text-xs font-medium text-zinc-300">Outreach Operation Activated</span>
        </div>
        <span className="text-zinc-700">•</span>
        <span className="text-xs text-zinc-400">Outreach Management System</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-300">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          <span>Supabase Auth</span>
        </div>
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-300">
          <Server className="w-3.5 h-3.5 text-cyan-400" />
          <span>Postgres 17</span>
        </div>

        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <UserIcon className="w-3 h-3" />
              </div>
              <span className="max-w-[150px] truncate text-[11px] font-mono text-zinc-300">
                {user.email}
              </span>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              title="Sign Out"
              className="p-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
