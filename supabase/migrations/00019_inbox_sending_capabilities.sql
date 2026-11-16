-- ============================================================================
-- Migration 00019: Granular Inbox Sending Capabilities
-- Allows separating active status for new leads and follow-ups both globally
-- (email_accounts) and locally per campaign (campaign_email_accounts).
-- ============================================================================

-- 1. Add capabilities to email_accounts (global ceiling)
ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS can_send_new_leads BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_send_follow_ups BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.email_accounts.can_send_new_leads IS
  'Global switch: if false, this inbox will never be assigned to new leads across any campaign.';

COMMENT ON COLUMN public.email_accounts.can_send_follow_ups IS
  'Global switch: if false, follow-ups for leads assigned to this inbox will be skipped until re-enabled.';

-- 2. Add capabilities to campaign_email_accounts (per-campaign control)
ALTER TABLE public.campaign_email_accounts
  ADD COLUMN IF NOT EXISTS can_send_new_leads BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_send_follow_ups BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.campaign_email_accounts.can_send_new_leads IS
  'Campaign-level switch: if false, this inbox will not be assigned to new leads for this campaign.';

COMMENT ON COLUMN public.campaign_email_accounts.can_send_follow_ups IS
  'Campaign-level switch: if false, follow-ups in this campaign for leads assigned to this inbox are skipped.';
