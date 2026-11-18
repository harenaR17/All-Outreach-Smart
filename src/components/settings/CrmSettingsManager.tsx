'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Kanban,
  Settings2,
  Clock,
  Bell,
  Plus,
  ArrowUp,
  ArrowDown,
  Edit2,
  Archive,
  ArchiveRestore,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
  Calendar,
  ExternalLink,
  Search,
  Filter,
} from 'lucide-react'
import type { CrmStatus, CrmSettings, CrmReminder } from '@/lib/types/crm'
import {
  createCrmStatus,
  updateCrmStatus,
  deleteCrmStatus,
  reorderCrmStatuses,
  updateCrmSettings,
  dismissCrmReminder,
  snoozeCrmReminder,
} from '@/app/actions/crm'
import { AddStatusModal } from './AddStatusModal'
import { formatDate, formatRelativeTime } from '@/lib/utils'

interface ReminderRow extends CrmReminder {
  leadEmail: string
  campaignName: string
  statusDisplayName: string
  leadId: string
}

interface Props {
  initialStatuses: CrmStatus[]
  initialSettings: CrmSettings | null
  initialReminders: ReminderRow[]
}

export function CrmSettingsManager({
  initialStatuses,
  initialSettings,
  initialReminders,
}: Props) {
  const [statuses, setStatuses] = useState<CrmStatus[]>(initialStatuses)
  const [settings, setSettings] = useState<CrmSettings>(
    initialSettings || {
      user_id: '',
      no_response_delay_hours: 24,
      meeting_reminder_offset_h: -1,
      created_at: '',
      updated_at: '',
    }
  )
  const [reminders, setReminders] = useState<ReminderRow[]>(initialReminders)

  // Tabs: 'stages' | 'automations' | 'reminders'
  const [activeTab, setActiveTab] = useState<'stages' | 'automations' | 'reminders'>('stages')

  // Modals & form state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingStatus, setEditingStatus] = useState<CrmStatus | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Automation Form State
  const [noResponseDelay, setNoResponseDelay] = useState(settings.no_response_delay_hours)
  const [meetingOffset, setMeetingOffset] = useState(settings.meeting_reminder_offset_h)
  const [isSavingSettings, startSavingSettings] = useTransition()

  // Inline snooze state for reminders tab
  const [snoozingReminderId, setSnoozingReminderId] = useState<string | null>(null)
  const [snoozeDatetime, setSnoozeDatetime] = useState<string>('')
  const [reminderSearch, setReminderSearch] = useState('')
  const [reminderFilter, setReminderFilter] = useState<'all' | 'pending' | 'snoozed' | 'fired'>('all')

  // Clear feedback after 4s
  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text })
    setTimeout(() => setFeedbackMsg(null), 4000)
  }

  // Handle Save Status (Create / Update)
  const handleSaveStatus = async (data: {
    id: string
    display_name: string
    icon: string
    color: string
    sort_order: number
    track: 'positive' | 'negative' | 'neutral'
    is_terminal: boolean
  }) => {
    if (editingStatus) {
      const res = await updateCrmStatus(editingStatus.id, {
        display_name: data.display_name,
        icon: data.icon,
        color: data.color,
        track: data.track,
        is_terminal: data.is_terminal,
      })
      if (res.success && res.data) {
        setStatuses((prev) => prev.map((s) => (s.id === editingStatus.id ? res.data! : s)))
        showFeedback('success', `Updated stage "${data.display_name}"`)
        setEditingStatus(null)
        return { success: true }
      }
      return { success: false, error: res.error }
    } else {
      const res = await createCrmStatus(data)
      if (res.success && res.data) {
        setStatuses((prev) => [...prev, res.data!])
        showFeedback('success', `Created stage "${data.display_name}"`)
        return { success: true }
      }
      return { success: false, error: res.error }
    }
  }

  // Handle Reorder Statuses
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= statuses.length) return

    const newStatuses = [...statuses]
    const temp = newStatuses[index]
    newStatuses[index] = newStatuses[targetIndex]
    newStatuses[targetIndex] = temp

    // Re-assign sort_orders
    const orders = newStatuses.map((s, i) => ({
      id: s.id,
      sort_order: (i + 1) * 10,
    }))

    setStatuses(newStatuses.map((s, i) => ({ ...s, sort_order: (i + 1) * 10 })))

    const res = await reorderCrmStatuses(orders)
    if (!res.success) {
      showFeedback('error', res.error || 'Failed to update stage order')
    }
  }

  // Handle Toggle Archive
  const handleToggleArchive = async (status: CrmStatus) => {
    const res = await updateCrmStatus(status.id, {
      is_archived: !status.is_archived,
    })
    if (res.success && res.data) {
      setStatuses((prev) => prev.map((s) => (s.id === status.id ? res.data! : s)))
      showFeedback(
        'success',
        `Stage "${status.display_name}" ${status.is_archived ? 'restored' : 'archived'}`
      )
    } else {
      showFeedback('error', res.error || 'Failed to update status')
    }
  }

  // Handle Delete Status
  const handleDeleteStatus = async (status: CrmStatus) => {
    if (!confirm(`Are you sure you want to delete stage "${status.display_name}"?`)) return

    const res = await deleteCrmStatus(status.id)
    if (res.success) {
      setStatuses((prev) => prev.filter((s) => s.id !== status.id))
      showFeedback('success', `Deleted stage "${status.display_name}"`)
    } else {
      showFeedback('error', res.error || 'Failed to delete status')
    }
  }

  // Handle Save Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault()
    startSavingSettings(async () => {
      const res = await updateCrmSettings({
        no_response_delay_hours: Number(noResponseDelay),
        meeting_reminder_offset_h: Number(meetingOffset),
      })
      if (res.success && res.data) {
        setSettings(res.data)
        showFeedback('success', 'CRM automation settings saved successfully')
      } else {
        showFeedback('error', res.error || 'Failed to save settings')
      }
    })
  }

  // Dismiss Reminder
  const handleDismissReminder = async (id: string) => {
    const res = await dismissCrmReminder(id)
    if (res.success) {
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'dismissed' as const } : r))
      )
      showFeedback('success', 'Reminder dismissed')
    } else {
      showFeedback('error', res.error || 'Failed to dismiss reminder')
    }
  }

  // Snooze Reminder
  const handleSnoozeReminder = async (id: string) => {
    if (!snoozeDatetime) return
    const iso = new Date(snoozeDatetime).toISOString()
    const res = await snoozeCrmReminder(id, iso)
    if (res.success) {
      setReminders((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: 'snoozed' as const, fire_at: iso, snoozed_until: iso }
            : r
        )
      )
      setSnoozingReminderId(null)
      setSnoozeDatetime('')
      showFeedback('success', 'Reminder snoozed')
    } else {
      showFeedback('error', res.error || 'Failed to snooze reminder')
    }
  }

  // Filtered Reminders
  const filteredReminders = reminders.filter((r) => {
    if (reminderFilter !== 'all' && r.status !== reminderFilter) return false
    if (reminderSearch.trim()) {
      const q = reminderSearch.trim().toLowerCase()
      return (
        r.leadEmail.toLowerCase().includes(q) ||
        r.campaignName.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Kanban className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-100">CRM Pipeline &amp; Reminders Management</h2>
            <p className="text-xs text-zinc-400">
              Customize pipeline stages, configure automated Telegram alert cadences, and review scheduled reminders.
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center rounded-xl bg-zinc-950 p-1 border border-zinc-800 self-start sm:self-auto">
          {[
            { id: 'stages' as const, label: `Stages (${statuses.length})`, icon: Kanban },
            { id: 'automations' as const, label: 'Automations', icon: Settings2 },
            { id: 'reminders' as const, label: `Reminders (${reminders.filter(r => r.status === 'pending' || r.status === 'snoozed').length})`, icon: Bell },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* ── Tab 1: Pipeline Stages Catalogue ── */}
      {activeTab === 'stages' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400">
              Stages define the columns of your CRM board. Reorder with the arrows or add custom stages.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingStatus(null)
                setIsAddModalOpen(true)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Custom Stage
            </button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden divide-y divide-zinc-800/60">
            {statuses.map((status, index) => (
              <div
                key={status.id}
                className={`p-3.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                  status.is_archived ? 'opacity-50 bg-zinc-950/40' : 'hover:bg-zinc-900/40'
                }`}
              >
                {/* Left: Move buttons + Icon + Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, 'up')}
                      className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 cursor-pointer"
                      title="Move up"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === statuses.length - 1}
                      onClick={() => handleMove(index, 'down')}
                      className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 cursor-pointer"
                      title="Move down"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="text-lg shrink-0">{status.icon}</span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-zinc-100">{status.display_name}</span>
                      <span className="text-[10px] font-mono text-zinc-500">({status.id})</span>
                      {status.is_system && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400">
                          System
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span
                        className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border"
                        style={{
                          backgroundColor: `${status.color}15`,
                          borderColor: `${status.color}35`,
                          color: status.color,
                        }}
                      >
                        {status.track.toUpperCase()}
                      </span>
                      {status.is_terminal && (
                        <span className="text-[10px] text-amber-400 font-medium">★ Closed / Terminal</span>
                      )}
                      {status.is_archived && (
                        <span className="text-[10px] text-zinc-500 italic">Archived (Hidden)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStatus(status)
                      setIsAddModalOpen(true)
                    }}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Edit stage"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleArchive(status)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                    title={status.is_archived ? 'Restore stage' : 'Archive stage'}
                  >
                    {status.is_archived ? (
                      <ArchiveRestore className="w-3.5 h-3.5 text-indigo-400" />
                    ) : (
                      <Archive className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {!status.is_system && (
                    <button
                      type="button"
                      onClick={() => handleDeleteStatus(status)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Delete custom stage"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab 2: Automation & Delays Settings ── */}
      {activeTab === 'automations' && (
        <form onSubmit={handleSaveSettings} className="space-y-6 max-w-xl">
          <p className="text-xs text-zinc-400">
            Configure automated timing for background Telegram alerts and reminder triggers.
          </p>

          <div className="space-y-4">
            {/* No Response Delay */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
              <label className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                Interested Lead &ldquo;No Response&rdquo; Delay (Hours)
              </label>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                When a genuine lead is classified as <strong>Interested</strong> by Gemini, an automated Telegram reminder is queued to ensure follow-up before the lead goes cold.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={noResponseDelay}
                  onChange={(e) => setNoResponseDelay(Number(e.target.value))}
                  className="w-28 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                <span className="text-xs text-zinc-400">hours (Default: 24h)</span>
              </div>
            </div>

            {/* Meeting Reminder Offset */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
              <label className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                Default Booked Meeting Reminder Offset
              </label>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                When you set a meeting datetime on a lead, an initial Telegram reminder is automatically scheduled at this offset before the meeting.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <select
                  value={meetingOffset}
                  onChange={(e) => setMeetingOffset(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
                >
                  <option value={-1}>1 hour before meeting (Default)</option>
                  <option value={-2}>2 hours before meeting</option>
                  <option value={-4}>4 hours before meeting</option>
                  <option value={-24}>24 hours before meeting</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSavingSettings ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving Settings...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Save Automation Settings
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ── Tab 3: Central Reminders Queue ── */}
      {activeTab === 'reminders' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={reminderSearch}
                onChange={(e) => setReminderSearch(e.target.value)}
                placeholder="Search reminders by lead or campaign..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {(['all', 'pending', 'snoozed', 'fired'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setReminderFilter(mode)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    reminderFilter === mode
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Reminders Table */}
          {filteredReminders.length > 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden divide-y divide-zinc-800/60 text-xs">
              {filteredReminders.map((rem) => {
                const isSnoozing = snoozingReminderId === rem.id
                const isPendingState = rem.status === 'pending' || rem.status === 'snoozed'

                return (
                  <div key={rem.id} className="p-3.5 space-y-2 hover:bg-zinc-900/30 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                            rem.status === 'fired'
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-400'
                              : rem.status === 'snoozed'
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                              : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
                          }`}
                        >
                          {rem.status.toUpperCase()}
                        </span>
                        <Link
                          href={`/pipeline?search=${encodeURIComponent(rem.leadEmail)}`}
                          className="font-mono font-semibold text-zinc-100 hover:text-indigo-400 transition-colors flex items-center gap-1"
                        >
                          {rem.leadEmail}
                          <ExternalLink className="w-3 h-3 text-zinc-500" />
                        </Link>
                        <span className="text-zinc-500">· {rem.campaignName}</span>
                      </div>

                      <span className="text-[11px] font-mono text-zinc-400">
                        {formatRelativeTime(rem.fire_at)} ({formatDate(rem.fire_at)})
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 font-mono bg-zinc-900/40 p-2 rounded-lg border border-zinc-800/40 line-clamp-2">
                      {rem.message.slice(0, 180)}...
                    </p>

                    {/* Actions if pending */}
                    {isPendingState && (
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/40">
                        {isSnoozing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="datetime-local"
                              value={snoozeDatetime}
                              onChange={(e) => setSnoozeDatetime(e.target.value)}
                              className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-100"
                            />
                            <button
                              type="button"
                              onClick={() => handleSnoozeReminder(rem.id)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setSnoozingReminderId(null)}
                              className="p-1 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setSnoozingReminderId(rem.id)
                                setSnoozeDatetime('')
                              }}
                              className="px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                              Snooze
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDismissReminder(rem.id)}
                              className="px-2 py-1 rounded-lg text-[11px] text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-zinc-950/40 rounded-xl border border-zinc-800 text-xs text-zinc-500 italic">
              No reminders found matching filter.
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Status Modal */}
      <AddStatusModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false)
          setEditingStatus(null)
        }}
        onSave={handleSaveStatus}
        initialStatus={editingStatus}
        existingCount={statuses.length}
      />
    </div>
  )
}
