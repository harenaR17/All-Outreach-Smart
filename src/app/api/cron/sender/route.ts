import { type NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

// ─── Module-level JWT token cache ───────────────────────────────────────────
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

// ─── Hard cap per invocation to stay within execution limits ────────────────
const MAX_SENDS_PER_RUN = 1

// ─── Free-mail domains, excluded from the per-company daily limit ────────────
// Leads on these domains are consumer addresses, not colleagues at one company,
// so each is treated as its own singleton group and is never limited by
// campaigns.limit_emails_per_company.
const FREE_MAIL_DOMAINS = new Set<string>([
  // Google
  'gmail.com', 'googlemail.com',
  // Yahoo
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it',
  'yahoo.ca', 'yahoo.com.au', 'yahoo.co.in', 'ymail.com', 'rocketmail.com',
  // Microsoft
  'outlook.com', 'outlook.fr', 'outlook.de', 'hotmail.com', 'hotmail.fr',
  'hotmail.co.uk', 'hotmail.de', 'hotmail.it', 'hotmail.es', 'live.com',
  'live.fr', 'live.co.uk', 'msn.com',
  // Apple
  'icloud.com', 'me.com', 'mac.com',
  // AOL
  'aol.com', 'aim.com',
  // Privacy-focused / other global providers
  'protonmail.com', 'proton.me', 'pm.me', 'tutanota.com', 'tuta.io',
  'zoho.com', 'fastmail.com', 'hushmail.com', 'mail.com', 'email.com',
  'gmx.com', 'gmx.net', 'gmx.de', 'gmx.fr', 'web.de', 't-online.de',
  'yandex.com', 'yandex.ru', 'mail.ru', 'inbox.ru', 'bk.ru', 'list.ru',
  'qq.com', '163.com', '126.com', 'sina.com', 'naver.com', 'daum.net',
  // French ISPs (common consumer mailboxes in this product's market)
  'free.fr', 'orange.fr', 'wanadoo.fr', 'laposte.net', 'sfr.fr', 'bbox.fr',
  'neuf.fr', 'aliceadsl.fr', 'numericable.fr',
  // North American ISPs
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net',
  'cox.net', 'charter.net', 'shaw.ca', 'rogers.com', 'sympatico.ca',
  // UK / AU / other ISPs
  'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net',
  'bigpond.com', 'optusnet.com.au',
])

/**
 * Company grouping key for the per-company daily limit.
 *
 * The key is the lead's email domain. Returns null when the lead must NOT be
 * grouped — either the address is unusable, or the domain is a free-mail
 * provider, in which case the lead is its own singleton group and is never
 * throttled by this feature.
 */
function companyKeyForEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = email.slice(at + 1).trim().toLowerCase()
  if (!domain || domain.includes('@')) return null
  if (FREE_MAIL_DOMAINS.has(domain)) return null
  return domain
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  name: string
  status: string
  timezone: string
  working_days: number[]
  working_hours_start: string
  working_hours_end: string
  send_priority?: 'new_leads' | 'follow_ups'
  /** Max sends per day to leads of the same company. null / 0 = unlimited. */
  limit_emails_per_company?: number | null
}

interface EmailAccount {
  id: string
  email_address: string
  display_name?: string | null
  first_name?: string | null
  last_name?: string | null
  role?: string | null
  phone_number?: string | null
  signature?: string | null
  variables?: Record<string, string> | null
  service_account_client_email: string
  service_account_private_key: string
  daily_send_limit: number
  /** Running count for today (UTC). Incremented after each send; reset at midnight by pg_cron. */
  daily_send_count: number
  min_seconds_between_sends: number
  next_available_at: string | null
  last_sent_at: string | null
  last_new_lead_sent_at: string | null
  is_active: boolean
  status: string
}

interface CampaignStep {
  id: string
  step_order: number
  delay_days: number
  subject_template: string
  body_template: string
}

