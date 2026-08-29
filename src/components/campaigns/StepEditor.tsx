'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Mail, Zap } from 'lucide-react'
import type { SaveStepInput } from '@/app/actions/campaigns'

const QUICK_TOKENS = ['first_name', 'last_name', 'company', 'role', 'email']

interface Props {
  steps: SaveStepInput[]
  onChange: (steps: SaveStepInput[]) => void
  disabled?: boolean
  availableTokens?: string[]  // extra tokens from leads
}

export function StepEditor({ steps, onChange, disabled, availableTokens = [] }: Props) {
  const [expandedStep, setExpandedStep] = useState<number>(0)

  const allTokens = Array.from(new Set([...QUICK_TOKENS, ...availableTokens]))

  const addStep = () => {
    const newStep: SaveStepInput = {
      step_order: steps.length + 1,
      delay_days: 3,
      subject_template: '',
      body_template: '',
    }
    const updated = [...steps, newStep]
    onChange(updated)
    setExpandedStep(updated.length - 1)
  }

  const removeStep = (index: number) => {
    const updated = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i + 1 }))
    onChange(updated)
    setExpandedStep(Math.max(0, index - 1))
  }

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= steps.length) return
    const updated = [...steps]
    ;[updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]]
    onChange(updated.map((s, i) => ({ ...s, step_order: i + 1 })))
    setExpandedStep(targetIndex)
  }

  const updateStep = (index: number, patch: Partial<SaveStepInput>) => {
    const updated = steps.map((s, i) => (i === index ? { ...s, ...patch } : s))
    onChange(updated)
  }

  const insertToken = (index: number, field: 'subject_template' | 'body_template', token: string) => {
    const current = steps[index][field]
    updateStep(index, { [field]: current + `{{${token}}}` })
  }

  return (
    <div className="space-y-3">
      {steps.length === 0 && (
        <div className="p-6 rounded-xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
          No steps yet. Add your first email step below.
        </div>
      )}

      {steps.map((step, index) => {
        const isFirst = index === 0
        const isExpanded = expandedStep === index

        return (
          <div key={index} className={`rounded-xl border transition-all ${isExpanded ? 'border-indigo-500/30 bg-zinc-900/60' : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'}`}>
            {/* Step Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
              onClick={() => setExpandedStep(isExpanded ? -1 : index)}
            >
              <GripVertical className="w-4 h-4 text-zinc-600 shrink-0" />

              <div className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${isFirst ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                {index + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="text-xs font-medium text-zinc-200 truncate">
                    {step.subject_template || (isFirst ? 'First contact' : `Follow-up #${index}`)}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {isFirst ? 'Sent immediately when campaign activates' : `${step.delay_days} day${step.delay_days !== 1 ? 's' : ''} after step ${index}`}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => moveStep(index, 'up')}
                  disabled={disabled || index === 0}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(index, 'down')}
                  disabled={disabled || index === steps.length - 1}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {!isFirst && (
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    disabled={disabled}
                    className="p-1 rounded text-zinc-500 hover:text-rose-400 disabled:opacity-30 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>

            {/* Step Editor Panel */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-4 border-t border-zinc-800/60 pt-4">
                {/* Delay (not for step 1) */}
                {!isFirst && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-zinc-400 shrink-0">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Send</span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={step.delay_days}
                      onChange={(e) => updateStep(index, { delay_days: Math.max(1, parseInt(e.target.value) || 1) })}
                      disabled={disabled}
                      className="w-16 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-100 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-zinc-400">days after step {index}</span>
                  </div>
                )}

                {/* Quick Token Inserter */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-zinc-500 font-medium">Insert variable:</span>
                  <div className="flex flex-wrap gap-1">
                    {allTokens.map((tok) => (
                      <div key={tok} className="flex">
                        <button
                          type="button"
                          onClick={() => insertToken(index, 'subject_template', tok)}
                          disabled={disabled}
                          className="px-1.5 py-0.5 text-[10px] font-mono rounded-l bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-indigo-300 hover:border-indigo-500/40 transition-colors cursor-pointer"
                          title="Insert into Subject"
                        >
                          S
                        </button>
                        <span className="px-2 py-0.5 text-[10px] font-mono bg-zinc-900 border-y border-zinc-700 text-zinc-300">
                          {`{{${tok}}}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => insertToken(index, 'body_template', tok)}
                          disabled={disabled}
                          className="px-1.5 py-0.5 text-[10px] font-mono rounded-r bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-indigo-300 hover:border-indigo-500/40 transition-colors cursor-pointer"
                          title="Insert into Body"
                        >
                          B
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Subject</label>
                  <input
                    type="text"
                    value={step.subject_template}
                    onChange={(e) => updateStep(index, { subject_template: e.target.value })}
                    disabled={disabled}
                    placeholder={isFirst ? 'e.g. Quick question for {{company}}' : 'e.g. Re: Quick question for {{company}}'}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700 focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition-all font-mono"
                  />
                </div>

                {/* Body */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Body</label>
                  <textarea
                    value={step.body_template}
                    onChange={(e) => updateStep(index, { body_template: e.target.value })}
                    disabled={disabled}
                    rows={6}
                    placeholder={`Hi {{first_name}},\n\nI noticed {{company}} is doing interesting work in...\n\nWould you be open to a quick call?\n\nBest,`}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700 focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition-all font-mono resize-y min-h-[140px]"
                  />
                </div>

                {/* Threading note for follow-ups */}
                {!isFirst && (
                  <p className="text-[11px] text-zinc-500 bg-zinc-900/60 rounded-lg px-3 py-2 border border-zinc-800">
                    📧 This step will be sent as a reply in the same Gmail thread as the original email, keeping the conversation intact.
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Add Step */}
      <button
        type="button"
        onClick={addStep}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-zinc-700 text-xs text-zinc-400 hover:text-indigo-400 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all cursor-pointer disabled:opacity-40"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Follow-up Step
      </button>
    </div>
  )
}
