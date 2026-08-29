'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  X,
  Edit3,
  Mail,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderPlus,
  ShieldCheck,
  ShieldBan,
  Code,
  List
} from 'lucide-react'
import type { Campaign, Lead } from '@/lib/types/database'
import { updateLead, assignLeadsToCampaign } from '@/app/actions/leads'

interface EditLeadModalProps {
  lead: Lead | null
  isOpen: boolean
  onClose: () => void
  campaigns: Campaign[]
  onLeadUpdated?: (lead: Lead) => void
}

interface CustomVariable {
  key: string
  value: string
}

export function EditLeadModal({
  lead,
  isOpen,
  onClose,
  campaigns,
  onLeadUpdated,
}: EditLeadModalProps) {
  const [isPending, startTransition] = useTransition()

  // Form State
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'active' | 'do_not_contact' | 'bounced'>('active')
  const [statusReason, setStatusReason] = useState('')
  const [customVars, setCustomVars] = useState<CustomVariable[]>([])
  const [rawJsonMode, setRawJsonMode] = useState(false)
  const [rawJsonText, setRawJsonText] = useState('')
  const [assignCampaignId, setAssignCampaignId] = useState('')

  // Feedback State
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (lead) {
      setEmail(lead.email || '')
      setStatus(lead.status || 'active')
      setStatusReason(lead.status_reason || '')
      setAssignCampaignId('')
      setFeedback(null)

      const varsObj = lead.variables || {}
      const entries = Object.entries(varsObj).map(([k, v]) => ({
        key: k,
        value: v !== null && v !== undefined ? String(v) : '',
      }))
      setCustomVars(entries)
      setRawJsonText(JSON.stringify(varsObj, null, 2))
    }
  }, [lead, isOpen])

  if (!isOpen || !lead) return null

  const handleAddVar = () => {
    setCustomVars((prev) => [...prev, { key: '', value: '' }])
  }

  const handleUpdateVar = (index: number, field: 'key' | 'value', val: string) => {
    setCustomVars((prev) => {
      const next = [...prev]
      next[index][field] = val
      return next
    })
  }

  const handleRemoveVar = (index: number) => {
    setCustomVars((prev) => prev.filter((_, i) => i !== index))
  }

  const handleToggleRawMode = () => {
    if (!rawJsonMode) {
      // Switching to raw JSON
      const obj: Record<string, string> = {}
      for (const item of customVars) {
        if (item.key.trim()) obj[item.key.trim()] = item.value
      }
      setRawJsonText(JSON.stringify(obj, null, 2))
      setRawJsonMode(true)
    } else {
      // Switching back to visual mode
      try {
        const parsed = JSON.parse(rawJsonText)
        if (typeof parsed === 'object' && parsed !== null) {
          const entries = Object.entries(parsed).map(([k, v]) => ({
            key: k,
            value: v !== null && v !== undefined ? String(v) : '',
          }))
          setCustomVars(entries)
          setRawJsonMode(false)
        }
      } catch {
        setFeedback({ type: 'error', message: 'Invalid JSON syntax. Fix errors before switching modes.' })
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) {
      setFeedback({ type: 'error', message: 'Please enter a valid email address.' })
      return
    }

    setFeedback(null)

    // Assemble variables
    let finalVars: Record<string, string | number | boolean | null> = {}
    if (rawJsonMode) {
      try {
        finalVars = JSON.parse(rawJsonText)
      } catch {
        setFeedback({ type: 'error', message: 'Invalid JSON format in custom variables.' })
        return
      }
    } else {
      for (const item of customVars) {
        if (item.key.trim()) {
          finalVars[item.key.trim()] = item.value
        }
      }
    }

    startTransition(async () => {
      const res = await updateLead(lead.id, {
        email,
        variables: finalVars,
        status,
        status_reason: statusReason || undefined,
      })

      if (res.success && res.data) {
        // If an assign campaign was selected, attach
        if (assignCampaignId && status === 'active') {
          await assignLeadsToCampaign(assignCampaignId, [lead.id])
        }

        setFeedback({ type: 'success', message: 'Lead updated successfully!' })
        if (onLeadUpdated) onLeadUpdated(res.data)

        setTimeout(() => {
          onClose()
        }, 800)
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to update lead.' })
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Edit Contact &amp; Variables</h2>
              <p className="text-xs text-zinc-400 font-mono">{lead.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form id="edit-lead-form" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Email Address */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-indigo-400" />
              Email Address <span className="text-rose-400">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
            />
          </div>

          {/* Status & Status Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Contact Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'do_not_contact' | 'bounced')}
                disabled={isPending}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="active">Active (Target for Outreach)</option>
                <option value="do_not_contact">Do Not Contact (Blocked)</option>
                <option value="bounced">Bounced (Deliverability Issue)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">
                Status Reason (Optional)
              </label>
              <input
                type="text"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="e.g. Unsubscribed via reply"
                disabled={isPending}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>

          {/* Assign to Campaign */}
          <div className="space-y-1.5 pt-2 border-t border-zinc-800/60">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <FolderPlus className="w-3.5 h-3.5 text-cyan-400" />
              Assign / Add to Campaign
            </label>
            <select
              value={assignCampaignId}
              onChange={(e) => setAssignCampaignId(e.target.value)}
              disabled={isPending || status !== 'active'}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
            >
              <option value="">No campaign change</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
            {status !== 'active' && (
              <p className="text-[10px] text-amber-400">
                Cannot assign contact to campaigns while marked as Do Not Contact or Bounced.
              </p>
            )}
          </div>

          {/* Custom Template Variables */}
          <div className="space-y-3 pt-2 border-t border-zinc-800/60">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-300">Variables &amp; Metadata</span>
                <p className="text-[11px] text-zinc-500">
                  Used for template replacements like <code>&#123;&#123;first_name&#125;&#125;</code>, <code>&#123;&#123;company&#125;&#125;</code>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleRawMode}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {rawJsonMode ? <List className="w-3 h-3" /> : <Code className="w-3 h-3" />}
                  <span>{rawJsonMode ? 'Visual Mode' : 'Raw JSON'}</span>
                </button>
                {!rawJsonMode && (
                  <button
                    type="button"
                    onClick={handleAddVar}
                    className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Variable</span>
                  </button>
                )}
              </div>
            </div>

            {rawJsonMode ? (
              <textarea
                value={rawJsonText}
                onChange={(e) => setRawJsonText(e.target.value)}
                rows={7}
                disabled={isPending}
                className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            ) : customVars.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {customVars.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="key (e.g. company)"
                      value={item.key}
                      onChange={(e) => handleUpdateVar(idx, 'key', e.target.value)}
                      disabled={isPending}
                      className="w-1/3 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="value"
                      value={item.value}
                      onChange={(e) => handleUpdateVar(idx, 'value', e.target.value)}
                      disabled={isPending}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveVar(idx)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Remove field"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 italic p-3 rounded-xl bg-zinc-900/30 border border-dashed border-zinc-800 text-center">
                No variables attached to this lead. Click &quot;Add Variable&quot; to define fields.
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
            form="edit-lead-form"
            disabled={isPending || !email.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
