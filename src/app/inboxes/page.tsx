import { getInboxes } from '@/app/actions/inboxes'
import { InboxManager } from '@/components/inboxes/InboxManager'
import { Mail, ShieldCheck, Sparkles } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function InboxesPage() {
  const { data: inboxes = [], error } = await getInboxes()

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Phase 1
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Connected Sending Inboxes
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Manage Google Workspace mailboxes, service account domain-wide delegation, daily send limits, and minimum spacing cooldowns.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">Auth Method:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            Service Account Impersonation
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          Failed to load inboxes: {error}
        </div>
      )}

      {/* Main Inbox Management Interface */}
      <InboxManager inboxes={inboxes} />
    </div>
  )
}
