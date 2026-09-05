'use client'

import { MessageSquare, Sparkles, TrendingUp } from 'lucide-react'
import type { ActivityEvent, ActivitySummaryStats } from '@/app/actions/activity'
import type { CampaignLeadItem } from '@/app/actions/campaigns'
import type { CampaignStep } from '@/lib/types/database'
import { CampaignActivityFeed } from '@/components/campaigns/CampaignActivityFeed'

interface Props {
  stats: ActivitySummaryStats
  events: ActivityEvent[]
  campaignLeads: CampaignLeadItem[]
  steps: CampaignStep[]
}

export function CampaignAnalyticsTab({ stats, events, campaignLeads, steps }: Props) {
  const replyRate = stats.totalSends > 0 ? ((stats.totalReplies / stats.totalSends) * 100).toFixed(1) : '0.0'
  const positiveReplyRate = (stats.positiveReplyRate * 100).toFixed(1)

  return (
    <div className="space-y-8">
      {/* Positive-outcome KPI tiles */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Performance Summary</h3>
          <p className="text-[11px] text-zinc-500">Lifetime totals for this campaign</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:border-indigo-700 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Reply Rate</span>
              <MessageSquare className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100">{replyRate}%</span>
            </div>
            <p className="text-[11px] text-zinc-500">{stats.totalReplies} replies of {stats.totalSends} sends</p>
          </div>

          <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:border-indigo-700 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Positive Replies</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100">{stats.interestedCount}</span>
            </div>
            <p className="text-[11px] text-zinc-500">Replies classified as interested</p>
          </div>

          <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:border-indigo-700 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Positive Reply Rate</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-400">{positiveReplyRate}%</span>
            </div>
            <p className="text-[11px] text-zinc-500">Interested replies / total sends</p>
          </div>
        </div>
      </div>

      {/* Scoped live activity feed (includes its own deliverability KPIs, search, and log) */}
      <div className="space-y-3 pt-6 border-t border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Live Activity</h3>
          <p className="text-[11px] text-zinc-500">Today&apos;s pace alongside the full send &amp; reply log</p>
        </div>
        <CampaignActivityFeed initialEvents={events} stats={stats} campaignLeads={campaignLeads} steps={steps} />
      </div>
    </div>
  )
}
