'use server'

import { supabaseAdmin, getAuthenticatedUser } from '@/lib/supabase/server'
import type {
  CrmStatus,
  CrmPipelineLead,
  CrmReminder,
  CrmStatusHistory,
  CrmActivityLogItem,
  CrmReminderType,
  CrmSettings,
} from '@/lib/types/crm'
import { formatTelegramCrmReminderMessage } from '@/lib/telegram/notify'

/** Default fallback seed statuses if a user doesn't have any seeded */
const DEFAULT_STATUS_SEEDS: Array<Omit<CrmStatus, 'user_id' | 'created_at'>> = [
  { id: 'new_interested', display_name: 'New — Interested', icon: '🎯', color: '#22c55e', sort_order: 10, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: { type: 'delay', hours: 24 } },
  { id: 'interested_follow_up_1', display_name: 'Follow-up 1 (Interested)', icon: '🔁', color: '#84cc16', sort_order: 20, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'interested_follow_up_2', display_name: 'Follow-up 2 (Interested)', icon: '🔁', color: '#84cc16', sort_order: 30, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'interested_closure_sent', display_name: 'Closure Sent (Interested)', icon: '📮', color: '#facc15', sort_order: 40, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'meeting_booked', display_name: 'Meeting Booked', icon: '📅', color: '#3b82f6', sort_order: 50, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: { type: 'meeting_offset', hours: -1 } },
  { id: 'no_show', display_name: 'No Show', icon: '👻', color: '#f97316', sort_order: 60, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'no_show_follow_up_1', display_name: 'Follow-up 1 (No Show)', icon: '🔁', color: '#fb923c', sort_order: 70, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'no_show_follow_up_2', display_name: 'Follow-up 2 (No Show)', icon: '🔁', color: '#fb923c', sort_order: 80, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'no_show_closure_sent', display_name: 'Closure Sent (No Show)', icon: '📮', color: '#facc15', sort_order: 90, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'proposal_sent', display_name: 'Proposal Sent', icon: '📄', color: '#8b5cf6', sort_order: 100, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'proposal_follow_up_1', display_name: 'Follow-up 1 (Proposal)', icon: '🔁', color: '#a78bfa', sort_order: 110, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'proposal_follow_up_2', display_name: 'Follow-up 2 (Proposal)', icon: '🔁', color: '#a78bfa', sort_order: 120, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'proposal_closure_sent', display_name: 'Closure Sent (Proposal)', icon: '📮', color: '#facc15', sort_order: 130, track: 'positive', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'closed_won', display_name: 'Closed — Won', icon: '🏆', color: '#fbbf24', sort_order: 140, track: 'positive', is_terminal: true, is_archived: false, is_system: true, reminder_config: null },
  { id: 'not_interested_replied', display_name: 'Not Interested', icon: '🛑', color: '#ef4444', sort_order: 200, track: 'negative', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'needs_review', display_name: 'Needs Review', icon: '❓', color: '#6b7280', sort_order: 210, track: 'neutral', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'ghosted', display_name: 'Ghosted', icon: '👤', color: '#6b7280', sort_order: 220, track: 'negative', is_terminal: false, is_archived: false, is_system: true, reminder_config: null },
  { id: 'closed_lost', display_name: 'Closed — Lost', icon: '❌', color: '#dc2626', sort_order: 230, track: 'negative', is_terminal: true, is_archived: false, is_system: true, reminder_config: null },
]

/**
 * Ensures the authenticated user has CRM statuses and CRM settings.
 */
export async function ensureUserCrmSeed(): Promise<CrmStatus[]> {
  const user = await getAuthenticatedUser()
  const supabase = supabaseAdmin()

  const { data: existing } = await supabase
    .from('crm_statuses')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  if (existing && existing.length > 0) {
    return existing as unknown as CrmStatus[]
  }

  // Seed default statuses for this user
  const inserts = DEFAULT_STATUS_SEEDS.map((s) => ({
    ...s,
    user_id: user.id,
  }))

  await supabase.from('crm_statuses').insert(inserts)
  await supabase.from('crm_settings').upsert({ user_id: user.id })

  const { data: seeded } = await supabase
    .from('crm_statuses')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  return (seeded || []) as unknown as CrmStatus[]
}

