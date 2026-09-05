import { type NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { classifyReplyWithGemini, type GeminiKeyItem, type ReplyCategory } from '@/lib/llm/gemini'
import { notifyAllRecipients, type TelegramRecipientItem } from '@/lib/telegram/notify'
import {
  getCachedGmailAccessToken,
  getHeader,
  extractPlainTextBody,
  fetchGmailThread,
  syncThreadMessages,
} from '@/lib/google/gmail-thread'

// ─── Interfaces ──────────────────────────────────────────────────────────────

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

// ─── Verification Helper ─────────────────────────────────────────────────────

async function verifyCronAuth(req: NextRequest, supabase: ReturnType<typeof supabaseAdmin>): Promise<boolean> {
  const cronSecretEnv = process.env.CRON_SECRET?.trim()
  const headerSecret =
    req.headers.get('x-cron-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    req.nextUrl.searchParams.get('secret')?.trim()

  if (cronSecretEnv && headerSecret === cronSecretEnv) {
    return true
  }

  try {
    const { data } = await (supabase as any)
      .from('cron_config.settings')
      .select('value')
      .eq('key', 'cron_secret')
      .maybeSingle()

    const dbSecret = (data as { value?: string } | null)?.value?.trim()
    if (dbSecret && headerSecret === dbSecret) {
      return true
    }
  } catch {
    // DB check fallback failed
  }

  if (!cronSecretEnv && !headerSecret) {
    return true
  }

  return false
}

// ─── Main Handler ────────────────────────────────────────────────────────────

async function handleReplyChecker(req: NextRequest) {
  const supabase = supabaseAdmin()

  // 1. Auth Guard
  const isAuthorized = await verifyCronAuth(req, supabase)
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized: invalid or missing cron secret' }, { status: 401 })
  }

  if (req.nextUrl.searchParams.get('ping') === 'true') {
    return NextResponse.json({ status: 'ok', worker: 'reply-checker', timestamp: new Date().toISOString() })
  }

  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN

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

    const geminiKeys: GeminiKeyItem[] = (keysRes.data as unknown as GeminiKeyItem[]) || []
    const telegramRecipients: TelegramRecipientItem[] = (tgRes.data as unknown as TelegramRecipientItem[]) || []

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
      return NextResponse.json({ status: 'ok', message: 'No active threads to check', ...results })
    }

    results.threadsChecked = openThreads.length

    // Fetch existing recorded message IDs from replies table
    const { data: existingReplies } = await supabase.from('replies').select('gmail_message_id')
    const existingMsgIds = new Set(
      (existingReplies || []).map((r: { gmail_message_id: string | null }) => r.gmail_message_id).filter(Boolean),
    )

    for (const cl of openThreads as unknown as CampaignLeadRow[]) {
      try {
        const inbox = cl.email_accounts
        const lead = cl.leads
        const campaign = cl.campaigns
        const stopOnAutoReply = campaign.stop_on_auto_reply ?? true

        // 4. Get Gmail access token
        const token = await getCachedGmailAccessToken(
          inbox.service_account_client_email,
          inbox.service_account_private_key,
          inbox.email_address,
        )

        // 5. Fetch the Gmail thread
        const threadRes = await fetchGmailThread(cl.thread_id, token)
        if (!threadRes.ok) {
          results.errors.push(threadRes.error)
          continue
        }

        const messages = threadRes.messages
        if (messages.length <= 1) continue

        // Tracks whether any new non-bounce reply was logged for this lead in
        // this run, so we can immediately sync the full thread into
        // thread_messages once at the end instead of waiting for the next
        // daily thread-sync run (SmartBox unified-inbox UI).
        let hasNewNonBounceReply = false

        // 6. Inspect messages after the first outbound email
        for (let i = 1; i < messages.length; i++) {
          const msg = messages[i]
          if (existingMsgIds.has(msg.id)) continue

          const headers = msg.payload?.headers || []
          const fromHeader = getHeader(headers, 'from') || ''
          const subjectHeader = getHeader(headers, 'subject') || ''
          const isSentByUs =
            (msg.labelIds && msg.labelIds.includes('SENT')) || fromHeader.includes(inbox.email_address)

          if (isSentByUs) continue

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

            await supabase
              .from('campaign_leads')
              .update({
                status: 'bounced',
                next_send_at: null,
              })
              .eq('id', cl.id)

            await supabase
              .from('leads')
              .update({
                status: 'bounced',
                status_reason: `Bounce: ${snippet.slice(0, 200)}`,
                status_changed_at: new Date().toISOString(),
              })
              .eq('id', lead.id)

            existingMsgIds.add(msg.id)
            break
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

            if (stopOnAutoReply) {
              await supabase
                .from('campaign_leads')
                .update({
                  status: 'replied',
                  next_send_at: null,
                  replied_at: new Date().toISOString(),
                })
                .eq('id', cl.id)
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
              await supabase
                .from('campaign_leads')
                .update({
                  status: 'replied',
                  next_send_at: null,
                  replied_at: new Date().toISOString(),
                })
                .eq('id', cl.id)
            }

            existingMsgIds.add(msg.id)
            hasNewNonBounceReply = true
            continue
          }

          // Genuine real reply
          results.realReplies++

          // 1. Insert reply record
          const { data: insertedReply } = await supabase
            .from('replies')
            .insert({
              campaign_lead_id: cl.id,
              gmail_message_id: msg.id,
              classification: 'real',
              llm_category: llmCategory,
              snippet: snippet.slice(0, 500),
              received_at: new Date().toISOString(),
            })
            .select('id')
            .single()

          // 2. Mark campaign lead as replied
          await supabase
            .from('campaign_leads')
            .update({
              status: 'replied',
              next_send_at: null,
              replied_at: new Date().toISOString(),
            })
            .eq('id', cl.id)

          existingMsgIds.add(msg.id)
          hasNewNonBounceReply = true

          // 3. Dispatch Telegram Notification
          const assignedIds = campaignRecipientsMap.get(campaign.id)
          let targetRecipients: TelegramRecipientItem[] = []

          if (assignedIds && assignedIds.size > 0) {
            targetRecipients = telegramRecipients.filter((r) => assignedIds.has(r.id))
          } else {
            targetRecipients = telegramRecipients
          }

          if (targetRecipients.length > 0) {
            const { sentCount, errors: tgErrors } = await notifyAllRecipients(
              targetRecipients,
              {
                leadEmail: lead.email,
                leadCompany: company,
                campaignName: campaign.name,
                inboxEmail: inbox.email_address,
                classification: 'real',
                llmCategory,
                snippet: snippet.slice(0, 500),
                receivedAt: new Date().toISOString(),
              },
              telegramBotToken,
            )

            results.telegramNotificationsSent += sentCount
            if (tgErrors.length > 0) {
              results.errors.push(...tgErrors)
            }

            if (insertedReply?.id && sentCount > 0) {
              await supabase
                .from('replies')
                .update({ notified_at: new Date().toISOString() })
                .eq('id', insertedReply.id)
            }
          }
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
      } catch (leadErr) {
        results.errors.push(`Error processing thread for lead ${cl.leads?.email}: ${String(leadErr)}`)
      }
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok', ...results })
}

export async function POST(req: NextRequest) {
  return handleReplyChecker(req)
}

export async function GET(req: NextRequest) {
  return handleReplyChecker(req)
}
