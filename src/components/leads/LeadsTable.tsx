'use client'

import { useState, useTransition } from 'react'
import type { Lead, Campaign } from '@/lib/types/database'
import { Pagination } from '@/components/shared/Pagination'
import {
  Search,
  ShieldBan,
  ShieldCheck,
  Trash2,
  AlertCircle,
  Eye,
  X,
  Code,
  CheckCircle2,
  Filter,
  UserCheck,
  UserX,
  Loader2,
  Edit3,
  FolderPlus,
  CheckSquare,
  Square
} from 'lucide-react'
import { updateLeadStatus, deleteLead, bulkUpdateLeadStatus, bulkDeleteLeads } from '@/app/actions/leads'
import { formatDate } from '@/lib/utils'
import { EditLeadModal } from './EditLeadModal'
import { AssignCampaignModal } from './AssignCampaignModal'

const PAGE_SIZE = 25

interface LeadsTableProps {
  initialLeads: Lead[]
  campaigns: Campaign[]
}

export function LeadsTable({ initialLeads, campaigns }: LeadsTableProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'do_not_contact' | 'bounced'>('all')
  const [inspectingLead, setInspectingLead] = useState<Lead | null>(null)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [assignTargetLeadIds, setAssignTargetLeadIds] = useState<string[]>([])
  const [assignTargetEmails, setAssignTargetEmails] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [page, setPage] = useState(1)
  const [paginationFilterKey, setPaginationFilterKey] = useState(`${statusFilter}__${search}`)

  // Filter leads based on search & tab
  const filteredLeads = initialLeads.filter((lead) => {
    if (statusFilter !== 'all' && lead.status !== statusFilter) {
      return false
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      const matchesEmail = lead.email.toLowerCase().includes(q)
      const matchesVars = JSON.stringify(lead.variables).toLowerCase().includes(q)
      return matchesEmail || matchesVars
    }

    return true
  })

  // Reset to page 1 when the search/tab changes, and clamp back in range if the
  // list shrinks under the current page (e.g. delete on the last page). Adjusted
  // during render rather than in an effect — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
  let effectivePage = page
  const filterKey = `${statusFilter}__${search}`
  if (filterKey !== paginationFilterKey) {
    setPaginationFilterKey(filterKey)
    setPage(1)
    effectivePage = 1
  }
  const maxPage = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE))
  if (effectivePage > maxPage) {
    setPage(maxPage)
    effectivePage = maxPage
  }

  const paginatedLeads = filteredLeads.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE)

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredLeads.map((l) => l.id)))
    }
  }

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Open single assign modal
  const handleOpenSingleAssign = (lead: Lead) => {
    setAssignTargetLeadIds([lead.id])
    setAssignTargetEmails([lead.email])
    setIsAssignModalOpen(true)
  }

  // Open bulk assign modal
  const handleOpenBulkAssign = () => {
    const ids = Array.from(selectedIds)
    const emails = filteredLeads.filter((l) => selectedIds.has(l.id)).map((l) => l.email)
    setAssignTargetLeadIds(ids)
    setAssignTargetEmails(emails)
    setIsAssignModalOpen(true)
  }

  // Bulk DNC
  const handleBulkDNC = () => {
    const ids = Array.from(selectedIds)
    if (!confirm(`Mark ${ids.length} selected lead(s) as Do Not Contact?`)) return

    startTransition(async () => {
      await bulkUpdateLeadStatus(ids, 'do_not_contact', 'Bulk marked Do Not Contact')
      setSelectedIds(new Set())
    })
  }

  // Bulk Delete
  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds)
    if (!confirm(`Permanently delete ${ids.length} selected lead(s)?`)) return

    startTransition(async () => {
      await bulkDeleteLeads(ids)
      setSelectedIds(new Set())
    })
  }

  // Handle status toggle (active <-> do_not_contact)
  const handleToggleDNC = (lead: Lead) => {
    const nextStatus = lead.status === 'do_not_contact' ? 'active' : 'do_not_contact'
    const reason = nextStatus === 'do_not_contact' ? 'Manually marked Do Not Contact' : undefined

    startTransition(async () => {
      await updateLeadStatus(lead.id, nextStatus, reason)
    })
  }

  // Handle delete
  const handleDelete = (lead: Lead) => {
    if (!confirm(`Delete lead "${lead.email}" permanently?`)) return

    startTransition(async () => {
      await deleteLead(lead.id)
    })
  }

  const counts = {
    all: initialLeads.length,
    active: initialLeads.filter((l) => l.status === 'active').length,
    do_not_contact: initialLeads.filter((l) => l.status === 'do_not_contact').length,
    bounced: initialLeads.filter((l) => l.status === 'bounced').length,
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-950 border border-zinc-800 overflow-x-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-emerald-500/20 text-emerald-300 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-emerald-300'
            }`}
          >
            Active ({counts.active})
          </button>
          <button
            onClick={() => setStatusFilter('do_not_contact')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              statusFilter === 'do_not_contact'
                ? 'bg-amber-500/20 text-amber-300 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-amber-300'
            }`}
          >
            Do Not Contact ({counts.do_not_contact})
          </button>
          <button
            onClick={() => setStatusFilter('bounced')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              statusFilter === 'bounced'
                ? 'bg-rose-500/20 text-rose-300 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-rose-300'
            }`}
          >
            Bounced ({counts.bounced})
          </button>
        </div>

        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search email, name, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      </div>

      {/* Bulk Actions Floating Bar */}
      {selectedIds.size > 0 && (
        <div className="p-3.5 px-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
            <span className="text-xs font-semibold text-indigo-200">
              {selectedIds.size} contact{selectedIds.size === 1 ? '' : 's'} selected
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleOpenBulkAssign}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Assign to Campaign</span>
            </button>
            <button
              onClick={handleBulkDNC}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ShieldBan className="w-3.5 h-3.5" />
              <span>Mark Do Not Contact</span>
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div className="rounded-2xl border border-zinc-800 overflow-hidden bg-zinc-950/60 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="w-10 px-4 py-3.5 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="text-zinc-400 hover:text-zinc-200 flex items-center justify-center mx-auto"
                    title={selectedIds.size === filteredLeads.length && filteredLeads.length > 0 ? 'Deselect All' : 'Select All'}
                  >
                    {selectedIds.size > 0 && selectedIds.size === filteredLeads.length ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-zinc-600" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3.5">Email Address</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Extracted Variables</th>
                <th className="px-4 py-3.5">Added Date</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {paginatedLeads.length > 0 ? (
                paginatedLeads.map((lead) => {
                  const varEntries = Object.entries(lead.variables || {}).slice(0, 3)
                  const isSelected = selectedIds.has(lead.id)

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-zinc-900/30 transition-colors group ${
                        isSelected ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="w-10 px-4 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectOne(lead.id)}
                          className="text-zinc-500 hover:text-zinc-300 flex items-center justify-center mx-auto cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-700" />
                          )}
                        </button>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-4 font-mono font-medium text-zinc-100">
                        {lead.email}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        {lead.status === 'active' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            Active
                          </span>
                        )}
                        {lead.status === 'do_not_contact' && (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              <ShieldBan className="w-3 h-3 text-amber-400" />
                              Do Not Contact
                            </span>
                            {lead.status_reason && (
                              <p className="text-[10px] text-zinc-400 truncate max-w-xs">
                                {lead.status_reason}
                              </p>
                            )}
                          </div>
                        )}
                        {lead.status === 'bounced' && (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <AlertCircle className="w-3 h-3 text-rose-400" />
                              Bounced
                            </span>
                            {lead.status_reason && (
                              <p className="text-[10px] text-zinc-400 truncate max-w-xs">
                                {lead.status_reason}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Variables JSON Chips */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {varEntries.map(([k, v]) => (
                            <span
                              key={k}
                              className="px-2 py-0.5 rounded-md text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono"
                              title={`${k}: ${String(v)}`}
                            >
                              <span className="text-zinc-500">{k}:</span> {String(v || '—')}
                            </span>
                          ))}
                          {Object.keys(lead.variables || {}).length > 3 && (
                            <button
                              onClick={() => setInspectingLead(lead)}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                            >
                              +{Object.keys(lead.variables).length - 3} more
                            </button>
                          )}
                          {Object.keys(lead.variables || {}).length === 0 && (
                            <span className="text-[11px] text-zinc-400 italic">No variables</span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-4 text-[11px] text-zinc-400">
                        {formatDate(lead.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit Lead */}
                          <button
                            onClick={() => setEditingLead(lead)}
                            title="Edit contact details & variables"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Assign to Campaign */}
                          <button
                            onClick={() => handleOpenSingleAssign(lead)}
                            disabled={lead.status !== 'active'}
                            title="Assign lead to campaign"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors cursor-pointer disabled:opacity-30"
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                          </button>

                          {/* Inspect Variables */}
                          <button
                            onClick={() => setInspectingLead(lead)}
                            title="Inspect raw JSON fields"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Do Not Contact */}
                          {lead.status === 'do_not_contact' ? (
                            <button
                              onClick={() => handleToggleDNC(lead)}
                              disabled={isPending}
                              title="Reactivate lead for outreach"
                              className="p-1.5 rounded-lg text-amber-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleDNC(lead)}
                              disabled={isPending}
                              title="Mark Do Not Contact (Blocks all campaigns)"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete Lead */}
                          <button
                            onClick={() => handleDelete(lead)}
                            disabled={isPending}
                            title="Delete lead permanently"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-400 space-y-1">
                    <p className="text-xs">No leads match the selected criteria.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={effectivePage}
          totalItems={filteredLeads.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          itemLabel="leads"
        />
      </div>

      {/* Edit Lead Modal */}
      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          isOpen={!!editingLead}
          onClose={() => setEditingLead(null)}
          campaigns={campaigns}
          onLeadUpdated={(updated) => {
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
          }}
        />
      )}

      {/* Assign Campaign Modal */}
      <AssignCampaignModal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false)
          setSelectedIds(new Set())
        }}
        leadIds={assignTargetLeadIds}
        leadEmails={assignTargetEmails}
        campaigns={campaigns}
      />

      {/* Variables Inspector Modal */}
      {inspectingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-indigo-400 font-mono">Lead Variables Inspector</span>
                <h3 className="text-sm font-semibold text-zinc-100">{inspectingLead.email}</h3>
              </div>
              <button
                onClick={() => setInspectingLead(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Extracted JSON Fields
                </span>
                <pre className="text-xs font-mono text-zinc-200 bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(inspectingLead.variables, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInspectingLead(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
