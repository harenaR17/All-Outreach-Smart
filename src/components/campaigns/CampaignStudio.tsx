'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Layers, Inbox, Settings, Globe, Clock, Users, Send, Check, Zap, BarChart3, Building2, Copy
} from 'lucide-react'
import type { CampaignDetail, SaveCampaignInput, SaveStepInput, CampaignLeadItem } from '@/app/actions/campaigns'
import type { EmailAccount, Lead, Campaign, TelegramRecipient } from '@/lib/types/database'
import type { ActivityEvent, ActivitySummaryStats } from '@/app/actions/activity'
import { StepEditor } from './StepEditor'
import { LiveLeadPreview } from './LiveLeadPreview'
import { InboxPoolSelector } from './InboxPoolSelector'
import { CampaignActionBar } from './CampaignActionBar'
import { CampaignLeadsTab } from './CampaignLeadsTab'
import { CampaignAnalyticsTab } from './CampaignAnalyticsTab'
import { CAMPAIGN_TIMEZONES } from '@/lib/timezones'

const EMPTY_ACTIVITY_STATS: ActivitySummaryStats = {
  sendsToday: 0,
  totalSends: 0,
  totalReplies: 0,
  totalBounces: 0,
  failedSends: 0,
  interestedCount: 0,
  notInterestedCount: 0,
  wrongPersonCount: 0,
  undefinedCount: 0,
  outOfOfficeCount: 0,
  positiveReplyRate: 0,
}

const DAYS = [
  { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 }, { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 },
]

type Tab = 'leads' | 'sequence' | 'inboxes' | 'schedule' | 'analytics'

interface Props {
  campaign: CampaignDetail
  allInboxes: EmailAccount[]
  sampleLeads?: Pick<Lead, 'id' | 'email' | 'variables'>[]
  campaignLeads?: CampaignLeadItem[]
  allTelegramRecipients?: TelegramRecipient[]
  allCampaigns?: Campaign[]
  activityStats?: ActivitySummaryStats
  activityEvents?: ActivityEvent[]
}

