-- ============================================================================
-- Migration 00020: CRM Pipeline
--
-- Creates the following tables:
--   • crm_statuses             — user-editable status catalogue (seeded with defaults)
--   • crm_pipeline_entries     — one entry per lead per user in the pipeline
--   • crm_status_history       — immutable audit trail of every status change
--   • crm_status_activity_log  — timestamped notes + auto-logged status events
--   • crm_reminders            — scheduled Telegram reminders
--   • crm_settings             — per-user global CRM defaults (e.g. no_response_delay_hours)
--
-- Deployment: run via your Supabase SQL editor or psql against the self-hosted instance.
-- ============================================================================

-- ─── 1. crm_statuses ─────────────────────────────────────────────────────────
-- The user-editable status catalogue. Seeded with defaults in §7 below.
-- Custom statuses added by the user share the same table with a unique slug id.

create table if not exists crm_statuses (
  id            text        not null,          -- slug, e.g. 'meeting_booked'
  user_id       uuid        not null references auth.users on delete cascade,
  display_name  text        not null,
  icon          text        not null default '📌',
  color         text        not null default '#6366f1',   -- hex
  sort_order    integer     not null default 999,
  track         text        not null default 'positive'
                            check (track in ('positive', 'negative', 'neutral')),
  is_terminal   boolean     not null default false,       -- closes entry & dismisses reminders
  is_archived   boolean     not null default false,
  is_system     boolean     not null default false,       -- seeded defaults; still editable
  reminder_config jsonb     null,
  -- reminder_config examples:
  --   { "type": "delay",          "hours": 24 }         → auto-create reminder N hours after status set
  --   { "type": "meeting_offset", "hours": -1 }         → auto-create reminder 1h before meeting_at
  --   null                                              → no auto-reminder
  created_at    timestamptz not null default now(),
  primary key (id, user_id)
);

comment on table crm_statuses is
  'CRM pipeline status catalogue. Seeded per-user with defaults. Users may add, rename, recolor, reorder, or archive. is_system marks the default seed rows — they can be edited but not deleted.';

comment on column crm_statuses.is_terminal is
  'When true, moving a lead to this status auto-dismisses all pending reminders for that entry and sets closed_at.';

-- ─── 2. crm_pipeline_entries ─────────────────────────────────────────────────
-- One unified row per (user_id, lead_id). A lead appears once regardless of
-- how many campaigns it touched.

create table if not exists crm_pipeline_entries (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users on delete cascade,
  lead_id            uuid        not null references leads on delete cascade,
  reply_id           uuid        null references replies on delete set null,
  campaign_id        uuid        null references campaigns on delete set null,
  status_id          text        not null,
  -- FK to crm_statuses enforced at app level (status_id + user_id pair);
  -- cannot use a simple FK because crm_statuses PK is composite (id, user_id).
  meeting_at         timestamptz null,            -- set when status = meeting_booked
  notes              text        null,            -- pinned scratchpad (auto-saves)
  entered_at         timestamptz not null default now(),
  status_changed_at  timestamptz null,
  closed_at          timestamptz null,            -- set when terminal status reached
  -- Phase 4 email compose fields (designed now, used later):
  last_sent_at       timestamptz null,
  last_sent_inbox_id uuid        null references email_accounts on delete set null,
  created_at         timestamptz not null default now(),
  unique (user_id, lead_id)                       -- one entry per lead per user
);

comment on table crm_pipeline_entries is
  'One CRM pipeline entry per (user, lead). Created automatically when reply-checker classifies a real reply as interested / not_interested / undefined. Updated manually via the UI.';

comment on column crm_pipeline_entries.last_sent_at is
  'Phase 4 (in-platform compose): timestamp of last email sent from the platform for this lead.';

comment on column crm_pipeline_entries.last_sent_inbox_id is
  'Phase 4 (in-platform compose): inbox used for the last in-platform reply, so the compose window can auto-select it.';

create index if not exists crm_pipeline_entries_user_status_idx
  on crm_pipeline_entries (user_id, status_id);

