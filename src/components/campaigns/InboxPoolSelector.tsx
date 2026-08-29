'use client'

import { Inbox, ShieldCheck, Info } from 'lucide-react'
import type { EmailAccount } from '@/lib/types/database'

interface Props {
  availableInboxes: EmailAccount[]
  selectedInboxIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

export function InboxPoolSelector({ availableInboxes, selectedInboxIds, onChange, disabled }: Props) {
  const toggle = (id: string) => {
    onChange(
      selectedInboxIds.includes(id)
        ? selectedInboxIds.filter((x) => x !== id)
        : [...selectedInboxIds, id]
    )
  }

  const activeInboxes = availableInboxes.filter((i) => i.is_active)
  const inactiveInboxes = availableInboxes.filter((i) => !i.is_active)

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/20 text-[11px] text-blue-300 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-blue-400 mt-px shrink-0" />
        <p>
          Inboxes are round-robined for <strong>first-touch</strong> emails only, using the inbox with the oldest last new-lead send time. Follow-ups are always sent from the same inbox that sent the initial email.
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
            return (
              <label
                key={inbox.id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                  disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-zinc-700'
                } ${
                  isSelected
                    ? 'border-indigo-500/40 bg-indigo-500/5'
                    : 'border-zinc-800 bg-zinc-900/30'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => !disabled && toggle(inbox.id)}
                  disabled={disabled}
                  className="w-4 h-4 rounded border-zinc-700 accent-indigo-500 shrink-0 cursor-pointer"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
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

                {/* Read-only metrics */}
                <div className="flex items-center gap-4 text-[11px] text-zinc-500 shrink-0">
                  <div className="text-center">
                    <div className="text-zinc-200 font-medium">{inbox.daily_send_limit}</div>
                    <div>limit/day</div>
                  </div>
                  <div className="text-center">
                    <div className="text-zinc-200 font-medium">{Math.round(inbox.min_seconds_between_sends / 60)}m</div>
                    <div>spacing</div>
                  </div>
                </div>
              </label>
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
            {' '}selected — emails will be distributed evenly for new leads
          </span>
        </div>
      )}
    </div>
  )
}
