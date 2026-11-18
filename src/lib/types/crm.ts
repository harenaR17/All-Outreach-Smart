/**
 * CRM Pipeline Types & Definitions
 */

export interface CrmStatus {
  id: string
  user_id: string
  display_name: string
  icon: string
  color: string
  sort_order: number
  track: 'positive' | 'negative' | 'neutral'
  is_terminal: boolean
  is_archived: boolean
  is_system: boolean
  reminder_config: {
    type: 'delay' | 'meeting_offset'
    hours: number
  } | null
  created_at: string
}

export type CrmReminderType = 'no_response' | 'meeting' | 'follow_up' | 'custom'
export type CrmReminderStatus = 'pending' | 'fired' | 'snoozed' | 'dismissed'

export interface CrmReminder {
  id: string
  user_id: string
  entry_id: string
  recipient_id: string | null
  reminder_type: CrmReminderType
  fire_at: string
  message: string
  status: CrmReminderStatus
  fired_at: string | null
  snoozed_until: string | null
  created_at: string
}

export interface CrmReminderWithLead extends CrmReminder {
  leadEmail?: string
  company?: string
  campaignName?: string
  statusDisplayName?: string
  statusIcon?: string
}

export interface CrmStatusHistory {
  id: string
  entry_id: string
  from_status: string | null
  to_status: string
  changed_at: string
  changed_by: string | null
}

export interface CrmActivityLogItem {
  id: string
  entry_id: string
  user_id: string
  note: string
  source: 'manual' | 'auto'
  created_at: string
}

export interface CrmPipelineLead {
  id: string // crm_pipeline_entries.id
  userId: string
  leadId: string
  replyId: string | null
  campaignId: string | null
  statusId: string
  meetingAt: string | null
  notes: string | null
  enteredAt: string
  statusChangedAt: string | null
  closedAt: string | null
  lastSentAt: string | null
  lastSentInboxId: string | null
  createdAt: string

  // Associated details
  leadEmail: string
  leadVariables: Record<string, unknown>
  campaignName: string
  campaignLeadId?: string | null
  threadId?: string | null
  inboxEmail?: string | null
  status: CrmStatus | null
  activeReminders: CrmReminder[]
}

export interface CrmSettings {
  user_id: string
  no_response_delay_hours: number
  meeting_reminder_offset_h: number
  created_at: string
  updated_at: string
}
