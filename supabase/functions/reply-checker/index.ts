/**
 * Outreach Smart — Reply Checker Edge Function
 *
 * Invoked periodically (every ~30 minutes via Supabase Cron).
 * 1. Checks open threads for active leads.
 * 2. Identifies inbound messages (bounces, auto-replies, and genuine replies).
 * 3. Runs Gemini LLM classification across 5 categories:
 *    ('interested', 'not_interested', 'out_of_office', 'wrong_person', 'undefined').
 * 4. Honors campaign.stop_on_auto_reply (default: true).
 * 5. Dispatches rich Markdown alerts to all active Telegram recipients.
 * 6. Immediately syncs the thread into `thread_messages` (SmartBox unified
 *    inbox) whenever it logs a new non-bounce reply for a lead.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { classifyReplyWithGemini, type GeminiKeyItem, type ReplyCategory } from '../_shared/gemini.ts'
import { notifyAllRecipients, type TelegramRecipientItem, type ReplyAlertContext } from '../_shared/telegram.ts'
import {
  getGmailAccessToken,
  getHeader,
  extractPlainTextBody,
  fetchGmailThread,
  syncThreadMessages,
} from '../_shared/gmail.ts'

const UNSUBSCRIBE_KEYWORDS = [
  'unsubscribe',
  'remove me',
  'opt out',
  'opt-out',
  'stop emailing',
  'take me off',
  'please remove',
  'do not contact',
  'cancel subscription',
]

interface CampaignLeadRow {
  id: string
  campaign_id: string
  lead_id: string
  email_account_id: string | null
  thread_id: string
  status: string
  current_step: number
  campaigns: {
    id: string
    name: string
    stop_on_auto_reply?: boolean
  }
  leads: {
    id: string
    email: string
    variables: Record<string, unknown>
    status: string
  }
  email_accounts: {
    id: string
    email_address: string
    service_account_client_email: string
    service_account_private_key: string
  }
}

Deno.serve(async (req: Request) => {
  // 1. Shared secret check
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
    threadsChecked: 0,
    newRepliesFound: 0,
    bounces: 0,
    autoReplies: 0,
    realReplies: 0,
    telegramNotificationsSent: 0,
    errors: [] as string[],
    timestamp: new Date().toISOString(),
  }

  try {
    // 2. Fetch all active Gemini API keys, Telegram recipients, and campaign recipient assignments
    const [keysRes, tgRes, campaignRecipsRes] = await Promise.all([
      supabase.from('gemini_api_keys').select('id, api_key, label').eq('is_active', true),
      supabase.from('telegram_notify_recipients').select('id, chat_id, bot_token, label').eq('is_active', true),
      supabase.from('campaign_telegram_recipients').select('campaign_id, recipient_id'),
    ])

    const geminiKeys: GeminiKeyItem[] = (keysRes.data as GeminiKeyItem[]) || []
    const telegramRecipients: TelegramRecipientItem[] = (tgRes.data as TelegramRecipientItem[]) || []

    const campaignRecipientsMap = new Map<string, Set<string>>()
    for (const row of (campaignRecipsRes.data || []) as { campaign_id: string; recipient_id: string }[]) {
      if (!campaignRecipientsMap.has(row.campaign_id)) {
        campaignRecipientsMap.set(row.campaign_id, new Set())
      }
      campaignRecipientsMap.get(row.campaign_id)!.add(row.recipient_id)
    }

    // 3. Fetch all active campaign_leads with an open thread_id
    const { data: openThreads, error: threadsErr } = await supabase
      .from('campaign_leads')
      .select('*, campaigns!inner(*), leads!inner(*), email_accounts!inner(*)')
      .eq('status', 'active')
      .not('thread_id', 'is', null)

    if (threadsErr) throw threadsErr
    if (!openThreads || openThreads.length === 0) {
      return jsonResponse({ status: 'ok', message: 'No active threads to check', ...results })
    }

    results.threadsChecked = openThreads.length

    // Fetch existing recorded message IDs from replies table to avoid duplicate processing
    const { data: existingReplies } = await supabase.from('replies').select('gmail_message_id')
    const existingMsgIds = new Set((existingReplies || []).map((r: { gmail_message_id: string | null }) => r.gmail_message_id).filter(Boolean))

    for (const cl of openThreads as unknown as CampaignLeadRow[]) {
      try {
        const inbox = cl.email_accounts
        const lead = cl.leads
        const campaign = cl.campaigns
        const stopOnAutoReply = campaign.stop_on_auto_reply ?? true // Default to true per requirement

        // 4. Get Gmail access token for this inbox
        const token = await getGmailAccessToken(
          inbox.service_account_client_email,
          inbox.service_account_private_key,
          inbox.email_address
        )

        // 5. Fetch the Gmail thread
        const threadRes = await fetchGmailThread(cl.thread_id, token)
        if (!threadRes.ok) {
          results.errors.push(threadRes.error)
          continue
        }

        const messages = threadRes.messages
        if (messages.length <= 1) continue // Only our original outbound email exists

        // Tracks whether any new non-bounce reply was logged for this lead in
        // this run, so we can immediately sync the full thread into
        // thread_messages once at the end instead of waiting for the next
        // daily thread-sync run (SmartBox unified-inbox UI).
        let hasNewNonBounceReply = false

        // 6. Inspect messages after the first one for inbound replies
        for (let i = 1; i < messages.length; i++) {
          const msg = messages[i]
          if (existingMsgIds.has(msg.id)) continue // Already processed

          const headers = msg.payload?.headers || []
          const fromHeader = getHeader(headers, 'from') || ''
          const subjectHeader = getHeader(headers, 'subject') || ''
          const isSentByUs = (msg.labelIds && msg.labelIds.includes('SENT')) || fromHeader.includes(inbox.email_address)

          if (isSentByUs) continue // Outbound follow-up sent by us

          results.newRepliesFound++
          const snippet = msg.snippet || ''
          const fullBody = extractPlainTextBody(msg.payload) || snippet

          // --- Step A: Bounce Heuristic ---
          const isBounce =
            fromHeader.toLowerCase().includes('mailer-daemon') ||
            fromHeader.toLowerCase().includes('postmaster') ||
            fromHeader.toLowerCase().includes('mail-delivery-system') ||
            subjectHeader.toLowerCase().includes('delivery status notification') ||
            subjectHeader.toLowerCase().includes('undelivered mail returned') ||
            subjectHeader.toLowerCase().includes('delivery failure')

          if (isBounce) {
            results.bounces++
            await supabase.from('replies').insert({
              campaign_lead_id: cl.id,
              gmail_message_id: msg.id,
              classification: 'bounce',
              snippet: snippet.slice(0, 500),
              received_at: new Date().toISOString(),
            })

            await supabase.from('campaign_leads').update({
              status: 'bounced',
              next_send_at: null,
            }).eq('id', cl.id)

            await supabase.from('leads').update({
              status: 'bounced',
              status_reason: `Bounce: ${snippet.slice(0, 200)}`,
              status_changed_at: new Date().toISOString(),
            }).eq('id', lead.id)

            existingMsgIds.add(msg.id)
            break // Stop thread processing on bounce
          }

          // --- Step B: Auto-Reply Heuristic ---
          const autoSubmitted = getHeader(headers, 'auto-submitted') || ''
          const xAutoreply = getHeader(headers, 'x-autoreply') || ''
          const precedence = getHeader(headers, 'precedence') || ''
          const subjectLower = subjectHeader.toLowerCase()

          const isAutoReply =
            (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') ||
            xAutoreply.toLowerCase() === 'yes' ||
            precedence.toLowerCase() === 'bulk' ||
            subjectLower.startsWith('automatic reply:') ||
            subjectLower.startsWith('out of office:') ||
            subjectLower.startsWith('auto:')

          if (isAutoReply) {
            results.autoReplies++
            await supabase.from('replies').insert({
              campaign_lead_id: cl.id,
              gmail_message_id: msg.id,
              classification: 'auto',
              llm_category: 'out_of_office',
              snippet: snippet.slice(0, 500),
              received_at: new Date().toISOString(),
            })

            // Respect campaign.stop_on_auto_reply (default TRUE)
            if (stopOnAutoReply) {
              await supabase.from('campaign_leads').update({
                status: 'replied',
                next_send_at: null,
                replied_at: new Date().toISOString(),
              }).eq('id', cl.id)
            }

            existingMsgIds.add(msg.id)
            hasNewNonBounceReply = true
            continue
          }

          // --- Step C: Real Reply & Gemini LLM Classification ---
          let llmCategory: ReplyCategory | null = null
          const company = (lead.variables?.company as string) || null

          if (geminiKeys.length > 0) {
            const llmRes = await classifyReplyWithGemini(fullBody, { leadCompany: company }, geminiKeys)
            llmCategory = llmRes.category
          }

          // If Gemini identified it as out_of_office, treat like auto-reply
          if (llmCategory === 'out_of_office') {
            results.autoReplies++
            await supabase.from('replies').insert({
              campaign_lead_id: cl.id,
              gmail_message_id: msg.id,
              classification: 'auto',
              llm_category: 'out_of_office',
              snippet: snippet.slice(0, 500),
              received_at: new Date().toISOString(),
            })

            if (stopOnAutoReply) {
              await supabase.from('campaign_leads').update({
                status: 'replied',
                next_send_at: null,
                replied_at: new Date().toISOString(),
              }).eq('id', cl.id)
            }

            existingMsgIds.add(msg.id)
            hasNewNonBounceReply = true
            continue
          }

          // Genuine real reply ('interested', 'not_interested', 'wrong_person', 'undefined', or fallback real)
          results.realReplies++

          // 1. Insert reply record
          const { data: insertedReply } = await supabase.from('replies').insert({
            campaign_lead_id: cl.id,
            gmail_message_id: msg.id,
            classification: 'real',
            llm_category: llmCategory,
            snippet: snippet.slice(0, 500),
            received_at: new Date().toISOString(),
          }).select('id').single()

          // 2. Mark campaign lead as replied (clearing next_send_at to halt sequence)
          await supabase.from('campaign_leads').update({
            status: 'replied',
            next_send_at: null,
            replied_at: new Date().toISOString(),
          }).eq('id', cl.id)

          // 3. Unsubscribe keyword check
          const contentLower = `${subjectHeader} ${fullBody}`.toLowerCase()
          const matchedUnsub = UNSUBSCRIBE_KEYWORDS.find((k) => contentLower.includes(k))
          if (matchedUnsub) {
            await supabase.from('leads').update({
              status: 'do_not_contact',
              status_reason: `Unsubscribe keyword matched: "${matchedUnsub}"`,
              status_changed_at: new Date().toISOString(),
            }).eq('id', lead.id)
          }

          // 4. Dispatch Telegram notifications to campaign-assigned recipients (or all active if none specified)
          const assignedRecipIds = campaignRecipientsMap.get(campaign.id)
          const targetsToNotify = (assignedRecipIds && assignedRecipIds.size > 0)
            ? telegramRecipients.filter((r) => assignedRecipIds.has(r.id))
            : telegramRecipients

          if (targetsToNotify.length > 0) {
            const alertCtx: ReplyAlertContext = {
              leadEmail: lead.email,
              leadCompany: company,
              campaignName: campaign.name,
              inboxEmail: inbox.email_address,
              classification: 'real',
              llmCategory,
              snippet: snippet || fullBody.slice(0, 300),
              receivedAt: new Date().toISOString(),
            }

            const tgResult = await notifyAllRecipients(targetsToNotify, alertCtx, telegramBotToken)
            results.telegramNotificationsSent += tgResult.sentCount

            if (insertedReply?.id && tgResult.sentCount > 0) {
              await supabase.from('replies').update({ notified_at: new Date().toISOString() }).eq('id', insertedReply.id)
            }
          }

          existingMsgIds.add(msg.id)
          hasNewNonBounceReply = true
        }

        // 7. Immediate SmartBox thread sync: if this run logged a new
        // non-bounce reply for this lead, persist the full thread (already
        // fetched above) into thread_messages right now instead of waiting
        // for the next daily thread-sync run.
        if (hasNewNonBounceReply) {
          const syncResult = await syncThreadMessages(supabase, cl.id, messages, inbox.email_address)
          if (syncResult.error) {
            results.errors.push(`thread_messages sync failed for lead ${cl.lead_id}: ${syncResult.error}`)
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        results.errors.push(`Error processing lead ${cl.lead_id} thread ${cl.thread_id}: ${message}`)
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
