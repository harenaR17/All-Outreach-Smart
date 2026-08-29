'use client'

import { useState, useMemo, useTransition } from 'react'
import { CampaignLeadItem, updateCampaignLeadState, removeLeadFromCampaign } from '@/app/actions/campaigns'
import { formatDate } from '@/lib/utils'
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Mail,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  MessageSquare,
  AlertCircle,
  PauseCircle,
  Play,
  UserMinus,
  ChevronDown,
  Loader2
} from 'lucide-react'

interface Props {
  leads: CampaignLeadItem[]
  totalSteps: number
}

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

export function CampaignLeadsTab({ leads, totalSteps }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isPending, startTransition] = useTransition()
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null)

  const filteredLeads = useMemo(() => {
    return leads.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const emailMatch = item.email.toLowerCase().includes(q)
        const companyMatch = (item.variables?.company as string)?.toLowerCase()?.includes(q)
        const nameMatch = (item.variables?.first_name as string)?.toLowerCase()?.includes(q)
        return emailMatch || companyMatch || nameMatch
      }
      return true
    })
  }, [leads, statusFilter, search])

  // Handlers for campaign lead state
  const handleStateUpdate = (campaignLeadId: string, updates: Parameters<typeof updateCampaignLeadState>[1]) => {
    setUpdatingLeadId(campaignLeadId)
    startTransition(async () => {
      await updateCampaignLeadState(campaignLeadId, updates)
      setUpdatingLeadId(null)
    })
  }

  const handleRestart = (campaignLeadId: string, email: string, campaignId: string) => {
    if (!confirm(`Restart sequence from Step 1 for "${email}"?`)) return
    handleStateUpdate(campaignLeadId, { restart: true, campaignId })
  }

  const handleRemove = (campaignLeadId: string, email: string, campaignId: string) => {
    if (!confirm(`Remove "${email}" from this campaign? (Lead will remain in the global pool)`)) return
    setUpdatingLeadId(campaignLeadId)
    startTransition(async () => {
      await removeLeadFromCampaign(campaignLeadId, campaignId)
      setUpdatingLeadId(null)
    })
  }

  // Count by status
  const counts = useMemo(() => {
    const c = { all: leads.length, active: 0, pending: 0, replied: 0, bounced: 0, completed: 0, paused: 0 }
    for (const l of leads) {
      if (l.status in c) {
        c[l.status as keyof typeof c]++
      }
    }
    return c
  }, [leads])

  return (
    <div className="space-y-4">
      {/* Filters & Search Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads by email or company..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-zinc-800 text-zinc-100'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'active'
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            Active ({counts.active})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'pending'
                ? 'bg-zinc-700 text-white'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            Pending ({counts.pending})
          </button>
          <button
            onClick={() => setStatusFilter('replied')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'replied'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            Replied ({counts.replied})
          </button>
          <button
            onClick={() => setStatusFilter('paused')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'paused'
                ? 'bg-amber-600 text-white'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            Paused ({counts.paused})
          </button>
          <button
            onClick={() => setStatusFilter('bounced')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'bounced'
                ? 'bg-rose-600 text-white'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            Bounced ({counts.bounced})
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'completed'
                ? 'bg-cyan-600 text-white'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            Completed ({counts.completed})
          </button>
        </div>
      </div>

      {/* Leads Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
        {filteredLeads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-medium">
                <tr>
                  <th className="py-3 px-4">Lead</th>
                  <th className="py-3 px-4">Current Step</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reply Analysis</th>
                  <th className="py-3 px-4">Inbox</th>
                  <th className="py-3 px-4">Next Send</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredLeads.map((item) => {
                  const company = (item.variables?.company as string) || (item.variables?.Company as string)
                  const firstName = (item.variables?.first_name as string) || (item.variables?.Name as string)
                  const currentCategory = item.latest_reply?.llm_category
                  const isRowUpdating = updatingLeadId === item.id

                  return (
                    <tr key={item.id} className="hover:bg-zinc-900/40 transition-colors">
                      {/* Lead Details */}
                      <td className="py-3.5 px-4 space-y-0.5">
                        <div className="font-medium text-zinc-100 flex items-center gap-1.5">
                          <span>{item.email}</span>
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center gap-2">
                          {firstName && <span>{firstName}</span>}
                          {firstName && company && <span>•</span>}
                          {company && <span className="text-zinc-400">{company}</span>}
                        </div>
                      </td>

                      {/* Current Step Progress */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-200">
                            Step {item.current_step + 1} of {Math.max(totalSteps, 1)}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {item.status === 'active' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Clock className="w-3 h-3" />
                            Active
                          </span>
                        )}
                        {item.status === 'replied' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Replied
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                            Pending
                          </span>
                        )}
                        {item.status === 'bounced' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <AlertCircle className="w-3 h-3" />
                            Bounced
                          </span>
                        )}
                        {item.status === 'completed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            Completed
                          </span>
                        )}
                        {item.status === 'paused' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <PauseCircle className="w-3 h-3" />
                            Paused
                          </span>
                        )}
                      </td>

                      {/* Reply Classification & Manual Override */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {item.status === 'replied' || item.latest_reply ? (
                          <div className="space-y-1">
                            <select
                              value={currentCategory || 'undefined'}
                              onChange={(e) =>
                                handleStateUpdate(item.id, {
                                  reply_category: e.target.value as any,
                                  campaignId: item.campaign_id,
                                })
                              }
                              disabled={isPending}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-900 border border-zinc-800 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="interested">🎯 Interested</option>
                              <option value="not_interested">🛑 Not Interested</option>
                              <option value="wrong_person">🔄 Wrong Person</option>
                              <option value="out_of_office">🏖️ Out of Office</option>
                              <option value="undefined">❓ Undefined</option>
                            </select>

                            {item.latest_reply?.snippet && (
                              <p className="text-[11px] text-zinc-400 truncate max-w-xs" title={item.latest_reply.snippet}>
                                &ldquo;{item.latest_reply.snippet}&rdquo;
                              </p>
                            )}
                          </div>
                        ) : item.latest_send?.status === 'failed' ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-400">
                              <AlertTriangle className="w-3 h-3" />
                              Send Error
                            </span>
                            <p className="text-[10px] text-rose-400/80 truncate max-w-xs" title={item.latest_send.error_message || ''}>
                              {item.latest_send.error_message}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Inbox */}
                      <td className="py-3.5 px-4 text-zinc-400 font-mono text-[11px]">
                        {item.inbox_email || '—'}
                      </td>

                      {/* Next Send Time */}
                      <td className="py-3.5 px-4 text-[11px] text-zinc-400">
                        {item.status === 'active' && item.next_send_at ? (
                          <span className="text-indigo-300">{formatDate(item.next_send_at)}</span>
                        ) : item.status === 'replied' && item.replied_at ? (
                          <span className="text-emerald-400/80">Replied {formatDate(item.replied_at)}</span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isRowUpdating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                          ) : (
                            <>
                              {/* Pause / Resume */}
                              {item.status === 'paused' ? (
                                <button
                                  onClick={() => handleStateUpdate(item.id, { status: 'pending', campaignId: item.campaign_id })}
                                  disabled={isPending}
                                  title="Resume Sequence"
                                  className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                              ) : item.status === 'pending' || item.status === 'active' ? (
                                <button
                                  onClick={() => handleStateUpdate(item.id, { status: 'paused', campaignId: item.campaign_id })}
                                  disabled={isPending}
                                  title="Pause Sequence"
                                  className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                                >
                                  <PauseCircle className="w-3.5 h-3.5" />
                                </button>
                              ) : null}

                              {/* Restart Sequence */}
                              <button
                                onClick={() => handleRestart(item.id, item.email, item.campaign_id)}
                                disabled={isPending}
                                title="Restart sequence from Step 1"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>

                              {/* Remove from Campaign */}
                              <button
                                onClick={() => handleRemove(item.id, item.email, item.campaign_id)}
                                disabled={isPending}
                                title="Remove from Campaign (Keeps lead in global pool)"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center space-y-2">
            <Users className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs font-medium text-zinc-300">No leads match the filter</p>
            <p className="text-[11px] text-zinc-500">
              {search ? 'Try clearing your search query.' : 'Attach leads to this campaign to begin sequencing.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
