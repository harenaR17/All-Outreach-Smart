'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthContext'
import { Send, Lock, Mail, ArrowRight, Loader2, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { refreshSession } = useAuth()

  const [mode, setMode] = useState<'password' | 'magic-link'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        throw new Error('Supabase client is not available.')
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          setErrorMsg('Invalid email or password. Please check your credentials.')
        } else if (error.message.toLowerCase().includes('email not confirmed')) {
          setErrorMsg('Please confirm your email address or check your invite link.')
        } else {
          setErrorMsg(error.message)
        }
        setLoading(false)
        return
      }

      if (data.session) {
        await refreshSession()
        router.push('/')
        router.refresh()
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred during sign in.')
      setLoading(false)
    }
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        throw new Error('Supabase client is not available.')
      }

      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : undefined

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: false, // Prevents unauthorized signups via magic link
        },
      })

      if (error) {
        if (error.message.toLowerCase().includes('signups not allowed') || error.message.toLowerCase().includes('user not found')) {
          setErrorMsg('Access is invite-only. If you have been invited, please use your invited email.')
        } else {
          setErrorMsg(error.message)
        }
        setLoading(false)
        return
      }

      setSuccessMsg('Check your email! We sent you a secure one-click sign-in link.')
      setLoading(false)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send magic link.')
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setErrorMsg('Please enter your email address first to reset your password.')
      return
    }

    setErrorMsg(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) throw new Error('Supabase client unavailable')

      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/update-password` : undefined

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      })

      if (error) {
        setErrorMsg(error.message)
      } else {
        setSuccessMsg('Password reset link sent to your email.')
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send reset link.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-[400px] h-[300px] bg-cyan-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 p-[1px] shadow-xl shadow-indigo-500/20 mb-4">
            <div className="w-full h-full bg-zinc-950 rounded-[15px] flex items-center justify-center">
              <Send className="w-6 h-6 text-indigo-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center justify-center gap-2">
            Outreach Smart
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              v0.1
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-mono">Single-Operator Cold Outreach Platform</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between pb-5 border-b border-zinc-800/80 mb-6">
            <div>
              <h2 className="text-base font-semibold text-zinc-200">
                {mode === 'password' ? 'Operator Sign In' : 'Magic Link Sign In'}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">Invite-only dashboard access</p>
            </div>
            <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setMode('password')
                  setErrorMsg(null)
                  setSuccessMsg(null)
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  mode === 'password'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-300'
                }`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('magic-link')
                  setErrorMsg(null)
                  setSuccessMsg(null)
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  mode === 'magic-link'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-300'
                }`}
              >
                Magic Link
              </button>
            </div>
          </div>

          {/* Feedback alerts */}
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          {mode === 'password' ? (
            <form onSubmit={handlePasswordSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@thereachsmart.net"
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-300">Password</label>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@thereachsmart.net"
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <p className="text-[11px] text-zinc-400">
                We'll email you a magic sign-in link. No password required.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending magic link...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Send Magic Link</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-zinc-800/60 text-center">
            <p className="text-[11px] text-zinc-500">
              Need access? Ask the workspace administrator for an invitation.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
