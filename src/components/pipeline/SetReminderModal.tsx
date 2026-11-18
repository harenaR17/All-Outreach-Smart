'use client'

import { useState, useEffect, useTransition } from 'react'
import { Bell, Calendar, Clock, X, Loader2, Sparkles, Send } from 'lucide-react'
import type { CrmPipelineLead, CrmReminder, CrmReminderType } from '@/lib/types/crm'
import type { TelegramRecipient } from '@/lib/types/database'
import { addCrmReminder } from '@/app/actions/crm'
import { getTelegramRecipients } from '@/app/actions/settings'

interface Props {
  isOpen: boolean
  onClose: () => void
  lead: CrmPipelineLead | null
  onReminderAdded: (newReminder: CrmReminder) => void
  telegramRecipients?: TelegramRecipient[]
}

export function SetReminderModal({
  isOpen,
  onClose,
  lead,
  onReminderAdded,
  telegramRecipients: initialRecipients,
}: Props) {
  const [reminderType, setReminderType] = useState<CrmReminderType>('follow_up')
  const [datetime, setDatetime] = useState<string>('')
  const [customNote, setCustomNote] = useState<string>('')
  const [recipientId, setRecipientId] = useState<string>('') // "" = all bots
  const [recipients, setRecipients] = useState<TelegramRecipient[]>(initialRecipients || [])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Fetch recipients if not provided
  useEffect(() => {
    if (initialRecipients && initialRecipients.length > 0) {
      setRecipients(initialRecipients)
      return
    }
    if (isOpen) {
      getTelegramRecipients().then((res) => {
        if (res.success && res.data) {
          setRecipients(res.data.filter((r) => r.is_active))
        }
      })
    }
  }, [isOpen, initialRecipients])

  if (!isOpen || !lead) return null

  // Helpers for quick presets
  const applyPreset = (hoursFromNow: number, targetHour?: number) => {
    const target = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
    if (targetHour !== undefined) {
      target.setHours(targetHour, 0, 0, 0)
    }
    // Format to YYYY-MM-DDTHH:mm for datetime-local
    const pad = (n: number) => String(n).padStart(2, '0')
    const localIso = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`
    setDatetime(localIso)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!datetime) {
      setError('Please select a reminder date and time')
      return
    }

    const fireAtIso = new Date(datetime).toISOString()
    if (isNaN(new Date(datetime).getTime())) {
      setError('Invalid date format')
      return
    }

    setError(null)
    startTransition(async () => {
      const res = await addCrmReminder({
        entryId: lead.id,
        reminderType,
        fireAt: fireAtIso,
        customNote: customNote.trim() || undefined,
        recipientId: recipientId.trim() || undefined,
      })

      if (res.success && res.data) {
        onReminderAdded(res.data)
        onClose()
      } else {
        setError(res.error || 'Failed to schedule reminder')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Set Telegram Reminder</h3>
              <p className="text-xs text-zinc-400 truncate max-w-[240px]">{lead.leadEmail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Reminder Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Reminder Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'follow_up' as const, label: 'Follow-up', icon: Clock },
                { type: 'meeting' as const, label: 'Meeting', icon: Calendar },
                { type: 'custom' as const, label: 'Custom', icon: Bell },
              ].map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setReminderType(item.type)}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    reminderType === item.type
                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Telegram Bot / Recipient Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-indigo-400" />
                Send Notification To
              </span>
              {recipients.length === 0 && (
                <span className="text-[10px] text-amber-400 font-normal">No active bots configured</span>
              )}
            </label>
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
            >
              <option value="">All Available Bots (Broadcast)</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label ? `${r.label} (${r.chat_id})` : `Chat ID: ${r.chat_id}`}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-500">
              Select which Telegram bot receives this reminder alert, or broadcast to all.
            </p>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Quick Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset(1)}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 transition-colors cursor-pointer"
              >
                In 1 Hour
              </button>
              <button
                type="button"
                onClick={() => applyPreset(24, 9)}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 transition-colors cursor-pointer"
              >
                Tomorrow 9am
              </button>
              <button
                type="button"
                onClick={() => applyPreset(48, 9)}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 transition-colors cursor-pointer"
              >
                In 2 Days
              </button>
              <button
                type="button"
                onClick={() => applyPreset(72, 9)}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 transition-colors cursor-pointer"
              >
                In 3 Days
              </button>
            </div>
          </div>

          {/* Datetime Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              Reminder Date & Time
            </label>
            <input
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              required
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Custom Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Note / Instructions (Optional)</label>
            <textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Follow up on proposal deck, ask if they had questions..."
              rows={2}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5" />
                  Schedule Reminder
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
