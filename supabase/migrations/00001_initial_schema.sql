-- ============================================================================
-- Cold outreach dashboard — schema
-- Service-account auth only. No login / no RLS.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- email_accounts: connected sending inboxes (service account only)
-- ----------------------------------------------------------------------------
create table if not exists email_accounts (
  id uuid primary key default gen_random_uuid(),
  email_address text not null unique,
  display_name text,

  service_account_client_email text not null,
  service_account_private_key text not null,

  google_access_token text,
  google_token_expires_at timestamptz,

  status text not null default 'active' check (status in ('active', 'error')),
  error_message text,

  daily_send_limit integer not null default 30,
  min_seconds_between_sends integer not null default 180,
  next_available_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_new_lead_sent_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on column email_accounts.daily_send_limit is
  'Editable per inbox, default 30. Never overridden by campaign or queue pressure — hitting it means this inbox waits until the next UTC day.';
comment on column email_accounts.min_seconds_between_sends is
  'Editable per inbox, default 180 (3 minutes). Minimum gap before this specific inbox is reused, regardless of anything else.';
comment on column email_accounts.last_sent_at is
  'Updated on every send (new-lead or follow-up). Used with min_seconds_between_sends for the per-inbox cooldown.';
comment on column email_accounts.last_new_lead_sent_at is
  'Updated ONLY when this inbox starts a brand-new lead. Drives equal distribution specifically among new-lead assignments, independent of follow-up volume — see §10.';

-- ----------------------------------------------------------------------------
-- campaigns
-- ----------------------------------------------------------------------------
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'completed')),
  timezone text not null default 'UTC',
  working_days smallint[] not null default '{1,2,3,4,5}',
  working_hours_start time not null default '09:00',
  working_hours_end time not null default '17:00',
  created_at timestamptz not null default now()
);

comment on column campaigns.working_days is 'ISO-8601 weekday numbers, 1=Monday .. 7=Sunday.';

-- ----------------------------------------------------------------------------
-- lead_imports: one row per spreadsheet upload, for dedup reporting
-- ----------------------------------------------------------------------------
create table if not exists lead_imports (
  id uuid primary key default gen_random_uuid(),
  filename text,
  campaign_id uuid references campaigns(id),
  total_rows integer not null default 0,
  new_leads integer not null default 0,
  duplicate_leads integer not null default 0,
  imported_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- leads: global pool, deduped by email address
-- ----------------------------------------------------------------------------
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'do_not_contact', 'bounced')),
  status_reason text,
  status_changed_at timestamptz,
  imported_via uuid references lead_imports(id),
  created_at timestamptz not null default now()
);

comment on column leads.variables is
  'Every spreadsheet column for this lead, keyed by header name, e.g. {"first_name": "Jane", "company": "Acme"}.';
comment on column leads.status is
  'Global: do_not_contact / bounced block outreach from every campaign, not just one.';
comment on column leads.status_reason is
  'Human-readable trace for the leads page, e.g. "Reply contained ''unsubscribe''" or "Bounce: mailer-daemon".';

-- ----------------------------------------------------------------------------
-- campaign_steps
-- ----------------------------------------------------------------------------
create table if not exists campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  step_order integer not null,
  delay_days integer not null default 0,
  subject_template text not null,
  body_template text not null,
  unique (campaign_id, step_order)
);

comment on column campaign_steps.delay_days is
  'Days after the previous step fires. 0 for the first step in the sequence.';

-- ----------------------------------------------------------------------------
-- campaign_email_accounts: which inboxes a campaign may use
-- ----------------------------------------------------------------------------
create table if not exists campaign_email_accounts (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  email_account_id uuid not null references email_accounts(id) on delete cascade,
  primary key (campaign_id, email_account_id)
);

-- ----------------------------------------------------------------------------
-- campaign_leads: one lead's progress through one specific campaign
-- ----------------------------------------------------------------------------
create table if not exists campaign_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'replied', 'bounced', 'paused', 'completed')),
  current_step integer not null default 0,
  email_account_id uuid references email_accounts(id),
  thread_id text,
  last_message_id text,
  next_send_at timestamptz,
  replied_at timestamptz,
  unique (campaign_id, lead_id)
);

comment on column campaign_leads.email_account_id is
  'Fixed to whichever inbox sent the first email. Follow-ups must stay on the same inbox for thread continuity — never reassigned for fairness.';
comment on column campaign_leads.next_send_at is
  'Null once replied/paused/completed, so the sender''s due-query naturally excludes it — this IS the auto-stop mechanism.';

-- ----------------------------------------------------------------------------
-- sends / replies: append-only logs
-- ----------------------------------------------------------------------------
create table if not exists sends (
  id uuid primary key default gen_random_uuid(),
  campaign_lead_id uuid not null references campaign_leads(id) on delete cascade,
  step_id uuid not null references campaign_steps(id),
  email_account_id uuid not null references email_accounts(id),
  gmail_message_id text,
  gmail_thread_id text,
  sent_at timestamptz not null default now(),
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error_message text
);

create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  campaign_lead_id uuid not null references campaign_leads(id) on delete cascade,
  gmail_message_id text,
  classification text not null check (classification in ('real', 'auto', 'bounce')),
  received_at timestamptz not null default now(),
  notified_at timestamptz,
  snippet text
);

-- ----------------------------------------------------------------------------
-- telegram_notify_recipients: any number of people, one shared bot
-- ----------------------------------------------------------------------------
create table if not exists telegram_notify_recipients (
  id uuid primary key default gen_random_uuid(),
  label text,
  chat_id text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table telegram_notify_recipients is
  'One bot (TELEGRAM_BOT_TOKEN, an env secret) can message any number of chat_ids. Notify function loops over every active row here.';

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_campaign_leads_due on campaign_leads (next_send_at) where status = 'active';
create index if not exists idx_campaign_leads_thread on campaign_leads (thread_id) where thread_id is not null;
create index if not exists idx_sends_campaign_lead on sends (campaign_lead_id);
create index if not exists idx_replies_campaign_lead on replies (campaign_lead_id);
create index if not exists idx_leads_status on leads (status);
create index if not exists idx_email_accounts_new_lead_rotation on email_accounts (last_new_lead_sent_at) where is_active;
