'use client'

import React, { useState } from 'react'
import { runDatabaseMigrations } from '@/app/actions/setup'
import { Play, CheckCircle2, AlertCircle, Loader2, ArrowRight, ArrowLeft, Layers, ShieldAlert } from 'lucide-react'

interface StepMigrationProps {
  formData: {
    supabaseUrl: string
    supabaseServiceRoleKey: string
    cronSecret: string
  }
  onNext: () => void
  onBack: () => void
}

const MIGRATION_TARGETS = [
  'PostgreSQL Extensions (pgcrypto, pg_cron, pg_net)',
  'Email Accounts (Inboxes & Rate Limit Tracking)',
  'Campaigns & Sequence Rules',
  'Lead Pool & Custom CSV Variables',
  'Campaign Steps & Email Templates',
  'Campaign Inboxes Allocation',
  'Campaign Lead Progress States',
  'Sends (Audit & Warmup Isolation)',
  'Replies (5-Category Gemini LLM Integration)',
  'Telegram Bot Recipients & Routing',
  'Inbound API Key Management',
  'Database Indexes & Query Optimizers',
  'Daily Inbox Send Capacity View',
  'Cron Schedules: Outreach Sender (Every 1 min)',
  'Cron Schedules: Reply Checker (Every 3 mins)',
]

export function StepMigration({ formData, onNext, onBack }: StepMigrationProps) {
  const [running, setRunning] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleRunMigration = async () => {
    setRunning(true)
    setError(null)
    setCompletedSteps([])

    try {
      const res = await runDatabaseMigrations({
        supabaseUrl: formData.supabaseUrl,
        supabaseServiceRoleKey: formData.supabaseServiceRoleKey,
        cronSecret: formData.cronSecret,
      })

      if (res.completedSteps) {
        setCompletedSteps(res.completedSteps)
      }

      if (res.success) {
        setSuccess(true)
      } else {
        setError(res.error || 'Migration encountered an error.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Execution failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          Initialize Database Schema
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Applies all 6 SQL migrations atomically over the Supabase HTTP execution bridge. All statements are idempotent.
        </p>
      </div>

      {/* Target schema checklist */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Schema Components to Initialize
        </p>
        <div className="space-y-2">
          {MIGRATION_TARGETS.map((target, idx) => {
            const isDone = success || completedSteps.some((s) => s.toLowerCase().includes(target.split(' ')[0].toLowerCase()))
            return (
              <div
                key={idx}
                className="flex items-center gap-2.5 text-xs text-zinc-300 py-1 border-b border-zinc-850 last:border-0"
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : running ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" />
                )}
                <span className={isDone ? 'text-zinc-200' : 'text-zinc-500'}>{target}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Notice on pg_cron extension if applicable */}
      <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3 text-indigo-300 text-xs">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
        <div>
          <p className="font-medium text-indigo-200">Supabase Extensions Notice</p>
          <p className="text-zinc-400 mt-0.5">
            If your Supabase plan restricts DDL extension creation via SQL, ensure{' '}
            <span className="text-indigo-300 font-mono">pg_cron</span> and{' '}
            <span className="text-indigo-300 font-mono">pg_net</span> are enabled in{' '}
            <span className="text-zinc-300">Database → Extensions</span>.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Migration Error</p>
            <p className="text-rose-400 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <div>
            <p className="font-medium">Database Initialized Successfully!</p>
            <p className="text-emerald-400/80 mt-0.5">All tables, views, triggers, and indexes are active.</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={onBack}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm font-medium transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          {!success && (
            <button
              type="button"
              onClick={handleRunMigration}
              disabled={running}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition shadow-lg shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Play className="w-4 h-4" />}
              <span>{running ? 'Running Migrations...' : 'Initialize Database'}</span>
            </button>
          )}

          {success && (
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-medium shadow-lg shadow-indigo-500/20 transition cursor-pointer"
            >
              <span>Next: Create Admin Account</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
