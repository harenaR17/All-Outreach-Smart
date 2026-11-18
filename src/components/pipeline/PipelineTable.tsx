'use client'

import { useState } from 'react'
import {
  Bell,
  Calendar,
  Clock,
  ExternalLink,
  Megaphone,
  UserCircle2,
  ChevronRight,
  FileText,
} from 'lucide-react'
import type { CrmPipelineLead, CrmStatus } from '@/lib/types/crm'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import { Pagination } from '@/components/shared/Pagination'

const PAGE_SIZE = 10

interface Props {
  leads: CrmPipelineLead[]
  statuses: CrmStatus[]
  onSelectLead: (lead: CrmPipelineLead) => void
  onOpenAddReminder: (lead: CrmPipelineLead) => void
  onUpdateStatus: (leadId: string, newStatusId: string) => void
}

export function PipelineTable({
  leads,
  statuses,
  onSelectLead,
  onOpenAddReminder,
  onUpdateStatus,
}: Props) {
  const [page, setPage] = useState(1)
  const [paginationKey, setPaginationKey] = useState('')

  // Reset page when lead list or filter changes, and clamp within range
  let effectivePage = page
  const currentKey = `${leads.length}__${leads[0]?.id || ''}`
  if (currentKey !== paginationKey) {
    setPaginationKey(currentKey)
    setPage(1)
    effectivePage = 1
  }
  const maxPage = Math.max(1, Math.ceil(leads.length / PAGE_SIZE))
  if (effectivePage > maxPage) {
    setPage(maxPage)
    effectivePage = maxPage
  }

  const paginatedLeads = leads.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE)

  if (leads.length === 0) {
    return (
      <div className="py-16 text-center space-y-2 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <UserCircle2 className="w-8 h-8 text-zinc-600 mx-auto" />
        <p className="text-xs font-semibold text-zinc-300">No leads match your pipeline filters</p>
        <p className="text-[11px] text-zinc-500">
          Try clearing filters or toggling &ldquo;Show Cold Leads&rdquo; / &ldquo;Show Archived&rdquo;.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full rounded-2xl bg-zinc-900/40 border border-zinc-800 overflow-hidden shadow-xl">
      <Pagination
        currentPage={effectivePage}
        totalItems={leads.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        itemLabel="leads"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/60 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <th className="py-3 px-4">Lead</th>
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Campaign</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Meeting</th>
              <th className="py-3 px-4">Next Reminder</th>
              <th className="py-3 px-4">Notes</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-xs">
            {paginatedLeads.map((lead) => {
              const company =
                (lead.leadVariables?.company as string) ||
                (lead.leadVariables?.Company as string) ||
                '—'
              const statusObj = statuses.find((s) => s.id === lead.statusId) || lead.status
              const nextReminder = lead.activeReminders[0]

              return (
                <tr
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="hover:bg-zinc-900/60 transition-colors cursor-pointer group"
                >
                  {/* Lead Email */}
                  <td className="py-3.5 px-4 font-mono font-semibold text-zinc-100 max-w-[200px] truncate">
                    {lead.leadEmail}
                  </td>

                  {/* Company */}
                  <td className="py-3.5 px-4 text-zinc-300 max-w-[150px] truncate">
                    {company}
                  </td>

                  {/* Campaign */}
                  <td className="py-3.5 px-4 text-zinc-400 font-mono max-w-[150px] truncate">
                    <span className="flex items-center gap-1">
                      <Megaphone className="w-3 h-3 text-zinc-500 shrink-0" />
                      <span className="truncate">{lead.campaignName}</span>
                    </span>
                  </td>

                  {/* Status Dropdown */}
                  <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={lead.statusId}
                      onChange={(e) => onUpdateStatus(lead.leadId, e.target.value)}
                      className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      {statuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.icon} {s.display_name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Meeting Time */}
                  <td className="py-3.5 px-4 font-mono text-zinc-400 text-[11px] whitespace-nowrap">
                    {lead.meetingAt ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">
                        <Calendar className="w-3 h-3" />
                        {formatDate(lead.meetingAt)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>

                  {/* Next Reminder */}
                  <td className="py-3.5 px-4 font-mono text-[11px] whitespace-nowrap">
                    {nextReminder ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                        <Bell className="w-3 h-3" />
                        {formatRelativeTime(nextReminder.fire_at)}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>

                  {/* Notes Snippet */}
                  <td className="py-3.5 px-4 max-w-[160px] truncate text-zinc-400 italic text-[11px]">
                    {lead.notes ? (
                      <span className="flex items-center gap-1 truncate" title={lead.notes}>
                        <FileText className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="truncate">{lead.notes}</span>
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>

                  {/* Action Buttons */}
                  <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenAddReminder(lead)}
                        title="Add Telegram reminder"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <Bell className="w-3.5 h-3.5" />
                      </button>
                      {lead.threadId && (
                        <a
                          href={`https://mail.google.com/mail/#all/${lead.threadId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open thread in Gmail"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectLead(lead)}
                        title="Open lead details"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <Pagination
        currentPage={effectivePage}
        totalItems={leads.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        itemLabel="leads"
      />
    </div>
  )
}
