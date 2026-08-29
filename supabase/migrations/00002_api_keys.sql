-- ============================================================================
-- Migration 00002: api_keys table for public Leads API authentication
-- ============================================================================

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  label text,
  key_hash text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

comment on table api_keys is
  'Inbound API keys for the public Leads API. Stores SHA-256 hash only — raw key shown once at creation, never stored.';
comment on column api_keys.key_hash is
  'SHA-256 hex digest of the raw bearer token. Fast hash is appropriate here — tokens are already high-entropy random values.';
comment on column api_keys.last_used_at is
  'Updated on every authenticated request for key usage auditing.';
