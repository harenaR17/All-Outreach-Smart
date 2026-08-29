import { type NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { authenticate } from '@/lib/api-auth'
import type { Lead } from '@/lib/types/database'

// ─── POST /api/leads ──────────────────────────────────────────────────────────
//
// Upserts a lead by email and optionally enrolls it in a campaign.
//
// Body parameters:
//   email                 (required) Lead email address
//   variables             (optional) Key/value pairs, merged on conflict
//   campaign_id           (optional) UUID — if provided, enrolls lead in that campaign
//   skip_if_in_lead_list  (optional, default: true)  — if true and email already exists,
//                          return the existing lead without updating variables
//   skip_if_in_campaign   (optional, default: true)  — if true and lead already enrolled
//                          in campaign_id, skip enrollment (no-op, no re-queue)

export async function POST(req: NextRequest) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { email, variables, campaign_id } = body
  const skipIfInLeadList: boolean = body.skip_if_in_lead_list !== false  // default true
  const skipIfInCampaign: boolean = body.skip_if_in_campaign !== false   // default true

  if (!email || typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const supabase = supabaseAdmin()

  // ── 1. skip_if_in_lead_list: return existing lead without touching it ──────
  if (skipIfInLeadList) {
    const { data: existing } = await supabase
      .from('leads')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ lead: existing, enrollment: null, skipped: true }, { status: 200 })
    }
  }

  // ── 2. Upsert lead (create or update variables on email conflict) ──────────
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .upsert(
      {
        email: email.trim().toLowerCase(),
        variables: (variables as Record<string, string | number | boolean | null>) ?? {},
      },
      { onConflict: 'email' }
    )
    .select()
    .single()

  if (leadError || !lead) {
    return NextResponse.json(
      { error: leadError?.message ?? 'Failed to upsert lead' },
      { status: 500 }
    )
  }

  const typedLead = lead as Lead

  // ── 3. Guard: blocked leads cannot be re-enrolled ─────────────────────────
  if (campaign_id && (typedLead.status === 'do_not_contact' || typedLead.status === 'bounced')) {
    return NextResponse.json(
      {
        lead: typedLead,
        enrollment: null,
        skipped: false,
        warning: `Lead is blocked (status: ${typedLead.status}) — campaign enrollment skipped`,
      },
      { status: 200 }
    )
  }

  // ── 4. Optional campaign enrollment ───────────────────────────────────────
  let enrollment = null

  if (campaign_id && typeof campaign_id === 'string') {
    if (skipIfInCampaign) {
      // INSERT … ON CONFLICT DO NOTHING — no-op if already enrolled
      const { data: cl, error: clError } = await supabase
        .from('campaign_leads')
        .insert({
          campaign_id,
          lead_id: typedLead.id,
          status: 'active',
          next_send_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle()

      if (clError && !clError.message.includes('duplicate')) {
        return NextResponse.json(
          { lead: typedLead, warning: `Lead saved, but enrollment failed: ${clError.message}` },
          { status: 207 }
        )
      }
      enrollment = cl ?? null
    } else {
      // Upsert — re-queue existing enrollment (reset status + next_send_at)
      const { data: cl, error: clError } = await supabase
        .from('campaign_leads')
        .upsert(
          {
            campaign_id,
            lead_id: typedLead.id,
            status: 'active',
            next_send_at: new Date().toISOString(),
          },
          { onConflict: 'campaign_id,lead_id' }
        )
        .select()
        .maybeSingle()

      if (clError) {
        return NextResponse.json(
          { lead: typedLead, warning: `Lead saved, but enrollment failed: ${clError.message}` },
          { status: 207 }
        )
      }
      enrollment = cl ?? null
    }
  }

  return NextResponse.json({ lead: typedLead, enrollment, skipped: false }, { status: 201 })
}

// ─── GET /api/leads ───────────────────────────────────────────────────────────
//
// List / filter leads.
// Query params: email (exact match), status, limit (max 200, default 50)

export async function GET(req: NextRequest) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  const status = searchParams.get('status')
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200)

  const supabase = supabaseAdmin()
  let query = supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(limit)

  if (email) query = query.eq('email', email.trim().toLowerCase())
  if (status) query = query.eq('status', status as 'active' | 'do_not_contact' | 'bounced')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ leads: data ?? [] })
}
