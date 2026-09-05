-- ============================================================================
-- Outreach Smart — Migration 00011: thread_messages (SmartBox thread persistence)
-- ============================================================================
-- Gmail is the source of truth for full message bodies today — the existing
-- reply-checker cron fetches full threads live via Gmail's threads.get and
-- only ever persists a 500-char snippet (replies.snippet). This table caches
-- the full thread (subject/body/from/to per message) so the SmartBox
-- unified-inbox UI can render entire conversations without live Gmail calls
-- on every page view.
--
-- Populated by:
--   - supabase/functions/thread-sync (daily batch, diffs against
--     gmail_message_id and inserts only new messages)
--   - reply-checker, inline, immediately after it detects and logs a new
--     non-bounce reply (so SmartBox isn't stale for up to a day)
-- ============================================================================

create table if not exists thread_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_lead_id uuid not null references campaign_leads(id) on delete cascade,
  gmail_message_id text not null unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_address text,
  to_address text,
  subject text,
  body_text text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table thread_messages is
  'Full Gmail thread cache (per-message subject/body/from/to) for the SmartBox unified-inbox UI. Gmail remains the source of truth; this table is a synced copy populated by thread-sync (daily) and inline by reply-checker on new non-bounce replies.';
comment on column thread_messages.gmail_message_id is
  'Gmail message id. Globally unique — used to diff against already-synced messages for a thread so re-syncs only insert the messages that are actually new.';
comment on column thread_messages.direction is
  'outbound = sent by one of our inboxes (Gmail SENT label, or From header matches the inbox address); inbound = everything else (real replies, auto-replies).';
comment on column thread_messages.body_text is
  'Full decoded plain-text body, unlike replies.snippet which only ever stores the first 500 chars.';
comment on column thread_messages.occurred_at is
  'Gmail internalDate for the message, used to order the thread chronologically in the SmartBox UI.';

create index if not exists idx_thread_messages_campaign_lead on thread_messages (campaign_lead_id);
