import Link from 'next/link'
import { getCampaigns } from '@/app/actions/campaigns'
import { getInboxes } from '@/app/actions/inboxes'
import { getLeadsSummary } from '@/app/actions/leads'
import { getActivitySummaryStats, getActivityFeed } from '@/app/actions/activity'
import { formatDate } from '@/lib/utils'
import {
  Megaphone,
  Inbox,
  Users,
  Activity,
  Settings,
  Sparkles,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  Globe,
  Send,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const CATEGORY_BADGES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  interested: {
    label: '🎯 Interested',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  not_interested: {
    label: '🛑 Not Interested',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/20',
  },
  wrong_person: {
    label: '🔄 Wrong Person',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  undefined: {
    label: '❓ Undefined',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
  },
  out_of_office: {
    label: '🏖️ Out of Office',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
  },
}

export default async function DashboardPage() {
  const [campaignsRes, inboxesRes, leadsSummaryRes, activityStatsRes, recentActivityRes] =
    await Promise.all([
      getCampaigns(),
      getInboxes(),
      getLeadsSummary(),
      getActivitySummaryStats(),
      getActivityFeed({ type: 'replies', limit: 5 }),
    ])

  const campaigns = campaignsRes.data || []
  const inboxes = inboxesRes.data || []
  const leadsSummary = leadsSummaryRes.data || { total: 0, active: 0, pending: 0, replied: 0, bounced: 0, doNotContact: 0 }
  const stats = activityStatsRes.data || {
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
  const recentReplies = recentActivityRes.data || []

  const activeCampaignsCount = campaigns.filter((c) => c.status === 'active').length
  const totalDailyCapacity = inboxes.reduce((acc, i) => acc + (i.is_active ? i.daily_send_limit : 0), 0)
  const activeInboxesCount = inboxes.filter((i) => i.is_active).length

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Hero Welcome & Executive Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950/50 via-zinc-900/60 to-zinc-950 border border-indigo-500/20 p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>All Systems Operational — Sender & Reply Triage Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Cold Outreach Automation Command Center
            </h1>
            <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Multi-step plain-text sequences distributed across Google Workspace inboxes with strict daily limits, thread continuity, Gemini 5-category reply classification, and Telegram broadcasting.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/campaigns"
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all shadow-lg shadow-indigo-600/25 flex items-center gap-2 cursor-pointer"
            >
              <span>Manage Campaigns</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/activity"
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-zinc-200 transition-all border border-zinc-700/80 flex items-center gap-2 cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Activity Logs</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Active Campaigns */}
        <Link
          href="/campaigns"
          className="group rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700/80 p-5 space-y-3 transition-all hover:bg-zinc-900/70"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Campaigns</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Megaphone className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100">{activeCampaignsCount} Active</span>
              <span className="text-xs text-zinc-500 font-mono">({campaigns.length} total)</span>
            </div>
            <p className="text-[11px] text-zinc-500">Automated sequence execution</p>
          </div>
        </Link>

        {/* Daily Send Volume & Inbox Capacity */}
        <Link
          href="/inboxes"
          className="group rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700/80 p-5 space-y-3 transition-all hover:bg-zinc-900/70"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Daily Send Volume</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100">{stats.sendsToday}</span>
              <span className="text-xs text-zinc-400 font-mono">/ {totalDailyCapacity} cap</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>{activeInboxesCount} active inboxes</span>
              <span className="text-emerald-400 font-medium">
                {totalDailyCapacity > 0 ? Math.round((stats.sendsToday / totalDailyCapacity) * 100) : 0}% used
              </span>
            </div>
          </div>
        </Link>

        {/* Total Leads */}
        <Link
          href="/leads"
          className="group rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700/80 p-5 space-y-3 transition-all hover:bg-zinc-900/70"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Enrolled Leads</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100">{leadsSummary.total} Leads</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span className="text-emerald-400">{leadsSummary.replied} replied</span>
              <span>•</span>
              <span className="text-amber-400">{leadsSummary.bounced} bounced</span>
            </div>
          </div>
        </Link>

        {/* Reply Rate & Intelligence */}
        <Link
          href="/activity"
          className="group rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700/80 p-5 space-y-3 transition-all hover:bg-zinc-900/70"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Reply Triage</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100">{stats.totalReplies} Replies</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span className="text-emerald-400 font-semibold">{stats.interestedCount} interested</span>
              <span>•</span>
              <span>{stats.undefinedCount} undefined</span>
            </div>
          </div>
        </Link>
      </div>

      {/* Main Grid: Recent Replies & Active Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active Campaigns Table */}
        <div className="lg:col-span-2 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-indigo-400" />
                Campaign Sequences
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Live delivery progress, schedules, and active inbox assignments
              </p>
            </div>
            <Link
              href="/campaigns"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              <span>View all ({campaigns.length})</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {campaigns.length > 0 ? (
            <div className="divide-y divide-zinc-800/60">
              {campaigns.slice(0, 5).map((camp) => (
                <Link
                  key={camp.id}
                  href={`/campaigns/${camp.id}`}
                  className="block p-3.5 -mx-2 rounded-xl hover:bg-zinc-900/50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-100">{camp.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border uppercase ${camp.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : camp.status === 'paused'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                            }`}
                        >
                          {camp.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3 text-zinc-500" />
                          {camp.timezone}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          {camp.working_hours_start.slice(0, 5)} - {camp.working_hours_end.slice(0, 5)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span className="font-medium text-zinc-200">{camp.leadCount} leads</span>
                      <span className="text-zinc-600">•</span>
                      <span>{camp.stepCount} steps</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center space-y-2">
              <p className="text-xs text-zinc-400">No campaigns created yet.</p>
              <Link
                href="/campaigns"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-block"
              >
                Create your first campaign &rarr;
              </Link>
            </div>
          )}
        </div>

        {/* Right 1 Col: Recent Triage Feed */}
        <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Recent Replies
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">Gemini classified responses</p>
            </div>
            <Link
              href="/activity"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Feed
            </Link>
          </div>

          {recentReplies.length > 0 ? (
            <div className="space-y-3">
              {recentReplies.map((rep) => {
                const badge = rep.llmCategory ? CATEGORY_BADGES[rep.llmCategory] : null

                return (
                  <div
                    key={rep.id}
                    className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-zinc-200 truncate">{rep.leadEmail}</span>
                      {badge && (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {rep.snippet && (
                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed italic">
                        &ldquo;{rep.snippet}&rdquo;
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-800/60">
                      <span>{rep.campaignName}</span>
                      <span>{formatDate(rep.timestamp)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-8 text-center space-y-2">
              <MessageSquare className="w-6 h-6 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-400">No replies logged yet</p>
              <p className="text-[11px] text-zinc-500">
                Inbound replies will automatically be triaged and notified here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
