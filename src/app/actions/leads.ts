'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin, getAuthenticatedUser } from '@/lib/supabase/server'
import type { Lead, LeadInsert, LeadUpdate } from '@/lib/types/database'
import type { ParsedLeadRow } from '@/lib/leads/parser'

export interface ImportLeadsInput {
  filename: string
  totalRowsFound: number
  leads: ParsedLeadRow[]
  campaignId?: string | null
}

export interface ImportSummary {
  success: boolean
  importId?: string
  totalRows: number
  newLeads: number
  duplicateLeads: number
  attachedToCampaign: number
  error?: string
}

export async function importLeads(input: ImportLeadsInput): Promise<ImportSummary> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const { filename, totalRowsFound, leads, campaignId } = input

    if (!leads || leads.length === 0) {
      return {
        success: false,
        totalRows: totalRowsFound || 0,
        newLeads: 0,
        duplicateLeads: 0,
        attachedToCampaign: 0,
        error: 'No valid leads provided for import.',
      }
    }

    // Verify campaign ownership if specified
    if (campaignId) {
      const { data: campCheck } = await supabase
        .from('campaigns')
        .select('id')
        .eq('id', campaignId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!campCheck) {
        return {
          success: false,
          totalRows: totalRowsFound || 0,
          newLeads: 0,
          duplicateLeads: 0,
          attachedToCampaign: 0,
          error: 'Target campaign not found or access denied.',
        }
      }
    }

    // 1. Create a lead_imports audit row scoped to user
    const { data: importRecord, error: importErr } = await supabase
      .from('lead_imports')
      .insert({
        user_id: user.id,
        filename: filename || 'manual_upload.csv',
        campaign_id: campaignId || null,
        total_rows: totalRowsFound,
        new_leads: 0,
        duplicate_leads: 0,
      })
      .select('id')
      .single()

    if (importErr || !importRecord) {
      return {
        success: false,
        totalRows: totalRowsFound,
        newLeads: 0,
        duplicateLeads: 0,
        attachedToCampaign: 0,
        error: `Failed to create import record: ${importErr?.message}`,
      }
    }

    const importId = importRecord.id

    // 2. Perform deduplicated batch insert into `leads` table scoped to user
    const leadInsertPayload: LeadInsert[] = leads.map((l) => ({
      user_id: user.id,
      email: l.email.trim().toLowerCase(),
      variables: l.variables,
      imported_via: importId,
      status: 'active',
    }))

    // Upsert with ON CONFLICT (user_id, lower(email)) / (user_id, email) DO NOTHING
    const { data: insertedRows, error: insertErr } = await supabase
      .from('leads')
      .upsert(leadInsertPayload, {
        onConflict: 'user_id,email',
        ignoreDuplicates: true,
      })
      .select('id, email')

    if (insertErr) {
      return {
        success: false,
        importId,
        totalRows: totalRowsFound,
        newLeads: 0,
        duplicateLeads: 0,
        attachedToCampaign: 0,
        error: `Database insertion failed: ${insertErr.message}`,
      }
    }

    const newLeadsCount = insertedRows ? insertedRows.length : 0
    const duplicateLeadsCount = Math.max(0, totalRowsFound - newLeadsCount)

    // 3. Update lead_imports record with calculated counts
    await supabase
      .from('lead_imports')
      .update({
        new_leads: newLeadsCount,
        duplicate_leads: duplicateLeadsCount,
      })
      .eq('id', importId)
      .eq('user_id', user.id)

    // 4. If a target campaign was selected, attach all valid active leads to the campaign
    let attachedToCampaignCount = 0

    if (campaignId) {
      // Get all lead IDs for the emails in this file belonging to this user
      const allEmails = leads.map((l) => l.email.trim().toLowerCase())
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('id, email, status')
        .eq('user_id', user.id)
        .in('email', allEmails)

      if (existingLeads && existingLeads.length > 0) {
        // Filter out any contacts flagged as do_not_contact or bounced
        const eligibleLeads = existingLeads.filter(
          (l) => l.status === 'active'
        )

        if (eligibleLeads.length > 0) {
          const campaignLeadsPayload = eligibleLeads.map((l) => ({
            campaign_id: campaignId,
            lead_id: l.id,
            status: 'pending' as const,
            current_step: 0,
          }))

          const { data: attachedRows } = await supabase
            .from('campaign_leads')
            .upsert(campaignLeadsPayload, {
              onConflict: 'campaign_id,lead_id',
              ignoreDuplicates: true,
            })
            .select('id')

          attachedToCampaignCount = attachedRows ? attachedRows.length : eligibleLeads.length
        }
      }
    }

    revalidatePath('/leads')
    if (campaignId) {
      revalidatePath(`/campaigns/${campaignId}`)
    }
    revalidatePath('/campaigns')
    revalidatePath('/')

    return {
      success: true,
      importId,
      totalRows: totalRowsFound,
      newLeads: newLeadsCount,
      duplicateLeads: duplicateLeadsCount,
      attachedToCampaign: attachedToCampaignCount,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error during lead import'
    return {
      success: false,
      totalRows: input.totalRowsFound || 0,
      newLeads: 0,
      duplicateLeads: 0,
      attachedToCampaign: 0,
      error: msg,
    }
  }
}

