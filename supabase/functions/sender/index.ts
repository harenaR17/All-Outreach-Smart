/**
 * Outreach Smart — Sender Edge Function
 *
 * Invoked roughly every minute via Supabase Cron.
 * Processes due campaign emails, enforces rate limits (campaign-sends only),
 * handles new-lead round-robin rotation and follow-up thread continuity,
 * and applies IMPORTANT + STARRED Gmail labels on first-touch emails.
 *
 * IMPORTANT: daily_send_limit counts only emails sent via campaigns (rows in
 * the `sends` table). External warmup emails are never counted.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Module-level JWT token cache ───────────────────────────────────────────
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

// ─── Hard cap per invocation to stay within edge function timeout ────────────
const MAX_SENDS_PER_RUN = 20

// ─── Types ───────────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  name: string
  status: string
  timezone: string
  working_days: number[]
  working_hours_start: string
  working_hours_end: string
}

interface EmailAccount {
  id: string
  email_address: string
  service_account_client_email: string
  service_account_private_key: string
  daily_send_limit: number
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

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // 1. Shared-secret guard
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
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const results = {
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
    timestamp: new Date().toISOString(),
  }

  try {
    // 2. Fetch all active campaigns
    const { data: campaigns, error: campErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'active')

    if (campErr) throw campErr
    if (!campaigns || campaigns.length === 0) {
      return jsonResponse({ status: 'ok', message: 'No active campaigns', ...results })
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

      // 5. Fetch due campaign leads
      //    a) Pending leads (never contacted, current_step=0, status='pending')
      //    b) Active leads with next_send_at <= now (follow-ups)
      const remaining = MAX_SENDS_PER_RUN - results.sent - results.failed

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

      const dueCampaignLeads: CampaignLead[] = [
        ...((pendingRes.data ?? []) as CampaignLead[]),
        ...((activeRes.data ?? []) as CampaignLead[]),
      ]

      if (dueCampaignLeads.length === 0) continue

      // 6. Fetch campaign's assigned inboxes
      const { data: accountRows } = await supabase
        .from('campaign_email_accounts')
        .select('email_accounts(*)')
        .eq('campaign_id', campaign.id)

      const allInboxes: EmailAccount[] = (accountRows ?? [])
        .map((r: { email_accounts: unknown }) => r.email_accounts as EmailAccount)
        .filter(Boolean)

      if (allInboxes.length === 0) continue

      // 7. Count campaign-only sends since UTC midnight per inbox
      //    (does NOT count warmup emails sent outside this system)
      const todayUtcStart = new Date()
      todayUtcStart.setUTCHours(0, 0, 0, 0)

      const { data: sendRows } = await supabase
        .from('sends')
        .select('email_account_id')
        .eq('status', 'sent')
        .gte('sent_at', todayUtcStart.toISOString())
        .in('email_account_id', allInboxes.map((i) => i.id))

      // Build mutable sends-today counter
      const sendsToday = new Map<string, number>()
      for (const row of sendRows ?? []) {
        const key = (row as { email_account_id: string }).email_account_id
        sendsToday.set(key, (sendsToday.get(key) ?? 0) + 1)
      }

      // 8. Determine initially eligible inboxes
      const now = new Date()
      const eligibleInboxes: EmailAccount[] = allInboxes.filter((inbox) =>
        isInboxEligible(inbox, sendsToday, now)
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

        // 10. Pick inbox
        let assignedInbox: EmailAccount | null = null

        if (isFirstTouch) {
          // Re-evaluate inboxes that are eligible right now (cooldown + daily limit)
          const currentNow = new Date()
          const currentlyEligible = eligibleInboxes.filter((inbox) =>
            isInboxEligible(inbox, sendsToday, currentNow)
          )

          if (currentlyEligible.length === 0) {
            // No inboxes ready right now; will retry on next cron run
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
          // Skip (retry next minute) if that specific inbox is in cooldown or hit limit right now
          if (!isInboxEligible(sameInbox, sendsToday, new Date())) {
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
        // For follow-ups, if subject_template is empty, inherit from Step 1 with "Re: " prefix
        const step1SubjectTemplate = campaignSteps[0]?.subject_template?.trim() ?? ''
        const rawSubjectTemplate = step.subject_template?.trim() ?? ''
        const effectiveSubjectTemplate = isFirstTouch
          ? rawSubjectTemplate
          : rawSubjectTemplate || (
              step1SubjectTemplate.toLowerCase().startsWith('re:')
                ? step1SubjectTemplate
                : `Re: ${step1SubjectTemplate}`
            )

        const variables = (lead.variables ?? {}) as Record<string, unknown>
        const { rendered: subject, missing: missingSubj } = renderTemplate(
          effectiveSubjectTemplate,
          variables,
          lead.email,
        )
        const { rendered: body, missing: missingBody } = renderTemplate(
          step.body_template,
          variables,
          lead.email,
        )
        const allMissing = [...new Set([...missingSubj, ...missingBody])]

        // If any variables are missing, log a failed send and move on without advancing
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

        // 12. Get Gmail access token (with in-memory cache)
        let accessToken: string
        try {
          accessToken = await getAccessToken(
            assignedInbox.service_account_client_email,
            assignedInbox.service_account_private_key,
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
          // Generate a unique Message-ID for this send
          const localMessageId = `<${crypto.randomUUID()}@outreach-smart>`

          const rawEmail = buildRawEmail({
            from: assignedInbox.email_address,
            to: lead.email,
            subject,
            body,
            messageId: localMessageId,
            // Include threading headers on follow-ups
            inReplyTo: isFirstTouch ? undefined : (cl.last_message_id ?? undefined),
            references: isFirstTouch ? undefined : (cl.last_message_id ?? undefined),
          })

          // Build Gmail API payload
          const gmailPayload: Record<string, string> = { raw: rawEmail }
          if (!isFirstTouch && cl.thread_id) {
            gmailPayload.threadId = cl.thread_id
          }

          // Send via Gmail API
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

          const sentMsg = await sendRes.json() as {
            id: string
            threadId: string
          }
          const gmailMessageId = sentMsg.id
          const gmailThreadId = sentMsg.threadId

          // 14. Apply IMPORTANT + STARRED labels on first-touch only
          //     This distinguishes outreach from warmup emails in the inbox view.
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
            ).catch(() => {
              // Non-fatal: labeling failure doesn't block the send record
            })
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
            const jitterMs = (Math.floor(Math.random() * 46) + 15) * 60 * 1_000
            nextSendAt = new Date(Date.now() + baseDelayMs + jitterMs).toISOString()
          }

          const clUpdate: Record<string, unknown> = {
            current_step: nextStepIdx,
            last_message_id: localMessageId,
            next_send_at: nextSendAt,
            status: hasNextStep ? 'active' : 'completed',
          }

          if (isFirstTouch) {
            // Assign inbox and thread ID permanently on first touch
            clUpdate.email_account_id = assignedInbox.id
            clUpdate.thread_id = gmailThreadId
          }

          await supabase.from('campaign_leads').update(clUpdate).eq('id', cl.id)

          // 17. Update inbox timestamps & cooldown
          const nextAvailableAt = new Date(
            Date.now() + assignedInbox.min_seconds_between_sends * 1_000,
          ).toISOString()
          const lastSentAt = new Date().toISOString()

          const inboxUpdate: Record<string, unknown> = {
            last_sent_at: lastSentAt,
            next_available_at: nextAvailableAt,
          }
          if (isFirstTouch) {
            inboxUpdate.last_new_lead_sent_at = lastSentAt
          }
          await supabase
            .from('email_accounts')
            .update(inboxUpdate)
            .eq('id', assignedInbox.id)

          // 18. Update in-memory inbox state for the rest of this run
          const todayCount = sendsToday.get(assignedInbox.id) ?? 0
          const newCount = todayCount + 1
          sendsToday.set(assignedInbox.id, newCount)

          // Keep in-memory allInboxes updated
          const inAll = allInboxes.find((i) => i.id === assignedInbox!.id)
          if (inAll) {
            inAll.next_available_at = nextAvailableAt
            inAll.last_sent_at = lastSentAt
            if (isFirstTouch) {
              inAll.last_new_lead_sent_at = lastSentAt
            }
          }

          // Update eligibleInboxes pool (remove if in cooldown or daily limit reached)
          const idxInEligible = eligibleInboxes.findIndex(
            (i) => i.id === assignedInbox!.id,
          )
          if (idxInEligible >= 0) {
            eligibleInboxes[idxInEligible].next_available_at = nextAvailableAt
            eligibleInboxes[idxInEligible].last_sent_at = lastSentAt
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
    return jsonResponse({ error: String(err) }, 500)
  }

  return jsonResponse({ status: 'ok', ...results })
})

// ─── Working-window check ─────────────────────────────────────────────────────

function isWithinWorkingWindow(campaign: Campaign): boolean {
  try {
    // Use Intl to get localised time parts in the campaign's timezone
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: campaign.timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())

    // ISO-8601 weekday: 1=Monday … 7=Sunday
    // Intl 'short' weekday in en-US: Mon, Tue, Wed, Thu, Fri, Sat, Sun
    const weekdayMap: Record<string, number> = {
      Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
    }

    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0'
    const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0'

    const dayOfWeek = weekdayMap[weekday] ?? 1
    if (!campaign.working_days.includes(dayOfWeek)) return false

    // Handle '24' as midnight edge-case from Intl
    const hour = parseInt(hourStr) % 24
    const minute = parseInt(minuteStr)

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
  sendsToday: Map<string, number>,
  now: Date,
): boolean {
  if (!inbox.is_active || inbox.status !== 'active') return false

  // Daily limit uses campaign-sends-only count (not warmup traffic)
  const todayCount = sendsToday.get(inbox.id) ?? 0
  if (todayCount >= inbox.daily_send_limit) return false

  // Per-inbox cooldown
  if (inbox.next_available_at && new Date(inbox.next_available_at) > now)
    return false

  return true
}

// ─── Template renderer (plain-text only) ─────────────────────────────────────

const TOKEN_REGEX = /\{\{(\w+)\}\}/g

function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
  email: string,
): { rendered: string; missing: string[] } {
  const missing: string[] = []
  const seen = new Set<string>()

  const rendered = template.replace(TOKEN_REGEX, (_, token: string) => {
    if (token === 'email') return email

    const val = variables[token]
    if (val !== undefined && val !== null && val !== '') return String(val)

    if (!seen.has(token)) {
      missing.push(token)
      seen.add(token)
    }
    return `{{${token}}}` // leave placeholder visible, not a blank
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

  // Base64url-encode per Gmail API requirement
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ─── Service Account JWT + token exchange (with module-level cache) ───────────

async function getAccessToken(
  clientEmail: string,
  privateKeyPem: string,
  subjectEmail: string,
): Promise<string> {
  const cacheKey = `${clientEmail}::${subjectEmail}`
  const cached = tokenCache.get(cacheKey)

  // Reuse cached token if it doesn't expire within the next 60 seconds
  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token
  }

  const nowSec = Math.floor(Date.now() / 1000)

  // Build JWT header and payload
  const b64url = (obj: unknown): string =>
    btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
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

  // Normalise PEM key (handle \n literals from DB storage)
  const normalised = privateKeyPem.trim().replace(/\\n/g, '\n')
  const pemBody = normalised
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const jwt = `${signingInput}.${sigB64}`

  // Exchange JWT for Google access token
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

  const tokenData = await tokenRes.json() as { access_token: string; expires_in: number }
  const token = tokenData.access_token

  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1_000,
  })

  return token
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
