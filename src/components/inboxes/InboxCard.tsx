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
  ChevronRight,
  Sparkles,
  Send,
  User,
  Plus,
  X as XIcon,
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

  // Local editable states — rate limits
  const [dailyLimit, setDailyLimit] = useState(inbox.daily_send_limit)
  const [minSeconds, setMinSeconds] = useState(inbox.min_seconds_between_sends)
  const [isActive, setIsActive] = useState(inbox.is_active)
  const [saveIndicator, setSaveIndicator] = useState<string | null>(null)

  // Sender profile state
  const [showProfile, setShowProfile] = useState(false)
  const [firstName, setFirstName] = useState(inbox.first_name ?? '')
  const [lastName, setLastName] = useState(inbox.last_name ?? '')
  const [role, setRole] = useState(inbox.role ?? '')
  const [phone, setPhone] = useState(inbox.phone_number ?? '')
  const [signature, setSignature] = useState(inbox.signature ?? '')
  // Custom variables: array of {key, value} pairs
  const [customVars, setCustomVars] = useState<{ key: string; value: string }[]>(
    Object.entries(inbox.variables ?? {}).map(([key, value]) => ({ key, value }))
  )

  const showSaveSuccess = (text: string) => {
    setSaveIndicator(text)
    setTimeout(() => setSaveIndicator(null), 2000)
  }

  // ── Rate limit handlers ───────────────────────────────────────────────────

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

  // ── Sender profile handlers ───────────────────────────────────────────────

  const saveProfileField = (field: {
    first_name?: string | null
    last_name?: string | null
    role?: string | null
    phone_number?: string | null
    signature?: string | null
  }) => {
    startTransition(async () => {
      const res = await updateInboxSettings(inbox.id, field)
      if (res.success) showSaveSuccess('Profile saved')
    })
  }

  const saveCustomVars = (vars: { key: string; value: string }[]) => {
    // Deduplicate and filter blank keys before saving
    const cleaned: Record<string, string> = {}
    for (const { key, value } of vars) {
      const k = key.trim()
      if (k && /^\w+$/.test(k)) cleaned[k] = value
    }
    startTransition(async () => {
      const res = await updateInboxSettings(inbox.id, { variables: cleaned })
      if (res.success) showSaveSuccess('Variables saved')
    })
  }

  const handleAddCustomVar = () => {
    setCustomVars((prev) => [...prev, { key: '', value: '' }])
  }

  const handleCustomVarChange = (
    idx: number,
    field: 'key' | 'value',
    val: string
  ) => {
    setCustomVars((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: val }
      return next
    })
  }

  const handleCustomVarBlur = () => {
    saveCustomVars(customVars)
  }

  const handleCustomVarDelete = (idx: number) => {
    const next = customVars.filter((_, i) => i !== idx)
    setCustomVars(next)
    saveCustomVars(next)
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
    <>
      <div
        className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
        isStatusError
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
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isStatusError
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
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                  isLimitReached
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
              className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                isActive ? 'bg-indigo-600' : 'bg-zinc-800'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  isActive ? 'translate-x-4' : 'translate-x-0'
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
      <div className="px-5 py-4 bg-zinc-900/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start text-xs">
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
              className={`h-full rounded-full transition-all ${
                isLimitReached
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
          {/* Invisible spacer to match Daily Limit cell's progress bar height, keeping inputs aligned */}
          <div className="h-1.5 mt-1.5" />
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

      {/* Sender Profile & Variables Trigger */}
      <div className="border-t border-zinc-800/80">
        <button
          type="button"
          onClick={() => setShowProfile(true)}
          className="w-full px-5 py-3 flex items-center justify-between text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            Sender Profile &amp; Variables
          </span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
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
          className={`px-5 py-3 border-t text-xs flex items-center justify-between ${
            testResult.success
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

    {/* Sender Profile & Variables Modal */}
    {showProfile && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-100">Sender Profile &amp; Variables</h2>
                <p className="text-xs text-zinc-400 font-mono">{inbox.email_address}</p>
              </div>
            </div>
            <button
              onClick={() => setShowProfile(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-5 flex-1">
            {/* Name Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-400">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={() => saveProfileField({ first_name: firstName.trim() || null })}
                  placeholder="e.g. Paul"
                  disabled={isPending}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-400">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={() => saveProfileField({ last_name: lastName.trim() || null })}
                  placeholder="e.g. Martin"
                  disabled={isPending}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Role & Phone Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-400">Job Title / Role</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  onBlur={() => saveProfileField({ role: role.trim() || null })}
                  placeholder="e.g. Head of Sales"
                  disabled={isPending}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-400">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => saveProfileField({ phone_number: phone.trim() || null })}
                  placeholder="e.g. +1 555 123 4567"
                  disabled={isPending}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Signature */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                Email Signature  <span className="text-zinc-600">(resolves <code className="font-mono">{'{{sender_signature}}'}</code>)</span>
              </label>
              <textarea
                rows={3}
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                onBlur={() => saveProfileField({ signature: signature.trim() || null })}
                placeholder={`Best regards,\nPaul Martin\nHead of Sales`}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-mono"
              />
            </div>

            {/* Custom Variables */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-zinc-400">
                  Custom Variables
                </label>
                <button
                  type="button"
                  onClick={handleAddCustomVar}
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add variable
                </button>
              </div>

              {customVars.length === 0 && (
                <p className="text-[11px] text-zinc-600 italic">
                  No custom variables. Add one to use tokens like <code className="font-mono">{'{{booking_link}}'}</code> in templates.
                </p>
              )}

              <div className="space-y-1.5">
                {customVars.map((cv, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={cv.key}
                      onChange={(e) => handleCustomVarChange(idx, 'key', e.target.value)}
                      onBlur={handleCustomVarBlur}
                      placeholder="key (e.g. booking_link)"
                      pattern="\w+"
                      disabled={isPending}
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-zinc-600 text-xs">→</span>
                    <input
                      type="text"
                      value={cv.value}
                      onChange={(e) => handleCustomVarChange(idx, 'value', e.target.value)}
                      onBlur={handleCustomVarBlur}
                      placeholder="value"
                      disabled={isPending}
                      className="flex-[2] px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleCustomVarDelete(idx)}
                      disabled={isPending}
                      className="p-1 text-zinc-600 hover:text-rose-400 transition-colors"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {customVars.length > 0 && (
                <p className="text-[10px] text-zinc-600">
                  Keys must be word characters only (letters, digits, underscores). Changes save on blur.
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 px-6 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setShowProfile(false)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
