-- A fixed first-sync window survives failures across midnight and later retries.
ALTER TABLE public.calendar_connection ADD COLUMN IF NOT EXISTS gmail_sync_started_at timestamptz;