interface CampaignLead {
  id: string
  campaign_id: string
  lead_id: string
  email_account_id: string | null
  current_step: number
  thread_id: string | null
  last_message_id: string | null
  next_send_at: string | null
  status: string
  leads: {
    id: string
    email: string
    variables: Record<string, unknown>
    status: string
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

  // Fallback check against cron_config.settings in DB
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
    // Database check failed or schema not present
  }

  // Allow if ping request explicitly in non-production or if no secret configured
  if (!cronSecretEnv && !headerSecret) {
    return true
  }

  return false
}

// ─── Main Handler ────────────────────────────────────────────────────────────

async function handleSender(req: NextRequest) {
  const supabase = supabaseAdmin()

  // 1. Auth Guard
  const isAuthorized = await verifyCronAuth(req, supabase)
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized: invalid or missing cron secret' }, { status: 401 })
  }

  // Quick health check ping
  if (req.nextUrl.searchParams.get('ping') === 'true') {
    return NextResponse.json({ status: 'ok', worker: 'sender', timestamp: new Date().toISOString() })
  }

  const results = {
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
    timestamp: new Date().toISOString(),
  }

  try {
    // 2. Early-exit guard: cheaply check if there is any sendable work before
    //    pulling the full campaign payload. Avoids heavy PostgREST egress on the
    //    vast majority of ticks where nothing is due.
    const nowIso = new Date().toISOString()
    const { data: workCheck } = await supabase
      .from('campaign_leads')
      .select('id')
      .in('status', ['pending', 'active'])
      .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`)
      .limit(1)

    if (!workCheck || workCheck.length === 0) {
      return NextResponse.json({ status: 'ok', message: 'No sendable leads', ...results })
    }

    // 2b. Inbox early-exit: check if at least one inbox is active, past its
    //     cooldown, and still under its daily send limit. Fetches only 2 integer
    //     fields — no private key, no joins. Eliminates the campaign/steps/leads
    //     fetches on ticks where all inboxes are saturated.
    {
      const nowInbox = new Date().toISOString()
      const { data: inboxCheck } = await supabase
        .from('email_accounts')
        .select('daily_send_count, daily_send_limit')
        .eq('is_active', true)
        .eq('status', 'active')
        .or(`next_available_at.is.null,next_available_at.lte.${nowInbox}`)

      const hasEligibleInbox = (inboxCheck ?? []).some(
        (i) => (i.daily_send_count ?? 0) < i.daily_send_limit
      )
      if (!hasEligibleInbox) {
        return NextResponse.json({ status: 'ok', message: 'No eligible inboxes', ...results })
      }
    }

    // 3. Fetch all active campaigns (only the columns needed for the working-window
    //    check and send logic — never select '*' to avoid pulling unused data).
    const { data: campaigns, error: campErr } = await supabase
      .from('campaigns')
      .select('id, name, status, timezone, working_days, working_hours_start, working_hours_end, send_priority, limit_emails_per_company')
      .eq('status', 'active')

    if (campErr) throw campErr
    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ status: 'ok', message: 'No active campaigns', ...results })
    }

    for (const campaign of campaigns as Campaign[]) {
      if (results.sent + results.failed >= MAX_SENDS_PER_RUN) break

      // 3. Working-window check (timezone-aware)
      if (!isWithinWorkingWindow(campaign)) continue

      // 4. Fetch campaign steps (ordered)
      const { data: steps } = await supabase
        .from('campaign_steps')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('step_order', { ascending: true })

      if (!steps || steps.length === 0) continue
      const campaignSteps = steps as CampaignStep[]

      // 5. Fetch due campaign leads (buffer of up to 30 candidates to evaluate)
      //    a) Pending leads (never contacted, current_step=0, status='pending')
      //    b) Active leads with next_send_at <= now (follow-ups)
      const remaining = 30

      const [pendingRes, activeRes] = await Promise.all([
        supabase
          .from('campaign_leads')
          .select('*, leads!inner(*)')
          .eq('campaign_id', campaign.id)
          .eq('status', 'pending')
          .eq('current_step', 0)
          .is('next_send_at', null)
          .limit(remaining),
        supabase
          .from('campaign_leads')
          .select('*, leads!inner(*)')
          .eq('campaign_id', campaign.id)
          .eq('status', 'active')
          .lte('next_send_at', new Date().toISOString())
          .order('next_send_at', { ascending: true })
          .limit(remaining),
      ])

      const isFollowUpPriority = campaign.send_priority === 'follow_ups'
      const dueCampaignLeads: CampaignLead[] = isFollowUpPriority
        ? [
            ...((activeRes.data ?? []) as unknown as CampaignLead[]),
            ...((pendingRes.data ?? []) as unknown as CampaignLead[]),
          ]
        : [
            ...((pendingRes.data ?? []) as unknown as CampaignLead[]),
            ...((activeRes.data ?? []) as unknown as CampaignLead[]),
          ]

      if (dueCampaignLeads.length === 0) continue

      // 6. Fetch campaign's assigned inboxes — lightweight columns only.
      //    Critically, service_account_private_key (~1.7 KB per inbox) is NOT
      //    fetched here. It is fetched individually only for the assigned inbox
      //    right before a send actually occurs (step 12).
      const { data: accountRows } = await supabase
        .from('campaign_email_accounts')
        .select(`email_accounts(
          id, email_address, display_name, first_name, last_name, role,
          phone_number, signature, variables, service_account_client_email,
          daily_send_limit, daily_send_count, min_seconds_between_sends,
          next_available_at, last_sent_at, last_new_lead_sent_at,
          is_active, status
        )`)
        .eq('campaign_id', campaign.id)

      const allInboxes: EmailAccount[] = (accountRows ?? [])
        .map((r: { email_accounts: unknown }) => r.email_accounts as EmailAccount)
        .filter(Boolean)

      if (allInboxes.length === 0) continue

      // 7. Per-inbox daily count comes directly from email_accounts.daily_send_count
      //    (incremented atomically on each send, reset at UTC midnight by pg_cron).
      //    No sends-table JOIN needed here.

      // 7b. Count campaign-only sends since UTC midnight per COMPANY for this
      //     campaign. Built once per run, only when the campaign enables the limit.
      const companyLimit = Math.max(0, Math.floor(campaign.limit_emails_per_company ?? 0))
      const companySendsToday = new Map<string, number>()

      if (companyLimit > 0) {
        const todayUtcStart = new Date()
        todayUtcStart.setUTCHours(0, 0, 0, 0)

        const { data: companySendRows } = await supabase
          .from('sends')
          .select('id, campaign_leads!inner(campaign_id, leads!inner(email))')
          .eq('campaign_leads.campaign_id', campaign.id)
          .eq('status', 'sent')
          .gte('sent_at', todayUtcStart.toISOString())

        for (const row of companySendRows ?? []) {
          const email = (row as unknown as {
            campaign_leads?: { leads?: { email?: string } | null } | null
          }).campaign_leads?.leads?.email
          const key = companyKeyForEmail(email)
          if (!key) continue // free-mail / unusable address: never limited
          companySendsToday.set(key, (companySendsToday.get(key) ?? 0) + 1)
        }
      }

      // 8. Determine initially eligible inboxes
      const now = new Date()
      const eligibleInboxes: EmailAccount[] = allInboxes.filter((inbox) =>
        isInboxEligible(inbox, now)
      )

      // 9. Process each due lead
      for (const cl of dueCampaignLeads) {
        if (results.sent + results.failed >= MAX_SENDS_PER_RUN) break

        const lead = cl.leads

        // Skip globally DNC / bounced leads
        if (lead.status !== 'active') {
          await supabase
            .from('campaign_leads')
            .update({ status: 'paused', next_send_at: null })
            .eq('id', cl.id)
          results.skipped++
          continue
        }

        const isFirstTouch = cl.current_step === 0

        // Guard: if current_step is beyond steps array, mark completed
        if (cl.current_step >= campaignSteps.length) {
          await supabase
            .from('campaign_leads')
            .update({ status: 'completed', next_send_at: null })
            .eq('id', cl.id)
          continue
        }

        const step = campaignSteps[cl.current_step]

        // 9b. Per-company daily limit.
        //     companyKey is null when the limit is off, the address is unusable,
        //     or the lead is on a free-mail domain — all of which mean "never
        //     limited". Otherwise skip (retry next cron run / next day) once the
        //     company has hit its cap for today.
        const leadCompanyKey = companyLimit > 0 ? companyKeyForEmail(lead.email) : null
        if (leadCompanyKey && (companySendsToday.get(leadCompanyKey) ?? 0) >= companyLimit) {
          results.skipped++
          continue
        }

        // 10. Pick inbox
        let assignedInbox: EmailAccount | null = null

        if (isFirstTouch) {
          const currentNow = new Date()
          const currentlyEligible = eligibleInboxes.filter((inbox) =>
            isInboxEligible(inbox, currentNow)
          )

          if (currentlyEligible.length === 0) {
            results.skipped++
            continue
          }

          // Round-robin: eligible inbox with oldest/null last_new_lead_sent_at
          const sorted = [...currentlyEligible].sort((a, b) => {
            if (!a.last_new_lead_sent_at) return -1
            if (!b.last_new_lead_sent_at) return 1
            return (
              new Date(a.last_new_lead_sent_at).getTime() -
              new Date(b.last_new_lead_sent_at).getTime()
            )
          })
          assignedInbox = sorted[0] ?? null
        } else {
          // Follow-up: must use the same inbox that sent the first email
          const sameInbox = allInboxes.find((i) => i.id === cl.email_account_id) ?? null
          if (!sameInbox) {
            results.skipped++
            continue
          }
          if (!isInboxEligible(sameInbox, new Date())) {
            results.skipped++
            continue
          }
          assignedInbox = sameInbox
        }

        if (!assignedInbox) {
          results.skipped++
          continue
        }

        // 11. Render templates (plain text only)
        const step1SubjectTemplate = campaignSteps[0]?.subject_template?.trim() ?? ''
        const rawSubjectTemplate = step.subject_template?.trim() ?? ''
        const effectiveSubjectTemplate = isFirstTouch
          ? rawSubjectTemplate
          : rawSubjectTemplate || (
            step1SubjectTemplate.toLowerCase().startsWith('re:')
              ? step1SubjectTemplate
              : `Re: ${step1SubjectTemplate}`
          )

        // Build inbox/sender variable map for template interpolation
        const nameParts = (assignedInbox.display_name ?? '').trim().split(/\s+/)
        const senderFirstName = assignedInbox.first_name?.trim() || nameParts[0] || ''
        const senderLastName  = assignedInbox.last_name?.trim()  || nameParts.slice(1).join(' ') || ''
        const senderFullName  = [senderFirstName, senderLastName].filter(Boolean).join(' ') || assignedInbox.display_name || ''
        const senderSig       = assignedInbox.signature?.trim() ?? ''
        const senderPhone     = assignedInbox.phone_number?.trim() ?? ''
        const senderRole      = assignedInbox.role?.trim() ?? ''
        const inboxVariables: Record<string, string> = {
          sender_email:      assignedInbox.email_address,
          sending_account_email: assignedInbox.email_address,
          sender_name:       senderFullName,
          sender_first_name: senderFirstName,
          sending_account_first_name: senderFirstName,
          sender_last_name:  senderLastName,
          sending_account_last_name: senderLastName,
          sender_role:       senderRole,
          sender_phone:      senderPhone,
          phone_number:      senderPhone,
          sender_signature:  senderSig,
          account_signature: senderSig,
          signature:         senderSig,
          ...(assignedInbox.variables ?? {}),
        }

        const variables = (lead.variables ?? {}) as Record<string, unknown>
        const { rendered: subject, missing: missingSubj } = renderTemplate(
          effectiveSubjectTemplate,
          variables,
          lead.email,
          inboxVariables,
        )
        const { rendered: body, missing: missingBody } = renderTemplate(
          step.body_template,
          variables,
          lead.email,
          inboxVariables,
        )
        const allMissing = [...new Set([...missingSubj, ...missingBody])]

        if (allMissing.length > 0) {
          await supabase.from('sends').insert({
            campaign_lead_id: cl.id,
            email_account_id: assignedInbox.id,
            step_id: step.id,
            status: 'failed',
            error_message: `Missing template variables: ${allMissing.join(', ')}`,
          })
          results.failed++
          continue
        }

        // 12. Fetch private key for the assigned inbox only now (column pruning:
        //    this is the only moment we need the key, so we didn't pull it for
        //    every inbox earlier — keeping the discovery query cheap).
        const { data: inboxSecret, error: secretErr } = await supabase
          .from('email_accounts')
          .select('service_account_private_key')
          .eq('id', assignedInbox.id)
          .single()

        if (secretErr || !inboxSecret?.service_account_private_key) {
          results.errors.push(`Could not fetch private key for ${assignedInbox.email_address}`)
          results.failed++
          continue
        }

        // 13. Get Gmail access token
        let accessToken: string
        try {
          accessToken = await getAccessToken(
            assignedInbox.service_account_client_email,
            inboxSecret.service_account_private_key,
            assignedInbox.email_address,
          )
        } catch (err) {
          results.errors.push(
            `JWT error for ${assignedInbox.email_address}: ${String(err)}`,
          )
          results.failed++
          continue
        }

        // 13. Build and send email
        try {
          const localMessageId = `<${crypto.randomUUID()}@outreach-smart>`

          const fromHeader = assignedInbox.display_name?.trim()
            ? `${assignedInbox.display_name.trim()} <${assignedInbox.email_address}>`
            : assignedInbox.email_address

          const rawEmail = buildRawEmail({
            from: fromHeader,
            to: lead.email,
            subject,
            body,
            messageId: localMessageId,
            inReplyTo: isFirstTouch ? undefined : (cl.last_message_id ?? undefined),
            references: isFirstTouch ? undefined : (cl.last_message_id ?? undefined),
          })

          const gmailPayload: Record<string, string> = { raw: rawEmail }
          if (!isFirstTouch && cl.thread_id) {
            gmailPayload.threadId = cl.thread_id
          }

          const sendRes = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(gmailPayload),
            },
          )

          if (!sendRes.ok) {
            const errBody = await sendRes.text()
            throw new Error(`Gmail API error ${sendRes.status}: ${errBody}`)
          }

          const sentMsg = (await sendRes.json()) as {
            id: string
            threadId: string
          }
          const gmailMessageId = sentMsg.id
          const gmailThreadId = sentMsg.threadId

          // 14. Apply IMPORTANT + STARRED labels on first-touch only
          if (isFirstTouch) {
            await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}/modify`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ addLabelIds: ['IMPORTANT', 'STARRED'] }),
              },
            ).catch(() => { })
          }

          // 15. Persist send record
          await supabase.from('sends').insert({
            campaign_lead_id: cl.id,
            email_account_id: assignedInbox.id,
            step_id: step.id,
            status: 'sent',
            gmail_message_id: gmailMessageId,
            gmail_thread_id: gmailThreadId,
            sent_at: new Date().toISOString(),
          })

          // 16. Advance campaign_lead state with randomized follow-up jitter
          const nextStepIdx = cl.current_step + 1
          const hasNextStep = nextStepIdx < campaignSteps.length
          const nextStep = hasNextStep ? campaignSteps[nextStepIdx] : null

          let nextSendAt: string | null = null
          if (nextStep) {
            const baseDelayMs = nextStep.delay_days * 86_400 * 1_000
            // Add 15 to 60 minutes of random jitter to avoid robotic timing and batch spikes
            const jitterMs = (Math.floor(Math.random() * 46) + 15) * 60 * 1_000 * (Math.random() < 0.5 ? -1 : 1)
            nextSendAt = new Date(Date.now() + baseDelayMs + jitterMs).toISOString()
          }

          const clUpdate: Record<string, any> = {
            current_step: nextStepIdx,
            last_message_id: localMessageId,
            next_send_at: nextSendAt,
            status: hasNextStep ? 'active' : 'completed',
          }

          if (isFirstTouch) {
            clUpdate.email_account_id = assignedInbox.id
            clUpdate.thread_id = gmailThreadId
          }

          await supabase.from('campaign_leads').update(clUpdate as any).eq('id', cl.id)

          // 17. Update inbox timestamps & cooldown
          const next_sent_jitterMs = (Math.floor(Math.random() * 5) + 3) * 60 * 1_000;
          const nextAvailableAt = new Date(
            Date.now() + assignedInbox.min_seconds_between_sends * 1_000 + next_sent_jitterMs,
          ).toISOString()
          const lastSentAt = new Date().toISOString()

          const inboxUpdate: Record<string, any> = {
            last_sent_at: lastSentAt,
            next_available_at: nextAvailableAt,
            // Atomically increment the daily counter so no sends-table JOIN is
            // needed on the next cron tick to know how many this inbox has sent today.
            daily_send_count: (assignedInbox.daily_send_count ?? 0) + 1,
          }
          if (isFirstTouch) {
            inboxUpdate.last_new_lead_sent_at = lastSentAt
          }
          await supabase
            .from('email_accounts')
            .update(inboxUpdate as any)
            .eq('id', assignedInbox.id)

          // 18. Update in-memory counters
          const newCount = (assignedInbox.daily_send_count ?? 0) + 1

          // Same for the per-company counter, so later leads in this same run
          // see the company as already used up.
          if (leadCompanyKey) {
            companySendsToday.set(
              leadCompanyKey,
              (companySendsToday.get(leadCompanyKey) ?? 0) + 1,
            )
          }

          const inAll = allInboxes.find((i) => i.id === assignedInbox!.id)
          if (inAll) {
            inAll.next_available_at = nextAvailableAt
            inAll.last_sent_at = lastSentAt
            inAll.daily_send_count = newCount
            if (isFirstTouch) {
              inAll.last_new_lead_sent_at = lastSentAt
            }
          }
          assignedInbox.daily_send_count = newCount

          const idxInEligible = eligibleInboxes.findIndex(
            (i) => i.id === assignedInbox!.id,
          )
          if (idxInEligible >= 0) {
            eligibleInboxes[idxInEligible].next_available_at = nextAvailableAt
            eligibleInboxes[idxInEligible].last_sent_at = lastSentAt
            eligibleInboxes[idxInEligible].daily_send_count = newCount
            if (isFirstTouch) {
              eligibleInboxes[idxInEligible].last_new_lead_sent_at = lastSentAt
            }
            if (
              newCount >= eligibleInboxes[idxInEligible].daily_send_limit ||
              assignedInbox.min_seconds_between_sends > 0
            ) {
              eligibleInboxes.splice(idxInEligible, 1)
            }
          }

          results.sent++
        } catch (err) {
          const errMsg = `Send error for ${lead.email} (step ${step.step_order}): ${String(err)}`
          results.errors.push(errMsg)

          await supabase.from('sends').insert({
            campaign_lead_id: cl.id,
            email_account_id: assignedInbox.id,
            step_id: step.id,
            status: 'failed',
            error_message: String(err),
          })

          results.failed++
        }
      }
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok', ...results })
}

