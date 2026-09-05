'use server'

import { supabaseAdmin } from '@/lib/supabase/server'
import type { ThreadMessage } from '@/lib/types/database'

// ─── Types ──────────────────────────────────────────────────────────────────

export type SmartBoxCategory = 'interested' | 'not_interested' | 'out_of_office' | 'wrong_person' | 'undefined'

export interface SmartBoxLatestReply {
  id: string
  classification: 'real' | 'auto'
  llmCategory: SmartBoxCategory | null
  snippet: string | null
  receivedAt: string
}

export interface SmartBoxLead {
  /** campaign_leads.id — pass this to getLeadThreadMessages */
  id: string
  campaignId: string
  campaignName: string
  leadId: string
  leadEmail: string
  /** Every spreadsheet column for this lead (e.g. company, first_name), same shape as leads.variables */
  leadVariables: Record<string, unknown>
  status: string
  threadId: string | null
  latestReply: SmartBoxLatestReply
}

export interface GetSmartBoxLeadsOptions {
  /** Filters by the latest non-bounce reply's llm_category. Omit for all 5 categories. */
  category?: SmartBoxCategory
  /** Case-insensitive substring match against lead email, company (variables.company), or campaign name. */
  search?: string
  /** Safety cap on rows returned, most-recent-activity-first. Defaults to 200. */
  limit?: number
}

// ─── getSmartBoxLeads ────────────────────────────────────────────────────────

/**
 * Returns campaign_leads that have received at least one non-bounce reply
 * (real replies AND auto-detected out-of-office responses; hard bounces are
 * excluded), joined to their lead/campaign info and their latest such reply.
 *
 * "Latest" is computed among non-bounce replies only, so a bounce arriving
 * after a genuine reply never hides that reply from SmartBox, and a
 * campaign_lead whose only reply is a bounce never appears at all.
 */
export async function getSmartBoxLeads(options?: GetSmartBoxLeadsOptions): Promise<{
  success: boolean
  data?: SmartBoxLead[]
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()
    const limit = options?.limit ?? 200

    // 1. Fetch every non-bounce reply, most recent first, so the first row
    // seen per campaign_lead_id below is that lead's latest non-bounce reply.
    const { data: replyRows, error: repliesErr } = await supabase
      .from('replies')
      .select('id, campaign_lead_id, classification, llm_category, snippet, received_at')
      .neq('classification', 'bounce')
      .order('received_at', { ascending: false })

    if (repliesErr) return { success: false, error: repliesErr.message }

    const latestReplyByLead = new Map<string, SmartBoxLatestReply>()
    for (const r of replyRows || []) {
      if (latestReplyByLead.has(r.campaign_lead_id)) continue
      latestReplyByLead.set(r.campaign_lead_id, {
        id: r.id,
        classification: r.classification as 'real' | 'auto',
        llmCategory: r.llm_category as SmartBoxCategory | null,
        snippet: r.snippet,
        receivedAt: r.received_at,
      })
    }

    let eligibleLeadIds = [...latestReplyByLead.keys()]
    if (options?.category) {
      eligibleLeadIds = eligibleLeadIds.filter(
        (id) => latestReplyByLead.get(id)?.llmCategory === options.category
      )
    }

    if (eligibleLeadIds.length === 0) {
      return { success: true, data: [] }
    }

    // 2. Fetch the campaign_leads themselves, joined to the lead (variables)
    // and campaign (name) info SmartBox needs to render.
    const { data: leadRows, error: leadsErr } = await supabase
      .from('campaign_leads')
      .select('id, campaign_id, lead_id, status, thread_id, campaigns(id, name), leads(id, email, variables)')
      .in('id', eligibleLeadIds)

    if (leadsErr) return { success: false, error: leadsErr.message }

    const searchTerm = options?.search?.trim().toLowerCase()

    let results: SmartBoxLead[] = (leadRows || []).map((row) => {
      const campaign = row.campaigns as unknown as { id: string; name: string } | null
      const lead = row.leads as unknown as {
        id: string
        email: string
        variables: Record<string, unknown>
      } | null

      return {
        id: row.id,
        campaignId: campaign?.id || row.campaign_id,
        campaignName: campaign?.name || 'Campaign',
        leadId: lead?.id || row.lead_id,
        leadEmail: lead?.email || 'Unknown Lead',
        leadVariables: lead?.variables || {},
        status: row.status,
        threadId: row.thread_id,
        latestReply: latestReplyByLead.get(row.id)!,
      }
    })

    if (searchTerm) {
      results = results.filter((r) => {
        const company = (r.leadVariables?.company as string) || ''
        return (
          r.leadEmail.toLowerCase().includes(searchTerm) ||
          company.toLowerCase().includes(searchTerm) ||
          r.campaignName.toLowerCase().includes(searchTerm)
        )
      })
    }

    // Most recent conversation activity first.
    results.sort((a, b) => new Date(b.latestReply.receivedAt).getTime() - new Date(a.latestReply.receivedAt).getTime())

    return { success: true, data: results.slice(0, limit) }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── getLeadThreadMessages ───────────────────────────────────────────────────

/**
 * Returns the full persisted Gmail thread (see `thread_messages`) for one
 * campaign_lead, oldest message first, for rendering a conversation view.
 */
export async function getLeadThreadMessages(campaignLeadId: string): Promise<{
  success: boolean
  data?: ThreadMessage[]
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()

    const { data, error } = await supabase
      .from('thread_messages')
      .select('*')
      .eq('campaign_lead_id', campaignLeadId)
      .order('occurred_at', { ascending: true })

    if (error) return { success: false, error: error.message }

    return { success: true, data: (data || []) as ThreadMessage[] }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
