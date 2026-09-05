/**
 * Outreach Smart — Thread Sync Edge Function
 *
 * Invoked daily via Supabase Cron. Backfills `thread_messages` (the full
 * Gmail thread cache backing the SmartBox unified-inbox UI) for every
 * campaign_lead whose thread has a non-bounce reply.
 *
 * `reply-checker` already syncs a thread immediately the moment it detects a
 * new non-bounce reply (see its "Immediate SmartBox thread sync" step), so
 * this daily run mainly catches: messages that arrived without reply-checker
 * running in between, and any earlier messages in a thread that predate
 * thread_messages existing.
 *
 * Scope: campaign_leads with a non-null thread_id AND whose latest reply
 * (by received_at) has classification != 'bounce'. Leads with no replies yet,
 * or whose latest reply is a hard bounce, are skipped — SmartBox has nothing
 * to show for them.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getGmailAccessToken, fetchGmailThread, syncThreadMessages } from '../_shared/gmail.ts'

interface CampaignLeadRow {
  id: string
  thread_id: string
  email_accounts: {
    email_address: string
    service_account_client_email: string
    service_account_private_key: string
  } | null
}

Deno.serve(async (req: Request) => {
  // 1. Shared secret check (same convention as sender / reply-checker)
  const authHeader = req.headers.get('x-cron-secret')
  const expectedSecret = Deno.env.get('CRON_SECRET')

  if (expectedSecret && authHeader !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const results = {
    leadsChecked: 0,
    leadsSynced: 0,
    messagesInserted: 0,
    errors: [] as string[],
    timestamp: new Date().toISOString(),
  }

  try {
    // 2. Candidate campaign_leads: has a thread_id, and its assigned inbox
    // (needed to fetch the thread via Gmail service-account auth).
    const { data: candidateLeads, error: leadsErr } = await supabase
      .from('campaign_leads')
      .select('id, thread_id, email_accounts(email_address, service_account_client_email, service_account_private_key)')
      .not('thread_id', 'is', null)

    if (leadsErr) throw leadsErr
    if (!candidateLeads || candidateLeads.length === 0) {
      return jsonResponse({ status: 'ok', message: 'No threads to sync', ...results })
    }

    // 3. Determine each lead's latest reply classification (ordered desc, so
    // the first row seen per campaign_lead_id is the latest one).
    const { data: repliesRows, error: repliesErr } = await supabase
      .from('replies')
      .select('campaign_lead_id, classification, received_at')
      .order('received_at', { ascending: false })

    if (repliesErr) throw repliesErr

    const latestClassificationByLead = new Map<string, string>()
    for (const row of (repliesRows || []) as { campaign_lead_id: string; classification: string }[]) {
      if (!latestClassificationByLead.has(row.campaign_lead_id)) {
        latestClassificationByLead.set(row.campaign_lead_id, row.classification)
      }
    }

    const eligibleLeads = (candidateLeads as unknown as CampaignLeadRow[]).filter((cl) => {
      const latest = latestClassificationByLead.get(cl.id)
      return Boolean(cl.email_accounts) && latest !== undefined && latest !== 'bounce'
    })

    results.leadsChecked = eligibleLeads.length

    // 4. For each eligible lead, fetch the full Gmail thread and diff/insert
    // any messages not already stored in thread_messages.
    for (const cl of eligibleLeads) {
      try {
        const inbox = cl.email_accounts!

        const token = await getGmailAccessToken(
          inbox.service_account_client_email,
          inbox.service_account_private_key,
          inbox.email_address
        )

        const threadRes = await fetchGmailThread(cl.thread_id, token)
        if (!threadRes.ok) {
          results.errors.push(threadRes.error)
          continue
        }

        const syncResult = await syncThreadMessages(supabase, cl.id, threadRes.messages, inbox.email_address)
        if (syncResult.error) {
          results.errors.push(`thread_messages sync failed for lead ${cl.id}: ${syncResult.error}`)
          continue
        }

        if (syncResult.inserted > 0) {
          results.leadsSynced++
          results.messagesInserted += syncResult.inserted
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        results.errors.push(`Error syncing thread for lead ${cl.id}: ${message}`)
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message, ...results }, 500)
  }

  return jsonResponse({ status: 'ok', ...results })
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