/**
 * Fetches all CRM statuses for the authenticated user.
 */
export async function getUserCrmStatuses(): Promise<{
  success: boolean
  data?: CrmStatus[]
  error?: string
}> {
  try {
    const statuses = await ensureUserCrmSeed()
    return { success: true, data: statuses }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export interface GetCrmPipelineOptions {
  campaignId?: string
  search?: string
  showArchived?: boolean
  showCold?: boolean
}

/**
 * Retrieves the CRM Pipeline leads and statuses for the board / table view.
 */
export async function getCrmPipelineData(options?: GetCrmPipelineOptions): Promise<{
  success: boolean
  data?: {
    leads: CrmPipelineLead[]
    statuses: CrmStatus[]
  }
  error?: string
}> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    // 1. Ensure statuses exist
    const statuses = await ensureUserCrmSeed()
    const statusMap = new Map<string, CrmStatus>()
    for (const s of statuses) {
      statusMap.set(s.id, s)
    }

    // 2. Fetch pipeline entries
    let query = supabase
      .from('crm_pipeline_entries')
      .select(`
        id,
        user_id,
        lead_id,
        reply_id,
        campaign_id,
        status_id,
        meeting_at,
        notes,
        entered_at,
        status_changed_at,
        closed_at,
        last_sent_at,
        last_sent_inbox_id,
        created_at,
        leads!inner(id, email, variables),
        campaigns(id, name)
      `)
      .eq('user_id', user.id)
      .order('status_changed_at', { ascending: false, nullsFirst: false })

    if (options?.campaignId && options.campaignId !== 'all') {
      query = query.eq('campaign_id', options.campaignId)
    }

    const { data: rawEntries, error: entriesErr } = await query
    if (entriesErr) throw entriesErr

    const leadIds = (rawEntries || []).map((e) => e.lead_id)

    // 3. Find campaign_leads info (to get thread_id, assigned inbox, campaign_leads.id)
    const campaignLeadsMap = new Map<string, { id: string; threadId: string | null; emailAccountId: string | null; inboxEmail: string | null }>()
    if (leadIds.length > 0) {
      const { data: clData } = await supabase
        .from('campaign_leads')
        .select('id, lead_id, thread_id, email_account_id, email_accounts(email_address)')
        .in('lead_id', leadIds)

      for (const cl of clData || []) {
        const inbox = cl.email_accounts as unknown as { email_address: string } | null
        campaignLeadsMap.set(cl.lead_id, {
          id: cl.id,
          threadId: cl.thread_id,
          emailAccountId: cl.email_account_id,
          inboxEmail: inbox?.email_address || null,
        })
      }
    }

    // 4. Fetch pending or snoozed reminders
    const entryIds = (rawEntries || []).map((e) => e.id)
    const remindersMap = new Map<string, CrmReminder[]>()
    if (entryIds.length > 0) {
      const { data: remData } = await supabase
        .from('crm_reminders')
        .select('*')
        .in('entry_id', entryIds)
        .in('status', ['pending', 'snoozed'])
        .order('fire_at', { ascending: true })

      for (const r of remData || []) {
        const list = remindersMap.get(r.entry_id) || []
        list.push(r as unknown as CrmReminder)
        remindersMap.set(r.entry_id, list)
      }
    }

    // 5. Construct lead list
    const searchTerm = options?.search?.trim().toLowerCase()
    const leads: CrmPipelineLead[] = []

    for (const row of rawEntries || []) {
      const leadInfo = row.leads as unknown as { id: string; email: string; variables: Record<string, unknown> }
      const campaignInfo = row.campaigns as unknown as { id: string; name: string } | null
      const clInfo = campaignLeadsMap.get(row.lead_id)
      const statusObj = statusMap.get(row.status_id) || null

      const isTerminal = row.closed_at !== null || (statusObj?.is_terminal ?? false)
      const isCold = statusObj?.track === 'negative' || statusObj?.track === 'neutral'

      // Filters
      if (!options?.showArchived && isTerminal) {
        continue
      }
      if (!options?.showCold && isCold && !isTerminal) {
        continue
      }

      const email = leadInfo?.email || 'Unknown'
      const variables = leadInfo?.variables || {}
      const company = (variables.company as string) || (variables.Company as string) || ''
      const campaignName = campaignInfo?.name || 'Campaign'

      if (searchTerm) {
        const match =
          email.toLowerCase().includes(searchTerm) ||
          company.toLowerCase().includes(searchTerm) ||
          campaignName.toLowerCase().includes(searchTerm)
        if (!match) continue
      }

      leads.push({
        id: row.id,
        userId: row.user_id,
        leadId: row.lead_id,
        replyId: row.reply_id,
        campaignId: row.campaign_id,
        statusId: row.status_id,
        meetingAt: row.meeting_at,
        notes: row.notes,
        enteredAt: row.entered_at,
        statusChangedAt: row.status_changed_at,
        closedAt: row.closed_at,
        lastSentAt: row.last_sent_at,
        lastSentInboxId: row.last_sent_inbox_id,
        createdAt: row.created_at,
        leadEmail: email,
        leadVariables: variables,
        campaignName,
        campaignLeadId: clInfo?.id || null,
        threadId: clInfo?.threadId || null,
        inboxEmail: clInfo?.inboxEmail || null,
        status: statusObj,
        activeReminders: remindersMap.get(row.id) || [],
      })
    }

    return {
      success: true,
      data: {
        leads,
        statuses,
      },
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Updates a lead's CRM status, logs history, updates timestamps, handles terminal state,
 * and schedules default meeting reminder if applicable.
 */
export async function updateLeadCrmStatus(params: {
  leadId: string
  newStatusId: string
  campaignId?: string
  meetingAt?: string | null
}): Promise<{ success: boolean; entryId?: string; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const { leadId, newStatusId, campaignId, meetingAt } = params

    // 1. Get status definition
    const { data: statusDef } = await supabase
      .from('crm_statuses')
      .select('*')
      .eq('user_id', user.id)
      .eq('id', newStatusId)
      .maybeSingle()

    const isTerminal = statusDef?.is_terminal ?? false
    const now = new Date()

    // 2. Fetch or create pipeline entry
    const { data: existing } = await supabase
      .from('crm_pipeline_entries')
      .select('id, status_id, notes, meeting_at, closed_at')
      .eq('user_id', user.id)
      .eq('lead_id', leadId)
      .maybeSingle()

    let entryId = existing?.id
    const fromStatus = existing?.status_id || null

    if (!existing) {
      // Create new pipeline entry
      const { data: inserted, error: insertErr } = await supabase
        .from('crm_pipeline_entries')
        .insert({
          user_id: user.id,
          lead_id: leadId,
          campaign_id: campaignId || null,
          status_id: newStatusId,
          meeting_at: meetingAt || null,
          entered_at: now.toISOString(),
          status_changed_at: now.toISOString(),
          closed_at: isTerminal ? now.toISOString() : null,
        })
        .select('id')
        .single()

      if (insertErr || !inserted) throw insertErr || new Error('Failed to create pipeline entry')
      entryId = inserted.id
    } else {
      // Update existing entry
      const updateData: {
        status_id: string
        status_changed_at: string
        closed_at: string | null
        meeting_at?: string | null
        campaign_id?: string | null
      } = {
        status_id: newStatusId,
        status_changed_at: now.toISOString(),
        closed_at: isTerminal ? now.toISOString() : null,
      }
      if (meetingAt !== undefined) {
        updateData.meeting_at = meetingAt
      }
      if (campaignId) {
        updateData.campaign_id = campaignId
      }

      const { error: updateErr } = await supabase
        .from('crm_pipeline_entries')
        .update(updateData)
        .eq('id', existing.id)

      if (updateErr) throw updateErr
      entryId = existing.id
    }

    if (!entryId) {
      throw new Error('Pipeline entry ID could not be determined')
    }

    // 3. Log to audit history
    if (fromStatus !== newStatusId) {
      await supabase.from('crm_status_history').insert({
        entry_id: entryId,
        from_status: fromStatus,
        to_status: newStatusId,
        changed_by: user.id,
      })

      // Log readable note to activity log
      const displayName = statusDef?.display_name || newStatusId
      await supabase.from('crm_status_activity_log').insert({
        entry_id: entryId,
        user_id: user.id,
        note: `Status changed to: ${displayName}`,
        source: 'auto',
      })
    }

    // 4. Handle terminal status: dismiss all pending reminders
    if (isTerminal) {
      await supabase
        .from('crm_reminders')
        .update({ status: 'dismissed' })
        .eq('entry_id', entryId)
        .eq('status', 'pending')
    }

    // 5. If status is meeting_booked and meetingAt is provided, auto-schedule meeting reminder
    if (newStatusId === 'meeting_booked' && meetingAt) {
      const meetingDate = new Date(meetingAt)
      if (!isNaN(meetingDate.getTime()) && meetingDate.getTime() > now.getTime()) {
        // Fetch CRM settings for offset
        const { data: settings } = await supabase
          .from('crm_settings')
          .select('meeting_reminder_offset_h')
          .eq('user_id', user.id)
          .maybeSingle()

        const offsetHours = settings?.meeting_reminder_offset_h ?? -1
        const fireAtTime = new Date(meetingDate.getTime() + offsetHours * 60 * 60 * 1000)

        // Only schedule if fireAtTime is in the future
        if (fireAtTime.getTime() > now.getTime()) {
          // Fetch lead details for message
          const { data: leadRow } = await supabase
            .from('leads')
            .select('email, variables')
            .eq('id', leadId)
            .single()

          const company = (leadRow?.variables?.company as string) || null

          const reminderMsg = formatTelegramCrmReminderMessage({
            type: 'meeting',
            leadEmail: leadRow?.email || 'Lead',
            leadCompany: company,
            meetingAt,
            statusDisplayName: statusDef?.display_name,
            customNote: 'Scheduled meeting countdown',
          })

          await supabase.from('crm_reminders').insert({
            user_id: user.id,
            entry_id: entryId,
            reminder_type: 'meeting',
            fire_at: fireAtTime.toISOString(),
            message: reminderMsg,
            status: 'pending',
          })
        }
      }
    }

    return { success: true, entryId }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Updates the free-text pinned scratchpad on a pipeline entry.
 */
export async function updateLeadScratchpad(
  entryId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    const { error } = await supabase
      .from('crm_pipeline_entries')
      .update({ notes })
      .eq('id', entryId)
      .eq('user_id', user.id)

    if (error) throw error
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Adds a timestamped manual note to the lead's activity log.
 */
export async function addActivityNote(
  entryId: string,
  noteText: string
): Promise<{ success: boolean; data?: CrmActivityLogItem; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    if (!noteText.trim()) {
      return { success: false, error: 'Note cannot be empty' }
    }

    const { data, error } = await supabase
      .from('crm_status_activity_log')
      .insert({
        entry_id: entryId,
        user_id: user.id,
        note: noteText.trim(),
        source: 'manual',
      })
      .select('*')
      .single()

    if (error) throw error
    return { success: true, data: data as unknown as CrmActivityLogItem }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Schedules a new reminder for a pipeline entry.
 */
export async function addCrmReminder(params: {
  entryId: string
  reminderType: CrmReminderType
  fireAt: string
  customNote?: string
  recipientId?: string | null
}): Promise<{ success: boolean; data?: CrmReminder; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const { entryId, reminderType, fireAt, customNote, recipientId } = params

    // Verify ownership and get lead details
    const { data: entry, error: entryErr } = await supabase
      .from('crm_pipeline_entries')
      .select(`
        id,
        user_id,
        status_id,
        meeting_at,
        leads!inner(email, variables),
        campaigns(name)
      `)
      .eq('id', entryId)
      .eq('user_id', user.id)
      .single()

    if (entryErr || !entry) throw new Error('Pipeline entry not found or unauthorized')

    const leadInfo = entry.leads as unknown as { email: string; variables: Record<string, unknown> }
    const campInfo = entry.campaigns as unknown as { name: string } | null
    const company = (leadInfo?.variables?.company as string) || null

    const message = formatTelegramCrmReminderMessage({
      type: reminderType,
      leadEmail: leadInfo.email,
      leadCompany: company,
      campaignName: campInfo?.name,
      meetingAt: entry.meeting_at,
      customNote,
    })

    const { data: newReminder, error: insertErr } = await supabase
      .from('crm_reminders')
      .insert({
        user_id: user.id,
        entry_id: entryId,
        recipient_id: recipientId || null,
        reminder_type: reminderType,
        fire_at: fireAt,
        message,
        status: 'pending',
      })
      .select('*')
      .single()

    if (insertErr) throw insertErr
    return { success: true, data: newReminder as unknown as CrmReminder }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Dismisses a reminder.
 */
export async function dismissCrmReminder(reminderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    const { error } = await supabase
      .from('crm_reminders')
      .update({ status: 'dismissed' })
      .eq('id', reminderId)
      .eq('user_id', user.id)

    if (error) throw error
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Snoozes a reminder to a custom datetime.
 */
export async function snoozeCrmReminder(
  reminderId: string,
  snoozeUntil: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    const { error } = await supabase
      .from('crm_reminders')
      .update({
        fire_at: snoozeUntil,
        snoozed_until: snoozeUntil,
        status: 'snoozed',
      })
      .eq('id', reminderId)
      .eq('user_id', user.id)

    if (error) throw error
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Fetches the full details for a single pipeline entry:
 * audit trail, activity log, all reminders, and thread messages.
 */
export async function getLeadCrmDetails(entryId: string): Promise<{
  success: boolean
  data?: {
    entry: CrmPipelineLead
    history: CrmStatusHistory[]
    activityLog: CrmActivityLogItem[]
    reminders: CrmReminder[]
  }
  error?: string
}> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    // 1. Fetch entry
    const { data: rawEntry, error: entryErr } = await supabase
      .from('crm_pipeline_entries')
      .select(`
        *,
        leads!inner(id, email, variables),
        campaigns(id, name)
      `)
      .eq('id', entryId)
      .eq('user_id', user.id)
      .single()

    if (entryErr || !rawEntry) throw new Error('Pipeline entry not found')

    // 2. Fetch status info
    const { data: statusObj } = await supabase
      .from('crm_statuses')
      .select('*')
      .eq('user_id', user.id)
      .eq('id', rawEntry.status_id)
      .maybeSingle()

    // 3. Find campaign_leads info for thread messages
    const { data: clRecord } = await supabase
      .from('campaign_leads')
      .select('id, thread_id, email_account_id, email_accounts(email_address)')
      .eq('lead_id', rawEntry.lead_id)
      .maybeSingle()

    const inbox = clRecord?.email_accounts as unknown as { email_address: string } | null

    // 4. Fetch history, activity log, reminders in parallel
    const [historyRes, activityRes, remindersRes] = await Promise.all([
      supabase
        .from('crm_status_history')
        .select('*')
        .eq('entry_id', entryId)
        .order('changed_at', { ascending: false }),
      supabase
        .from('crm_status_activity_log')
        .select('*')
        .eq('entry_id', entryId)
        .order('created_at', { ascending: false }),
      supabase
        .from('crm_reminders')
        .select('*')
        .eq('entry_id', entryId)
        .order('fire_at', { ascending: true }),
    ])

    const leadInfo = rawEntry.leads as unknown as { id: string; email: string; variables: Record<string, unknown> }
    const campInfo = rawEntry.campaigns as unknown as { id: string; name: string } | null

    const lead: CrmPipelineLead = {
      id: rawEntry.id,
      userId: rawEntry.user_id,
      leadId: rawEntry.lead_id,
      replyId: rawEntry.reply_id,
      campaignId: rawEntry.campaign_id,
      statusId: rawEntry.status_id,
      meetingAt: rawEntry.meeting_at,
      notes: rawEntry.notes,
      enteredAt: rawEntry.entered_at,
      statusChangedAt: rawEntry.status_changed_at,
      closedAt: rawEntry.closed_at,
      lastSentAt: rawEntry.last_sent_at,
      lastSentInboxId: rawEntry.last_sent_inbox_id,
      createdAt: rawEntry.created_at,
      leadEmail: leadInfo.email,
      leadVariables: leadInfo.variables || {},
      campaignName: campInfo?.name || 'Campaign',
      campaignLeadId: clRecord?.id || null,
      threadId: clRecord?.thread_id || null,
      inboxEmail: inbox?.email_address || null,
      status: (statusObj || null) as unknown as CrmStatus,
      activeReminders: (remindersRes.data || []) as unknown as CrmReminder[],
    }

    return {
      success: true,
      data: {
        entry: lead,
        history: (historyRes.data || []) as unknown as CrmStatusHistory[],
        activityLog: (activityRes.data || []) as unknown as CrmActivityLogItem[],
        reminders: (remindersRes.data || []) as unknown as CrmReminder[],
      },
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Phase 3: Status & Settings Management Actions ───────────────────────────

/**
 * Retrieves the user's CRM settings.
 */
export async function getCrmSettings(): Promise<{
  success: boolean
  data?: CrmSettings
  error?: string
}> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    const { data, error } = await supabase
      .from('crm_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      // Create defaults
      const { data: created, error: createErr } = await supabase
        .from('crm_settings')
        .insert({ user_id: user.id })
        .select('*')
        .single()
      if (createErr) throw createErr
      return { success: true, data: created as unknown as CrmSettings }
    }

    return { success: true, data: data as unknown as CrmSettings }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Updates the user's CRM settings.
 */
export async function updateCrmSettings(input: {
  no_response_delay_hours: number
  meeting_reminder_offset_h: number
}): Promise<{ success: boolean; data?: CrmSettings; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    const { data, error } = await supabase
      .from('crm_settings')
      .upsert({
        user_id: user.id,
        no_response_delay_hours: input.no_response_delay_hours,
        meeting_reminder_offset_h: input.meeting_reminder_offset_h,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (error) throw error
    return { success: true, data: data as unknown as CrmSettings }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Creates a new CRM status for the user.
 */
export async function createCrmStatus(status: {
  id: string
  display_name: string
  icon: string
  color: string
  sort_order: number
  track: 'positive' | 'negative' | 'neutral'
  is_terminal: boolean
}): Promise<{ success: boolean; data?: CrmStatus; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    // Validate ID slug format
    const slug = status.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    if (!slug) {
      return { success: false, error: 'Status ID must contain valid characters' }
    }

    // Check if ID already exists for this user
    const { data: existing } = await supabase
      .from('crm_statuses')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', slug)
      .maybeSingle()

    if (existing) {
      return { success: false, error: `A status with ID "${slug}" already exists` }
    }

    const { data, error } = await supabase
      .from('crm_statuses')
      .insert({
        id: slug,
        user_id: user.id,
        display_name: status.display_name.trim(),
        icon: status.icon || '📌',
        color: status.color || '#6366f1',
        sort_order: status.sort_order,
        track: status.track,
        is_terminal: status.is_terminal,
        is_archived: false,
        is_system: false,
      })
      .select('*')
      .single()

    if (error) throw error
    return { success: true, data: data as unknown as CrmStatus }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Updates an existing CRM status.
 */
export async function updateCrmStatus(
  statusId: string,
  updates: {
    display_name?: string
    icon?: string
    color?: string
    sort_order?: number
    track?: 'positive' | 'negative' | 'neutral'
    is_terminal?: boolean
    is_archived?: boolean
  }
): Promise<{ success: boolean; data?: CrmStatus; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    const { data, error } = await supabase
      .from('crm_statuses')
      .update(updates)
      .eq('id', statusId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (error) throw error
    return { success: true, data: data as unknown as CrmStatus }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Safely deletes a custom CRM status if and only if no leads are currently assigned to it
 * and it is not a system default status.
 */
export async function deleteCrmStatus(statusId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    // 1. Check if status exists
    const { data: statusRow } = await supabase
      .from('crm_statuses')
      .select('*')
      .eq('id', statusId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!statusRow) {
      return { success: false, error: 'Status not found' }
    }

    if (statusRow.is_system) {
      return {
        success: false,
        error: 'System statuses cannot be deleted. You can archive them instead to hide them from the board.',
      }
    }

    // 2. Check if any leads currently hold this status
    const { count, error: countErr } = await supabase
      .from('crm_pipeline_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status_id', statusId)

    if (countErr) throw countErr

    if (count && count > 0) {
      return {
        success: false,
        error: `Cannot delete "${statusRow.display_name}" because ${count} lead(s) currently hold this status. Move them to another stage or archive this status instead.`,
      }
    }

    // 3. Delete status
    const { error: delErr } = await supabase
      .from('crm_statuses')
      .delete()
      .eq('id', statusId)
      .eq('user_id', user.id)

    if (delErr) throw delErr
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Reorders multiple statuses at once.
 */
export async function reorderCrmStatuses(
  statusOrders: Array<{ id: string; sort_order: number }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    await Promise.all(
      statusOrders.map((item) =>
        supabase
          .from('crm_statuses')
          .update({ sort_order: item.sort_order })
          .eq('id', item.id)
          .eq('user_id', user.id)
      )
    )

    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Fetches all reminders for the user (pending, snoozed, and recently fired),
 * joined with lead email and campaign name for the central reminders management tab.
 */
export async function getAllCrmReminders(): Promise<{
  success: boolean
  data?: Array<CrmReminder & { leadEmail: string; campaignName: string; statusDisplayName: string; leadId: string }>
  error?: string
}> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    const { data: rems, error: remErr } = await supabase
      .from('crm_reminders')
      .select(`
        *,
        crm_pipeline_entries!inner(
          lead_id,
          status_id,
          leads!inner(id, email, variables),
          campaigns(name)
        )
      `)
      .eq('user_id', user.id)
      .order('fire_at', { ascending: true })

    if (remErr) throw remErr

    const { data: statuses } = await supabase
      .from('crm_statuses')
      .select('id, display_name')
      .eq('user_id', user.id)

    const statusMap = new Map<string, string>()
    for (const s of statuses || []) {
      statusMap.set(s.id, s.display_name)
    }

    const results = (rems || []).map((r) => {
      const entry = r.crm_pipeline_entries as unknown as {
        lead_id: string
        status_id: string
        leads: { id: string; email: string; variables: Record<string, unknown> }
        campaigns: { name: string } | null
      }

      return {
        id: r.id,
        user_id: r.user_id,
        entry_id: r.entry_id,
        recipient_id: r.recipient_id ?? null,
        reminder_type: r.reminder_type,
        fire_at: r.fire_at,
        message: r.message,
        status: r.status,
        fired_at: r.fired_at,
        snoozed_until: r.snoozed_until,
        created_at: r.created_at,
        leadEmail: entry?.leads?.email || 'Unknown Lead',
        campaignName: entry?.campaigns?.name || 'Campaign',
        statusDisplayName: statusMap.get(entry?.status_id) || entry?.status_id || 'Unknown',
        leadId: entry?.leads?.id || entry?.lead_id,
      }
    })

    return { success: true, data: results }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

