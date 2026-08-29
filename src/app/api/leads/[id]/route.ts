import { type NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { authenticate } from '@/lib/api-auth'
import type { LeadUpdate } from '@/lib/types/database'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_STATUSES = ['active', 'do_not_contact', 'bounced'] as const

// ─── GET /api/leads/:id ───────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteContext) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = supabaseAdmin()

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ lead: data })
}

// ─── PATCH /api/leads/:id ─────────────────────────────────────────────────────
//
// Accepts: { variables?, status?, status_reason? }
// variables are merged (shallow), not replaced wholesale.

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const updates: LeadUpdate = {}

  if (body.variables !== undefined) {
    if (typeof body.variables !== 'object' || body.variables === null || Array.isArray(body.variables)) {
      return NextResponse.json({ error: 'variables must be an object' }, { status: 400 })
    }

    // Shallow-merge variables with existing rather than replacing wholesale
    const supabase = supabaseAdmin()
    const { data: existing } = await supabase.from('leads').select('variables').eq('id', id).maybeSingle()
    const merged = {
      ...(existing?.variables as Record<string, string | number | boolean | null> ?? {}),
      ...(body.variables as Record<string, string | number | boolean | null>),
    }
    updates.variables = merged
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }
    updates.status = body.status as 'active' | 'do_not_contact' | 'bounced'
    updates.status_reason = typeof body.status_reason === 'string' ? body.status_reason : 'Set via API'
    updates.status_changed_at = new Date().toISOString()
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ lead: data })
}

// ─── DELETE /api/leads/:id ────────────────────────────────────────────────────
//
// Soft delete — sets status = 'do_not_contact'.
// Does NOT remove the row or cascade through campaign_leads/sends/replies.
// The full send/reply history is preserved; only future outreach is blocked.

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = supabaseAdmin()

  const { data, error } = await supabase
    .from('leads')
    .update({
      status: 'do_not_contact',
      status_reason: 'Removed via API',
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ lead: data })
}