export interface GetLeadsParams {
  status?: string
  search?: string
  page?: number
  limit?: number
}

export async function getLeads(params: GetLeadsParams = {}): Promise<{
  success: boolean
  data?: Lead[]
  totalCount?: number
  error?: string
}> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const hasLimit = params.limit !== undefined && params.limit !== null
    const page = Math.max(1, params.page || 1)
    const limit = hasLimit ? Math.max(1, params.limit!) : undefined
    const offset = limit ? (page - 1) * limit : 0

    let query = supabase.from('leads').select('*', { count: 'exact' }).eq('user_id', user.id)

    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status as Lead['status'])
    }

    if (params.search && params.search.trim()) {
      const search = params.search.trim()
      query = query.ilike('email', `%${search}%`)
    }

    query = query.order('created_at', { ascending: false })

    if (limit !== undefined) {
      query = query.range(offset, offset + limit - 1)
      const { data, count, error } = await query
      if (error) {
        return { success: false, error: error.message }
      }
      return {
        success: true,
        data: (data as Lead[]) || [],
        totalCount: count || 0,
      }
    } else {
      // When no limit is passed (e.g. initial full load for client-side table),
      // auto-chunk across PostgREST's max_rows boundary so the caller receives the complete dataset.
      const CHUNK_SIZE = 1000
      let currentOffset = 0
      let allLeads: Lead[] = []
      let totalCount = 0

      while (true) {
        const { data, count, error } = await query.range(currentOffset, currentOffset + CHUNK_SIZE - 1)
        if (error) {
          return { success: false, error: error.message }
        }
        if (count !== null && totalCount === 0) {
          totalCount = count
        }
        const chunk = (data as Lead[]) || []
        allLeads = allLeads.concat(chunk)
        if (chunk.length < CHUNK_SIZE || (totalCount > 0 && allLeads.length >= totalCount)) {
          break
        }
        currentOffset += CHUNK_SIZE
      }

      return {
        success: true,
        data: allLeads,
        totalCount: totalCount || allLeads.length,
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch leads'
    return { success: false, error: msg }
  }
}

export async function getLeadImports() {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('lead_imports')
      .select('*, campaigns(name)')
      .eq('user_id', user.id)
      .order('imported_at', { ascending: false })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch imports'
    return { success: false, error: msg }
  }
}

