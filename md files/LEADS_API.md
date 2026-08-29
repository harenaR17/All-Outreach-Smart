# Public Leads API — Addon to the Build Plan

Adds an externally-callable CRUD API for leads, on top of whatever the dashboard's own
Phase 2 pages already do internally. This is a meaningful scope change from Phase 2 as
originally written: that phase assumed the dashboard's own pages were the only caller,
which meant no API-level auth was needed (the deployment-level privacy in the main
plan's §8 was protection enough). An externally-callable API can't lean on that — it
has to be reachable from wherever the calling tool runs, so it needs its own
authentication.

## 1. Why this needs its own auth

The main plan's whole "no login" design leans on keeping the dashboard off the public
internet. A public API breaks that assumption on purpose — a website's contact form, a
script, or a Zapier-style integration needs to reach this endpoint from wherever *they*
run, which means the endpoint itself has to be reachable, which means anyone who finds
the URL could otherwise create, read, or edit leads freely. So: a bearer API key, checked
on every request, independent of anything else in the app.

Keys are stored as a hash, not plaintext — this is a genuinely external-facing credential
now, unlike the Gmail service-account keys or Gemini keys, which are *outbound*
credentials the app itself uses (and therefore needs in a usable form). This one is
*inbound*: the app only ever needs to verify a presented key matches, never use it
itself, so there's no reason to keep it recoverable. SHA-256 (not bcrypt) is the right
tool here — bcrypt's slow hashing exists to resist brute-forcing low-entropy human
passwords; API keys are already high-entropy random tokens, so a fast hash is standard
practice (this is how GitHub- and Stripe-style tokens are typically stored).

## 2. Schema addition

Validated against Postgres.

```sql
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  label text,
  key_hash text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
```

Multiple keys, each labeled by integration ("Website contact form", "Zapier"), so any
one integration's access can be revoked without touching the others — same pattern as
the Telegram recipients and Gemini keys tables elsewhere in this plan.

## 3. Endpoints

| Method | Path              | Behavior |
| ------ | ----------------- | -------- |
| `POST`   | `/api/leads`        | Create or update a lead by email (upsert), optionally enrolling it into a campaign in the same call. |
| `GET`    | `/api/leads`        | List leads. Query params: `email` (exact lookup), `status`, `limit` (max 200). |
| `GET`    | `/api/leads/:id`    | Fetch a single lead. |
| `PATCH`  | `/api/leads/:id`    | Update `variables` and/or `status`. |
| `DELETE` | `/api/leads/:id`    | **Soft** delete — see below. |

**`POST` upserts, the bulk CSV import doesn't — deliberately.** The Phase 2 spreadsheet
import skips existing emails on purpose (you're re-uploading a list, duplicates are
noise). A single API call naming one specific lead is different: if a website visitor
resubmits a form with updated info, the sensible behavior is to update that lead's
`variables`, not silently ignore the new submission. Both are "correct" dedup
behavior for their own context.

**`POST` can enroll into a campaign in the same call.** Passing a `campaign_id` creates
the `campaign_leads` row too (or does nothing if that lead's already enrolled in that
campaign — same composite-conflict pattern as everywhere else in this plan), with
`next_send_at` set to right now so it picks up in the sender's normal next pass, subject
to that campaign's usual working-hours and inbox-rotation rules. This is what makes
"website form → straight into a nurture campaign" a single call instead of two.

**`DELETE` is a soft delete, not a real one — this is a deliberate deviation from what
DELETE usually means, worth understanding before wiring anything up to it.** The main
schema has `campaign_leads.lead_id references leads(id) on delete cascade` — an actual
row deletion would cascade through `campaign_leads` into `sends` and `replies`,
permanently erasing that lead's entire send/reply history across every campaign it was
ever part of. `DELETE` here instead sets `status = 'do_not_contact'`, which is what an
external caller almost always actually wants ("stop contacting this person") without
the silent, irreversible history loss. If a caller genuinely needs to purge a row
entirely later, that should be a separate, explicit action — not the default behavior
of a REST verb doing what REST verbs usually do.

## 4. Route handlers

Syntax-checked with esbuild; not live-tested against a running Next.js app in this
environment. `authenticate()` is duplicated across both files below for clarity — in
the real app it should live in one shared module (e.g. `lib/api-auth.ts`) and be
imported by both.

```typescript
// app/api/leads/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function hashKey(rawKey: string): Promise<string> {
  const data = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function authenticate(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;

  const rawKey = authHeader.slice('Bearer '.length).trim();
  const hash = await hashKey(rawKey);

  const { data } = await supabase
    .from('api_keys')
    .select('id')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) return false;

  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return true;
}

export async function POST(req: NextRequest) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { email, variables, campaign_id } = body ?? {};

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .upsert({ email, variables: variables ?? {} }, { onConflict: 'email' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let enrollment = null;
  if (campaign_id) {
    const { data: cl, error: clError } = await supabase
      .from('campaign_leads')
      .upsert(
        {
          campaign_id,
          lead_id: lead.id,
          status: 'active',
          next_send_at: new Date().toISOString(),
        },
        { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true },
      )
      .select()
      .maybeSingle();

    if (clError) {
      return NextResponse.json(
        { lead, warning: `Lead saved, but enrollment failed: ${clError.message}` },
        { status: 207 },
      );
    }
    enrollment = cl;
  }

  return NextResponse.json({ lead, enrollment }, { status: 201 });
}

export async function GET(req: NextRequest) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const status = searchParams.get('status');
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

  let query = supabase.from('leads').select('*').limit(limit);
  if (email) query = query.eq('email', email);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data });
}
```

```typescript
// app/api/leads/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function hashKey(rawKey: string): Promise<string> {
  const data = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function authenticate(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const hash = await hashKey(authHeader.slice('Bearer '.length).trim());
  const { data } = await supabase
    .from('api_keys')
    .select('id')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .maybeSingle();
  if (!data) return false;
  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return true;
}

type RouteParams = { params: { id: string } };

export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { data, error } = await supabase.from('leads').select('*').eq('id', params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ lead: data });
}

const VALID_STATUSES = ['active', 'do_not_contact', 'bounced'];

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.variables !== undefined) updates.variables = body.variables;

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }
    updates.status = body.status;
    updates.status_reason = body.status_reason ?? 'Set via API';
    updates.status_changed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', params.id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ lead: data });
}

// Soft delete -- see section 3 above for why this doesn't remove the row.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('leads')
    .update({
      status: 'do_not_contact',
      status_reason: 'Removed via API',
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ lead: data });
}
```

## 5. Key generation and display

Generate a random token with a recognizable prefix (e.g. `outreach_live_` followed by
32 random hex characters from `crypto.randomUUID()` twice concatenated, or
`crypto.getRandomValues`), show the **raw** key to the user exactly once at creation
time, then store only its hash. This mirrors how Stripe/GitHub-style tokens work, and
the prefix makes an accidentally-committed key easy to grep for. After creation, the
settings page should only ever show a label and a masked/truncated form — never the raw
value again.

## 6. Rate limiting and abuse protection

Not built into the code above — worth having before this is genuinely public, but
proportional to actual risk: this is a low-volume outreach tool's API, not a
high-traffic public service. A simple per-key request cap (checked against a small
counter table, or an external store like Upstash Redis if deployed on Vercel) is enough;
full-blown rate-limiting infrastructure would be over-building for the likely traffic
here. Flagged as a Phase 2 checklist item below rather than skipped entirely.

## 7. Additions to the Phase 2 checklist in the main plan

- [ ] Build the `api_keys` table and a settings-page section to create/label/deactivate keys
- [ ] Implement key generation: random token with a recognizable prefix, shown once, stored as a SHA-256 hash
- [ ] Build `POST /api/leads` (upsert by email, optional campaign enrollment)
- [ ] Build `GET /api/leads` (list/filter) and `GET /api/leads/:id`
- [ ] Build `PATCH /api/leads/:id` (variables and/or status)
- [ ] Build `DELETE /api/leads/:id` as a soft delete (sets `do_not_contact`) — confirm this is documented clearly enough that nobody wiring up an integration expects a hard delete
- [ ] Add a basic per-key request cap

**Done when:** a request with no key or a revoked key gets a 401, a valid key can create
a lead and enroll it into a real campaign in one call, and calling `DELETE` on a lead
leaves its send/reply history intact while stopping further sends.

## 8. Assumptions worth flagging

- Auth is a single bearer token per integration, not OAuth or scoped permissions — every
  key can do everything (create, read, update, soft-delete). Fine for a handful of
  trusted integrations; would need real scoping if this ever serves untrusted third
  parties.
- `PATCH` allows setting `status` directly, including back to `active` — an integration
  could theoretically un-suppress a `do_not_contact` lead. If that's a concern, restrict
  `PATCH` to only ever move status toward more restrictive values, not less.