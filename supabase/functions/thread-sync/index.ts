/**
 * Outreach Smart — Thread Sync Edge Function
 *
 * Invoked hourly via Supabase Cron (at minute 2).
 * 1. Backfills `thread_messages` (the full Gmail thread cache backing the SmartBox
 *    unified-inbox UI) for every campaign_lead whose thread has a non-bounce reply.
 * 2. Dispatches Telegram "Conversation Continues" alerts for any newly arrived
 *    inbound replies, tracking `telegram_notified_at` on `thread_messages` to ensure
 *    notifications are never missed and never duplicated.
 *
 * Employs a Least-Recently-Synced Fair Queue (round-robin) with batching
 * and concurrency:
 * - Sorts by `last_thread_synced_at ASC NULLS FIRST`
 * - BATCH_SIZE = 100 leads per hourly execution
 * - CONCURRENCY = 5 parallel thread fetches
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getGmailAccessToken,
  fetchGmailThread,
  syncThreadMessages,
  getHeader,
  extractPlainTextBody,
  isSentByInbox,
} from '../_shared/gmail.ts'
import {
  notifyAllRecipients,
  type TelegramRecipientItem,
  type ConversationAlertContext,
} from '../_shared/telegram.ts'

const BATCH_SIZE = 100
const CONCURRENCY = 5

interface CampaignLeadRow {
  id: string
  thread_id: string
  status: string
  campaign_id: string
  conversation_monitoring?: boolean
  last_thread_synced_at: string | null
  campaigns: {
    id: string
    name: string
    user_id: string
  }
  leads: {
    id: string
    email: string
    variables: Record<string, unknown>
  }
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

  const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')

  const results = {
    leadsChecked: 0,
    leadsSynced: 0,
    messagesInserted: 0,
    telegramNotificationsSent: 0,
    errors: [] as string[],
    timestamp: new Date().toISOString(),
  }

  try {
    // 2. Fetch active Telegram recipients and campaign recipient mappings
    const [tgRes, campaignRecipsRes] = await Promise.all([
      supabase.from('telegram_notify_recipients').select('id, chat_id, bot_token, label, user_id').eq('is_active', true),
      supabase.from('campaign_telegram_recipients').select('campaign_id, recipient_id'),
    ])

    const telegramRecipientsByUser = new Map<string, TelegramRecipientItem[]>()
    for (const recip of (tgRes.data || []) as unknown as (TelegramRecipientItem & { user_id: string })[]) {
      if (!telegramRecipientsByUser.has(recip.user_id)) {
        telegramRecipientsByUser.set(recip.user_id, [])
      }
      telegramRecipientsByUser.get(recip.user_id)!.push(recip)
    }

    const campaignRecipientsMap = new Map<string, Set<string>>()
    for (const row of (campaignRecipsRes.data || []) as { campaign_id: string; recipient_id: string }[]) {
      if (!campaignRecipientsMap.has(row.campaign_id)) {
        campaignRecipientsMap.set(row.campaign_id, new Set())
      }
      campaignRecipientsMap.get(row.campaign_id)!.add(row.recipient_id)
    }

    // 3. Query candidate leads ordered by least-recently-synced (NULLS FIRST).
    const { data: candidateLeads, error: leadsErr } = await supabase
      .from('campaign_leads')
      .select('id, thread_id, status, campaign_id, conversation_monitoring, last_thread_synced_at, campaigns!inner(id, name, user_id), leads!inner(id, email, variables), email_accounts!inner(email_address, service_account_client_email, service_account_private_key)')
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

    // 4. Process eligible leads in concurrent chunks of 5
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

            const messages = threadRes.messages
            if (messages.length === 0) return

            // Query existing replies (for initial reply ID) and existing thread_messages
            const [repliesRes, existingMsgsRes] = await Promise.all([
              supabase.from('replies').select('gmail_message_id').eq('campaign_lead_id', cl.id),
              supabase.from('thread_messages').select('gmail_message_id, telegram_notified_at').eq('campaign_lead_id', cl.id),
            ])

            const existingReplyMsgIds = new Set(
              (repliesRes.data || []).map((r: { gmail_message_id: string | null }) => r.gmail_message_id).filter(Boolean)
            )
            const existingNotifiedIds = new Set(
              (existingMsgsRes.data || [])
                .filter((r: { telegram_notified_at: string | null }) => r.telegram_notified_at != null)
                .map((r: { gmail_message_id: string }) => r.gmail_message_id)
            )
            const existingSyncedIds = new Set(
              (existingMsgsRes.data || []).map((r: { gmail_message_id: string }) => r.gmail_message_id)
            )

            const newlyNotifiedIds = new Set<string>()

            // Check for unnotified inbound conversation messages
            for (let mIdx = 1; mIdx < messages.length; mIdx++) {
              const msg = messages[mIdx]
              if (existingReplyMsgIds.has(msg.id)) continue
              if (existingNotifiedIds.has(msg.id)) continue
              if (isSentByInbox(msg, inbox.email_address)) continue

              // Bounce check
              const headers = msg.payload?.headers || []
              const fromHeader = getHeader(headers, 'from') || ''
              const subjectHeader = getHeader(headers, 'subject') || ''
              const isBounce =
                fromHeader.toLowerCase().includes('mailer-daemon') ||
                fromHeader.toLowerCase().includes('postmaster') ||
                fromHeader.toLowerCase().includes('mail-delivery-system') ||
                subjectHeader.toLowerCase().includes('delivery status notification') ||
                subjectHeader.toLowerCase().includes('undelivered mail returned') ||
                subjectHeader.toLowerCase().includes('delivery failure')
              if (isBounce) continue

              // Only alert if conversation monitoring is enabled
              if (cl.conversation_monitoring === false) continue

              // Atomic claim if the message is already present in thread_messages
              let canNotify = true
              if (existingSyncedIds.has(msg.id)) {
                const { data: claimed } = await supabase
                  .from('thread_messages')
                  .update({ telegram_notified_at: new Date().toISOString() })
                  .eq('campaign_lead_id', cl.id)
                  .eq('gmail_message_id', msg.id)
                  .is('telegram_notified_at', null)
                  .select('id')

                if (!claimed || claimed.length === 0) {
                  canNotify = false
                }
              }

              if (!canNotify) continue

              const snippet = msg.snippet || ''
              const fullBody = extractPlainTextBody(msg.payload) || snippet
              const company = (cl.leads?.variables?.company as string) || null

              const userTelegramRecipients = telegramRecipientsByUser.get(cl.campaigns.user_id) ?? []
              const assignedRecipIds = campaignRecipientsMap.get(cl.campaigns.id)
              const targetsToNotify = (assignedRecipIds && assignedRecipIds.size > 0)
                ? userTelegramRecipients.filter((r) => assignedRecipIds.has(r.id))
                : userTelegramRecipients

              if (targetsToNotify.length > 0) {
                const alertCtx: ConversationAlertContext = {
                  leadEmail: cl.leads.email,
                  leadCompany: company,
                  campaignName: cl.campaigns.name,
                  inboxEmail: inbox.email_address,
                  snippet: snippet || fullBody.slice(0, 300),
                  receivedAt: new Date().toISOString(),
                }
                const tgResult = await notifyAllRecipients(targetsToNotify, alertCtx, telegramBotToken, 'conversation')
                results.telegramNotificationsSent += tgResult.sentCount

                if (tgResult.sentCount > 0) {
                  existingNotifiedIds.add(msg.id)
                  newlyNotifiedIds.add(msg.id)
                } else if (existingSyncedIds.has(msg.id)) {
                  // Revert claim on failure
                  await supabase
                    .from('thread_messages')
                    .update({ telegram_notified_at: null })
                    .eq('campaign_lead_id', cl.id)
                    .eq('gmail_message_id', msg.id)
                }
              } else {
                existingNotifiedIds.add(msg.id)
                newlyNotifiedIds.add(msg.id)
              }
            }

            const syncResult = await syncThreadMessages(supabase, cl.id, messages, inbox.email_address, newlyNotifiedIds)
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

    // 5. Update last_thread_synced_at for all polled leads so the next tick rotates to the next batch
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
