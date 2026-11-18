'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import {
  X,
  Megaphone,
  UserCircle2,
  Calendar,
  Clock,
  Bell,
  BellOff,
  Check,
  ExternalLink,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Plus,
  Send,
  FileText,
  History,
  ListFilter,
  Sparkles,
} from 'lucide-react'
import type {
  CrmPipelineLead,
  CrmStatus,
  CrmReminder,
  CrmStatusHistory,
  CrmActivityLogItem,
} from '@/lib/types/crm'
import type { ThreadMessage } from '@/lib/types/database'
import {
  getLeadCrmDetails,
  updateLeadCrmStatus,
  updateLeadScratchpad,
  addActivityNote,
  dismissCrmReminder,
  snoozeCrmReminder,
} from '@/app/actions/crm'
import { getLeadThreadMessages } from '@/app/actions/smartbox'
import { formatDate, formatRelativeTime } from '@/lib/utils'

interface Props {
  lead: CrmPipelineLead | null
  statuses: CrmStatus[]
  onClose: () => void
  onLeadUpdated: (updatedLead: CrmPipelineLead) => void
  onOpenAddReminder: () => void
}

export function LeadDetailDrawer({
  lead,
  statuses,
  onClose,
  onLeadUpdated,
  onOpenAddReminder,
}: Props) {
  const [details, setDetails] = useState<{
    history: CrmStatusHistory[]
    activityLog: CrmActivityLogItem[]
    reminders: CrmReminder[]
  } | null>(null)

  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([])
  const [isLoadingThread, setIsLoadingThread] = useState(false)

  // Status & Meeting state
  const [selectedStatusId, setSelectedStatusId] = useState<string>(lead?.statusId || '')
  const [meetingDatetime, setMeetingDatetime] = useState<string>('')
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  // Scratchpad
  const [scratchpadText, setScratchpadText] = useState<string>(lead?.notes || '')
  const [isScratchpadSaved, setIsScratchpadSaved] = useState(true)

  // New Note
  const [newNoteText, setNewNoteText] = useState('')
  const [isAddingNote, setIsAddingNote] = useState(false)

  // Inline snooze state
  const [snoozingReminderId, setSnoozingReminderId] = useState<string | null>(null)
  const [snoozeDatetime, setSnoozeDatetime] = useState<string>('')

  // Active tab inside drawer: 'overview' | 'thread' | 'fields'
  const [activeTab, setActiveTab] = useState<'overview' | 'thread' | 'fields'>('overview')

  // Sync state when lead changes
  useEffect(() => {
    if (!lead) return
    setSelectedStatusId(lead.statusId)
    setScratchpadText(lead.notes || '')
    setIsScratchpadSaved(true)

    if (lead.meetingAt) {
      try {
        const d = new Date(lead.meetingAt)
        const pad = (n: number) => String(n).padStart(2, '0')
        setMeetingDatetime(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        )
      } catch {
        setMeetingDatetime('')
      }
    } else {
      setMeetingDatetime('')
    }

    // Load full details
    setIsLoadingDetails(true)
    getLeadCrmDetails(lead.id).then((res) => {
      if (res.success && res.data) {
        setDetails({
          history: res.data.history,
          activityLog: res.data.activityLog,
          reminders: res.data.reminders,
        })
      }
      setIsLoadingDetails(false)
    })

    // Load thread messages if campaignLeadId is known
    if (lead.campaignLeadId) {
      setIsLoadingThread(true)
      getLeadThreadMessages(lead.campaignLeadId).then((res) => {
        if (res.success && res.data) {
          setThreadMessages(res.data)
        }
        setIsLoadingThread(false)
      })
    } else {
      setThreadMessages([])
    }
  }, [lead?.id])

  if (!lead) return null

  const currentStatus = statuses.find((s) => s.id === selectedStatusId) || lead.status

  // Status Change Handler
  const handleStatusChange = async (newStatusId: string) => {
    setSelectedStatusId(newStatusId)
    setIsUpdatingStatus(true)

    const res = await updateLeadCrmStatus({
      leadId: lead.leadId,
      newStatusId,
      campaignId: lead.campaignId || undefined,
      meetingAt: newStatusId === 'meeting_booked' && meetingDatetime ? new Date(meetingDatetime).toISOString() : undefined,
    })

    if (res.success) {
      const foundStatus = statuses.find((s) => s.id === newStatusId) || null
      const updated = {
        ...lead,
        statusId: newStatusId,
        status: foundStatus,
        statusChangedAt: new Date().toISOString(),
      }
      onLeadUpdated(updated)

      // Refresh activity log
      getLeadCrmDetails(lead.id).then((r) => {
        if (r.success && r.data) {
          setDetails({
            history: r.data.history,
            activityLog: r.data.activityLog,
            reminders: r.data.reminders,
          })
        }
      })
    }
    setIsUpdatingStatus(false)
  }

  // Save Meeting Datetime
  const handleSaveMeeting = async () => {
    if (!meetingDatetime) return
    setIsUpdatingStatus(true)
    const iso = new Date(meetingDatetime).toISOString()
    const res = await updateLeadCrmStatus({
      leadId: lead.leadId,
      newStatusId: 'meeting_booked',
      campaignId: lead.campaignId || undefined,
      meetingAt: iso,
    })
    if (res.success) {
      const updated = {
        ...lead,
        statusId: 'meeting_booked',
        meetingAt: iso,
      }
      onLeadUpdated(updated)
      // Refresh reminders
      getLeadCrmDetails(lead.id).then((r) => {
        if (r.success && r.data) {
          setDetails({
            history: r.data.history,
            activityLog: r.data.activityLog,
            reminders: r.data.reminders,
          })
        }
      })
    }
    setIsUpdatingStatus(false)
  }

  // Scratchpad Blur Handler
  const handleScratchpadBlur = async () => {
    if (scratchpadText === lead.notes) return
    setIsScratchpadSaved(false)
    const res = await updateLeadScratchpad(lead.id, scratchpadText)
    if (res.success) {
      setIsScratchpadSaved(true)
      onLeadUpdated({ ...lead, notes: scratchpadText })
    }
  }

  // Add Manual Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNoteText.trim() || isAddingNote) return
    setIsAddingNote(true)

    const res = await addActivityNote(lead.id, newNoteText.trim())
    if (res.success && res.data) {
      setDetails((prev) =>
        prev
          ? {
              ...prev,
              activityLog: [res.data!, ...prev.activityLog],
            }
          : null
      )
      setNewNoteText('')
    }
    setIsAddingNote(false)
  }

  // Dismiss Reminder
  const handleDismissReminder = async (reminderId: string) => {
    const res = await dismissCrmReminder(reminderId)
    if (res.success) {
      setDetails((prev) =>
        prev
          ? {
              ...prev,
              reminders: prev.reminders.filter((r) => r.id !== reminderId),
            }
          : null
      )
      onLeadUpdated({
        ...lead,
        activeReminders: lead.activeReminders.filter((r) => r.id !== reminderId),
      })
    }
  }

  // Snooze Reminder
  const handleSnoozeSubmit = async (reminderId: string) => {
    if (!snoozeDatetime) return
    const snoozeIso = new Date(snoozeDatetime).toISOString()
    const res = await snoozeCrmReminder(reminderId, snoozeIso)
    if (res.success) {
      setDetails((prev) =>
        prev
          ? {
              ...prev,
              reminders: prev.reminders.map((r) =>
                r.id === reminderId
                  ? { ...r, fire_at: snoozeIso, status: 'snoozed', snoozed_until: snoozeIso }
                  : r
              ),
            }
          : null
      )
      setSnoozingReminderId(null)
      setSnoozeDatetime('')
    }
  }

  const company =
    (lead.leadVariables?.company as string) || (lead.leadVariables?.Company as string) || ''

  // Merge history & activity log chronologically
  const timelineEvents = [
    ...(details?.history || []).map((h) => {
      const toStatus = statuses.find((s) => s.id === h.to_status)
      return {
        id: h.id,
        type: 'status' as const,
        timestamp: h.changed_at,
        text: `Status changed to: ${toStatus?.icon || '📌'} ${toStatus?.display_name || h.to_status}`,
        user: h.changed_by ? 'Manual update' : 'Auto-detected',
      }
    }),
    ...(details?.activityLog || []).map((a) => ({
      id: a.id,
      type: 'note' as const,
      timestamp: a.created_at,
      text: a.note,
      user: a.source === 'auto' ? 'System event' : 'User note',
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      />

      {/* Drawer Container */}
      <div
        role="dialog"
        aria-label="Lead Details"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-zinc-800 flex items-start justify-between gap-3 shrink-0 bg-zinc-950/80">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
              <UserCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-zinc-100 truncate font-mono">{lead.leadEmail}</h2>
              <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5 flex-wrap">
                {company && <span className="font-medium text-zinc-300 truncate">🏢 {company}</span>}
                <span className="flex items-center gap-1 truncate text-zinc-400">
                  <Megaphone className="w-3 h-3 shrink-0" />
                  {lead.campaignName}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {lead.threadId && (
              <a
                href={`https://mail.google.com/mail/#all/${lead.threadId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 text-zinc-200 transition-colors cursor-pointer"
                title="Open thread in Gmail"
              >
                <ExternalLink className="w-3 h-3 text-zinc-400" />
                Gmail
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-zinc-800/80 bg-zinc-950/40 px-5 shrink-0">
          {[
            { id: 'overview' as const, label: 'CRM Overview', icon: History },
            { id: 'thread' as const, label: `Conversation (${threadMessages.length})`, icon: MessageSquare },
            { id: 'fields' as const, label: 'Lead Fields', icon: ListFilter },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Drawer Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeTab === 'overview' && (
            <>
              {/* Status Section */}
              <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300">Pipeline Stage & Status</span>
                  {currentStatus && (
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
                      style={{
                        backgroundColor: `${currentStatus.color}15`,
                        borderColor: `${currentStatus.color}35`,
                        color: currentStatus.color,
                      }}
                    >
                      <span>{currentStatus.icon}</span>
                      <span>{currentStatus.display_name}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedStatusId}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={isUpdatingStatus}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer disabled:opacity-50"
                  >
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon} {s.display_name} {s.is_terminal ? '(Terminal / Closed)' : ''}
                      </option>
                    ))}
                  </select>
                  {isUpdatingStatus && <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />}
                </div>

                {/* Meeting Datetime Picker (Only when status is meeting_booked) */}
                {selectedStatusId === 'meeting_booked' && (
                  <div className="pt-2 border-t border-zinc-800/80 space-y-2 animate-in fade-in duration-200">
                    <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      Meeting Date & Time
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="datetime-local"
                        value={meetingDatetime}
                        onChange={(e) => setMeetingDatetime(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleSaveMeeting}
                        disabled={isUpdatingStatus || !meetingDatetime}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                    {lead.meetingAt && (
                      <p className="text-[11px] text-blue-400 font-mono">
                        Scheduled for: {formatDate(lead.meetingAt)} ({formatRelativeTime(lead.meetingAt)})
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Reminders Section */}
              <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-indigo-400" />
                    Scheduled Telegram Reminders
                  </h3>
                  <button
                    type="button"
                    onClick={onOpenAddReminder}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Add Reminder
                  </button>
                </div>

                {details?.reminders && details.reminders.length > 0 ? (
                  <div className="space-y-2">
                    {details.reminders.map((rem) => {
                      const isSnoozing = snoozingReminderId === rem.id
                      const isPendingState = rem.status === 'pending' || rem.status === 'snoozed'

                      return (
                        <div
                          key={rem.id}
                          className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/90 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                  rem.status === 'fired'
                                    ? 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                                    : rem.status === 'snoozed'
                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                    : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                                }`}
                              >
                                {rem.status.toUpperCase()}
                              </span>
                              <span className="text-xs font-medium text-zinc-200">
                                {rem.reminder_type.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-zinc-400">
                              {formatRelativeTime(rem.fire_at)} ({formatDate(rem.fire_at)})
                            </span>
                          </div>

                          {/* Message snippet */}
                          <p className="text-[11px] text-zinc-400 line-clamp-2 italic font-mono bg-zinc-900/40 p-2 rounded-lg border border-zinc-800/50">
                            {rem.message.slice(0, 160)}...
                          </p>

                          {/* Snooze/Dismiss actions if pending */}
                          {isPendingState && (
                            <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/60">
                              {isSnoozing ? (
                                <div className="flex items-center gap-2 w-full pt-1">
                                  <input
                                    type="datetime-local"
                                    value={snoozeDatetime}
                                    onChange={(e) => setSnoozeDatetime(e.target.value)}
                                    className="flex-1 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-100"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSnoozeSubmit(rem.id)}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSnoozingReminderId(null)}
                                    className="p-1 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
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
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                                  >
                                    <Clock className="w-3 h-3" />
                                    Snooze
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDismissReminder(rem.id)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
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
                  <p className="text-xs text-zinc-500 italic p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/60 text-center">
                    No active reminders scheduled for this lead.
                  </p>
                )}
              </div>

              {/* Pinned Scratchpad */}
              <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    Pinned Scratchpad (Auto-saves on blur)
                  </label>
                  {isScratchpadSaved ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                      <Check className="w-3 h-3" /> Saved
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 animate-pulse">Saving...</span>
                  )}
                </div>
                <textarea
                  value={scratchpadText}
                  onChange={(e) => {
                    setScratchpadText(e.target.value)
                    setIsScratchpadSaved(false)
                  }}
                  onBlur={handleScratchpadBlur}
                  rows={3}
                  placeholder="Keep high-level context here: e.g. 'Interested in enterprise plan, waiting on CFO approval after Dec 15th'..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                />
              </div>

              {/* Activity Log & Timeline */}
              <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-4 space-y-3.5">
                <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-indigo-400" />
                  Activity History & Notes
                </h3>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Add an activity note (e.g. 'Sent deck via LinkedIn')..."
                    className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={isAddingNote || !newNoteText.trim()}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isAddingNote ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        Log
                      </>
                    )}
                  </button>
                </form>

                {/* Timeline */}
                <div className="divide-y divide-zinc-800/60 max-h-60 overflow-y-auto pr-1">
                  {isLoadingDetails ? (
                    <div className="py-8 flex items-center justify-center gap-2 text-xs text-zinc-400">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                      Loading activity...
                    </div>
                  ) : timelineEvents.length > 0 ? (
                    timelineEvents.map((evt) => (
                      <div key={evt.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <p className="text-zinc-200 font-medium">{evt.text}</p>
                          <p className="text-[10px] text-zinc-500">{evt.user}</p>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                          {formatRelativeTime(evt.timestamp)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-xs text-zinc-500 italic text-center">No activity logged yet.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'thread' && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                Email Thread History
              </h3>

              {isLoadingThread ? (
                <div className="p-8 flex items-center justify-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  Loading conversation thread...
                </div>
              ) : threadMessages.length > 0 ? (
                <div className="space-y-3">
                  {threadMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3.5 rounded-xl border space-y-1.5 ${
                        msg.direction === 'inbound'
                          ? 'bg-zinc-950/70 border-zinc-800/80'
                          : 'bg-indigo-500/5 border-indigo-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1.5 font-medium">
                          {msg.direction === 'inbound' ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          )}
                          <span className="text-zinc-300 truncate font-mono">
                            {msg.from_address || 'Unknown'}
                          </span>
                        </span>
                        <span className="font-mono shrink-0">{formatDate(msg.occurred_at)}</span>
                      </div>
                      {msg.subject && (
                        <p className="text-xs font-semibold text-zinc-200">{msg.subject}</p>
                      )}
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
                        {msg.body_text || '(no message body)'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center space-y-2 bg-zinc-900/30 rounded-2xl border border-zinc-800">
                  <MessageSquare className="w-6 h-6 text-zinc-600 mx-auto" />
                  <p className="text-xs text-zinc-400">No synced thread messages</p>
                  <p className="text-[11px] text-zinc-500">
                    Use the &ldquo;Open in Gmail&rdquo; button above to view this lead in Gmail.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'fields' && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                <ListFilter className="w-3.5 h-3.5 text-indigo-400" />
                Lead Spreadsheet Variables
              </h3>

              {Object.keys(lead.leadVariables || {}).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(lead.leadVariables).map(([k, v]) => (
                    <div
                      key={k}
                      className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-1"
                    >
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wide truncate">{k}</p>
                      <p className="text-xs font-medium text-zinc-200 break-words">
                        {v === null || v === undefined || v === '' ? '—' : String(v)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic p-6 bg-zinc-900/30 rounded-2xl border border-zinc-800 text-center">
                  No custom spreadsheet fields attached to this lead.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