export async function getLeadsSummary(): Promise<{
  success: boolean
  data?: {
    total: number
    active: number
    pending: number
    replied: number
    bounced: number
    doNotContact: number
  }
  error?: string
}> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const [
      totalLeadsRes,
      activeLeadsRes,
      bouncedLeadsRes,
      dncLeadsRes,
      repliedClRes,
      pendingClRes,
    ] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'bounced'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'do_not_contact'),
      supabase.from('campaign_leads').select('*, campaigns!inner(user_id)', { count: 'exact', head: true }).eq('campaigns.user_id', user.id).eq('status', 'replied'),
      supabase.from('campaign_leads').select('*, campaigns!inner(user_id)', { count: 'exact', head: true }).eq('campaigns.user_id', user.id).eq('status', 'pending'),
    ])

    return {
      success: true,
      data: {
        total: totalLeadsRes.count ?? 0,
        active: activeLeadsRes.count ?? 0,
        pending: pendingClRes.count ?? 0,
        replied: repliedClRes.count ?? 0,
        bounced: bouncedLeadsRes.count ?? 0,
        doNotContact: dncLeadsRes.count ?? 0,
      },
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateLeadStatus(
  leadId: string,
  status: 'active' | 'do_not_contact' | 'bounced',
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const now = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('leads')
      .update({
        status,
        status_reason: reason || (status === 'do_not_contact' ? 'Manually marked Do Not Contact' : null),
        status_changed_at: now,
      })
      .eq('id', leadId)
      .eq('user_id', user.id)

    if (updateErr) {
      return { success: false, error: updateErr.message }
    }

    // If marked do_not_contact or bounced, immediately stop / clear next_send_at on all active campaign sequences
    if (status === 'do_not_contact' || status === 'bounced') {
      await supabase
        .from('campaign_leads')
        .update({
          status: status === 'bounced' ? 'bounced' : 'paused',
          next_send_at: null, // Clear next_send_at to halt sender immediately
        })
        .eq('lead_id', leadId)
    }

    revalidatePath('/leads')
    revalidatePath('/campaigns')
    revalidatePath('/')

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update lead status'
    return { success: false, error: msg }
  }
}

export async function deleteLead(leadId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)
      .eq('user_id', user.id)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/leads')
    revalidatePath('/campaigns')
    revalidatePath('/')

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete lead'
    return { success: false, error: msg }
  }
}

/**
 * Creates a single lead manually from the UI and optionally assigns it to a campaign.
 */
export async function createSingleLead(input: {
  email: string
  variables?: Record<string, string | number | boolean | null>
  status?: 'active' | 'do_not_contact' | 'bounced'
  statusReason?: string
  campaignId?: string | null
}): Promise<{ success: boolean; data?: Lead; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const email = input.email.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      return { success: false, error: 'A valid email address is required.' }
    }

    const supabase = supabaseAdmin()
    const status = input.status || 'active'
    const variables = input.variables || {}

    // 1. Insert into leads table with user_id
    const { data: newLead, error: insertErr } = await supabase
      .from('leads')
      .insert({
        user_id: user.id,
        email,
        variables,
        status,
        status_reason: input.statusReason || (status === 'do_not_contact' ? 'Manually created as Do Not Contact' : null),
        status_changed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') {
        return { success: false, error: `A lead with email "${email}" already exists in your pool.` }
      }
      return { success: false, error: insertErr.message }
    }

    // 2. If target campaign is provided and status is active, attach to campaign
    if (input.campaignId && status === 'active' && newLead) {
      const { data: campCheck } = await supabase
        .from('campaigns')
        .select('id')
        .eq('id', input.campaignId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (campCheck) {
        await supabase.from('campaign_leads').upsert(
          {
            campaign_id: input.campaignId,
            lead_id: newLead.id,
            status: 'pending',
            current_step: 0,
          },
          { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true }
        )
      }
    }

    if (input.campaignId) {
      revalidatePath(`/campaigns/${input.campaignId}`)
    }
    revalidatePath('/leads')
    revalidatePath('/campaigns')
    revalidatePath('/')

    return { success: true, data: newLead as Lead }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create lead'
    return { success: false, error: msg }
  }
}

/**
 * Updates an existing lead's email, variables, and status.
 */
export async function updateLead(
  leadId: string,
  updates: {
    email?: string
    variables?: Record<string, string | number | boolean | null>
    status?: 'active' | 'do_not_contact' | 'bounced'
    status_reason?: string
  }
): Promise<{ success: boolean; data?: Lead; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const payload: Partial<LeadUpdate> = {}

    if (updates.email !== undefined) {
      const email = updates.email.trim().toLowerCase()
      if (!email || !email.includes('@')) {
        return { success: false, error: 'A valid email address is required.' }
      }
      payload.email = email
    }

    if (updates.variables !== undefined) {
      payload.variables = updates.variables
    }

    if (updates.status !== undefined) {
      payload.status = updates.status
      payload.status_reason = updates.status_reason || (updates.status === 'do_not_contact' ? 'Manually marked Do Not Contact' : null)
      payload.status_changed_at = new Date().toISOString()
    }

    const { data: updatedLead, error: updateErr } = await supabase
      .from('leads')
      .update(payload)
      .eq('id', leadId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateErr) {
      if (updateErr.code === '23505') {
        return { success: false, error: 'Another lead in your pool is already using this email address.' }
      }
      return { success: false, error: updateErr.message }
    }

    // If marked do_not_contact or bounced, halt next_send_at in active campaigns
    if (updates.status === 'do_not_contact' || updates.status === 'bounced') {
      await supabase
        .from('campaign_leads')
        .update({
          status: updates.status === 'bounced' ? 'bounced' : 'paused',
          next_send_at: null,
        })
        .eq('lead_id', leadId)
    }

    revalidatePath('/leads')
    revalidatePath('/campaigns')
    revalidatePath('/')

    return { success: true, data: updatedLead as Lead }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update lead'
    return { success: false, error: msg }
  }
}

