import { Activity, Send, MessageSquare, ShieldCheck } from 'lucide-react'
import { getActivitySummaryStats, getActivityFeed } from '@/app/actions/activity'
import { ActivityFeed } from '@/components/activity/ActivityFeed'

export const dynamic = 'force-dynamic'

export default async function ActivityPage() {
  const [statsRes, eventsRes] = await Promise.all([
    getActivitySummaryStats(),
    getActivityFeed({ type: 'all', limit: 100 }),
  ])

  const stats = statsRes.data || {
    sendsToday: 0,
    totalSends: 0,
    totalReplies: 0,
    totalBounces: 0,
    failedSends: 0,
    interestedCount: 0,
    notInterestedCount: 0,
    wrongPersonCount: 0,
    undefinedCount: 0,
    outOfOfficeCount: 0,
  }

  const events = eventsRes.data || []

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Live Monitor
            </span>
            <h1 className="text-xl font-bold text-zinc-100">Live Activity & Deliverability Audit</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time audit log of dispatched campaign emails, inbound replies, Gemini AI triage classifications, bounces, and send error diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 bg-zinc-900/60 px-3 py-1.5 rounded-lg border border-zinc-800 self-start sm:self-auto">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Polling interval: Real-time</span>
        </div>
      </div>

      {/* Main Activity Monitor & Feed */}
      <ActivityFeed initialEvents={events} stats={stats} />
    </div>
  )
}
