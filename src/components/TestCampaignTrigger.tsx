'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { createTestCampaign, deleteCampaign } from '@/app/actions/campaigns'

export function TestCampaignTrigger() {
  const [isPending, startTransition] = useTransition()
  const [campaignName, setCampaignName] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleCreate = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setMessage(null)

    startTransition(async () => {
      const res = await createTestCampaign(campaignName.trim() || undefined)
      if (res.success) {
        setMessage({ type: 'success', text: 'Successfully written test row to Supabase campaigns table!' })
        setCampaignName('')
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to write test row' })
      }
    })
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <input
          type="text"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="Optional: custom campaign name..."
          disabled={isPending}
          className="flex-1 px-3.5 py-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
        />
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Executing Write...</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Insert Test Campaign Row</span>
            </>
          )}
        </button>
      </form>

      {message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-xs border ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  )
}

export function DeleteCampaignButton({ id, name }: { id: string; name: string }) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!confirm(`Delete test campaign "${name}"?`)) return
    startTransition(async () => {
      await deleteCampaign(id)
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      title="Delete test row"
      className="p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50 cursor-pointer"
    >
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  )
}
