'use server'

import { supabaseAdmin } from '@/lib/supabase/server'

export interface ActivityEvent {
  id: string
  type: 'send' | 'reply' | 'bounce'
  status: 'sent' | 'failed' | 'real' | 'auto' | 'bounce'
  timestamp: string
  leadEmail: string
  leadCompany?: string | null
  campaignId: string
  campaignName: string
  inboxEmail: string
  stepOrder?: number | null
  messageId?: string | null
  threadId?: string | null
  llmCategory?: 'interested' | 'not_interested' | 'out_of_office' | 'wrong_person' | 'undefined' | null
  snippet?: string | null
  errorMessage?: string | null
}

export interface ActivitySummaryStats {
  sendsToday: number
  totalSends: number
  totalReplies: number
  totalBounces: number
  failedSends: number
  interestedCount: number
  notInterestedCount: number
  wrongPersonCount: number
  undefinedCount: number
  outOfOfficeCount: number
  /** interestedCount / totalSends, same ratio convention as replyRate (totalReplies / totalSends) in ActivityFeed.tsx. 0 when totalSends is 0. */
  positiveReplyRate: number
}

/**
 * Aggregate send/reply KPIs. Pass `campaignId` to scope every count to a single
 * campaign (via the campaign_leads join); omit it for the global, all-campaigns view.
 */
export async function getActivitySummaryStats(campaignId?: string): Promise<{
  success: boolean
  data?: ActivitySummaryStats
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()

    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayIso = todayStart.toISOString()

    // sends/replies don't carry campaign_id directly - it lives on campaign_leads,
    // so scoping to a campaign requires an inner join through campaign_leads.
    let sendsTodayQuery = supabase
      .from('sends')
      .select('*, campaign_leads!inner(campaign_id)', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', todayIso)
    let totalSendsQuery = supabase
      .from('sends')
      .select('*, campaign_leads!inner(campaign_id)', { count: 'exact', head: true })
      .eq('status', 'sent')
    let failedSendsQuery = supabase
      .from('sends')
      .select('*, campaign_leads!inner(campaign_id)', { count: 'exact', head: true })
      .eq('status', 'failed')
    let repliesQuery = supabase
      .from('replies')
      .select('classification, llm_category, campaign_leads!inner(campaign_id)')

    if (campaignId) {
      sendsTodayQuery = sendsTodayQuery.eq('campaign_leads.campaign_id', campaignId)
      totalSendsQuery = totalSendsQuery.eq('campaign_leads.campaign_id', campaignId)
      failedSendsQuery = failedSendsQuery.eq('campaign_leads.campaign_id', campaignId)
      repliesQuery = repliesQuery.eq('campaign_leads.campaign_id', campaignId)
    }

    const [sendsTodayRes, totalSendsRes, failedSendsRes, repliesRes] = await Promise.all([
      sendsTodayQuery,
      totalSendsQuery,
      failedSendsQuery,
      repliesQuery,
    ])

    const replies = repliesRes.data || []
    let totalReplies = 0
    let totalBounces = 0
    let interestedCount = 0
    let notInterestedCount = 0
    let wrongPersonCount = 0
    let undefinedCount = 0
    let outOfOfficeCount = 0

    for (const r of replies) {
      if (r.classification === 'bounce') {
        totalBounces++
      } else {
        totalReplies++
      }

      if (r.llm_category === 'interested') interestedCount++
      else if (r.llm_category === 'not_interested') notInterestedCount++
      else if (r.llm_category === 'wrong_person') wrongPersonCount++
      else if (r.llm_category === 'undefined') undefinedCount++
      else if (r.llm_category === 'out_of_office') outOfOfficeCount++
    }

    const totalSends = totalSendsRes.count || 0

    return {
      success: true,
      data: {
        sendsToday: sendsTodayRes.count || 0,
        totalSends,
        failedSends: failedSendsRes.count || 0,
        totalReplies,
        totalBounces,
        interestedCount,
        notInterestedCount,
        wrongPersonCount,
        undefinedCount,
        outOfOfficeCount,
        positiveReplyRate: totalSends > 0 ? interestedCount / totalSends : 0,
      },
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function getActivityFeed(options?: {
  type?: 'all' | 'sends' | 'replies' | 'failed'
  campaignId?: string
  limit?: number
}): Promise<{
  success: boolean
  data?: ActivityEvent[]
  error?: string
}> {
  try {
    const supabase = supabaseAdmin()
    const limit = options?.limit || 50
    const events: ActivityEvent[] = []

    const fetchSends = options?.type === 'all' || options?.type === 'sends' || options?.type === 'failed'
    const fetchReplies = options?.type === 'all' || options?.type === 'replies'

    if (fetchSends) {
      let query = supabase
        .from('sends')
        .select(`
          id,
          campaign_lead_id,
          email_account_id,
          step_id,
          gmail_message_id,
          gmail_thread_id,
          status,
          error_message,
          sent_at,
          campaign_leads!inner(
            campaign_id,
            campaigns(id, name),
            leads(email, variables)
          ),
          email_accounts(email_address),
          campaign_steps(step_order)
        `)
        .order('sent_at', { ascending: false })
        .limit(limit)

      if (options?.type === 'failed') {
        query = query.eq('status', 'failed')
      }

      if (options?.campaignId) {
        query = query.eq('campaign_leads.campaign_id', options.campaignId)
      }

      const { data: sendsData } = await query

      for (const s of sendsData || []) {
        const cl = (s as any).campaign_leads
        const lead = cl?.leads
        const campaign = cl?.campaigns
        const inbox = (s as any).email_accounts
        const step = (s as any).campaign_steps

        events.push({
          id: s.id,
          type: 'send',
          status: s.status as any,
          timestamp: s.sent_at,
          leadEmail: lead?.email || 'Unknown Lead',
          leadCompany: (lead?.variables?.company as string) || null,
          campaignId: campaign?.id || '',
          campaignName: campaign?.name || 'Campaign',
          inboxEmail: inbox?.email_address || 'Inbox',
          stepOrder: step?.step_order ?? null,
          messageId: s.gmail_message_id,
          threadId: s.gmail_thread_id,
          errorMessage: s.error_message,
        })
      }
    }

    if (fetchReplies) {
      let query = supabase
        .from('replies')
        .select(`
          id,
          campaign_lead_id,
          gmail_message_id,
          classification,
          llm_category,
          received_at,
          snippet,
          campaign_leads!inner(
            campaign_id,
            campaigns(id, name),
            leads(email, variables),
            email_accounts(email_address)
          )
        `)
        .order('received_at', { ascending: false })
        .limit(limit)

      if (options?.campaignId) {
        query = query.eq('campaign_leads.campaign_id', options.campaignId)
      }

      const { data: repliesData } = await query

      for (const r of repliesData || []) {
        const cl = (r as any).campaign_leads
        const lead = cl?.leads
        const campaign = cl?.campaigns
        const inbox = cl?.email_accounts

        events.push({
          id: r.id,
          type: r.classification === 'bounce' ? 'bounce' : 'reply',
          status: r.classification as any,
          timestamp: r.received_at,
          leadEmail: lead?.email || 'Unknown Lead',
          leadCompany: (lead?.variables?.company as string) || null,
          campaignId: campaign?.id || '',
          campaignName: campaign?.name || 'Campaign',
          inboxEmail: inbox?.email_address || 'Inbox',
          messageId: r.gmail_message_id,
          llmCategory: r.llm_category,
          snippet: r.snippet,
        })
      }
    }

    // Sort combined feed descending by timestamp
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return { success: true, data: events.slice(0, limit) }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
