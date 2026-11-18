'use client'

import { useMemo } from 'react'
import {
  Bell,
  Calendar,
  Clock,
  Megaphone,
  UserCircle2,
  ChevronRight,
  MoreVertical,
} from 'lucide-react'
import type { CrmPipelineLead, CrmStatus } from '@/lib/types/crm'
import { formatDate, formatRelativeTime } from '@/lib/utils'

interface Props {
  leads: CrmPipelineLead[]
  statuses: CrmStatus[]
  onSelectLead: (lead: CrmPipelineLead) => void
  onOpenAddReminder: (lead: CrmPipelineLead) => void
  onUpdateStatus: (leadId: string, newStatusId: string) => void
}

export function PipelineKanban({
  leads,
  statuses,
  onSelectLead,
  onOpenAddReminder,
  onUpdateStatus,
}: Props) {
  // Group leads by statusId
  const leadsByStatus = useMemo(() => {
    const map = new Map<string, CrmPipelineLead[]>()
    for (const s of statuses) {
      map.set(s.id, [])
    }
    for (const lead of leads) {
      const list = map.get(lead.statusId)
      if (list) {
        list.push(lead)
      } else {
        // Fallback for unknown status
        const fallbackList = map.get('new_interested') || []
        fallbackList.push(lead)
        map.set('new_interested', fallbackList)
      }
    }
    return map
  }, [leads, statuses])

  return (
    <div className="w-full overflow-x-auto pb-6 pt-2">
      <div className="flex gap-4 items-start min-w-max pr-6">
        {statuses.map((status) => {
          const columnLeads = leadsByStatus.get(status.id) || []

          return (
            <div
              key={status.id}
              className="w-72 shrink-0 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 p-3.5 flex flex-col space-y-3 shadow-lg"
            >
              {/* Column Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">{status.icon}</span>
                    <h3 className="text-xs font-bold text-zinc-100 truncate" title={status.display_name}>
                      {status.display_name}
                    </h3>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 border"
                    style={{
                      backgroundColor: `${status.color}15`,
                      borderColor: `${status.color}35`,
                      color: status.color,
                    }}
                  >
                    {columnLeads.length}
                  </span>
                </div>
                {/* Status Color Accent Bar */}
                <div
                  className="h-1 rounded-full w-full opacity-80"
                  style={{ backgroundColor: status.color }}
                />
              </div>

              {/* Cards Container */}
              <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-0.5">
                {columnLeads.length > 0 ? (
                  columnLeads.map((lead) => {
                    const company =
                      (lead.leadVariables?.company as string) ||
                      (lead.leadVariables?.Company as string) ||
                      ''
                    const nextReminder = lead.activeReminders[0]

                    return (
                      <div
                        key={lead.id}
                        onClick={() => onSelectLead(lead)}
                        className="group relative rounded-xl p-3 bg-zinc-900/60 hover:bg-zinc-900/90 border border-zinc-800/80 hover:border-indigo-500/50 transition-all cursor-pointer space-y-2 shadow-sm"
                      >
                        {/* Header: Lead Email + Quick Move */}
                        <div className="flex items-start justify-between gap-1.5">
                          <span
                            className="text-xs font-semibold text-zinc-100 truncate font-mono flex-1"
                            title={lead.leadEmail}
                          >
                            {lead.leadEmail}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpenAddReminder(lead)
                            }}
                            title="Schedule Telegram Reminder"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-zinc-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all cursor-pointer shrink-0"
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Company & Campaign */}
                        <div className="space-y-0.5 text-[11px] text-zinc-400">
                          {company && (
                            <p className="truncate font-medium text-zinc-300">🏢 {company}</p>
                          )}
                          <p className="flex items-center gap-1 truncate text-zinc-400 font-mono">
                            <Megaphone className="w-3 h-3 shrink-0 text-zinc-500" />
                            <span className="truncate">{lead.campaignName}</span>
                          </p>
                        </div>

                        {/* Reminders / Meeting Pills */}
                        {(nextReminder || lead.meetingAt) && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {lead.meetingAt && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-blue-500/10 border border-blue-500/20 text-blue-300">
                                <Calendar className="w-3 h-3" />
                                {formatRelativeTime(lead.meetingAt)}
                              </span>
                            )}
                            {nextReminder && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                                <Bell className="w-3 h-3" />
                                {formatRelativeTime(nextReminder.fire_at)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Card Footer: Time in status & Status Change Quick Action */}
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1.5 border-t border-zinc-800/60 font-mono">
                          <span>
                            {formatRelativeTime(lead.statusChangedAt || lead.enteredAt)}
                          </span>

                          {/* Quick status selector */}
                          <select
                            value={lead.statusId}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation()
                              onUpdateStatus(lead.leadId, e.target.value)
                            }}
                            className="bg-zinc-950/80 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 focus:outline-none hover:text-zinc-200 cursor-pointer max-w-[100px] truncate"
                          >
                            {statuses.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.icon} {s.display_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="py-8 text-center border border-dashed border-zinc-800/60 rounded-xl bg-zinc-950/20">
                    <p className="text-[11px] text-zinc-600 italic">No leads here</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