create index if not exists crm_pipeline_entries_user_closed_idx
  on crm_pipeline_entries (user_id, closed_at)
  where closed_at is null;   -- partial index — only open entries

-- ─── 3. crm_status_history ───────────────────────────────────────────────────
-- Immutable audit trail. Never updated or deleted.

create table if not exists crm_status_history (
  id           uuid        primary key default gen_random_uuid(),
  entry_id     uuid        not null references crm_pipeline_entries on delete cascade,
  from_status  text        null,     -- NULL on the first entry into the pipeline
  to_status    text        not null,
  changed_at   timestamptz not null default now(),
  changed_by   uuid        null references auth.users on delete set null
);

comment on table crm_status_history is
  'Immutable audit trail of every CRM status change. changed_by is null for auto-triggered changes (reply-checker).';

create index if not exists crm_status_history_entry_idx
  on crm_status_history (entry_id, changed_at desc);

-- ─── 4. crm_status_activity_log ──────────────────────────────────────────────
-- Timestamped notes log. Each row is a manual note or an auto-logged event.
-- Rendered as a timeline in the lead detail panel.

create table if not exists crm_status_activity_log (
  id         uuid        primary key default gen_random_uuid(),
  entry_id   uuid        not null references crm_pipeline_entries on delete cascade,
  user_id    uuid        not null references auth.users on delete cascade,
  note       text        not null,
  source     text        not null default 'manual'
             check (source in ('manual', 'auto')),   -- 'auto' = system-generated event note
  created_at timestamptz not null default now()
);

comment on table crm_status_activity_log is
  'Timestamped activity log per pipeline entry. source=manual means user-typed notes; source=auto means system-generated events (status changes logged here as a readable string for the timeline).';

create index if not exists crm_activity_log_entry_idx
  on crm_status_activity_log (entry_id, created_at desc);

-- ─── 5. crm_reminders ────────────────────────────────────────────────────────
-- One row per scheduled Telegram reminder. Fired by the crm-reminder-dispatcher
-- edge function every 5 minutes.

create table if not exists crm_reminders (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users on delete cascade,
  entry_id        uuid        not null references crm_pipeline_entries on delete cascade,
  reminder_type   text        not null
                  check (reminder_type in ('no_response', 'meeting', 'follow_up', 'custom')),
  fire_at         timestamptz not null,
  message         text        not null,   -- pre-rendered Telegram MarkdownV2 message
  status          text        not null default 'pending'
                  check (status in ('pending', 'fired', 'snoozed', 'dismissed')),
  fired_at        timestamptz null,
  snoozed_until   timestamptz null,
  created_at      timestamptz not null default now()
);

comment on table crm_reminders is
  'Scheduled Telegram reminders for CRM pipeline entries. Fired by the crm-reminder-dispatcher edge function (runs every 5 min). status=pending means not yet sent.';

-- Partial index — only pending reminders need fast lookup
create index if not exists crm_reminders_pending_fire_at_idx
  on crm_reminders (fire_at)
  where status = 'pending';

create index if not exists crm_reminders_entry_idx
  on crm_reminders (entry_id, status);

-- ─── 6. crm_settings ─────────────────────────────────────────────────────────
-- Per-user global CRM configuration. One row per user, upserted on first access.

