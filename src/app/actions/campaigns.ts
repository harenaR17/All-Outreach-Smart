'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/server'
import type {
  Campaign,
  CampaignStep,
  EmailAccount,
} from '@/lib/types/database'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CampaignWithMeta extends Campaign {
  stepCount: number
  inboxCount: number
  leadCount: number
}

export interface CampaignDetail extends Campaign {
  steps: CampaignStep[]
  inboxIds: string[]
  inboxes: EmailAccount[]
  recipientIds: string[]
  leadCount: number
}

export interface CreateCampaignInput {
  name: string
  timezone: string
  working_days: number[]
  working_hours_start: string
  working_hours_end: string
  stop_on_auto_reply?: boolean
  recipientIds?: string[]
}

export interface SaveStepInput {
  id?: string            // undefined = new step
  step_order: number
  delay_days: number
  subject_template: string
  body_template: string
}

export interface SaveCampaignInput {
  name: string
  timezone: string
  working_days: number[]
  working_hours_start: string
  working_hours_end: string
  stop_on_auto_reply?: boolean
  steps: SaveStepInput[]
  inboxIds: string[]
  recipientIds?: string[]
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function getCampaigns(): Promise<{
  success: boolean
  data?: CampaignWithMeta[]
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return { success: false, error: error.message }

    const campaigns = data as Campaign[]

    // Fetch counts in parallel
    const withMeta = await Promise.all(
      campaigns.map(async (camp) => {
        const [stepsRes, inboxRes, leadRes] = await Promise.all([
          supabase
            .from('campaign_steps')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', camp.id),
          supabase
            .from('campaign_email_accounts')
            .select('email_account_id', { count: 'exact', head: true })
            .eq('campaign_id', camp.id),
          supabase
            .from('campaign_leads')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', camp.id),
        ])

        return {
          ...camp,
          stepCount: stepsRes.count ?? 0,
          inboxCount: inboxRes.count ?? 0,
          leadCount: leadRes.count ?? 0,
        } satisfies CampaignWithMeta
      })
    )

    return { success: true, data: withMeta }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Single Detail ───────────────────────────────────────────────────────────

export async function getCampaignById(id: string): Promise<{
  success: boolean
  data?: CampaignDetail
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()

    const [campRes, stepsRes, inboxRes, recipRes, leadCountRes] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', id).single(),
      supabase
        .from('campaign_steps')
        .select('*')
        .eq('campaign_id', id)
        .order('step_order', { ascending: true }),
      supabase
        .from('campaign_email_accounts')
        .select('email_account_id, email_accounts(*)')
        .eq('campaign_id', id),
      supabase
        .from('campaign_telegram_recipients')
        .select('recipient_id')
        .eq('campaign_id', id),
      supabase
        .from('campaign_leads')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id),
    ])

    if (campRes.error) return { success: false, error: campRes.error.message }

    const inboxIds = (inboxRes.data ?? []).map((r) => r.email_account_id)
    const inboxes = (inboxRes.data ?? []).map(
      (r) => r.email_accounts as unknown as EmailAccount
    )
    const recipientIds = (recipRes.data ?? []).map((r) => r.recipient_id)

    return {
      success: true,
      data: {
        ...(campRes.data as Campaign),
        steps: (stepsRes.data ?? []) as CampaignStep[],
        inboxIds,
        inboxes,
        recipientIds,
        leadCount: leadCountRes.count ?? 0,
      },
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createCampaign(input: CreateCampaignInput): Promise<{
  success: boolean
  data?: Campaign
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name: input.name.trim(),
        status: 'draft',
        timezone: input.timezone,
        working_days: input.working_days,
        working_hours_start: input.working_hours_start,
        working_hours_end: input.working_hours_end,
        stop_on_auto_reply: input.stop_on_auto_reply ?? true,
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }

    if (input.recipientIds && input.recipientIds.length > 0) {
      await supabase
        .from('campaign_telegram_recipients')
        .insert(input.recipientIds.map((rid) => ({ campaign_id: data.id, recipient_id: rid })))
    }

    revalidatePath('/campaigns')
    return { success: true, data: data as Campaign }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function createTestCampaign(customName?: string): Promise<{
  success: boolean
  data?: Campaign
  error?: string
}> {
  return createCampaign({
    name: customName || `Test Campaign (${new Date().toLocaleTimeString()})`,
    timezone: 'Europe/Paris',
    working_days: [1, 2, 3, 4, 5],
    working_hours_start: '09:00:00',
    working_hours_end: '18:00:00',
    stop_on_auto_reply: true,
  })
}

// ─── Save (settings + steps + inboxes + telegram recipients, no status change) ──

export async function saveCampaign(
  id: string,
  input: SaveCampaignInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()

    // 1. Update campaign settings
    const { error: campErr } = await supabase
      .from('campaigns')
      .update({
        name: input.name.trim(),
        timezone: input.timezone,
        working_days: input.working_days,
        working_hours_start: input.working_hours_start,
        working_hours_end: input.working_hours_end,
        stop_on_auto_reply: input.stop_on_auto_reply ?? true,
      })
      .eq('id', id)

    if (campErr) return { success: false, error: campErr.message }

    // 2. Update steps non-destructively: update existing, insert new, delete removed only.
    //    Blind delete-all would violate the sends.step_id FK if any email has been sent.
    const { data: existingSteps } = await supabase
      .from('campaign_steps')
      .select('id')
      .eq('campaign_id', id)

    const existingIds = new Set((existingSteps || []).map((s) => s.id))
    const keptIds = new Set(input.steps.filter((s) => s.id).map((s) => s.id!))

    // Delete only steps explicitly removed in the UI
    const idsToDelete = [...existingIds].filter((stepId) => !keptIds.has(stepId))
    if (idsToDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('campaign_steps')
        .delete()
        .in('id', idsToDelete)
      if (delErr) return { success: false, error: delErr.message }
    }

    // Update retained steps and insert new ones
    for (let i = 0; i < input.steps.length; i++) {
      const s = input.steps[i]
      const stepData = {
        campaign_id: id,
        step_order: i + 1,
        delay_days: i === 0 ? 0 : s.delay_days,
        subject_template: s.subject_template.trim(),
        body_template: s.body_template.trim(),
      }

      if (s.id && existingIds.has(s.id)) {
        const { error: updateErr } = await supabase
          .from('campaign_steps')
          .update(stepData)
          .eq('id', s.id)
        if (updateErr) return { success: false, error: updateErr.message }
      } else {
        const { error: insertErr } = await supabase
          .from('campaign_steps')
          .insert(stepData)
        if (insertErr) return { success: false, error: insertErr.message }
      }
    }

    // 3. Replace inbox pool
    const { error: delInboxErr } = await supabase
      .from('campaign_email_accounts')
      .delete()
      .eq('campaign_id', id)

    if (delInboxErr) return { success: false, error: delInboxErr.message }

    if (input.inboxIds.length > 0) {
      const { error: inboxErr } = await supabase
        .from('campaign_email_accounts')
        .insert(input.inboxIds.map((eid) => ({ campaign_id: id, email_account_id: eid })))
      if (inboxErr) return { success: false, error: inboxErr.message }
    }

    // 4. Replace telegram recipient assignments
    const { error: delRecipErr } = await supabase
      .from('campaign_telegram_recipients')
      .delete()
      .eq('campaign_id', id)

    if (delRecipErr) return { success: false, error: delRecipErr.message }

    if (input.recipientIds && input.recipientIds.length > 0) {
      const { error: recipErr } = await supabase
        .from('campaign_telegram_recipients')
        .insert(input.recipientIds.map((rid) => ({ campaign_id: id, recipient_id: rid })))
      if (recipErr) return { success: false, error: recipErr.message }
    }

    revalidatePath('/campaigns')
    revalidatePath(`/campaigns/${id}`)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Launch (save + activate) ────────────────────────────────────────────────

export async function launchCampaign(
  id: string,
  input?: SaveCampaignInput
): Promise<{ success: boolean; error?: string }> {
  if (input) {
    const saveResult = await saveCampaign(id, input)
    if (!saveResult.success) return saveResult
  }

  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'active' })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    revalidatePath('/campaigns')
    revalidatePath(`/campaigns/${id}`)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Pause ───────────────────────────────────────────────────────────────────

export async function pauseCampaign(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    revalidatePath('/campaigns')
    revalidatePath(`/campaigns/${id}`)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteCampaign(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase.from('campaigns').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    revalidatePath('/campaigns')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── Campaign Leads Progress View (Phase 6) ──────────────────────────────────

export interface CampaignLeadItem {
  id: string
  campaign_id: string
  lead_id: string
  current_step: number
  status: 'pending' | 'active' | 'replied' | 'bounced' | 'paused' | 'completed'
  email_account_id: string | null
  thread_id: string | null
  next_send_at: string | null
  replied_at: string | null
  email: string
  variables: Record<string, string | number | boolean | null>
  lead_status: string
  lead_status_reason: string | null
  inbox_email: string | null
  latest_reply?: {
    classification: 'real' | 'auto' | 'bounce'
    llm_category: 'interested' | 'not_interested' | 'out_of_office' | 'wrong_person' | 'undefined' | null
    snippet: string | null
    received_at: string
  } | null
  latest_send?: {
    status: 'sent' | 'failed'
    sent_at: string
    error_message: string | null
  } | null
}

export async function getCampaignLeads(
  campaignId: string,
  options?: {
    status?: string
    search?: string
  }
): Promise<{
  success: boolean
  data?: CampaignLeadItem[]
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()

    let query = supabase
      .from('campaign_leads')
      .select('*, leads!inner(*), email_accounts(email_address)')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false, foreignTable: 'leads' })

    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status as any)
    }

    const { data: rows, error } = await query

    if (error) return { success: false, error: error.message }
    if (!rows || rows.length === 0) return { success: true, data: [] }

    // Fetch replies and sends for these campaign leads to enrich status
    const clIds = rows.map((r) => r.id)
    const [repliesRes, sendsRes] = await Promise.all([
      supabase
        .from('replies')
        .select('*')
        .in('campaign_lead_id', clIds)
        .order('received_at', { ascending: false }),
      supabase
        .from('sends')
        .select('*')
        .in('campaign_lead_id', clIds)
        .order('sent_at', { ascending: false }),
    ])

    const repliesByCl = new Map<string, unknown>()
    for (const rep of repliesRes.data || []) {
      if (!repliesByCl.has(rep.campaign_lead_id)) {
        repliesByCl.set(rep.campaign_lead_id, rep)
      }
    }

    const sendsByCl = new Map<string, unknown>()
    for (const send of sendsRes.data || []) {
      if (!sendsByCl.has(send.campaign_lead_id)) {
        sendsByCl.set(send.campaign_lead_id, send)
      }
    }

    let items: CampaignLeadItem[] = rows.map((row: any) => {
      const lead = row.leads
      const inbox = row.email_accounts
      const reply = repliesByCl.get(row.id) as any
      const send = sendsByCl.get(row.id) as any

      return {
        id: row.id,
        campaign_id: row.campaign_id,
        lead_id: row.lead_id,
        current_step: row.current_step,
        status: row.status,
        email_account_id: row.email_account_id,
        thread_id: row.thread_id,
        next_send_at: row.next_send_at,
        replied_at: row.replied_at,
        email: lead.email,
        variables: lead.variables || {},
        lead_status: lead.status,
        lead_status_reason: lead.status_reason,
        inbox_email: inbox?.email_address || null,
        latest_reply: reply
          ? {
              classification: reply.classification,
              llm_category: reply.llm_category,
              snippet: reply.snippet,
              received_at: reply.received_at,
            }
          : null,
        latest_send: send
          ? {
              status: send.status,
              sent_at: send.sent_at,
              error_message: send.error_message,
            }
          : null,
      }
    })

    if (options?.search?.trim()) {
      const s = options.search.trim().toLowerCase()
      items = items.filter((item) => item.email.toLowerCase().includes(s))
    }

    return { success: true, data: items }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Removes / unassigns a lead from a campaign sequence without deleting the lead from the global pool.
 */
