-- ============================================================================
-- Fix FK constraints that block deleting inboxes / editing campaign steps
-- when historical send data already exists.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fix 1: campaign_leads.email_account_id
--   Was:  RESTRICT (default) — blocks deleting an inbox that has ever been
--         assigned to a lead.
--   Fix:  ON DELETE SET NULL — deleting an inbox nulls the reference on the
--         lead row, preserving lead history without blocking the delete.
-- ----------------------------------------------------------------------------
ALTER TABLE campaign_leads
  DROP CONSTRAINT IF EXISTS campaign_leads_email_account_id_fkey,
  ADD CONSTRAINT campaign_leads_email_account_id_fkey
    FOREIGN KEY (email_account_id)
    REFERENCES email_accounts(id)
    ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- Fix 2: sends.step_id
--   Was:  NOT NULL + RESTRICT — blocks deleting/replacing campaign steps that
--         have already been used to send an email.
--   Fix:  nullable + ON DELETE SET NULL — deleting a step keeps the send log
--         intact but clears the now-gone step reference.
-- ----------------------------------------------------------------------------
ALTER TABLE sends
  ALTER COLUMN step_id DROP NOT NULL;

ALTER TABLE sends
  DROP CONSTRAINT IF EXISTS sends_step_id_fkey,
  ADD CONSTRAINT sends_step_id_fkey
    FOREIGN KEY (step_id)
    REFERENCES campaign_steps(id)
    ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- Fix 3: sends.email_account_id
--   Was:  NOT NULL + RESTRICT — blocks deleting an inbox that has ever sent
--         an email, even long after the campaign has completed.
--   Fix:  nullable + ON DELETE SET NULL — inbox delete preserves the send log
--         but clears the now-gone inbox reference.
-- ----------------------------------------------------------------------------
ALTER TABLE sends
  ALTER COLUMN email_account_id DROP NOT NULL;

ALTER TABLE sends
  DROP CONSTRAINT IF EXISTS sends_email_account_id_fkey,
  ADD CONSTRAINT sends_email_account_id_fkey
    FOREIGN KEY (email_account_id)
    REFERENCES email_accounts(id)
    ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- Fix 4: lead_imports.campaign_id
--   Was:  RESTRICT (default) — blocks deleting a campaign that had at least
--         one spreadsheet import associated with it.
--   Fix:  ON DELETE SET NULL — campaign delete orphans the import record
--         (preserving the import audit row) rather than being blocked.
-- ----------------------------------------------------------------------------
ALTER TABLE lead_imports
  DROP CONSTRAINT IF EXISTS lead_imports_campaign_id_fkey,
  ADD CONSTRAINT lead_imports_campaign_id_fkey
    FOREIGN KEY (campaign_id)
    REFERENCES campaigns(id)
    ON DELETE SET NULL;
