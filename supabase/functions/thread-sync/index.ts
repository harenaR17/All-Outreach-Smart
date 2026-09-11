/**
 * Outreach Smart — Thread Sync Edge Function
 *
 * Invoked hourly via Supabase Cron. Backfills `thread_messages` (the full
 * Gmail thread cache backing the SmartBox unified-inbox UI) for every
 * campaign_lead whose thread has a non-bounce reply.
 *
 * Employs a Least-Recently-Synced Fair Queue (round-robin) with batching
 * and concurrency:
 * - Sorts by `last_thread_synced_at ASC NULLS FIRST`
 * - BATCH_SIZE = 100 leads per hourly execution
 * - CONCURRENCY = 5 parallel thread fetches
 * - Completes in ~6-8 seconds, eliminating timeout risks as replied leads scale.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getGmailAccessToken, fetchGmailThread, syncThreadMessages } from '../_shared/gmail.ts'

const BATCH_SIZE = 100
const CONCURRENCY = 5

interface CampaignLeadRow {
  id: string
  thread_id: string
  status: string
  last_thread_synced_at: string | null
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
    // 2. Query candidate leads ordered by least-recently-synced (NULLS FIRST).
    // Only leads with status='replied' (which signifies a non-bounce reply) and
    // a non-null thread_id are polled for SmartBox thread backfill.
    const { data: candidateLeads, error: leadsErr } = await supabase
      .from('campaign_leads')
      .select('id, thread_id, status, last_thread_synced_at, email_accounts(email_address, service_account_client_email, service_account_private_key)')
      .eq('status', 'replied')
      .not('thread_id', 'is', null)
      .order('last_thread_synced_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE)

    if (leadsErr) throw leadsErr

    if (!candidateLeads || candidateLeads.length === 0) {
      return jsonResponse({ status: 'ok', message: 'No replied threads to sync', ...results })
    }

    const eligibleLeads = (candidateLeads as unknown as CampaignLeadRow[]).filter((cl) => {
      const inbox = cl.email_accounts
      return Boolean(inbox?.email_address && inbox?.service_account_client_email && inbox?.service_account_private_key)
    })

    results.leadsChecked = eligibleLeads.length

    // 3. Process eligible leads in concurrent chunks of 5
    for (let i = 0; i < eligibleLeads.length; i += CONCURRENCY) {
      const chunk = eligibleLeads.slice(i, i + CONCURRENCY)
      await Promise.all(
        chunk.map(async (cl) => {
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
              return
            }

            const syncResult = await syncThreadMessages(supabase, cl.id, threadRes.messages, inbox.email_address)
            if (syncResult.error) {
              results.errors.push(`thread_messages sync failed for lead ${cl.id}: ${syncResult.error}`)
              return
            }

            if (syncResult.inserted > 0) {
              results.leadsSynced++
              results.messagesInserted += syncResult.inserted
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            results.errors.push(`Error syncing thread for lead ${cl.id}: ${message}`)
          }
        })
      )
    }

    // 4. Update last_thread_synced_at for all polled leads so the next tick rotates to the next batch
    const polledLeadIds = eligibleLeads.map((cl) => cl.id)
    if (polledLeadIds.length > 0) {
      const { error: updateErr } = await supabase
        .from('campaign_leads')
        .update({ last_thread_synced_at: new Date().toISOString() })
        .in('id', polledLeadIds)

      if (updateErr) {
        results.errors.push(`Failed to update last_thread_synced_at: ${updateErr.message}`)
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
