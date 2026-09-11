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
  type GmailMessage,
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
  last_reply_checked_at?: string | null
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

// ─── Queue Batching & Concurrency ────────────────────────────────────────────

const BATCH_SIZE = 150
const CONCURRENCY = 5

// ─── Thread Transcript Helper ────────────────────────────────────────────────

function formatThreadTranscript(
  messages: GmailMessage[],
  currentIdx: number,
  inboxEmail: string,
): string {
  const parts: string[] = []
  for (let idx = 0; idx < currentIdx; idx++) {
    const m = messages[idx]
    const headers = m.payload?.headers || []
    const from = getHeader(headers, 'from') || ''
    const isSentByUs = (m.labelIds && m.labelIds.includes('SENT')) || from.includes(inboxEmail)
    const role = isSentByUs ? 'Outreach Team' : 'Lead'
    const body = extractPlainTextBody(m.payload) || m.snippet || ''
    if (body.trim()) {
      parts.push(`[${role}]:\n${body.trim()}`)
    }
  }
  return parts.join('\n\n')
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

    // 3. Fetch candidate campaign_leads with an open thread_id, ordered by
    // least-recently-checked (nulls first) to implement round-robin fair queueing.
    const [threadsRes, repliesRes] = await Promise.all([
      supabase
        .from('campaign_leads')
        .select('*, campaigns!inner(*), leads!inner(*), email_accounts!inner(*)')
        .in('status', ['active', 'completed', 'replied'])
        .not('thread_id', 'is', null)
        .order('last_reply_checked_at', { ascending: true, nullsFirst: true }),
      supabase
        .from('replies')
        .select('campaign_lead_id, gmail_message_id, classification, llm_category'),
    ])

    if (threadsRes.error) throw threadsRes.error
    const candidateThreads = threadsRes.data || []

    const existingReplies = repliesRes.data || []
    const existingMsgIds = new Set(
      (existingReplies as Array<{ gmail_message_id: string | null }>)
        .map((r) => r.gmail_message_id)
        .filter(Boolean),
    )

    // Index replies by campaign_lead_id to evaluate reply/bounce history
    const repliesByLeadId = new Map<string, Array<{ classification: string; llm_category: string | null }>>()
    for (const r of existingReplies as Array<{ campaign_lead_id: string | null; classification: string; llm_category: string | null }>) {
      if (!r.campaign_lead_id) continue
      const list = repliesByLeadId.get(r.campaign_lead_id) || []
      list.push(r)
      repliesByLeadId.set(r.campaign_lead_id, list)
    }

    // Filter threads to check based on criteria:
    // - Check active leads in sequence
    // - Check leads marked completed that have not received any real reply
    // - Check leads marked out of office (auto/out_of_office reply, awaiting potential real reply)
    // - Skip any leads that bounced (status/lead status bounced or has bounce reply)
    // - Skip leads that already received a real reply
    const eligibleThreads = (candidateThreads as unknown as CampaignLeadRow[]).filter((cl) => {
      if (!cl.email_accounts) return false

      const leadReplies = repliesByLeadId.get(cl.id) || []
      const hasRealReply = leadReplies.some((r) => r.classification === 'real')
      const hasBounce =
        cl.status === 'bounced' ||
        cl.leads?.status === 'bounced' ||
        leadReplies.some((r) => r.classification === 'bounce')

      if (hasBounce) return false
      if (hasRealReply) return false

      // 1. Active sequence leads
      if (cl.status === 'active') return true

      // 2. Completed leads that haven't received a real reply
      if (cl.status === 'completed') return true

      // 3. Leads marked out-of-office (auto-reply received, checking if real reply arrives later)
      const isOutOfOffice = leadReplies.some(
        (r) => r.llm_category === 'out_of_office' || r.classification === 'auto',
      )
      if (cl.status === 'replied' && isOutOfOffice) return true

      return false
    })

    // Take top BATCH_SIZE (150) from the round-robin queue
    const openThreads = eligibleThreads.slice(0, BATCH_SIZE)

    if (openThreads.length === 0) {
      return NextResponse.json({ status: 'ok', message: 'No candidate threads to check', ...results })
    }

    results.threadsChecked = openThreads.length

    // 4. Process threads with micro-concurrency (5 at a time) for speed
    for (let chunkStart = 0; chunkStart < openThreads.length; chunkStart += CONCURRENCY) {
      const chunk = openThreads.slice(chunkStart, chunkStart + CONCURRENCY)
      await Promise.all(
        chunk.map(async (cl) => {
          try {
            const inbox = cl.email_accounts
            const lead = cl.leads
            const campaign = cl.campaigns
            const stopOnAutoReply = campaign.stop_on_auto_reply ?? true

            // Get Gmail access token
            const token = await getCachedGmailAccessToken(
              inbox.service_account_client_email,
              inbox.service_account_private_key,
              inbox.email_address,
            )

            // Fetch the Gmail thread
            const threadRes = await fetchGmailThread(cl.thread_id, token)
            if (!threadRes.ok) {
              results.errors.push(threadRes.error)
              return
            }

            const messages = threadRes.messages
            if (messages.length <= 1) return

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

            // Ambiguity retry: if single reply returns 'undefined' and earlier messages exist in thread
            if (llmCategory === 'undefined' && i > 0) {
              const threadTranscript = formatThreadTranscript(messages, i, inbox.email_address)
              if (threadTranscript.trim()) {
                const retryRes = await classifyReplyWithGemini(
                  fullBody,
                  { leadCompany: company, threadHistory: threadTranscript },
                  geminiKeys,
                )
                if (retryRes.category && retryRes.category !== 'undefined') {
                  llmCategory = retryRes.category
                }
              }
            }
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

            // 7. Immediate SmartBox thread sync
            if (hasNewNonBounceReply) {
              const syncResult = await syncThreadMessages(supabase, cl.id, messages, inbox.email_address)
              if (syncResult.error) {
                results.errors.push(`thread_messages sync failed for lead ${cl.lead_id}: ${syncResult.error}`)
              } else {
                await supabase
                  .from('campaign_leads')
                  .update({ last_thread_synced_at: new Date().toISOString() })
                  .eq('id', cl.id)
              }
            }
          } catch (leadErr) {
            results.errors.push(`Error processing thread for lead ${cl.leads?.email}: ${String(leadErr)}`)
          }
        })
      )
    }

    // 8. Update last_reply_checked_at for all polled leads so the next tick rotates to the next batch
    const checkedLeadIds = openThreads.map((cl) => cl.id)
    if (checkedLeadIds.length > 0) {
      await supabase
        .from('campaign_leads')
        .update({ last_reply_checked_at: new Date().toISOString() })
        .in('id', checkedLeadIds)
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
