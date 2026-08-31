'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Save, Play, Pause, Loader2, AlertTriangle, CheckCircle2, RotateCcw, Copy
} from 'lucide-react'
import type { Campaign } from '@/lib/types/database'
import type { SaveCampaignInput } from '@/app/actions/campaigns'
import { saveCampaign, launchCampaign, pauseCampaign, duplicateCampaign } from '@/app/actions/campaigns'

interface Props {
  campaign: Campaign
  getFormData: () => SaveCampaignInput
  onStatusChange?: (newStatus: Campaign['status']) => void
  hasUnsavedChanges: boolean
}

export function CampaignActionBar({ campaign, getFormData, onStatusChange, hasUnsavedChanges }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const clearFeedback = () => setFeedback(null)

  const handleSave = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await saveCampaign(campaign.id, getFormData())
      if (res.success) {
        setFeedback({ type: 'success', message: 'Campaign saved.' })
        onStatusChange?.(campaign.status)
      } else {
        setFeedback({ type: 'error', message: res.error || 'Save failed.' })
      }
    })
  }

  const handleLaunch = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await launchCampaign(campaign.id, getFormData())
      if (res.success) {
        setFeedback({ type: 'success', message: 'Campaign is now active!' })
        onStatusChange?.('active')
      } else {
        setFeedback({ type: 'error', message: res.error || 'Launch failed.' })
      }
    })
  }

  const handlePause = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await pauseCampaign(campaign.id)
      if (res.success) {
        setFeedback({ type: 'success', message: 'Campaign paused.' })
        onStatusChange?.('paused')
      } else {
        setFeedback({ type: 'error', message: res.error || 'Pause failed.' })
      }
    })
  }

  const handleDuplicate = () => {
    setFeedback(null)
    startTransition(async () => {
      const res = await duplicateCampaign(campaign.id)
      if (res.success && res.data) {
        router.push(`/campaigns/${res.data.id}`)
      } else {
        setFeedback({ type: 'error', message: res.error || 'Duplicate failed.' })
      }
    })
  }

  const status = campaign.status

  return (
    <div className="flex flex-col gap-3">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs animate-in fade-in slide-in-from-bottom-1 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success'
            ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          }
          <span className="flex-1">{feedback.message}</span>
          <button onClick={clearFeedback} className="text-current opacity-60 hover:opacity-100 transition-opacity cursor-pointer text-[10px]">✕</button>
        </div>
      )}

      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && status !== 'active' && (
        <div className="flex items-center gap-2 text-[11px] text-amber-400/80">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Unsaved changes
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition-all cursor-pointer disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
          Duplicate
        </button>

        {/* DRAFT: Save + Launch */}
        {status === 'draft' && (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition-all cursor-pointer disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Draft
            </button>
            <button
              type="button"
              onClick={handleLaunch}
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Launch Campaign
            </button>
          </>
        )}

        {/* ACTIVE: Pause only (editing requires pausing first) */}
        {status === 'active' && (
          <>
            <span className="text-[11px] text-zinc-500 bg-zinc-900/60 px-3 py-2 rounded-lg border border-zinc-800">
              Pause the campaign to make edits
            </span>
            <button
              type="button"
              onClick={handlePause}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-xs font-medium text-amber-300 transition-all cursor-pointer disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
              Pause Campaign
            </button>
          </>
        )}

        {/* PAUSED: Save + Resume */}
        {status === 'paused' && (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition-all cursor-pointer disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Changes
            </button>
            <button
              type="button"
              onClick={handleLaunch}
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Resume Campaign
            </button>
          </>
        )}

        {/* COMPLETED */}
        {status === 'completed' && (
          <span className="text-[11px] text-zinc-500 bg-zinc-900/60 px-3 py-2 rounded-lg border border-zinc-800">
            This campaign has completed. Duplicate it to run again with new leads.
          </span>
        )}
      </div>
    </div>
  )
}
