-- ============================================================================
-- Add limit_emails_per_company column to campaigns table.
-- Caps how many emails this campaign may send per day to leads sharing the
-- same company (derived from the lead's email domain). 0 / NULL = unlimited.
-- Leads on common free-mail domains (gmail.com, yahoo.com, ...) are each
-- treated as their own singleton company and are never limited by this rule.
-- ============================================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS limit_emails_per_company integer DEFAULT 0
    CHECK (limit_emails_per_company IS NULL OR limit_emails_per_company >= 0);

COMMENT ON COLUMN campaigns.limit_emails_per_company IS
  'Max emails per day to leads of the same company (grouped by email domain, free-mail domains exempt). NULL or 0 = unlimited.';
