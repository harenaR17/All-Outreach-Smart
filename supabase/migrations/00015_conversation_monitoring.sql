ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS conversation_monitoring boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN campaign_leads.conversation_monitoring IS
  'When true (default), the reply-checker fires Telegram alerts for every new
   inbound message on this lead''s Gmail thread even after a real reply has been
   logged. Set to false to opt this lead out of ongoing conversation monitoring.';