create table if not exists crm_settings (
  user_id                    uuid    primary key references auth.users on delete cascade,
  no_response_delay_hours    integer not null default 24,   -- default 24h for 'no_response' reminder
  meeting_reminder_offset_h  integer not null default -1,   -- default: 1h before meeting (negative = before)
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

comment on table crm_settings is
  'Per-user global CRM settings. no_response_delay_hours: how many hours after a lead enters new_interested before the no-response reminder fires (default 24). meeting_reminder_offset_h: hours offset for the auto meeting reminder (default -1 = 1h before).';

-- ─── 7. Seed default statuses ────────────────────────────────────────────────
-- Inserts the default status set for every existing user.
-- New users get the same seed via the app on first access (server action).
-- Uses ON CONFLICT DO NOTHING so re-running the migration is safe.

do $$
declare
  u record;
begin
  for u in select id from auth.users loop

    insert into crm_statuses (id, user_id, display_name, icon, color, sort_order, track, is_terminal, is_system, reminder_config) values

      -- ── Positive: Post-Interested track (before meeting) ──
      ('new_interested',           u.id, 'New — Interested',           '🎯', '#22c55e',  10, 'positive', false, true,
        '{"type":"delay","hours":24}'::jsonb),
      ('interested_follow_up_1',   u.id, 'Follow-up 1 (Interested)',   '🔁', '#84cc16',  20, 'positive', false, true, null),
      ('interested_follow_up_2',   u.id, 'Follow-up 2 (Interested)',   '🔁', '#84cc16',  30, 'positive', false, true, null),
      ('interested_closure_sent',  u.id, 'Closure Sent (Interested)',  '📮', '#facc15',  40, 'positive', false, true, null),

      -- ── Positive: Meeting track ──
      ('meeting_booked',           u.id, 'Meeting Booked',             '📅', '#3b82f6',  50, 'positive', false, true,
        '{"type":"meeting_offset","hours":-1}'::jsonb),
      ('no_show',                  u.id, 'No Show',                    '👻', '#f97316',  60, 'positive', false, true, null),
      ('no_show_follow_up_1',      u.id, 'Follow-up 1 (No Show)',      '🔁', '#fb923c',  70, 'positive', false, true, null),
      ('no_show_follow_up_2',      u.id, 'Follow-up 2 (No Show)',      '🔁', '#fb923c',  80, 'positive', false, true, null),
      ('no_show_closure_sent',     u.id, 'Closure Sent (No Show)',     '📮', '#facc15',  90, 'positive', false, true, null),

      -- ── Positive: Proposal track ──
      ('proposal_sent',            u.id, 'Proposal Sent',              '📄', '#8b5cf6', 100, 'positive', false, true, null),
      ('proposal_follow_up_1',     u.id, 'Follow-up 1 (Proposal)',     '🔁', '#a78bfa', 110, 'positive', false, true, null),
      ('proposal_follow_up_2',     u.id, 'Follow-up 2 (Proposal)',     '🔁', '#a78bfa', 120, 'positive', false, true, null),
      ('proposal_closure_sent',    u.id, 'Closure Sent (Proposal)',    '📮', '#facc15', 130, 'positive', false, true, null),

      -- ── Terminal: Won ──
      ('closed_won',               u.id, 'Closed — Won',               '🏆', '#fbbf24', 140, 'positive', true,  true, null),

      -- ── Negative / Recovery track ──
      ('not_interested_replied',   u.id, 'Not Interested',             '🛑', '#ef4444', 200, 'negative', false, true, null),
      ('needs_review',             u.id, 'Needs Review',               '❓', '#6b7280', 210, 'neutral',  false, true, null),
      ('ghosted',                  u.id, 'Ghosted',                    '👤', '#6b7280', 220, 'negative', false, true, null),
      ('closed_lost',              u.id, 'Closed — Lost',              '❌', '#dc2626', 230, 'negative', true,  true, null)

    on conflict (id, user_id) do nothing;

    -- Seed default crm_settings row for this user
    insert into crm_settings (user_id)
    values (u.id)
    on conflict (user_id) do nothing;

  end loop;
end;
$$;

-- ─── 8. Cron: crm-reminder-dispatcher — every 5 minutes ──────────────────────
-- Fires pending crm_reminders via the new edge function.
-- Hits the Supabase Edge Function directly via Kong with anon_key auth and cron_secret.

SELECT cron.schedule(
  'crm-reminder-dispatcher',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM cron_config.settings WHERE key = 'supabase_url') || '/functions/v1/crm-reminder-dispatcher',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM cron_config.settings WHERE key = 'anon_key'),
      'x-cron-secret', (SELECT value FROM cron_config.settings WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- ─── Verification helpers ─────────────────────────────────────────────────────
-- After running this migration, verify with:
--   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'crm_%';
--   SELECT id, display_name, sort_order, track FROM crm_statuses ORDER BY sort_order;
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'crm-reminder-dispatcher';
