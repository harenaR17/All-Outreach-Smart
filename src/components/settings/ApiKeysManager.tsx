'use client'

import { useState, useTransition } from 'react'
import { Key, Plus, Trash2, Check, X, Copy, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import type { ApiKey } from '@/lib/types/database'
import { createApiKey, toggleApiKey, deleteApiKey } from '@/app/actions/settings'

type ApiKeyRow = Omit<ApiKey, 'key_hash'>

interface Props {
  initialKeys: ApiKeyRow[]
}

export function ApiKeysManager({ initialKeys }: Props) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys)
  const [isPending, startTransition] = useTransition()

  // Create form state
  const [label, setLabel] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // One-time raw key display state
  const [newRawKey, setNewRawKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)
    setNewRawKey(null)

    startTransition(async () => {
      const res = await createApiKey(label)
      if (res.success && res.rawKey && res.id) {
        setNewRawKey(res.rawKey)
        setCopied(false)
        setLabel('')
        // Optimistic add (key_hash excluded — we never display it)
        setKeys((prev) => [
          {
            id: res.id!,
            label: label.trim() || null,
            is_active: true,
            created_at: new Date().toISOString(),
            last_used_at: null,
          },
          ...prev,
        ])
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to create API key.' })
      }
    })
  }

  const handleCopy = async () => {
    if (!newRawKey) return
    try {
      await navigator.clipboard.writeText(newRawKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select the text
    }
  }

  const handleDismissNewKey = () => setNewRawKey(null)

  const handleToggle = (id: string, currentActive: boolean) => {
    startTransition(async () => {
      const res = await toggleApiKey(id, !currentActive)
      if (res.success) {
        setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, is_active: !currentActive } : k)))
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to update key.' })
      }
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this API key? Any integrations using it will immediately stop working.')) return
    startTransition(async () => {
      const res = await deleteApiKey(id)
      if (res.success) {
        setKeys((prev) => prev.filter((k) => k.id !== id))
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to delete key.' })
      }
    })
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80  hover:border-indigo-700 rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
          <Key className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">API Keys</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Bearer tokens for the public Leads API (n8n, Zapier, etc.)</p>
        </div>
      </div>

      {/* One-time raw key banner */}
      {newRawKey && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-300">Copy this key now — it won&apos;t be shown again</p>
              <p className="text-xs text-zinc-400 mt-0.5">After closing this banner, only a masked form of the key is visible. Store it securely.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-violet-300 break-all select-all">
              {newRawKey}
            </code>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all shrink-0 ${copied
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200 border border-zinc-600'
                }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={handleDismissNewKey}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
          >
            <EyeOff className="w-3 h-3" /> I&apos;ve saved it — dismiss
          </button>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${feedback.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. n8n workflow)"
          className="flex-1 bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50"
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Generate Key
        </button>
      </form>

      {/* Key list */}
      <div className="space-y-2">
        {keys.length === 0 && (
          <p className="text-xs text-zinc-500 text-center py-4">
            No API keys yet. Generate one above to enable external integrations.
          </p>
        )}
        {keys.map((key) => (
          <div
            key={key.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border hover:border-emerald-700 transition-all ${key.is_active
              ? 'bg-zinc-800/40 border-zinc-700/60'
              : 'bg-zinc-900/40 border-zinc-800/40 opacity-60'
              }`}
          >
            {/* Status dot */}
            <div className={`w-2 h-2 rounded-full shrink-0 ${key.is_active ? 'bg-emerald-400' : 'bg-zinc-600'}`} />

            {/* Label + meta */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{key.label || <span className="text-zinc-500 italic">Unlabeled</span>}</p>
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                outreach_live_••••••••••••••••
                <span className="ml-3 font-sans">Created {formatDate(key.created_at)}</span>
                {key.last_used_at && (
                  <span className="ml-2">· Last used {formatDate(key.last_used_at)}</span>
                )}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Toggle active */}
              <button
                onClick={() => handleToggle(key.id, key.is_active)}
                disabled={isPending}
                title={key.is_active ? 'Deactivate key' : 'Activate key'}
                className={`p-1.5 rounded-md transition-colors ${key.is_active
                  ? 'text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10'
                  : 'text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10'
                  }`}
              >
                {key.is_active ? <X className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete(key.id)}
                disabled={isPending}
                title="Delete key permanently"
                className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Usage hint */}
      <div className="rounded-lg bg-zinc-800/30 border border-zinc-800 px-4 py-3">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Use as <code className="text-violet-400 font-mono">Authorization: Bearer &lt;key&gt;</code> on requests to{' '}
          <code className="text-zinc-300 font-mono">POST /api/leads</code>,{' '}
          <code className="text-zinc-300 font-mono">GET /api/leads</code>,{' '}
          <code className="text-zinc-300 font-mono">PATCH /api/leads/:id</code>, or{' '}
          <code className="text-zinc-300 font-mono">DELETE /api/leads/:id</code>.
        </p>
      </div>
    </div>
  )
}
