'use client'

import { useState, useTransition } from 'react'
import { X, Megaphone, Globe, Clock, Loader2 } from 'lucide-react'
import { createCampaign, type CreateCampaignInput } from '@/app/actions/campaigns'
import { useRouter } from 'next/navigation'
import { CAMPAIGN_TIMEZONES } from '@/lib/timezones'

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 },
]

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function CreateCampaignModal({ isOpen, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('Europe/Paris')
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [hoursStart, setHoursStart] = useState('09:00')
  const [hoursEnd, setHoursEnd] = useState('18:00')
  const [stopOnAutoReply, setStopOnAutoReply] = useState(true)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const toggleDay = (day: number) => {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    )
  }

  const handleCreate = () => {
    if (!name.trim()) { setError('Campaign name is required.'); return }
    if (workingDays.length === 0) { setError('Select at least one working day.'); return }
    setError(null)

    startTransition(async () => {
      const input: CreateCampaignInput = {
        name,
        timezone,
        working_days: workingDays,
        working_hours_start: `${hoursStart}:00`,
        working_hours_end: `${hoursEnd}:00`,
        stop_on_auto_reply: stopOnAutoReply,
      }

      const res = await createCampaign(input)
      if (res.success && res.data) {
        router.push(`/campaigns/${res.data.id}`)
        onClose()
      } else {
        setError(res.error || 'Failed to create campaign')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800/90 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Megaphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">New Campaign</h2>
              <p className="text-xs text-zinc-400">Sequence, scheduling, and inbox pool</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isPending} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q1 Enterprise Outreach"
              disabled={isPending}
              className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition-all"
            />
          </div>

          {/* Timezone */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-zinc-400" />
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={isPending}
              className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {CAMPAIGN_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          {/* Working Days */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Working Days</label>
            <div className="flex gap-1.5">
              {DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  disabled={isPending}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                    workingDays.includes(d.value)
                      ? 'bg-indigo-600 text-white border border-indigo-500'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Working Hours */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              Working Hours (local to timezone)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={hoursStart}
                onChange={(e) => setHoursStart(e.target.value)}
                disabled={isPending}
                className="flex-1 px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-xs text-zinc-400">to</span>
              <input
                type="time"
                value={hoursEnd}
                onChange={(e) => setHoursEnd(e.target.value)}
                disabled={isPending}
                className="flex-1 px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Stop on Auto-Reply Toggle */}
          <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 cursor-pointer">
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-zinc-200">Stop Sequence on Auto-Reply</div>
              <div className="text-[11px] text-zinc-400">
                Halt further emails if an out-of-office or auto-responder is received (default: ON)
              </div>
            </div>
            <input
              type="checkbox"
              checked={stopOnAutoReply}
              onChange={(e) => setStopOnAutoReply(e.target.checked)}
              disabled={isPending}
              className="w-4 h-4 rounded border-zinc-700 accent-indigo-600 cursor-pointer shrink-0"
            />
          </label>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-end gap-3">
          <button onClick={onClose} disabled={isPending} className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isPending || !name.trim()}
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
            Create Campaign
          </button>
        </div>
      </div>
    </div>
  )
}
