-- ============================================================================
-- Change the default for campaigns.limit_emails_per_company to 2.
-- New campaigns will now default to capping emails to 2 per company per day
-- instead of unlimited. This only changes the column default applied to
-- future inserts — existing campaign rows are left untouched.
-- ============================================================================

ALTER TABLE campaigns
  ALTER COLUMN limit_emails_per_company SET DEFAULT 2;
