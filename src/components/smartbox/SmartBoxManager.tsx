'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import type { SmartBoxLead } from '@/app/actions/smartbox'
import { getLeadThreadMessages } from '@/app/actions/smartbox'
import { CATEGORY_BADGES, REPLY_CATEGORY_ORDER, type ReplyCategory } from '@/lib/constants/replyCategories'
import { formatDate } from '@/lib/utils'
import type { ThreadMessage } from '@/lib/types/database'
import {
  Search,
  Inbox,
  Megaphone,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  ListFilter,
  UserCircle2,
} from 'lucide-react'

interface Props {
  initialLeads: SmartBoxLead[]
}

/** Pretty-print a variable key like `first_name` -> `First Name`. */
function prettifyKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function SmartBoxManager({ initialLeads }: Props) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ReplyCategory | 'all'>('all')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialLeads[0]?.id ?? null)
  const [filterKeyAtSelection, setFilterKeyAtSelection] = useState(`${categoryFilter}__${search}`)

  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([])
  const [threadError, setThreadError] = useState<string | null>(null)
  const [isThreadPending, startThreadTransition] = useTransition()

  const filteredLeads = useMemo(() => {
    return initialLeads.filter((lead) => {
      if (categoryFilter !== 'all' && lead.latestReply.llmCategory !== categoryFilter) return false

      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const company = (lead.leadVariables?.company as string) || (lead.leadVariables?.Company as string) || ''
        return (
          lead.leadEmail.toLowerCase().includes(q) ||
          company.toLowerCase().includes(q) ||
          lead.campaignName.toLowerCase().includes(q)
        )
      }

      return true
    })
  }, [initialLeads, categoryFilter, search])

  // Keep selection valid as the filtered list changes (e.g. filters/search
  // narrow the list out from under the currently selected lead). Adjusted
  // during render rather than in an effect — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
  let effectiveSelectedLeadId = selectedLeadId
  const filterKey = `${categoryFilter}__${search}`
  if (filterKey !== filterKeyAtSelection) {
    effectiveSelectedLeadId = filteredLeads[0]?.id ?? null
    setFilterKeyAtSelection(filterKey)
    setSelectedLeadId(effectiveSelectedLeadId)
  }

  const selectedLead = useMemo(
    () => initialLeads.find((l) => l.id === effectiveSelectedLeadId) ?? null,
    [initialLeads, effectiveSelectedLeadId]
  )

  useEffect(() => {
    if (!effectiveSelectedLeadId) return

    let cancelled = false

    startThreadTransition(async () => {
      const res = await getLeadThreadMessages(effectiveSelectedLeadId)
      if (cancelled) return
      if (res.success) {
        setThreadMessages(res.data || [])
        setThreadError(null)
      } else {
        setThreadMessages([])
        setThreadError(res.error || 'Failed to load thread')
      }
    })

    return () => {
      cancelled = true
    }
  }, [effectiveSelectedLeadId])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: initialLeads.length }
    for (const cat of REPLY_CATEGORY_ORDER) c[cat] = 0
    for (const lead of initialLeads) {
      const cat = lead.latestReply.llmCategory
      if (cat && cat in c) c[cat]++
    }
    return c
  }, [initialLeads])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      {/* Left Pane: Conversation List */}
      <div className="lg:col-span-2 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by lead, company, or campaign..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${categoryFilter === 'all'
              ? 'bg-zinc-800 text-zinc-100'
              : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
          >
            All ({counts.all})
          </button>
          {REPLY_CATEGORY_ORDER.map((cat) => {
            const badge = CATEGORY_BADGES[cat]
            const isActive = categoryFilter === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer shrink-0 ${isActive
                  ? `${badge.bg} ${badge.text} ${badge.border}`
                  : 'bg-zinc-800/80 border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
              >
                {badge.label} ({counts[cat] ?? 0})
              </button>
            )
          })}
        </div>

        {/* Lead List */}
        <div className="divide-y divide-zinc-800/60 max-h-[65vh] overflow-y-auto -mx-1">
          {filteredLeads.length > 0 ? (
            filteredLeads.map((lead) => {
              const badge = lead.latestReply.llmCategory ? CATEGORY_BADGES[lead.latestReply.llmCategory] : null
              const isSelected = lead.id === effectiveSelectedLeadId

              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`w-full text-left p-3 mx-1 my-0.5 rounded-xl border transition-all cursor-pointer ${isSelected
                    ? 'border-indigo-500/40 bg-indigo-500/5'
                    : 'border-transparent hover:bg-zinc-900/50'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-100 truncate">{lead.leadEmail}</span>
                    {badge && (
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>
                  {lead.latestReply.snippet && (
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed mt-1 italic">
                      &ldquo;{lead.latestReply.snippet}&rdquo;
                    </p>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mt-1.5 pt-1.5 border-t border-zinc-800/60">
                    <span className="flex items-center gap-1 truncate">
                      <Megaphone className="w-3 h-3 shrink-0" />
                      <span className="truncate">{lead.campaignName}</span>
                    </span>
                    <span className="shrink-0">{formatDate(lead.latestReply.receivedAt)}</span>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="p-8 text-center space-y-2">
              <ListFilter className="w-6 h-6 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-400">No conversations match</p>
              <p className="text-[11px] text-zinc-500">Try clearing your search or category filter.</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Thread + Lead Details */}
      <div className="lg:col-span-3 space-y-4">
        {selectedLead ? (
          <>
            {/* Lead Header */}
            <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <UserCircle2 className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 truncate">{selectedLead.leadEmail}</p>
                  <p className="text-[11px] text-zinc-400 flex items-center gap-1 truncate">
                    <Megaphone className="w-3 h-3 shrink-0" />
                    {selectedLead.campaignName}
                  </p>
                </div>
              </div>
              {selectedLead.latestReply.llmCategory && (
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border shrink-0 ${CATEGORY_BADGES[selectedLead.latestReply.llmCategory].bg} ${CATEGORY_BADGES[selectedLead.latestReply.llmCategory].text} ${CATEGORY_BADGES[selectedLead.latestReply.llmCategory].border}`}
                >
                  {CATEGORY_BADGES[selectedLead.latestReply.llmCategory].label}
                </span>
              )}
            </div>

            {/* Lead Variables Panel */}
            <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                <ListFilter className="w-3.5 h-3.5 text-indigo-400" />
                Lead Fields
              </h3>
              {Object.keys(selectedLead.leadVariables || {}).length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(selectedLead.leadVariables).map(([key, value]) => (
                    <div key={key} className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80 min-w-0">
                      <p className="text-[10px] text-zinc-500 truncate">{prettifyKey(key)}</p>
                      <p className="text-xs text-zinc-200 font-medium truncate" title={String(value ?? '—')}>
                        {value === null || value === undefined || value === '' ? '—' : String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500 italic">No custom fields attached to this lead.</p>
              )}
            </div>

            {/* Thread */}
            <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                Full Conversation
              </h3>

              {isThreadPending ? (
                <div className="p-8 flex items-center justify-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  Loading thread...
                </div>
              ) : threadError ? (
                <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                  {threadError}
                </div>
              ) : threadMessages.length > 0 ? (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {threadMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-xl border space-y-1.5 ${msg.direction === 'inbound'
                        ? 'bg-zinc-950/60 border-zinc-800/80'
                        : 'bg-indigo-500/5 border-indigo-500/20'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1.5 font-medium">
                          {msg.direction === 'inbound' ? (
                            <ArrowDownLeft className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3 text-indigo-400 shrink-0" />
                          )}
                          <span className="text-zinc-300 truncate font-mono">
                            {msg.from_address || 'Unknown sender'}
                          </span>
                        </span>
                        <span className="font-mono shrink-0">{formatDate(msg.occurred_at)}</span>
                      </div>
                      {msg.subject && (
                        <p className="text-xs font-semibold text-zinc-200 truncate">{msg.subject}</p>
                      )}
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {msg.body_text || '(no message body)'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center space-y-2">
                  <Inbox className="w-6 h-6 text-zinc-600 mx-auto" />
                  <p className="text-xs text-zinc-400">No thread messages synced yet</p>
                  <p className="text-[11px] text-zinc-500">The daily thread sync will populate this conversation soon.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-12 text-center space-y-2">
            <MessageSquare className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs font-medium text-zinc-300">No conversation selected</p>
            <p className="text-[11px] text-zinc-500">Select a lead on the left to view their full reply thread.</p>
          </div>
        )}
      </div>
    </div>
  )
}
