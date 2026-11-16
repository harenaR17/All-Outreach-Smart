'use client'

import { Inbox, ShieldCheck, Info } from 'lucide-react'
import type { EmailAccount } from '@/lib/types/database'

export interface InboxCampaignSettings {
  can_send_new_leads: boolean
  can_send_follow_ups: boolean
}

interface Props {
  availableInboxes: EmailAccount[]
  selectedInboxIds: string[]
  inboxSettings?: Record<string, InboxCampaignSettings>
  onChange: (ids: string[], settings?: Record<string, InboxCampaignSettings>) => void
  disabled?: boolean
}

export function InboxPoolSelector({
  availableInboxes,
  selectedInboxIds,
  inboxSettings = {},
  onChange,
  disabled,
}: Props) {
  const toggleInbox = (id: string, inboxObj: EmailAccount) => {
    if (selectedInboxIds.includes(id)) {
      const nextIds = selectedInboxIds.filter((x) => x !== id)
      onChange(nextIds, inboxSettings)
    } else {
      const isGloballyNewLeadsBlocked = inboxObj.can_send_new_leads === false
      const isGloballyFollowUpsBlocked = inboxObj.can_send_follow_ups === false

      const nextSettings: Record<string, InboxCampaignSettings> = {
        ...inboxSettings,
        [id]: inboxSettings[id] ?? {
          can_send_new_leads: !isGloballyNewLeadsBlocked,
          can_send_follow_ups: !isGloballyFollowUpsBlocked,
        },
      }
      onChange([...selectedInboxIds, id], nextSettings)
    }
  }

  const toggleNewLeads = (inboxId: string, currentVal: boolean, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return

    const current = inboxSettings[inboxId] ?? {
      can_send_new_leads: true,
      can_send_follow_ups: true,
    }
    const nextSettings: Record<string, InboxCampaignSettings> = {
      ...inboxSettings,
      [inboxId]: {
        ...current,
        can_send_new_leads: !currentVal,
      },
    }
    onChange(selectedInboxIds, nextSettings)
  }

  const toggleFollowUps = (inboxId: string, currentVal: boolean, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return

    const current = inboxSettings[inboxId] ?? {
      can_send_new_leads: true,
      can_send_follow_ups: true,
    }
    const nextSettings: Record<string, InboxCampaignSettings> = {
      ...inboxSettings,
      [inboxId]: {
        ...current,
        can_send_follow_ups: !currentVal,
      },
    }
    onChange(selectedInboxIds, nextSettings)
  }

  const activeInboxes = availableInboxes.filter((i) => i.is_active)
  const inactiveInboxes = availableInboxes.filter((i) => !i.is_active)

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/20 text-[11px] text-blue-300 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-blue-400 mt-px shrink-0" />
        <p>
          Inboxes can be enabled for <strong>New Leads</strong> (first-touch cold outreach) and/or <strong>Follow-ups</strong>.
          Global inbox settings act as a strict ceiling. Follow-ups are always sent from the same inbox that sent the initial email.
        </p>
      </div>

      {availableInboxes.length === 0 && (
        <div className="p-6 rounded-xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
          No inboxes connected. Go to the Inboxes page to add them first.
        </div>
      )}

      {/* Active Inboxes */}
      {activeInboxes.length > 0 && (
        <div className="space-y-2">
          {activeInboxes.map((inbox) => {
            const isSelected = selectedInboxIds.includes(inbox.id)
            const settings = inboxSettings[inbox.id] ?? {
              can_send_new_leads: inbox.can_send_new_leads ?? true,
              can_send_follow_ups: inbox.can_send_follow_ups ?? true,
            }

            const isGloballyNewLeadsBlocked = inbox.can_send_new_leads === false
            const isGloballyFollowUpsBlocked = inbox.can_send_follow_ups === false

            const localCanSendNewLeads = isGloballyNewLeadsBlocked ? false : settings.can_send_new_leads
            const localCanSendFollowUps = isGloballyFollowUpsBlocked ? false : settings.can_send_follow_ups

            return (
              <div
                key={inbox.id}
                onClick={() => !disabled && toggleInbox(inbox.id, inbox)}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
                  disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-zinc-700'
                } ${
                  isSelected
                    ? 'border-indigo-500/40 bg-indigo-500/5'
                    : 'border-zinc-800 bg-zinc-900/30'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // Controlled by outer click
                    disabled={disabled}
                    className="w-4 h-4 rounded border-zinc-700 accent-indigo-500 shrink-0 cursor-pointer"
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Inbox className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="text-xs font-medium text-zinc-100 truncate">{inbox.email_address}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                        Active
                      </span>
                    </div>
                    {inbox.display_name && (
                      <p className="text-[11px] text-zinc-500 mt-0.5 truncate pl-5">{inbox.display_name}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                  {/* Granular local switches when inbox is selected */}
                  {isSelected && (
                    <div className="flex items-center gap-2">
                      {/* Local New Leads Toggle Button */}
                      <button
                        type="button"
                        onClick={(e) => !isGloballyNewLeadsBlocked && toggleNewLeads(inbox.id, localCanSendNewLeads, e)}
                        disabled={disabled || isGloballyNewLeadsBlocked}
                        title={
                          isGloballyNewLeadsBlocked
                            ? 'Disabled globally in Inbox settings (Ceiling)'
                            : localCanSendNewLeads
                            ? 'Sending to new leads enabled for this campaign (click to disable)'
                            : 'Sending to new leads disabled for this campaign (click to enable)'
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                          isGloballyNewLeadsBlocked
                            ? 'bg-zinc-900/40 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-60'
                            : localCanSendNewLeads
                            ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 cursor-pointer'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isGloballyNewLeadsBlocked
                              ? 'bg-zinc-600'
                              : localCanSendNewLeads
                              ? 'bg-indigo-400'
                              : 'bg-zinc-600'
                          }`}
                        />
                        <span>New Leads</span>
                        {isGloballyNewLeadsBlocked && (
                          <span className="text-[9px] text-zinc-500 font-mono">(Global Off)</span>
                        )}
                      </button>

                      {/* Local Follow-ups Toggle Button */}
                      <button
                        type="button"
                        onClick={(e) => !isGloballyFollowUpsBlocked && toggleFollowUps(inbox.id, localCanSendFollowUps, e)}
                        disabled={disabled || isGloballyFollowUpsBlocked}
                        title={
                          isGloballyFollowUpsBlocked
                            ? 'Disabled globally in Inbox settings (Ceiling)'
                            : localCanSendFollowUps
                            ? 'Sending follow-ups enabled for this campaign (click to disable)'
                            : 'Sending follow-ups disabled for this campaign (click to enable)'
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                          isGloballyFollowUpsBlocked
                            ? 'bg-zinc-900/40 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-60'
                            : localCanSendFollowUps
                            ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 cursor-pointer'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isGloballyFollowUpsBlocked
                              ? 'bg-zinc-600'
                              : localCanSendFollowUps
                              ? 'bg-cyan-400'
                              : 'bg-zinc-600'
                          }`}
                        />
                        <span>Follow-ups</span>
                        {isGloballyFollowUpsBlocked && (
                          <span className="text-[9px] text-zinc-500 font-mono">(Global Off)</span>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Read-only metrics */}
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500 pl-2 border-l border-zinc-800">
                    <div className="text-center">
                      <div className="text-zinc-200 font-mono font-medium">
                        {inbox.sends_today ?? 0} / {inbox.daily_send_limit}
                      </div>
                      <div className="text-[10px]">today / cap</div>
                    </div>
                    <div className="text-center">
                      <div className="text-zinc-200 font-medium">{Math.round(inbox.min_seconds_between_sends / 60)}m</div>
                      <div className="text-[10px]">spacing</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Inactive Inboxes */}
      {inactiveInboxes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-600 font-medium px-1">Inactive inboxes (can&apos;t be assigned)</p>
          {inactiveInboxes.map((inbox) => (
            <div key={inbox.id} className="flex items-center gap-4 p-4 rounded-xl border border-zinc-800/40 bg-zinc-900/20 opacity-50">
              <input type="checkbox" disabled className="w-4 h-4 rounded border-zinc-700 cursor-not-allowed shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Inbox className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  <span className="text-xs text-zinc-500 truncate">{inbox.email_address}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-500 border border-zinc-700 shrink-0">
                    Inactive
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selection summary */}
      {selectedInboxIds.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            <span className="text-zinc-200 font-medium">{selectedInboxIds.length} inbox{selectedInboxIds.length !== 1 ? 'es' : ''}</span>
            {' '}selected for this campaign pool
          </span>
        </div>
      )}
    </div>
  )
}
