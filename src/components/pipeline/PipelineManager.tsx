'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Kanban as KanbanIcon,
  LayoutList,
  Search,
  Filter,
  Megaphone,
  Calendar,
  Bell,
  Archive,
  Flame,
  UserCheck,
  FileCheck2,
  RefreshCw,
  Plus,
} from 'lucide-react'
import type { CrmPipelineLead, CrmStatus, CrmReminder } from '@/lib/types/crm'
import type { TelegramRecipient } from '@/lib/types/database'
import { updateLeadCrmStatus, getCrmPipelineData } from '@/app/actions/crm'
import { PipelineKanban } from './PipelineKanban'
import { PipelineTable } from './PipelineTable'
import { LeadDetailDrawer } from './LeadDetailDrawer'
import { SetReminderModal } from './SetReminderModal'

interface Props {
  initialLeads: CrmPipelineLead[]
  initialStatuses: CrmStatus[]
  telegramRecipients?: TelegramRecipient[]
}

export function PipelineManager({ initialLeads, initialStatuses, telegramRecipients = [] }: Props) {
  const searchParams = useSearchParams()
  const initialSearchParam = searchParams.get('search') || ''

  // State
  const [leads, setLeads] = useState<CrmPipelineLead[]>(initialLeads)
  const [statuses] = useState<CrmStatus[]>(initialStatuses)
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')

  // Filters
  const [search, setSearch] = useState(initialSearchParam)
  const [campaignFilter, setCampaignFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showColdLeads, setShowColdLeads] = useState(false)
  const [showArchivedLeads, setShowArchivedLeads] = useState(false)

  // Drawer & Modal State
  const [selectedLead, setSelectedLead] = useState<CrmPipelineLead | null>(null)
  const [reminderTargetLead, setReminderTargetLead] = useState<CrmPipelineLead | null>(null)
  const [isRefreshing, startRefresh] = useTransition()

  // Distinct campaigns for filter dropdown
  const campaignOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>()
    for (const lead of leads) {
      if (!lead.campaignId) continue
      const existing = map.get(lead.campaignId)
      if (existing) existing.count++
      else map.set(lead.campaignId, { id: lead.campaignId, name: lead.campaignName, count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [leads])

  // Top KPI Stats
  const stats = useMemo(() => {
    let openDeals = 0
    let meetings = 0
    let proposals = 0
    let remindersCount = 0

    for (const l of leads) {
      const isTerminal = l.closedAt !== null || (l.status?.is_terminal ?? false)
      if (!isTerminal) openDeals++
      if (l.statusId === 'meeting_booked' || l.meetingAt) meetings++
      if (l.statusId.startsWith('proposal_')) proposals++
      remindersCount += l.activeReminders.length
    }

    return { openDeals, meetings, proposals, remindersCount }
  }, [leads])

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const isTerminal = lead.closedAt !== null || (lead.status?.is_terminal ?? false)
      const isCold = lead.status?.track === 'negative' || lead.status?.track === 'neutral'

      // Terminal leads filter
      if (!showArchivedLeads && isTerminal) return false

      // Cold leads filter
      if (!showColdLeads && isCold && !isTerminal) return false

      // Campaign filter
      if (campaignFilter !== 'all' && lead.campaignId !== campaignFilter) return false

      // Status filter
      if (statusFilter !== 'all' && lead.statusId !== statusFilter) return false

      // Search match
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const company =
          (lead.leadVariables?.company as string) ||
          (lead.leadVariables?.Company as string) ||
          ''
        return (
          lead.leadEmail.toLowerCase().includes(q) ||
          company.toLowerCase().includes(q) ||
          lead.campaignName.toLowerCase().includes(q)
        )
      }

      return true
    })
  }, [leads, showArchivedLeads, showColdLeads, campaignFilter, statusFilter, search])

  // Visible Status Columns (for Kanban)
  const visibleStatuses = useMemo(() => {
    return statuses.filter((s) => {
      if (statusFilter !== 'all') {
        return s.id === statusFilter
      }
      if (!showArchivedLeads && s.is_terminal) return false
      if (!showColdLeads && (s.track === 'negative' || s.track === 'neutral')) return false
      return true
    })
  }, [statuses, statusFilter, showArchivedLeads, showColdLeads])

  // Quick Status Update
  const handleUpdateStatus = async (leadId: string, newStatusId: string) => {
    const targetLead = leads.find((l) => l.leadId === leadId)
    if (!targetLead) return

    const res = await updateLeadCrmStatus({
      leadId,
      newStatusId,
      campaignId: targetLead.campaignId || undefined,
    })

    if (res.success) {
      const newStatusObj = statuses.find((s) => s.id === newStatusId) || null
      const isTerminal = newStatusObj?.is_terminal ?? false

      setLeads((prev) =>
        prev.map((l) =>
          l.leadId === leadId
            ? {
                ...l,
                statusId: newStatusId,
                status: newStatusObj,
                closedAt: isTerminal ? new Date().toISOString() : null,
                statusChangedAt: new Date().toISOString(),
              }
            : l
        )
      )

      if (selectedLead?.leadId === leadId) {
        setSelectedLead((prev) =>
          prev
            ? {
                ...prev,
                statusId: newStatusId,
                status: newStatusObj,
                closedAt: isTerminal ? new Date().toISOString() : null,
                statusChangedAt: new Date().toISOString(),
              }
            : null
        )
      }
    }
  }

  // Refresh pipeline data from DB
  const handleRefresh = () => {
    startRefresh(async () => {
      const res = await getCrmPipelineData({
        showArchived: true,
        showCold: true,
      })
      if (res.success && res.data) {
        setLeads(res.data.leads)
      }
    })
  }

  // Handle reminder added
  const handleReminderAdded = (newReminder: CrmReminder) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === newReminder.entry_id
          ? {
              ...l,
              activeReminders: [newReminder, ...l.activeReminders],
            }
          : l
      )
    )

    if (selectedLead?.id === newReminder.entry_id) {
      setSelectedLead((prev) =>
        prev
          ? {
              ...prev,
              activeReminders: [newReminder, ...prev.activeReminders],
            }
          : null
      )
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <KanbanIcon className="w-5 h-5 text-indigo-400" />
            CRM Pipeline
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage interested leads, track follow-up cadences, book meetings, and trigger Telegram alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh pipeline"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            Refresh
          </button>

          {/* View Toggle */}
          <div className="flex items-center rounded-xl bg-zinc-900 p-1 border border-zinc-800">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <KanbanIcon className="w-3.5 h-3.5" />
              Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              Table
            </button>
          </div>
        </div>
      </div>

      {/* KPI Chips */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Active Deals</p>
            <p className="text-xl font-bold text-zinc-100 font-mono">{stats.openDeals}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Flame className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Meetings Booked</p>
            <p className="text-xl font-bold text-zinc-100 font-mono">{stats.meetings}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
            <Calendar className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Proposals in Play</p>
            <p className="text-xl font-bold text-zinc-100 font-mono">{stats.proposals}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
            <FileCheck2 className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Active Reminders</p>
            <p className="text-xl font-bold text-zinc-100 font-mono">{stats.remindersCount}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
            <Bell className="w-4.5 h-4.5" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads, companies, campaigns..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Campaign Filter */}
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Campaigns ({leads.length})</option>
            {campaignOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Stages</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.display_name}
              </option>
            ))}
          </select>
        </div>

        {/* Toggle Switches */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Show Cold Leads Toggle */}
          <button
            type="button"
            onClick={() => setShowColdLeads((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              showColdLeads
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Show Cold Leads
          </button>

          {/* Show Archived Toggle */}
          <button
            type="button"
            onClick={() => setShowArchivedLeads((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              showArchivedLeads
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            Show Archived
          </button>
        </div>
      </div>

      {/* Main Content: Kanban or Table */}
      {viewMode === 'kanban' ? (
        <PipelineKanban
          leads={filteredLeads}
          statuses={visibleStatuses}
          onSelectLead={(lead) => setSelectedLead(lead)}
          onOpenAddReminder={(lead) => setReminderTargetLead(lead)}
          onUpdateStatus={handleUpdateStatus}
        />
      ) : (
        <PipelineTable
          leads={filteredLeads}
          statuses={statuses}
          onSelectLead={(lead) => setSelectedLead(lead)}
          onOpenAddReminder={(lead) => setReminderTargetLead(lead)}
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      {/* Lead Detail Side Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        statuses={statuses}
        onClose={() => setSelectedLead(null)}
        onLeadUpdated={(updated) => {
          setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
          setSelectedLead(updated)
        }}
        onOpenAddReminder={() => {
          if (selectedLead) setReminderTargetLead(selectedLead)
        }}
      />

      {/* Set Reminder Modal */}
      <SetReminderModal
        isOpen={Boolean(reminderTargetLead)}
        onClose={() => setReminderTargetLead(null)}
        lead={reminderTargetLead}
        onReminderAdded={handleReminderAdded}
        telegramRecipients={telegramRecipients}
      />
    </div>
  )
}
