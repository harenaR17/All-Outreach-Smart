import { type NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  getCachedGmailAccessToken,
  fetchGmailThread,
  syncThreadMessages,
} from '@/lib/google/gmail-thread'

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface CampaignLeadRow {
  id: string
  thread_id: string
  status: string
  last_thread_synced_at?: string | null
  email_accounts: {
    id: string
    email_address: string
    service_account_client_email: string
    service_account_private_key: string
  } | null
}

// ─── Queue Batching & Concurrency ────────────────────────────────────────────

const BATCH_SIZE = 100
const CONCURRENCY = 5

// ─── Auth Verification ───────────────────────────────────────────────────────

async function verifyCronAuth(req: NextRequest, supabase: ReturnType<typeof supabaseAdmin>): Promise<boolean> {
  const headerSecret =
    req.headers.get('x-cron-secret') ||
    req.headers.get('cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  const cronSecretEnv = process.env.CRON_SECRET

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

async function handleThreadSync(req: NextRequest) {
  const supabase = supabaseAdmin()

  // 1. Auth Guard
  const isAuthorized = await verifyCronAuth(req, supabase)
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized: invalid or missing cron secret' }, { status: 401 })
  }

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
      .select(`
        id,
        thread_id,
        status,
        last_thread_synced_at,
        email_accounts (
          id,
          email_address,
          service_account_client_email,
          service_account_private_key
        )
      `)
      .eq('status', 'replied')
      .not('thread_id', 'is', null)
      .order('last_thread_synced_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE)

    if (leadsErr) throw leadsErr

    if (!candidateLeads || candidateLeads.length === 0) {
      return NextResponse.json({ status: 'ok', message: 'No replied threads to sync', ...results })
    }

    const eligibleLeads = (candidateLeads as unknown as CampaignLeadRow[]).filter((cl) => {
      const inbox = cl.email_accounts
      return Boolean(
        inbox?.email_address &&
        inbox?.service_account_client_email &&
        inbox?.service_account_private_key
      )
    })

    results.leadsChecked = eligibleLeads.length

    // 3. Process eligible leads in concurrent chunks of 5
    for (let i = 0; i < eligibleLeads.length; i += CONCURRENCY) {
      const chunk = eligibleLeads.slice(i, i + CONCURRENCY)
      await Promise.all(
        chunk.map(async (cl) => {
          try {
            const inbox = cl.email_accounts!

            const token = await getCachedGmailAccessToken(
              inbox.service_account_client_email,
              inbox.service_account_private_key,
              inbox.email_address,
            )

            const threadRes = await fetchGmailThread(cl.thread_id, token)
            if (!threadRes.ok) {
              results.errors.push(threadRes.error)
              return
            }

            const syncResult = await syncThreadMessages(
              supabase,
              cl.id,
              threadRes.messages,
              inbox.email_address,
            )
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
    return NextResponse.json({ error: message, ...results }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok', ...results })
}

export async function GET(req: NextRequest) {
  return handleThreadSync(req)
}

export async function POST(req: NextRequest) {
  return handleThreadSync(req)
}
