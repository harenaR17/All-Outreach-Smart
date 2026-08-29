'use client'

import { useState } from 'react'
import type { EmailAccount } from '@/lib/types/database'
import { InboxCard } from './InboxCard'
import { AddInboxModal } from './AddInboxModal'
import {
  Mail,
  Plus,
  ShieldCheck,
  Zap,
  Gauge,
  Clock,
  HelpCircle,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Copy,
  Check,
  Cloud,
  Building2,
  Key,
  Send,
} from 'lucide-react'

interface InboxManagerProps {
  inboxes: EmailAccount[]
}

const SCOPE_SEND = 'https://www.googleapis.com/auth/gmail.send'
const SCOPE_READONLY = 'https://www.googleapis.com/auth/gmail.readonly'
const SCOPE_MODIFY = 'https://www.googleapis.com/auth/gmail.modify'
const SCOPES_COMBINED = `${SCOPE_SEND}, ${SCOPE_READONLY}, ${SCOPE_MODIFY}`

export function InboxManager({ inboxes }: InboxManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [copiedScope, setCopiedScope] = useState<'send' | 'readonly' | 'modify' | 'all' | null>(null)

  const activeInboxes = inboxes.filter((i) => i.status === 'active' && i.is_active)
  const totalDailyCapacity = activeInboxes.reduce((acc, curr) => acc + curr.daily_send_limit, 0)
  const totalSendsToday = inboxes.reduce((acc, curr) => acc + (curr.sends_today || 0), 0)
  const capacityUsedPercent =
    totalDailyCapacity > 0 ? Math.min(100, Math.round((totalSendsToday / totalDailyCapacity) * 100)) : 0

  const avgSpacing = activeInboxes.length
    ? Math.round(
      activeInboxes.reduce((acc, curr) => acc + curr.min_seconds_between_sends, 0) /
      activeInboxes.length
    )
    : 180

  const handleCopyScope = (type: 'send' | 'readonly' | 'modify' | 'all') => {
    let textToCopy = SCOPES_COMBINED
    if (type === 'send') textToCopy = SCOPE_SEND
    if (type === 'readonly') textToCopy = SCOPE_READONLY
    if (type === 'modify') textToCopy = SCOPE_MODIFY

    navigator.clipboard.writeText(textToCopy)
    setCopiedScope(type)
    setTimeout(() => setCopiedScope(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Top Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Connected Inboxes</span>
            <Mail className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">{inboxes.length}</div>
          <p className="text-[11px] text-zinc-400">Mailboxes configured</p>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Senders</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{activeInboxes.length}</div>
          <p className="text-[11px] text-zinc-400">
            {inboxes.length - activeInboxes.length} paused or error
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Daily Sends / Capacity</span>
            <Send className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-cyan-400">{totalSendsToday}</span>
            <span className="text-xs text-zinc-400 font-mono">/ {totalDailyCapacity} max</span>
          </div>
          <div className="w-full bg-zinc-800/80 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${capacityUsedPercent >= 90
                ? 'bg-rose-500'
                : capacityUsedPercent >= 70
                  ? 'bg-amber-400'
                  : 'bg-cyan-400'
                }`}
              style={{ width: `${capacityUsedPercent}%` }}
            />
          </div>

          <p className="text-[10px] text-zinc-500 pt-0.5">
            {capacityUsedPercent}% of pooled daily quota used
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Avg Spacing Cooldown</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{avgSpacing}s</div>
          <p className="text-[11px] text-zinc-400">Min {Math.round(avgSpacing / 60)} min per inbox reuse</p>
        </div>
      </div>

      {/* Action Bar & Quick Setup Guide Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/80">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{showGuide ? 'Hide Domain Delegation Instructions' : 'View Google Workspace Delegation Guide'}</span>
          </button>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Connect New Inbox</span>
        </button>
      </div>

      {/* Domain Delegation Reference Guide */}
      {showGuide && (
        <div className="p-6 rounded-2xl bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 border border-indigo-500/25 text-xs space-y-5 animate-in fade-in shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>One-Time Google Workspace Domain-Wide Delegation Setup</span>
            </div>
            <button
              onClick={() => handleCopyScope('all')}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer ${copiedScope === 'all'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
            >
              {copiedScope === 'all' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedScope === 'all' ? 'Copied All 3 Scopes!' : 'Copy Scopes for Admin Console'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-zinc-300">
            <div className="space-y-2 p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-indigo-400" />
                    Step 1: Google Cloud Project
                  </span>
                  <a
                    href="https://console.cloud.google.com/apis/library/gmail.googleapis.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 underline"
                  >
                    <span>GCP Console</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-400 leading-relaxed">
                  <li>Enable <strong>Gmail API</strong> in Google Cloud Console.</li>
                  <li>Create a <strong>Service Account</strong> and download its JSON Key.</li>
                  <li>Enable <strong>&quot;Domain-Wide Delegation&quot;</strong> on the service account.</li>
                  <li>Copy the numeric <strong>OAuth2 Client ID</strong>.</li>
                </ol>
              </div>
            </div>

            <div className="space-y-2 p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-cyan-400" />
                    Step 2: Workspace Admin Console
                  </span>
                  <a
                    href="https://admin.google.com/ac/owl/domainwidedelegation"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 underline"
                  >
                    <span>Admin Console</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-400 leading-relaxed">
                  <li>Go to <code className="text-zinc-200">admin.google.com</code> ➔ Security ➔ API controls.</li>
                  <li>Click <strong>Manage Domain-wide Delegation</strong> ➔ <strong>Add new</strong>.</li>
                  <li>Paste the numeric <strong>Client ID</strong> from Step 1.</li>
                  <li>Paste the three OAuth scopes (<code className="text-indigo-300">gmail.send</code>, <code className="text-indigo-300">gmail.readonly</code> &amp; <code className="text-indigo-300">gmail.modify</code>) and click Authorize.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inbox List Cards */}
      <div className="space-y-4">
        {inboxes.length > 0 ? (
          inboxes.map((inbox) => <InboxCard key={inbox.id} inbox={inbox} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/30 p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
              <Mail className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-sm font-semibold text-zinc-100">No Inboxes Connected Yet</h3>
              <p className="text-xs text-zinc-400">
                Connect your Google Workspace inboxes using your service account credentials to start sending outreach.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Connect First Inbox</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      <AddInboxModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}
