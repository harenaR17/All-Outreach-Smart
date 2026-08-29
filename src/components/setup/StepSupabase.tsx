'use client'

import React, { useState } from 'react'
import { testSupabaseConnection } from '@/app/actions/setup'
import { Database, Key, CheckCircle2, AlertCircle, Loader2, ArrowRight, Sparkles, Server } from 'lucide-react'

interface StepSupabaseProps {
  formData: {
    supabaseUrl: string
    supabaseAnonKey: string
    supabaseServiceRoleKey: string
    dbConnectionString: string
    cronSecret: string
  }
  updateFormData: (data: Partial<StepSupabaseProps['formData']>) => void
  onNext: () => void
}

export function StepSupabase({ formData, updateFormData, onNext }: StepSupabaseProps) {
  const [testing, setTesting] = useState(false)
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleTest = async () => {
    if (!formData.supabaseUrl || !formData.supabaseAnonKey || !formData.supabaseServiceRoleKey) {
      setErrorMessage('Please fill in your Supabase Project URL, Anon Key, and Service Role Key.')
      return
    }

    if (!formData.dbConnectionString) {
      setErrorMessage('Please provide your Database Connection String to execute DDL migrations.')
      return
    }

    setTesting(true)
    setErrorMessage(null)
    setTestSuccess(null)

    try {
      const res = await testSupabaseConnection({
        supabaseUrl: formData.supabaseUrl,
        supabaseAnonKey: formData.supabaseAnonKey,
        supabaseServiceRoleKey: formData.supabaseServiceRoleKey,
        dbConnectionString: formData.dbConnectionString,
      })

      if (res.success) {
        setTestSuccess(true)
      } else {
        setTestSuccess(false)
        setErrorMessage(res.error || 'Connection test failed')
      }
    } catch {
      setTestSuccess(false)
      setErrorMessage('Failed to communicate with setup service.')
    } finally {
      setTesting(false)
    }
  }

  const generateNewSecret = () => {
    const randomBytes = new Uint8Array(24)
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(randomBytes)
      const secret = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      updateFormData({ cronSecret: secret })
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-400" />
          Connect Supabase Project
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Enter your Supabase project credentials. Found under{' '}
          <span className="text-indigo-300 font-mono text-xs">Project Settings → API & Database</span> in your Supabase Dashboard.
        </p>
      </div>

      <div className="space-y-4">
        {/* Supabase URL */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wider mb-1.5">
            Supabase Project URL <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="https://xyzprojectref.supabase.co"
              value={formData.supabaseUrl}
              onChange={(e) => {
                updateFormData({ supabaseUrl: e.target.value })
                setTestSuccess(null)
              }}
              className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all font-mono"
            />
          </div>
        </div>

        {/* Anon Key */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wider mb-1.5">
            Supabase Anon / Public Key <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsIn..."
              value={formData.supabaseAnonKey}
              onChange={(e) => {
                updateFormData({ supabaseAnonKey: e.target.value })
                setTestSuccess(null)
              }}
              className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all font-mono"
            />
          </div>
        </div>

        {/* Service Role Key */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wider mb-1.5">
            Supabase Service Role Key (Secret) <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsIn..."
              value={formData.supabaseServiceRoleKey}
              onChange={(e) => {
                updateFormData({ supabaseServiceRoleKey: e.target.value })
                setTestSuccess(null)
              }}
              className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all font-mono"
            />
          </div>
        </div>

        {/* Database Direct Connection String */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-indigo-400" />
            Database Connection String (URI) <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <input
              type="password"
              placeholder="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
              value={formData.dbConnectionString}
              onChange={(e) => {
                updateFormData({ dbConnectionString: e.target.value })
                setTestSuccess(null)
              }}
              className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all font-mono"
            />
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Found in Supabase: <span className="text-zinc-400">Project Settings → Database → Connection string (URI / Session / Transaction mode)</span>.
          </p>
        </div>

        {/* Cron Shared Secret */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
              Internal Cron Secret Token
            </label>
            <button
              type="button"
              onClick={generateNewSecret}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              Regenerate
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              readOnly
              value={formData.cronSecret}
              className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-4 py-2.5 text-xs text-zinc-300 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Connection Feedback Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Connection Error</p>
            <p className="text-rose-400 mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {testSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <div>
            <p className="font-medium">Supabase & Database Connected Successfully</p>
            <p className="text-emerald-400/80 mt-0.5">REST API, Service Role, and PostgreSQL connection verified.</p>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !formData.supabaseUrl || !formData.supabaseAnonKey || !formData.supabaseServiceRoleKey || !formData.dbConnectionString}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Key className="w-4 h-4 text-zinc-400" />}
          {testing ? 'Testing Connection...' : 'Test Connection'}
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!testSuccess}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-medium shadow-lg shadow-indigo-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span>Next: Database Migration</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
