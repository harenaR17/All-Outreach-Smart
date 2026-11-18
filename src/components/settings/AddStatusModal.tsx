'use client'

import { useState } from 'react'
import { X, Kanban, Check, Sparkles, Loader2 } from 'lucide-react'
import type { CrmStatus } from '@/lib/types/crm'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSave: (status: {
    id: string
    display_name: string
    icon: string
    color: string
    sort_order: number
    track: 'positive' | 'negative' | 'neutral'
    is_terminal: boolean
  }) => Promise<{ success: boolean; error?: string }>
  initialStatus?: CrmStatus | null
  existingCount: number
}

const COLOR_SWATCHES = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Emerald', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Rose', value: '#ef4444' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Zinc', value: '#71717a' },
]

const EMOJI_SUGGESTIONS = ['🎯', '📅', '📄', '💬', '🔁', '📮', '🏆', '🛑', '❓', '👻', '❌', '🔒', '💼', '🤝', '🚀', '⏳']

export function AddStatusModal({
  isOpen,
  onClose,
  onSave,
  initialStatus,
  existingCount,
}: Props) {
  const isEditing = Boolean(initialStatus)

  const [displayName, setDisplayName] = useState(initialStatus?.display_name || '')
  const [slug, setSlug] = useState(initialStatus?.id || '')
  const [icon, setIcon] = useState(initialStatus?.icon || '📌')
  const [color, setColor] = useState(initialStatus?.color || '#6366f1')
  const [track, setTrack] = useState<'positive' | 'negative' | 'neutral'>(initialStatus?.track || 'positive')
  const [isTerminal, setIsTerminal] = useState(initialStatus?.is_terminal || false)

  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  if (!isOpen) return null

  // Auto-generate slug from name if not editing
  const handleNameChange = (name: string) => {
    setDisplayName(name)
    if (!isEditing) {
      const generated = name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_')
      setSlug(generated)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim() || !slug.trim()) {
      setError('Please provide a display name and status ID')
      return
    }

    setError(null)
    setIsPending(true)

    const res = await onSave({
      id: slug.trim(),
      display_name: displayName.trim(),
      icon: icon || '📌',
      color,
      sort_order: initialStatus?.sort_order ?? (existingCount + 1) * 10,
      track,
      is_terminal: isTerminal,
    })

    if (res.success) {
      onClose()
    } else {
      setError(res.error || 'Failed to save status')
    }
    setIsPending(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Kanban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                {isEditing ? 'Edit Pipeline Stage' : 'Add New Pipeline Stage'}
              </h3>
              <p className="text-xs text-zinc-400">
                {isEditing ? 'Update stage appearance and rules' : 'Define a new milestone in your CRM deal flow'}
              </p>
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
          {/* Display Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Stage Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Security Questionnaire Sent"
              required
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Slug ID (Read-only when editing) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Unique Identifier (Slug)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={isEditing}
              placeholder="e.g. security_review"
              required
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
            />
          </div>

          {/* Emoji Icon & Suggestions */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Emoji Icon</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={4}
                className="w-14 text-center px-2 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <div className="flex items-center gap-1 overflow-x-auto py-1">
                {EMOJI_SUGGESTIONS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setIcon(em)}
                    className="p-1 rounded-lg hover:bg-zinc-800 text-sm transition-colors cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Color Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Accent Color</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.value}
                  type="button"
                  onClick={() => setColor(swatch.value)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    color === swatch.value ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: swatch.value }}
                  title={swatch.name}
                >
                  {color === swatch.value && <Check className="w-3.5 h-3.5 text-black stroke-[3]" />}
                </button>
              ))}
            </div>
          </div>

          {/* Track Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Pipeline Track</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'positive' as const, label: 'Positive (Open)', color: 'text-emerald-400 border-emerald-500/20' },
                { id: 'neutral' as const, label: 'Neutral (Review)', color: 'text-zinc-300 border-zinc-700' },
                { id: 'negative' as const, label: 'Negative (Lost)', color: 'text-rose-400 border-rose-500/20' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrack(t.id)}
                  className={`p-2 rounded-xl border text-xs font-medium text-center transition-all cursor-pointer ${
                    track === t.id
                      ? `bg-zinc-900 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/40`
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Terminal Status Checkbox */}
          <div className="pt-1">
            <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isTerminal}
                onChange={(e) => setIsTerminal(e.target.checked)}
                className="w-4 h-4 rounded-md bg-zinc-900 border-zinc-700 text-indigo-600 focus:ring-0 cursor-pointer"
              />
              <span>Terminal Status (Closes the lead &amp; auto-dismisses reminders)</span>
            </label>
          </div>

          {/* Submit Actions */}
          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-end gap-2.5">
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
                  Saving...
                </>
              ) : (
                'Save Stage'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