export function CampaignStudio({
  campaign,
  allInboxes,
  sampleLeads = [],
  campaignLeads = [],
  allTelegramRecipients = [],
  allCampaigns = [],
  activityStats = EMPTY_ACTIVITY_STATS,
  activityEvents = [],
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('leads')
  const [currentStatus, setCurrentStatus] = useState<Campaign['status']>(campaign.status)

  // Form state
  const [name, setName] = useState(campaign.name)
  const [timezone, setTimezone] = useState(campaign.timezone)
  const [workingDays, setWorkingDays] = useState<number[]>(campaign.working_days)
  const [hoursStart, setHoursStart] = useState(campaign.working_hours_start.slice(0, 5))
  const [hoursEnd, setHoursEnd] = useState(campaign.working_hours_end.slice(0, 5))
  const [stopOnAutoReply, setStopOnAutoReply] = useState(campaign.stop_on_auto_reply ?? true)
  const [sendPriority, setSendPriority] = useState<'new_leads' | 'follow_ups'>(campaign.send_priority ?? 'new_leads')
  const [companyLimit, setCompanyLimit] = useState<string>(
    campaign.limit_emails_per_company ? String(campaign.limit_emails_per_company) : ''
  )
  const [steps, setSteps] = useState<SaveStepInput[]>(
    campaign.steps.map((s) => ({
      id: s.id,
      step_order: s.step_order,
      delay_days: s.delay_days,
      subject_template: s.subject_template,
      body_template: s.body_template,
    }))
  )
  const [selectedInboxIds, setSelectedInboxIds] = useState<string[]>(campaign.inboxIds)
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(campaign.recipientIds || [])
  const [copiedId, setCopiedId] = useState(false)

  const handleCopyId = useCallback(async () => {
    if (!campaign.id) return
    try {
      await navigator.clipboard.writeText(campaign.id)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    } catch {
      // fallback
    }
  }, [campaign.id])

  // Track unsaved changes
  const initialState = useRef({
    name: campaign.name,
    timezone: campaign.timezone,
    workingDays: JSON.stringify(campaign.working_days),
    hoursStart: campaign.working_hours_start.slice(0, 5),
    hoursEnd: campaign.working_hours_end.slice(0, 5),
    stopOnAutoReply: campaign.stop_on_auto_reply ?? true,
    sendPriority: campaign.send_priority ?? 'new_leads',
    companyLimit: campaign.limit_emails_per_company ? String(campaign.limit_emails_per_company) : '',
    steps: JSON.stringify(campaign.steps),
    inboxIds: JSON.stringify(campaign.inboxIds),
    recipientIds: JSON.stringify(campaign.recipientIds || []),
  })

  const hasUnsavedChanges =
    name !== campaign.name ||
    timezone !== campaign.timezone ||
    JSON.stringify(workingDays) !== initialState.current.workingDays ||
    hoursStart !== initialState.current.hoursStart ||
    hoursEnd !== initialState.current.hoursEnd ||
    stopOnAutoReply !== initialState.current.stopOnAutoReply ||
    sendPriority !== initialState.current.sendPriority ||
    companyLimit !== initialState.current.companyLimit ||
    JSON.stringify(steps) !== initialState.current.steps ||
    JSON.stringify(selectedInboxIds) !== initialState.current.inboxIds ||
    JSON.stringify(selectedRecipientIds) !== initialState.current.recipientIds

  const isReadOnly = currentStatus === 'active' || currentStatus === 'completed'

  const toggleDay = (day: number) => {
    if (isReadOnly) return
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    )
  }

  const toggleRecipient = (id: string) => {
    if (isReadOnly) return
    setSelectedRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    )
  }

  const getFormData = useCallback((): SaveCampaignInput => ({
    name,
    timezone,
    working_days: workingDays,
    working_hours_start: `${hoursStart}:00`,
    working_hours_end: `${hoursEnd}:00`,
    stop_on_auto_reply: stopOnAutoReply,
    send_priority: sendPriority,
    limit_emails_per_company: companyLimit.trim() === '' ? null : Number(companyLimit),
    steps,
    inboxIds: selectedInboxIds,
    recipientIds: selectedRecipientIds,
  }), [name, timezone, workingDays, hoursStart, hoursEnd, stopOnAutoReply, sendPriority, companyLimit, steps, selectedInboxIds, selectedRecipientIds])

  // Extract available tokens from campaign leads for the inserter
  const availableTokens = Array.from(
    new Set(
      campaignLeads.flatMap((l) =>
        Object.keys((l.variables || {}) as Record<string, unknown>)
      )
    )
  )

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'leads', label: `Leads (${campaignLeads.length || campaign.leadCount})`, icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'inboxes', label: `Inboxes (${selectedInboxIds.length})`, icon: <Inbox className="w-3.5 h-3.5" /> },
    { id: 'sequence', label: `Sequence (${campaign.steps.length})`, icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'schedule', label: 'Schedule', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="space-y-5">
      {/* Campaign Name & ID (editable in header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {!isReadOnly ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isReadOnly}
              className="w-full px-0 py-1 bg-transparent text-2xl font-bold text-zinc-100 border-b border-transparent hover:border-zinc-700 focus:border-indigo-500 outline-none transition-colors"
            />
          ) : (
            <h2 className="text-2xl font-bold text-zinc-100">{name}</h2>
          )}
        </div>

        {/* Copy Campaign ID Button */}
        <button
          type="button"
          onClick={handleCopyId}
          className="self-start sm:self-center inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer shrink-0"
          title={`Click to copy: ${campaign.id}`}
        >
          <span className="text-zinc-500 text-[11px]">ID:</span>
          <span>{copiedId ? 'Copied!' : `${campaign.id}`}</span>
          {copiedId ? (
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          )}
        </button>
      </div>

      {/* Action Bar */}
      <CampaignActionBar
        campaign={{ ...campaign, status: currentStatus }}
        getFormData={getFormData}
        onStatusChange={setCurrentStatus}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Tab Bar */}
      <div className="flex bg-zinc-900/60 p-1 rounded-xl border border-zinc-800 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${activeTab === tab.id
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
              }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {activeTab === 'leads' && (
        <div className="space-y-3">
          <CampaignLeadsTab
            leads={campaignLeads}
            totalSteps={steps.length}
            campaignId={campaign.id}
            campaigns={allCampaigns.length > 0 ? allCampaigns : [campaign]}
          />
        </div>
      )}

      {activeTab === 'inboxes' && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Inbox className="w-3.5 h-3.5 text-indigo-400" />
            Assigned Inbox Pool
          </h3>
          <InboxPoolSelector
            availableInboxes={allInboxes}
            selectedInboxIds={selectedInboxIds}
            onChange={setSelectedInboxIds}
            disabled={isReadOnly}
          />
        </div>
      )}

      {activeTab === 'sequence' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Email Steps
            </h3>
            {isReadOnly && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                Pause the campaign to edit the sequence.
              </div>
            )}
            <StepEditor
              steps={steps}
              onChange={setSteps}
              disabled={isReadOnly}
              availableTokens={availableTokens}
            />
          </div>
          <div className="space-y-3">
            <LiveLeadPreview
              steps={steps}
              leads={campaignLeads}
              inboxes={allInboxes.filter((i) => selectedInboxIds.includes(i.id))}
            />
          </div>
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-indigo-400" />
            Schedule & Settings
          </h3>

          {isReadOnly && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              Pause the campaign to edit the schedule.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
            <div className="space-y-5">
              {/* Timezone */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-zinc-400" />
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                >
                  {CAMPAIGN_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>

              {/* Working Days */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Working Days</label>
                <div className="flex gap-1.5">
                  {DAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      disabled={isReadOnly}
                      className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer disabled:cursor-not-allowed ${workingDays.includes(d.value)
                        ? 'bg-indigo-600 text-white border border-indigo-500'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                        } disabled:opacity-60`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Working Hours */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  Working Hours
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={hoursStart}
                    onChange={(e) => setHoursStart(e.target.value)}
                    disabled={isReadOnly}
                    className="flex-1 px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  />
                  <span className="text-xs text-zinc-400">to</span>
                  <input
                    type="time"
                    value={hoursEnd}
                    onChange={(e) => setHoursEnd(e.target.value)}
                    disabled={isReadOnly}
                    className="flex-1 px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  />
                </div>
                <p className="text-[11px] text-zinc-500">Emails are only sent during these hours in the campaign&apos;s timezone.</p>
              </div>

              {/* Stop on Auto-Reply Toggle */}
              <label className={`flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 transition-colors ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-zinc-700'}`}>
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-zinc-200">Stop Sequence on Auto-Reply</div>
                  <div className="text-[11px] text-zinc-400">
                    Halt further sequence emails if an out-of-office or automated response is detected (default: ON)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={stopOnAutoReply}
                  onChange={(e) => !isReadOnly && setStopOnAutoReply(e.target.checked)}
                  disabled={isReadOnly}
                  className="w-4 h-4 rounded border-zinc-700 accent-indigo-600 cursor-pointer shrink-0"
                />
              </label>
            </div>

            <div className="space-y-5">
              {/* Lead Sending Priority */}
              <div className="space-y-2 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Lead Sending Priority
                  </label>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Choose whether this campaign prioritizes starting new leads or delivering follow-up emails first when both are due.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => !isReadOnly && setSendPriority('new_leads')}
                    disabled={isReadOnly}
                    className={`p-3 rounded-xl border text-left transition-all ${sendPriority === 'new_leads'
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-sm shadow-amber-950/20'
                      : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${sendPriority === 'new_leads' ? 'text-amber-200' : 'text-zinc-300'}`}>
                        Prioritize New Leads
                      </span>
                      {sendPriority === 'new_leads' && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                      Sends Step 1 emails to pending leads first before delivering scheduled follow-ups.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => !isReadOnly && setSendPriority('follow_ups')}
                    disabled={isReadOnly}
                    className={`p-3 rounded-xl border text-left transition-all ${sendPriority === 'follow_ups'
                      ? 'bg-indigo-500/10 border-indigo-500/40 shadow-sm shadow-indigo-950/20'
                      : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${sendPriority === 'follow_ups' ? 'text-indigo-200' : 'text-zinc-300'}`}>
                        Prioritize Follow-ups
                      </span>
                      {sendPriority === 'follow_ups' && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                      Sends due follow-up emails first to keep active threads warm before starting new leads.
                    </p>
                  </button>
                </div>
              </div>

              {/* Limit Emails Per Company */}
              <div className="space-y-2 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  Limit Emails Per Company (per day)
                </label>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Cap how many emails this campaign sends per day to leads sharing the same company (email domain). Leave empty or 0 for unlimited.
                </p>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={companyLimit}
                  onChange={(e) => setCompanyLimit(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Unlimited"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>

              {/* Telegram Notification Recipients */}
              <div className="space-y-2 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-sky-400" />
                    Telegram Alert Recipients
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    {selectedRecipientIds.length === 0
                      ? 'All active recipients'
                      : `${selectedRecipientIds.length} designated`}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Designate which associates / Telegram bots should receive instant reply alerts for this specific campaign. If none selected, all active recipients are notified.
                </p>

                {allTelegramRecipients.length > 0 ? (
                  <div className="space-y-1.5 pt-2">
                    {allTelegramRecipients.map((recip) => {
                      const isSelected = selectedRecipientIds.includes(recip.id)
                      return (
                        <button
                          key={recip.id}
                          type="button"
                          onClick={() => toggleRecipient(recip.id)}
                          disabled={isReadOnly}
                          className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${isSelected
                            ? 'bg-sky-950/30 border-sky-500/40 text-sky-200'
                            : 'bg-zinc-900/80 border-zinc-800/80 text-zinc-400 hover:border-zinc-700'
                            } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected
                                ? 'bg-sky-600 border-sky-500 text-white'
                                : 'bg-zinc-800 border-zinc-700 text-transparent'
                                }`}
                            >
                              <Check className="w-3 h-3" />
                            </div>
                            <div>
                              <div className="text-xs font-medium text-zinc-200">
                                {recip.label || 'Unnamed Associate'}
                              </div>
                              <div className="text-[10px] font-mono text-zinc-500">
                                Chat: {recip.chat_id}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${recip.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                              }`}
                          >
                            {recip.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500 italic pt-1">
                    No Telegram bots configured. Add bots in Settings to enable notifications.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
            Campaign Analytics
          </h3>
          <CampaignAnalyticsTab
            stats={activityStats}
            events={activityEvents}
            campaignLeads={campaignLeads}
            steps={campaign.steps}
          />
        </div>
      )}
    </div>
  )
}
