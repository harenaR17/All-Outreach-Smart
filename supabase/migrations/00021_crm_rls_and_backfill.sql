-- ============================================================================
-- Migration 00021: CRM Multi-User RLS, Per-Reminder Bot & Replied Leads Backfill
--
-- 1. Adds recipient_id to crm_reminders (allows selecting a specific Telegram bot per reminder)
--
-- 2. Enables Row Level Security (RLS) across all 6 CRM tables:
--      • crm_statuses
--      • crm_pipeline_entries
--      • crm_status_history
--      • crm_status_activity_log
--      • crm_reminders
--      • crm_settings
--
-- 3. Configures strict tenant isolation policies matching Migration 00017
--    (auth.uid() = user_id, with crm_status_history linked via crm_pipeline_entries).
--
-- 4. Backfills replied leads (Option A: only leads with non-bounce replies)
--    into crm_pipeline_entries with status 'needs_review', audit history,
--    and initial activity log entries.
--
-- Deployment: run via your Supabase SQL editor against the self-hosted instance.
-- ============================================================================

-- ─── 0. Add recipient_id to crm_reminders ────────────────────────────────────

ALTER TABLE crm_reminders
  ADD COLUMN IF NOT EXISTS recipient_id uuid NULL REFERENCES telegram_notify_recipients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_reminders_recipient_idx
  ON crm_reminders (recipient_id);

-- ─── 1. Enable Row Level Security (RLS) on all CRM tables ─────────────────────

ALTER TABLE crm_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_status_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;

-- ─── 2. Row Level Security Policies ──────────────────────────────────────────

-- crm_statuses: Tenant isolation by user_id
DROP POLICY IF EXISTS "crm_statuses_user_isolation" ON crm_statuses;
CREATE POLICY "crm_statuses_user_isolation" ON crm_statuses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- crm_pipeline_entries: Tenant isolation by user_id
DROP POLICY IF EXISTS "crm_pipeline_entries_user_isolation" ON crm_pipeline_entries;
CREATE POLICY "crm_pipeline_entries_user_isolation" ON crm_pipeline_entries
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- crm_status_history: Linked to user via crm_pipeline_entries
DROP POLICY IF EXISTS "crm_status_history_user_isolation" ON crm_status_history;
CREATE POLICY "crm_status_history_user_isolation" ON crm_status_history
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM crm_pipeline_entries pe
    WHERE pe.id = crm_status_history.entry_id AND pe.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM crm_pipeline_entries pe
    WHERE pe.id = crm_status_history.entry_id AND pe.user_id = auth.uid()
  ));

-- crm_status_activity_log: Tenant isolation by user_id
DROP POLICY IF EXISTS "crm_status_activity_log_user_isolation" ON crm_status_activity_log;
CREATE POLICY "crm_status_activity_log_user_isolation" ON crm_status_activity_log
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- crm_reminders: Tenant isolation by user_id
DROP POLICY IF EXISTS "crm_reminders_user_isolation" ON crm_reminders;
CREATE POLICY "crm_reminders_user_isolation" ON crm_reminders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- crm_settings: Tenant isolation by user_id
DROP POLICY IF EXISTS "crm_settings_user_isolation" ON crm_settings;
CREATE POLICY "crm_settings_user_isolation" ON crm_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 3. Backfill Replied Leads (Option A) ────────────────────────────────────
-- Selects leads with non-bounce replies, groups by (user_id, lead_id) taking the
-- earliest reply as entered_at, sets status to 'needs_review', and seeds audit history.

DO $$
DECLARE
  v_inserted_count integer := 0;
BEGIN
  WITH replied_leads AS (
    SELECT DISTINCT ON (c.user_id, cl.lead_id)
      c.user_id,
      cl.lead_id,
      r.id AS reply_id,
      cl.campaign_id,
      'needs_review'::text AS status_id,
      r.received_at AS entered_at,
      r.received_at AS status_changed_at
    FROM replies r
    JOIN campaign_leads cl ON cl.id = r.campaign_lead_id
    JOIN campaigns c ON c.id = cl.campaign_id
    WHERE r.classification != 'bounce'
    ORDER BY c.user_id, cl.lead_id, r.received_at ASC
  ),
  inserted_entries AS (
    INSERT INTO crm_pipeline_entries (
      user_id,
      lead_id,
      reply_id,
      campaign_id,
      status_id,
      entered_at,
      status_changed_at
    )
    SELECT
      user_id,
      lead_id,
      reply_id,
      campaign_id,
      status_id,
      entered_at,
      status_changed_at
    FROM replied_leads
    ON CONFLICT (user_id, lead_id) DO NOTHING
    RETURNING id, user_id, status_id, entered_at
  ),
  ins_history AS (
    INSERT INTO crm_status_history (
      entry_id,
      from_status,
      to_status,
      changed_at,
      changed_by
    )
    SELECT
      id,
      NULL,
      status_id,
      entered_at,
      NULL
    FROM inserted_entries
  )
  INSERT INTO crm_status_activity_log (
    entry_id,
    user_id,
    note,
    source,
    created_at
  )
  SELECT
    id,
    user_id,
    'Lead backfilled into CRM — pending manual review',
    'auto',
    entered_at
  FROM inserted_entries;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RAISE NOTICE 'Backfill complete: processed replied leads into crm_pipeline_entries.';
END $$;
