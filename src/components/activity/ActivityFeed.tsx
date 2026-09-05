'use client'

import { useState, useMemo } from 'react'
import { ActivityEvent, ActivitySummaryStats } from '@/app/actions/activity'
import { formatDate } from '@/lib/utils'
import { Pagination } from '@/components/shared/Pagination'
import { CATEGORY_BADGES } from '@/lib/constants/replyCategories'
import {
  Send,
  MessageSquare,
  AlertTriangle,
  AlertCircle,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  Inbox,
  Megaphone,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  XCircle,
} from 'lucide-react'

interface Props {
  initialEvents: ActivityEvent[]
  stats: ActivitySummaryStats
}

const PAGE_SIZE = 15

export function ActivityFeed({ initialEvents, stats }: Props) {
  const [events] = useState<ActivityEvent[]>(initialEvents)
  const [activeTab, setActiveTab] = useState<'all' | 'sends' | 'replies' | 'failed'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [paginationFilterKey, setPaginationFilterKey] = useState(`${activeTab}__${search}`)

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (activeTab === 'sends' && ev.type !== 'send') return false
      if (activeTab === 'replies' && ev.type !== 'reply') return false
      if (activeTab === 'failed' && ev.status !== 'failed' && ev.type !== 'bounce') return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchEmail = ev.leadEmail.toLowerCase().includes(q)
        const matchCampaign = ev.campaignName.toLowerCase().includes(q)
        const matchInbox = ev.inboxEmail.toLowerCase().includes(q)
        const matchSnippet = ev.snippet?.toLowerCase().includes(q) || false
        const matchError = ev.errorMessage?.toLowerCase().includes(q) || false
        return matchEmail || matchCampaign || matchInbox || matchSnippet || matchError
      }

      return true
    })
  }, [events, activeTab, search])

  // Reset to page 1 when the search/tab changes, and clamp back in range if the
  // list shrinks under the current page. Adjusted during render rather than in
  // an effect — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
  let effectivePage = page
  const filterKey = `${activeTab}__${search}`
  if (filterKey !== paginationFilterKey) {
    setPaginationFilterKey(filterKey)
    setPage(1)
    effectivePage = 1
  }
  const maxPage = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE))
  if (effectivePage > maxPage) {
    setPage(maxPage)
    effectivePage = maxPage
  }

  const paginatedEvents = useMemo(
    () => filteredEvents.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
    [filteredEvents, effectivePage]
  )

  const replyRate = stats.totalSends > 0 ? ((stats.totalReplies / stats.totalSends) * 100).toFixed(1) : '0.0'
  const bounceRate = stats.totalSends > 0 ? ((stats.totalBounces / stats.totalSends) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-6">
      {/* Deliverability & Activity KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sends Today */}
        <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Sends Today</span>
            <Send className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">{stats.sendsToday}</span>
            <span className="text-xs text-zinc-500 font-mono">({stats.totalSends} total)</span>
          </div>
          <p className="text-[11px] text-zinc-500">Live emails dispatched via campaign sequences</p>
        </div>

        {/* Replies Received */}
        <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Replies Received</span>
            <MessageSquare className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">{stats.totalReplies}</span>
            <span className="text-xs text-emerald-400 font-medium">({replyRate}% Reply rate)</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <span className="text-emerald-400 font-semibold">{stats.interestedCount} interested</span>
            <span>•</span>
            <span>{stats.wrongPersonCount} redirect</span>
          </div>
        </div>

        {/* Bounces */}
        <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Bounces</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">{stats.totalBounces}</span>
            <span className="text-xs text-amber-400/80 font-mono">({bounceRate}% bounce rate)</span>
          </div>
          <p className="text-[11px] text-zinc-500">Automatically marked globally bounced</p>
        </div>

        {/* Failed Sends */}
        <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Failed Sends / Issues</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${stats.failedSends > 0 ? 'text-rose-400' : 'text-zinc-100'}`}>
              {stats.failedSends}
            </span>
            <span className="text-xs text-zinc-500">needs review</span>
          </div>
          <p className="text-[11px] text-zinc-500">Missing template variables or API errors</p>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs by lead, campaign, inbox, or error..."
            className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-zinc-950/60 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${activeTab === 'all' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
          >
            All Activity
          </button>
          <button
            onClick={() => setActiveTab('sends')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${activeTab === 'sends' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
          >
            Sends ({stats.totalSends})
          </button>
          <button
            onClick={() => setActiveTab('replies')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${activeTab === 'replies' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
          >
            Replies ({stats.totalReplies})
          </button>
          <button
            onClick={() => setActiveTab('failed')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${activeTab === 'failed'
              ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
              }`}
          >
            Issues ({stats.failedSends + stats.totalBounces})
          </button>
        </div>
      </div>

      {/* Activity Log Feed */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
        {filteredEvents.length > 0 ? (
          <>
            <Pagination
              currentPage={effectivePage}
              totalItems={filteredEvents.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="events"
            />
            <div className="divide-y divide-zinc-800/60">
              {paginatedEvents.map((ev) => {
                const badge = ev.llmCategory ? CATEGORY_BADGES[ev.llmCategory] : null

                return (
                  <div
                    key={ev.id}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-900/30 transition-colors"
                  >
                    {/* Left: Type Icon + Lead Details */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        {ev.type === 'send' && ev.status === 'sent' && (
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                            <Send className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {ev.type === 'send' && ev.status === 'failed' && (
                          <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                            <XCircle className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {ev.type === 'reply' && (
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {ev.type === 'bounce' && (
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                            <AlertCircle className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-100">{ev.leadEmail}</span>
                          {ev.leadCompany && (
                            <span className="text-[11px] text-zinc-400">({ev.leadCompany})</span>
                          )}

                          {/* Classification Badges */}
                          {badge && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${badge.bg} ${badge.text} ${badge.border}`}>
                              {badge.label}
                            </span>
                          )}
                          {!badge && ev.type === 'reply' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Reply Received
                            </span>
                          )}
                          {ev.type === 'bounce' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Hard Bounce
                            </span>
                          )}
                          {ev.status === 'failed' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Send Failed
                            </span>
                          )}
                          {ev.stepOrder !== null && ev.stepOrder !== undefined && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                              Step {ev.stepOrder + 1}
                            </span>
                          )}
                        </div>

                        {/* Snippet / Error details */}
                        {ev.snippet && (
                          <p className="text-xs text-zinc-400 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/80 font-sans leading-relaxed">
                            &ldquo;{ev.snippet}&rdquo;
                          </p>
                        )}
                        {ev.errorMessage && (
                          <div className="p-2 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                            <span>{ev.errorMessage}</span>
                          </div>
                        )}

                        {/* Meta information */}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 font-mono">
                          <span className="flex items-center gap-1">
                            <Megaphone className="w-3 h-3 text-zinc-500" />
                            {ev.campaignName}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Inbox className="w-3 h-3 text-zinc-500" />
                            {ev.inboxEmail}
                          </span>
                          {ev.messageId && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[140px]" title={ev.messageId}>
                                ID: {ev.messageId.slice(0, 12)}...
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Timestamp */}
                    <div className="text-[11px] text-zinc-400 font-mono shrink-0 self-end md:self-center">
                      {formatDate(ev.timestamp)}
                    </div>
                  </div>
                )
              })}
            </div>
            <Pagination
              currentPage={effectivePage}
              totalItems={filteredEvents.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="events"
            />
          </>
        ) : (
          <div className="p-12 text-center space-y-2">
            <Clock className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs font-medium text-zinc-300">No activity recorded</p>
            <p className="text-[11px] text-zinc-500">
              {search ? 'Try clearing your search query.' : 'Dispatched outreach emails and replies will appear here in real time.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
