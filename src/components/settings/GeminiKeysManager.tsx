'use client'

import { useState, useTransition } from 'react'
import { Sparkles, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Key, Info, Check, X, ExternalLink } from 'lucide-react'
import type { GeminiApiKey } from '@/lib/types/database'
import { addGeminiKey, toggleGeminiKey, deleteGeminiKey, testGeminiKey } from '@/app/actions/settings'

interface Props {
  initialKeys: GeminiApiKey[]
}

export function GeminiKeysManager({ initialKeys }: Props) {
  const [keys, setKeys] = useState<GeminiApiKey[]>(initialKeys)
  const [isPending, startTransition] = useTransition()

  // Form state
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null)

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.trim()) {
      setFeedback({ type: 'error', message: 'Gemini API key is required.' })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const res = await addGeminiKey({ label, apiKey })
      if (res.success) {
        const modelNote = res.modelUsed ? ` (verified via ${res.modelUsed})` : ''
        setFeedback({ type: 'success', message: `✅ Gemini API key verified${modelNote} and added to pool successfully.` })
        setLabel('')
        setApiKey('')
        // Optimistic refresh
        setKeys((prev) => [
          {
            id: crypto.randomUUID(),
            label: label.trim() || null,
            api_key: apiKey.trim(),
            is_active: true,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ])
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to add Gemini API key.' })
      }
    })
  }

  const handleToggle = (id: string, current: boolean) => {
    const next = !current
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, is_active: next } : k)))
    startTransition(async () => {
      await toggleGeminiKey(id, next)
    })
  }

  const handleDelete = (id: string, labelText?: string | null) => {
    if (!confirm(`Delete Gemini key ${labelText || 'entry'}?`)) return
    setKeys((prev) => prev.filter((k) => k.id !== id))
    startTransition(async () => {
      await deleteGeminiKey(id)
    })
  }

  const handleTestKey = async (keyItem: GeminiApiKey) => {
    setTestingKeyId(keyItem.id)
    setFeedback(null)
    const res = await testGeminiKey(keyItem.api_key)
    setTestingKeyId(null)
    if (res.success) {
      setFeedback({
        type: 'success',
        message: `✅ Gemini connection successful for "${keyItem.label || 'Key'}"!`,
      })
    } else {
      setFeedback({
        type: 'error',
        message: `❌ ${res.error || 'Gemini key test failed'}`,
      })
    }
  }

  const maskKey = (key: string) => {
    if (key.length <= 10) return '••••••••••••'
    return `${key.slice(0, 7)}...${key.slice(-4)}`
  }

  return (
    <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800  hover:border-indigo-700 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">Gemini LLM API Keys</h2>
          </div>
          <p className="text-xs text-zinc-400">
            Enables smart 5-category reply classification (Interested, Not Interested, Out of Office, Wrong Person, Undefined).
          </p>
        </div>
      </div>

      {/* Project Rate Limit Explanation */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-[11px] text-indigo-300 leading-relaxed">
        <Info className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
        <p>
          <strong>Quota Best Practice:</strong> Gemini enforces rate limits <em>per Google Cloud Project</em>, not per key.
          For genuine fallback capacity, create each key under a <strong>separate Google Cloud project</strong> and label them accordingly (e.g. &quot;Project Alpha&quot;, &quot;Project Beta&quot;).
        </p>
      </div>

      {/* Add Key Form */}
      <form onSubmit={handleAddKey} className="space-y-3 bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/80">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Google Gemini API Key
          </label>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
          >
            Get Free Key <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-4">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. Project 1 - Production)"
              disabled={isPending}
              className="w-full px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
          <div className="sm:col-span-6">
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                disabled={isPending}
                className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isPending || !apiKey.trim()}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/20"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Key</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Feedback message */}
      {feedback && (
        <div
          className={`flex items-center gap-2 p-3 rounded-xl text-xs border ${feedback.type === 'success'
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
          <button onClick={() => setFeedback(null)} className="text-current opacity-60 hover:opacity-100 text-[10px]">
            ✕
          </button>
        </div>
      )}

      {/* Keys List */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-zinc-400 px-1">Active Keys Pool ({keys.length})</div>

        {keys.length > 0 ? (
          <div className="divide-y divide-zinc-800/60 rounded-xl border border-zinc-800 hover:border-emerald-700 overflow-hidden bg-zinc-950/40">
            {keys.map((k) => (
              <div
                key={k.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-emerald-900/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleToggle(k.id, k.is_active)}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${k.is_active
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-zinc-900 border-zinc-700 text-transparent'
                      }`}
                    title={k.is_active ? 'Active' : 'Inactive'}
                  >
                    <Check className="w-3 h-3" />
                  </button>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-200">{k.label || 'Unnamed Key'}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${k.is_active
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                          }`}
                      >
                        {k.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-500">{maskKey(k.api_key)}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleTestKey(k)}
                    disabled={testingKeyId === k.id}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-zinc-300 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {testingKeyId === k.id ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      <span>Test Key</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(k.id, k.label)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Delete key"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-4 rounded-xl bg-zinc-950/20 border border-dashed border-zinc-800 text-center">
            No Gemini API keys registered yet. Add at least one key to enable LLM reply classification.
          </p>
        )}
      </div>
    </div>
  )
}