/**
 * Assigns one or multiple leads to a target campaign.
 */
export async function assignLeadsToCampaign(
  campaignId: string,
  leadIds: string[]
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    if (!campaignId) return { success: false, error: 'Campaign ID is required.' }
    if (!leadIds || leadIds.length === 0) return { success: false, error: 'At least one lead must be selected.' }

    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()

    // 1. Verify target campaign belongs to user
    const { data: campCheck } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!campCheck) {
      return { success: false, error: 'Campaign not found or access denied.' }
    }

    // 2. Fetch eligible active leads belonging to user
    const { data: activeLeads, error: fetchErr } = await supabase
      .from('leads')
      .select('id, status')
      .eq('user_id', user.id)
      .in('id', leadIds)
      .eq('status', 'active')

    if (fetchErr) return { success: false, error: fetchErr.message }
    if (!activeLeads || activeLeads.length === 0) {
      return { success: false, error: 'None of the selected leads are active (DNC or Bounced contacts cannot be added to campaigns).' }
    }

    // 3. Upsert into campaign_leads table
    const payload = activeLeads.map((l) => ({
      campaign_id: campaignId,
      lead_id: l.id,
      status: 'pending' as const,
      current_step: 0,
    }))

    const { data: inserted, error: upsertErr } = await supabase
      .from('campaign_leads')
      .upsert(payload, {
        onConflict: 'campaign_id,lead_id',
        ignoreDuplicates: true,
      })
      .select('id')

    if (upsertErr) return { success: false, error: upsertErr.message }

    revalidatePath(`/campaigns/${campaignId}`)
    revalidatePath('/leads')
    revalidatePath('/campaigns')
    revalidatePath('/')

    return { success: true, count: inserted ? inserted.length : activeLeads.length }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to assign leads to campaign'
    return { success: false, error: msg }
  }
}

/**
 * Bulk updates status for multiple leads (e.g. bulk mark DNC or bulk reactivate).
 */
export async function bulkUpdateLeadStatus(
  leadIds: string[],
  status: 'active' | 'do_not_contact' | 'bounced',
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!leadIds || leadIds.length === 0) return { success: false, error: 'No leads selected' }

    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const now = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('leads')
      .update({
        status,
        status_reason: reason || (status === 'do_not_contact' ? 'Bulk marked Do Not Contact' : null),
        status_changed_at: now,
      })
      .in('id', leadIds)
      .eq('user_id', user.id)

    if (updateErr) return { success: false, error: updateErr.message }

    if (status === 'do_not_contact' || status === 'bounced') {
      await supabase
        .from('campaign_leads')
        .update({
          status: status === 'bounced' ? 'bounced' : 'paused',
          next_send_at: null,
        })
        .in('lead_id', leadIds)
    }

    revalidatePath('/leads')
    revalidatePath('/campaigns')
    revalidatePath('/')

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to bulk update status'
    return { success: false, error: msg }
  }
}

/**
 * Bulk deletes multiple leads from the pool.
 */
export async function bulkDeleteLeads(leadIds: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!leadIds || leadIds.length === 0) return { success: false, error: 'No leads selected' }

    const user = await getAuthenticatedUser()
    const supabase = supabaseAdmin()
    const { error } = await supabase
      .from('leads')
      .delete()
      .in('id', leadIds)
      .eq('user_id', user.id)

    if (error) return { success: false, error: error.message }

    revalidatePath('/leads')
    revalidatePath('/campaigns')
    revalidatePath('/')

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to bulk delete leads'
    return { success: false, error: msg }
  }
}
