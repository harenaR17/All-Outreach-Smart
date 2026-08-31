'use client'

import { useState, useMemo, useEffect } from 'react'
import { Eye, AlertTriangle, CheckCircle2, User, ChevronDown, Inbox } from 'lucide-react'
import type { SaveStepInput } from '@/app/actions/campaigns'
import type { Lead, EmailAccount } from '@/lib/types/database'
import { segmentTemplate, extractTokens, buildInboxVariableMap } from '@/lib/templates/renderer'

interface Props {
  steps: SaveStepInput[]
  leads: Pick<Lead, 'id' | 'email' | 'variables'>[]
  inboxes?: Pick<EmailAccount, 'id' | 'email_address' | 'display_name' | 'first_name' | 'last_name' | 'role' | 'phone_number' | 'signature' | 'variables'>[]
}

export function LiveLeadPreview({ steps, leads, inboxes = [] }: Props) {
  const [selectedLeadId, setSelectedLeadId] = useState<string>(leads[0]?.id ?? '')
  const [selectedInboxId, setSelectedInboxId] = useState<string>(inboxes[0]?.id ?? '')
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0)

  useEffect(() => {
    if (!selectedLeadId || !leads.some((l) => l.id === selectedLeadId)) {
      if (leads.length > 0) {
        setSelectedLeadId(leads[0].id)
      } else {
        setSelectedLeadId('')
      }
    }
  }, [leads, selectedLeadId])

  useEffect(() => {
    if (!selectedInboxId || !inboxes.some((i) => i.id === selectedInboxId)) {
      setSelectedInboxId(inboxes[0]?.id ?? '')
    }
  }, [inboxes, selectedInboxId])

  const selectedLead = leads.find((l) => l.id === selectedLeadId)
  const selectedInbox = inboxes.find((i) => i.id === selectedInboxId)
  const currentStep = steps[selectedStepIndex]

  const inboxVars = useMemo(() => {
    if (!selectedInbox) return undefined
    return buildInboxVariableMap(selectedInbox)
  }, [selectedInbox])

  const { subjectSegments, bodySegments, missingTokens, allTokens } = useMemo(() => {
    if (!currentStep || !selectedLead) {
      return { subjectSegments: [], bodySegments: [], missingTokens: [], allTokens: [] }
    }
    const vars = selectedLead.variables as Record<string, string | number | boolean | null>
    const email = selectedLead.email

    const step1Subject = steps[0]?.subject_template?.trim() || ''
    const rawSub = currentStep.subject_template?.trim() || ''
    const effectiveSubject = selectedStepIndex === 0
      ? rawSub
      : rawSub || (
          step1Subject.toLowerCase().startsWith('re:')
            ? step1Subject
            : `Re: ${step1Subject}`
        )

    const subSeg = segmentTemplate(effectiveSubject, vars, email, inboxVars)
    const bodySeg = segmentTemplate(currentStep.body_template, vars, email, inboxVars)

    const missing = new Set<string>()
    const all = extractTokens(effectiveSubject + '\n' + currentStep.body_template)
    for (const t of all) {
      if (t === 'email') continue
      const leadVal = vars[t]
      const inboxVal = inboxVars?.[t]
      const hasVal = (leadVal !== undefined && leadVal !== null && leadVal !== '') ||
                     (inboxVal !== undefined && inboxVal !== '')
      if (!hasVal) missing.add(t)
    }

    return { subjectSegments: subSeg, bodySegments: bodySeg, missingTokens: Array.from(missing), allTokens: all }
  }, [currentStep, selectedLead, steps, selectedStepIndex, inboxVars])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
          <Eye className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-semibold text-zinc-200">Live Preview</h3>
      </div>

      {/* Lead + Inbox Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Lead Selector */}
        {leads.length > 0 ? (
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 font-medium">Preview Lead</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              <select
                value={selectedLeadId}
                onChange={(e) => setSelectedLeadId(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/40 appearance-none cursor-pointer"
              >
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.email}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500 bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-2 sm:col-span-2">
            No leads enrolled in this campaign yet. Go to the <strong>Leads</strong> tab to import leads for sequence preview.
          </p>
        )}

        {/* Inbox Selector */}
        {inboxes.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-[10px] text-indigo-400/70 font-medium">Sending as Inbox</label>
            <div className="relative">
              <Inbox className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-400/50 pointer-events-none" />
              <select
                value={selectedInboxId}
                onChange={(e) => setSelectedInboxId(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg bg-indigo-950/30 border border-indigo-500/20 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 appearance-none cursor-pointer"
              >
                <option value="">(no inbox selected)</option>
                {inboxes.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.display_name ? `${i.display_name} <${i.email_address}>` : i.email_address}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* Step Selector */}
      {steps.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] text-zinc-500 font-medium">Preview Step</label>
          <div className="flex gap-1.5 flex-wrap">
            {steps.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedStepIndex(i)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                  selectedStepIndex === i
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Step {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Missing Token Warning */}
      {missingTokens.length > 0 && selectedLead && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            Missing variables for this lead{selectedInbox ? ' / inbox' : ''}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missingTokens.map((t) => (
              <span key={t} className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-amber-950/40 border border-amber-500/30 text-amber-300">
                {`{{${t}}}`}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-amber-300/70">
            These tokens will remain unreplaced in the sent email. Update the lead&apos;s variables, the inbox sender profile, or revise the template.
          </p>
        </div>
      )}

      {/* All Resolved */}
      {selectedLead && allTokens.length > 0 && missingTokens.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          All variables resolve for this lead{selectedInbox ? ' and inbox' : ''}
        </div>
      )}

      {/* Rendered Preview */}
      {currentStep && selectedLead && (
        <div className="space-y-3">
          {/* Subject */}
          <div className="space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium">Subject</span>
            <div className="px-3.5 py-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs font-mono leading-relaxed flex flex-wrap gap-0.5">
              {subjectSegments.map((seg, i) => (
                <SegmentChip key={i} segment={seg} />
              ))}
              {subjectSegments.length === 0 && <span className="text-zinc-500 italic">No subject template</span>}
            </div>
          </div>

          {/* Body */}
          <div className="space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium">Body</span>
            <div className="px-3.5 py-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs font-mono leading-relaxed whitespace-pre-wrap min-h-[120px]">
              {bodySegments.map((seg, i) => (
                <SegmentChip key={i} segment={seg} />
              ))}
              {bodySegments.length === 0 && <span className="text-zinc-500 italic">No body template</span>}
            </div>
          </div>
        </div>
      )}

      {steps.length === 0 && (
        <p className="text-[11px] text-zinc-500 text-center py-4">Add steps to see a preview.</p>
      )}
    </div>
  )
}

function SegmentChip({ segment }: { segment: ReturnType<typeof segmentTemplate>[number] }) {
  if (segment.type === 'text') {
    return <span className="text-zinc-200 whitespace-pre-wrap">{segment.value}</span>
  }
  if (segment.type === 'resolved') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono mx-0.5">
        {segment.value}
      </span>
    )
  }
  // missing
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-mono mx-0.5">
      {`{{${segment.value}}}`}
    </span>
  )
}
