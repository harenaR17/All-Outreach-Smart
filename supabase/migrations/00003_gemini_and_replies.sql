-- ============================================================================
-- Outreach Smart — Migration 00003: Gemini API Keys, LLM Category & Auto-reply Settings
-- ============================================================================

-- 1. gemini_api_keys table
create table if not exists gemini_api_keys (
  id uuid primary key default gen_random_uuid(),
  label text,
  api_key text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table gemini_api_keys is
  'Each key should come from a SEPARATE Google Cloud project -- Gemini rate limits are enforced per-project, not per-key.';

-- 2. telegram_notify_recipients table (if not already created)
create table if not exists telegram_notify_recipients (
  id uuid primary key default gen_random_uuid(),
  label text,
  chat_id text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. Add stop_on_auto_reply to campaigns (defaults to TRUE per user requirement)
alter table campaigns
  add column if not exists stop_on_auto_reply boolean not null default true;

comment on column campaigns.stop_on_auto_reply is
  'When true (default), auto-replies / out-of-office responses halt the sequence. When false, sequence continues.';

-- 4. Add llm_category to replies table with 5-category constraint including undefined
alter table replies
  add column if not exists llm_category text
  check (llm_category is null or llm_category in ('interested', 'not_interested', 'out_of_office', 'wrong_person', 'undefined'));

comment on column replies.llm_category is
  'Set by the reply checker using Gemini classification. Null if LLM was skipped/failed.';