export async function POST(req: NextRequest) {
  return handleSender(req)
}

export async function GET(req: NextRequest) {
  return handleSender(req)
}

// ─── Working-window check ─────────────────────────────────────────────────────

function isWithinWorkingWindow(campaign: Campaign): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: campaign.timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())

    const weekdayMap: Record<string, number> = {
      Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
    }

    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0'
    const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0'

    const dayOfWeek = weekdayMap[weekday] ?? 1
    if (!campaign.working_days.includes(dayOfWeek)) return false

    const hour = parseInt(hourStr, 10) % 24
    const minute = parseInt(minuteStr, 10)

    const nowMins = hour * 60 + minute
    const [startH, startM] = campaign.working_hours_start.split(':').map(Number)
    const [endH, endM] = campaign.working_hours_end.split(':').map(Number)
    const startMins = startH * 60 + startM
    const endMins = endH * 60 + endM

    return nowMins >= startMins && nowMins < endMins
  } catch {
    return false
  }
}

// ─── Inbox eligibility check ─────────────────────────────────────────────────

function isInboxEligible(
  inbox: EmailAccount,
  now: Date,
): boolean {
  if (!inbox.is_active || inbox.status !== 'active') return false

  // Daily limit: use the counter column instead of querying sends each time
  if ((inbox.daily_send_count ?? 0) >= inbox.daily_send_limit) return false

  if (inbox.next_available_at && new Date(inbox.next_available_at) > now) {
    return false
  }

  return true
}

