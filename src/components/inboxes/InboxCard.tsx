'use client'

import { useState, useTransition } from 'react'
import type { EmailAccount } from '@/lib/types/database'
import {
  Mail,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Send
} from 'lucide-react'
import {
  updateInboxSettings,
  testInboxConnection,
  sendTestEmailAction,
  deleteInbox
} from '@/app/actions/inboxes'
import { formatDate } from '@/lib/utils'

interface InboxCardProps {
  inbox: EmailAccount
}

export function InboxCard({ inbox }: InboxCardProps) {
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    error?: string
    remediation?: string
    isTestEmail?: boolean
  } | null>(null)
  const [showErrorDetails, setShowErrorDetails] = useState(false)

  // Local editable states
  const [dailyLimit, setDailyLimit] = useState(inbox.daily_send_limit)
  const [minSeconds, setMinSeconds] = useState(inbox.min_seconds_between_sends)
  const [isActive, setIsActive] = useState(inbox.is_active)
  const [saveIndicator, setSaveIndicator] = useState<string | null>(null)

  const showSaveSuccess = (text: string) => {
    setSaveIndicator(text)
    setTimeout(() => setSaveIndicator(null), 2000)
  }

  // Handle active/inactive toggle
  const handleToggleActive = () => {
    const nextVal = !isActive
    setIsActive(nextVal)

    startTransition(async () => {
      const res = await updateInboxSettings(inbox.id, { is_active: nextVal })
      if (res.success) {
        showSaveSuccess(nextVal ? 'Inbox activated' : 'Inbox paused')
      }
    })
  }

  // Handle daily limit save on blur
  const handleDailyLimitBlur = () => {
    if (dailyLimit === inbox.daily_send_limit) return
    startTransition(async () => {
      const res = await updateInboxSettings(inbox.id, { daily_send_limit: dailyLimit })
      if (res.success) {
        showSaveSuccess('Daily limit saved')
      }
    })
  }

  // Handle spacing cooldown save on blur
  const handleMinSecondsBlur = () => {
    if (minSeconds === inbox.min_seconds_between_sends) return
    startTransition(async () => {
      const res = await updateInboxSettings(inbox.id, { min_seconds_between_sends: minSeconds })
      if (res.success) {
        showSaveSuccess('Spacing cooldown saved')
      }
    })
  }

  // Handle re-testing connection
  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    const res = await testInboxConnection(inbox.id)
    setIsTesting(false)
    setTestResult({ ...res, isTestEmail: false })
    if (!res.success) {
      setShowErrorDetails(true)
    }
  }

  // Handle sending on-demand confirmation test email
  const handleSendTestEmail = async () => {
    setIsSendingTest(true)
    setTestResult(null)
    const res = await sendTestEmailAction(inbox.id)
    setIsSendingTest(false)
    setTestResult({ ...res, isTestEmail: true })
    if (res.success) {
      showSaveSuccess('Test confirmation email dispatched to inbox!')
    } else {
      setShowErrorDetails(true)
    }
  }

  // Handle deletion
  const handleDelete = () => {
    if (!confirm(`Are you sure you want to disconnect inbox "${inbox.email_address}"?`)) return

    startTransition(async () => {
      await deleteInbox(inbox.id)
    })
  }

  const isStatusActive = inbox.status === 'active' && isActive
  const isStatusError = inbox.status === 'error'
  const sendsToday = inbox.sends_today || 0
  const sendPercent = dailyLimit > 0 ? Math.min(100, Math.round((sendsToday / dailyLimit) * 100)) : 0
  const isLimitReached = sendsToday >= dailyLimit

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${isStatusError
        ? 'bg-zinc-950 border-rose-500/30 shadow-lg shadow-rose-950/20'
        : isStatusActive
          ? 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700 shadow-md'
          : 'bg-zinc-950/40 border-zinc-800/60 opacity-85'
        }`}
    >
      {/* Card Header & Controls */}
      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80">
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${isStatusError
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : isStatusActive
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500'
              }`}
          >
            <Mail className="w-5 h-5" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-sm font-semibold text-zinc-100">{inbox.email_address}</span>
              {inbox.display_name && (
                <span className="text-xs text-zinc-400 font-medium">({inbox.display_name})</span>
              )}

              {/* Status Badge */}
              {isStatusError ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <ShieldAlert className="w-3 h-3" />
                  Auth Error
                </span>
              ) : isActive ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                  Paused
                </span>
              )}


              {/* Sends Today Quota Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${isLimitReached
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  : sendPercent >= 80
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                  }`}
                title={`${sendsToday} emails sent today out of ${dailyLimit} limit (${sendPercent}%)`}
              >
                <Send className="w-2.5 h-2.5 text-indigo-400" />
                <span>{sendsToday}/{dailyLimit} today</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 font-mono">
              <span title="Google Service Account Client Email">
                SA: {inbox.service_account_client_email.split('@')[0]}...
              </span>
              <span>•</span>
              <span>Added: {formatDate(inbox.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-end md:self-center flex-wrap">
          {/* Active / Inactive Toggle Switch */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <span className="text-[11px] font-medium text-zinc-400">
              {isActive ? 'Sending Enabled' : 'Sending Paused'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={handleToggleActive}
              disabled={isPending}
              className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${isActive ? 'bg-indigo-600' : 'bg-zinc-800'
                }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0'
                  }`}
              />
            </button>
          </div>

          {/* Send Test Email Button */}
          <button
            onClick={handleSendTestEmail}
            disabled={isSendingTest || isTesting || isPending}
            title="Send a live self-test email to verify send permissions"
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSendingTest ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <Send className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span className="hidden sm:inline">Send Test Email</span>
          </button>

          {/* Test Connection Button */}
          <button
            onClick={handleTestConnection}
            disabled={isTesting || isSendingTest || isPending}
            title="Re-verify Gmail token and delegation"
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span className="hidden sm:inline">Test Auth</span>
          </button>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            disabled={isPending}
            title="Delete inbox connection"
            className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editable Rate Limits & Timers Bar */}
      <div className="px-5 py-4 bg-zinc-900/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center text-xs">
        {/* Editable Daily Send Limit */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-zinc-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-indigo-400" />
              Daily Limit
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {sendsToday}/{dailyLimit} sent
            </span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={1}
              max={500}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(parseInt(e.target.value) || 0)}
              onBlur={handleDailyLimitBlur}
              disabled={isPending}
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono font-semibold text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="w-full bg-zinc-950 border border-zinc-800/80 rounded-full h-1.5 overflow-hidden mt-1.5">
            <div
              className={`h-full rounded-full transition-all ${isLimitReached
                ? 'bg-rose-500'
                : sendPercent >= 80
                  ? 'bg-amber-400'
                  : 'bg-indigo-500'
                }`}
              style={{ width: `${sendPercent}%` }}
            />
          </div>
        </div>

        {/* Editable Minimum Spacing Cooldown */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-zinc-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              Min Spacing
            </span>
            <span className="text-[10px] text-zinc-400">seconds</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={10}
              max={3600}
              value={minSeconds}
              onChange={(e) => setMinSeconds(parseInt(e.target.value) || 0)}
              onBlur={handleMinSecondsBlur}
              disabled={isPending}
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono font-semibold text-zinc-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Last Send Activity */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-zinc-400">Last Send Dispatched</span>
          <div className="text-xs font-mono text-zinc-300">
            {formatDate(inbox.last_sent_at)}
          </div>
        </div>

        {/* Fair Rotation: Last New Lead Timestamp */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-zinc-400">Last New Lead Started</span>
          <div className="text-xs font-mono text-zinc-300">
            {formatDate(inbox.last_new_lead_sent_at)}
          </div>
        </div>
      </div>

      {/* Save Success Notice */}
      {saveIndicator && (
        <div className="px-5 py-2 bg-emerald-500/10 border-t border-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{saveIndicator}</span>
        </div>
      )}

      {/* Test Connection Live Result */}
      {testResult && (
        <div
          className={`px-5 py-3 border-t text-xs flex items-center justify-between ${testResult.success
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            )}
            <span>
              {testResult.success
                ? testResult.isTestEmail
                  ? `Confirmation test email sent successfully to ${inbox.email_address}! Check your Gmail inbox.`
                  : 'Auth verified: Google Workspace delegation token is active and working.'
                : testResult.error}
            </span>
          </div>
          {!testResult.success && (
            <button
              onClick={() => setShowErrorDetails(!showErrorDetails)}
              className="text-[11px] font-medium text-rose-400 hover:underline flex items-center gap-1"
            >
              <span>{showErrorDetails ? 'Hide Help' : 'View Fix'}</span>
              {showErrorDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      )}

      {/* Error Message from Database or Verification */}
      {(inbox.error_message || (testResult && !testResult.success)) && showErrorDetails && (
        <div className="p-4 bg-rose-950/30 border-t border-rose-500/30 text-xs space-y-2">
          <div className="text-rose-300 font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Diagnostic Trace:</span>
          </div>
          <p className="text-rose-200/90 font-mono text-[11px] pl-6">
            {inbox.error_message || testResult?.error}
          </p>
          {testResult?.remediation && (
            <div className="pl-6 pt-2 border-t border-rose-500/20 text-[11px] text-zinc-300">
              <span className="font-semibold text-rose-200">How to fix:</span>
              <p className="mt-0.5">{testResult.remediation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
