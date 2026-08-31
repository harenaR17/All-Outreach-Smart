'use client'

import { useRouter } from 'next/navigation'
import { Megaphone, Globe, Clock, Layers, Inbox, Users, ChevronRight, Pause, Play, Trash2, Copy } from 'lucide-react'
import type { CampaignWithMeta } from '@/app/actions/campaigns'

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft:     { label: 'Draft',     bg: 'bg-zinc-800',       text: 'text-zinc-300',  dot: 'bg-zinc-500' },
  active:    { label: 'Active',    bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  paused:    { label: 'Paused',    bg: 'bg-amber-500/10',   text: 'text-amber-400',  dot: 'bg-amber-400' },
  completed: { label: 'Completed', bg: 'bg-indigo-500/10',  text: 'text-indigo-400', dot: 'bg-indigo-400' },
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  campaign: CampaignWithMeta
  onDelete?: (id: string) => void
  onTogglePause?: (id: string, currentStatus: string) => void
  onDuplicate?: (id: string) => void
}

export function CampaignCard({ campaign, onDelete, onTogglePause, onDuplicate }: Props) {
  const router = useRouter()
  const style = STATUS_STYLES[campaign.status] ?? STATUS_STYLES.draft

  return (
    <div className="group relative bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700/80 rounded-2xl p-5 transition-all hover:bg-zinc-900/60 cursor-pointer"
      onClick={() => router.push(`/campaigns/${campaign.id}`)}>

      {/* Status Badge */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <Megaphone className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-100 truncate">{campaign.name}</h3>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border border-transparent ${style.bg} ${style.text} shrink-0`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>

      {/* Schedule Info */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400 mb-4">
        <span className="flex items-center gap-1">
          <Globe className="w-3 h-3" />
          {campaign.timezone}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {campaign.working_hours_start.slice(0, 5)} – {campaign.working_hours_end.slice(0, 5)}
        </span>
        <span className="text-zinc-500">
          {campaign.working_days.map((d) => DAY_NAMES[d]).filter(Boolean).join(' · ')}
        </span>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-3">
        <Stat icon={<Layers className="w-3 h-3" />} value={campaign.stepCount} label="steps" />
        <Dot />
        <Stat icon={<Inbox className="w-3 h-3" />} value={campaign.inboxCount} label="inboxes" />
        <Dot />
        <Stat icon={<Users className="w-3 h-3" />} value={campaign.leadCount} label="leads" />
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate(campaign.id)
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Duplicate campaign"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
          {onTogglePause && (campaign.status === 'active' || campaign.status === 'paused') && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onTogglePause(campaign.id, campaign.status)
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
              title={campaign.status === 'active' ? 'Pause Campaign' : 'Resume Campaign'}
            >
              {campaign.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(campaign.id) }}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Delete campaign"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-indigo-400 transition-colors ml-1">
          <span>Open</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-zinc-400">
      {icon}
      <span className="text-zinc-200 font-medium">{value}</span>
      <span>{label}</span>
    </span>
  )
}

function Dot() {
  return <span className="text-zinc-700">·</span>
}