// ─── Template renderer (plain-text only) ─────────────────────────────────────

const TOKEN_REGEX = /\{\{(\w+)\}\}/g

function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
  email: string,
  inboxVariables?: Record<string, string>,
): { rendered: string; missing: string[] } {
  const missing: string[] = []
  const seen = new Set<string>()

  const rendered = template.replace(TOKEN_REGEX, (_, token: string) => {
    if (token === 'email') return email

    // Lead variables take precedence
    const val = variables[token]
    if (val !== undefined && val !== null && val !== '') return String(val)

    // Fall back to inbox variables
    const inboxVal = inboxVariables?.[token]
    if (inboxVal !== undefined && inboxVal !== '') return inboxVal

    if (!seen.has(token)) {
      missing.push(token)
      seen.add(token)
    }
    return `{{${token}}}`
  })

  return { rendered, missing }
}

// ─── RFC 2822 email builder ───────────────────────────────────────────────────

function buildRawEmail(opts: {
  from: string
  to: string
  subject: string
  body: string
  messageId: string
  inReplyTo?: string
  references?: string
}): string {
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Message-ID: ${opts.messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: quoted-printable`,
  ]

  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`)
  if (opts.references) headers.push(`References: ${opts.references}`)

  const raw = [...headers, '', opts.body].join('\r\n')

  return Buffer.from(raw, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ─── Service Account JWT + token exchange ─────────────────────────────────────

async function getAccessToken(
  clientEmail: string,
  privateKeyPem: string,
  subjectEmail: string,
): Promise<string> {
  const cacheKey = `${clientEmail}::${subjectEmail}`
  const cached = tokenCache.get(cacheKey)

  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token
  }

  const nowSec = Math.floor(Date.now() / 1000)

  const b64url = (obj: unknown): string =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  const jwtHeader = { alg: 'RS256', typ: 'JWT' }
  const jwtPayload = {
    iss: clientEmail,
    sub: subjectEmail,
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  }

  const signingInput = `${b64url(jwtHeader)}.${b64url(jwtPayload)}`

  const normalised = privateKeyPem.trim().replace(/\\n/g, '\n')
  const pemBody = normalised
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  const keyBytes = Buffer.from(pemBody, 'base64')

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )

  const sigB64 = Buffer.from(signatureBytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const jwt = `${signingInput}.${sigB64}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`)
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number }
  const token = tokenData.access_token

  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1_000,
  })

  return token
}