export async function removeLeadFromCampaign(
  campaignLeadId: string,
  campaignId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    const { error } = await supabase.from('campaign_leads').delete().eq('id', campaignLeadId)
    if (error) return { success: false, error: error.message }

    if (campaignId) revalidatePath(`/campaigns/${campaignId}`)
    revalidatePath('/campaigns')
    revalidatePath('/leads')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Updates a campaign lead's state (pause, resume, restart sequence from Step 1, or manual reply category override).
 */
export async function updateCampaignLeadState(
  campaignLeadId: string,
  updates: {
    status?: 'pending' | 'active' | 'replied' | 'bounced' | 'paused' | 'completed'
    current_step?: number
    restart?: boolean
    campaignId?: string
    reply_category?: 'interested' | 'not_interested' | 'out_of_office' | 'wrong_person' | 'undefined' | null
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin()
    type CLUpdate = {
      status?: 'pending' | 'active' | 'replied' | 'bounced' | 'paused' | 'completed'
      current_step?: number
      next_send_at?: string | null
      thread_id?: string | null
      last_message_id?: string | null
    }
    const clPayload: CLUpdate = {}

    if (updates.status !== undefined) {
      clPayload.status = updates.status
      if (updates.status === 'paused') {
        clPayload.next_send_at = null
      }
    }

    if (updates.restart) {
      clPayload.current_step = 0
      clPayload.status = 'pending'
      clPayload.next_send_at = null
      clPayload.thread_id = null
      clPayload.last_message_id = null
    } else if (updates.current_step !== undefined) {
      clPayload.current_step = updates.current_step
    }

    if (Object.keys(clPayload).length > 0) {
      const { error: clErr } = await supabase
        .from('campaign_leads')
        .update(clPayload)
        .eq('id', campaignLeadId)

      if (clErr) return { success: false, error: clErr.message }
    }

    // If reply category override was requested, update latest reply
    if (updates.reply_category !== undefined) {
      const { data: latestReply } = await supabase
        .from('replies')
        .select('id')
        .eq('campaign_lead_id', campaignLeadId)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestReply) {
        await supabase
          .from('replies')
          .update({ llm_category: updates.reply_category })
          .eq('id', latestReply.id)
      }
    }

    if (updates.campaignId) revalidatePath(`/campaigns/${updates.campaignId}`)
    revalidatePath('/campaigns')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

