'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  X,
  UserPlus,
  Mail,
  Building,
  User,
  Briefcase,
  Globe,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderPlus,
  ShieldCheck,
  ShieldBan
} from 'lucide-react'
import type { Campaign, Lead } from '@/lib/types/database'
import { createSingleLead } from '@/app/actions/leads'

interface AddLeadModalProps {
  isOpen: boolean
  onClose: () => void
  campaigns: Campaign[]
  defaultCampaignId?: string
  onLeadCreated?: (lead: Lead) => void
}

interface CustomVariable {
  key: string
  value: string
}

export function AddLeadModal({
  isOpen,
  onClose,
  campaigns,
  defaultCampaignId,
  onLeadCreated,
}: AddLeadModalProps) {
  const [isPending, startTransition] = useTransition()

  // Form State
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [company, setCompany] = useState('')
  const [title, setTitle] = useState('')
  const [website, setWebsite] = useState('')
  const [selectedCampaignId, setSelectedCampaignId] = useState(defaultCampaignId || '')
  const [status, setStatus] = useState<'active' | 'do_not_contact'>('active')
  const [customVars, setCustomVars] = useState<CustomVariable[]>([])

  // Feedback State
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSelectedCampaignId(defaultCampaignId || '')
    }
  }, [isOpen, defaultCampaignId])

  if (!isOpen) return null

  const handleAddCustomVar = () => {
    setCustomVars((prev) => [...prev, { key: '', value: '' }])
  }

  const handleUpdateCustomVar = (index: number, field: 'key' | 'value', val: string) => {
    setCustomVars((prev) => {
      const next = [...prev]
      next[index][field] = val
      return next
    })
  }

  const handleRemoveCustomVar = (index: number) => {
    setCustomVars((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) {
      setFeedback({ type: 'error', message: 'Please enter a valid email address.' })
      return
    }

    setFeedback(null)

    // Assemble variables object
    const variables: Record<string, string | number | boolean | null> = {}
    if (firstName.trim()) variables.first_name = firstName.trim()
    if (lastName.trim()) variables.last_name = lastName.trim()
    if (company.trim()) variables.company = company.trim()
    if (title.trim()) variables.title = title.trim()
    if (website.trim()) variables.website = website.trim()

    for (const item of customVars) {
      if (item.key.trim()) {
        variables[item.key.trim()] = item.value.trim()
      }
    }

    startTransition(async () => {
      const res = await createSingleLead({
        email,
        variables,
        status,
        campaignId: selectedCampaignId || null,
      })

      if (res.success && res.data) {
        setFeedback({ type: 'success', message: `Lead "${email}" added successfully!` })
        if (onLeadCreated) onLeadCreated(res.data)

        setTimeout(() => {
          onClose()
          // Reset form
          setEmail('')
          setFirstName('')
          setLastName('')
          setCompany('')
          setTitle('')
          setWebsite('')
          setSelectedCampaignId(defaultCampaignId || '')
          setStatus('active')
          setCustomVars([])
          setFeedback(null)
        }, 1000)
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to create lead.' })
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
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">Add Single Lead</h2>
              <p className="text-xs text-zinc-400">
                Directly add a contact to the global pool &amp; optional campaign.
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

        {/* Form Body */}
        <form id="add-single-lead-form" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
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
              placeholder="alex@company.com"
              disabled={isPending}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
            />
          </div>

          {/* Contact Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-zinc-500" />
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Alex"
                disabled={isPending}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-zinc-500" />
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
                disabled={isPending}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-zinc-500" />
                Company
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Corp"
                disabled={isPending}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-zinc-500" />
                Job Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VP of Growth"
                disabled={isPending}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>

          {/* Target Campaign & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800/60">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <FolderPlus className="w-3.5 h-3.5 text-cyan-400" />
                Target Campaign (Optional)
              </label>
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                disabled={isPending}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">Do not assign to campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'do_not_contact')}
                disabled={isPending}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="active">Active (Outreach Target)</option>
                <option value="do_not_contact">Do Not Contact (Blocked)</option>
              </select>
            </div>
          </div>

          {/* Custom Template Variables Section */}
          <div className="space-y-3 pt-2 border-t border-zinc-800/60">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-300">Custom Template Variables</span>
                <p className="text-[11px] text-zinc-500">
                  Values available as <code>&#123;&#123;variable_name&#125;&#125;</code> in campaign templates.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddCustomVar}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Field</span>
              </button>
            </div>

            {customVars.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {customVars.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="e.g. custom_hook"
                      value={item.key}
                      onChange={(e) => handleUpdateCustomVar(idx, 'key', e.target.value)}
                      disabled={isPending}
                      className="w-1/3 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="Variable value..."
                      value={item.value}
                      onChange={(e) => handleUpdateCustomVar(idx, 'value', e.target.value)}
                      disabled={isPending}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomVar(idx)}
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
                No custom variables added yet. Click &quot;Add Field&quot; to define custom sequence tokens.
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
            form="add-single-lead-form"
            disabled={isPending || !email.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Creating Lead...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Lead</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
