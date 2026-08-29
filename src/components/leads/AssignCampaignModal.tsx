'use client'

import { useState, useTransition } from 'react'
import {
  X,
  FolderPlus,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles
} from 'lucide-react'
import type { Campaign } from '@/lib/types/database'
import { assignLeadsToCampaign } from '@/app/actions/leads'

interface AssignCampaignModalProps {
  isOpen: boolean
  onClose: () => void
  leadIds: string[]
  leadEmails?: string[]
  campaigns: Campaign[]
  onSuccess?: (count: number) => void
}

export function AssignCampaignModal({
  isOpen,
  onClose,
  leadIds,
  leadEmails = [],
  campaigns,
  onSuccess,
}: AssignCampaignModalProps) {
  const [isPending, startTransition] = useTransition()
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id || '')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  if (!isOpen) return null

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCampaignId) {
      setFeedback({ type: 'error', message: 'Please select a campaign.' })
      return
    }

    if (leadIds.length === 0) {
      setFeedback({ type: 'error', message: 'No leads selected for assignment.' })
      return
    }

    setFeedback(null)

    startTransition(async () => {
      const res = await assignLeadsToCampaign(selectedCampaignId, leadIds)
      if (res.success) {
        const count = res.count ?? leadIds.length
        setFeedback({
          type: 'success',
          message: `Successfully attached ${count} lead${count === 1 ? '' : 's'} to the campaign!`,
        })
        if (onSuccess) onSuccess(count)

        setTimeout(() => {
          onClose()
        }, 1000)
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to assign leads to campaign.' })
      }
    })
  }

  const activeCampaigns = campaigns.filter((c) => c.status === 'active' || c.status === 'draft' || c.status === 'paused')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Assign to Campaign</h2>
              <p className="text-xs text-zinc-400">
                Enroll {leadIds.length} lead{leadIds.length === 1 ? '' : 's'} into an outreach sequence.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form id="assign-campaign-form" onSubmit={handleAssign} className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs flex items-center justify-between">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-400" />
              Selected Contacts
            </span>
            <span className="font-semibold text-zinc-100 font-mono">
              {leadIds.length} contact{leadIds.length === 1 ? '' : 's'}
            </span>
          </div>

          {leadEmails.length > 0 && leadEmails.length <= 5 && (
            <div className="space-y-1">
              <span className="text-[11px] text-zinc-500 font-medium">Target Leads:</span>
              <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 text-[11px] font-mono text-zinc-300 space-y-0.5 max-h-24 overflow-y-auto">
                {leadEmails.map((em, idx) => (
                  <div key={idx} className="truncate">• {em}</div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">
              Select Target Campaign <span className="text-rose-400">*</span>
            </label>
            {activeCampaigns.length > 0 ? (
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                disabled={isPending}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              >
                {activeCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — Status: {c.status.toUpperCase()}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-amber-400 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                No campaigns found. Please create a campaign first before assigning leads.
              </p>
            )}
          </div>

          {/* Feedback */}
          {feedback && (
            <div
              className={`flex items-center gap-2 p-3 rounded-xl text-xs border ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="flex-1">{feedback.message}</span>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="assign-campaign-form"
            disabled={isPending || !selectedCampaignId || leadIds.length === 0}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-medium text-white transition-all shadow-md shadow-cyan-600/20 flex items-center gap-2 cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Enrolling Leads...</span>
              </>
            ) : (
              <>
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Enroll in Campaign</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
