-- v151: E-post-opt-out/avregistrering för kunder (marknadsföringslagen-gap).
-- Kör manuellt i Supabase SQL Editor. Idempotent (kan köras flera gånger).
--
-- BAKGRUND: proaktiv marknadsföringsmail (nurture-sekvenser, lib/nurture.ts)
-- skickades utan någon avregistreringslänk och utan möjlighet att spärra en
-- kunds e-postadress — samma gap som v86 stängde för SMS (sms_opt_out), nu
-- för e-post. Denna migration lägger tre kolumner på customer (OBS: singular
-- tabellnamn i den faktiska databasen, inte "customers"):
--
--   email_opt_out        BOOLEAN — true om kunden inte ska få marknadsförings-
--                         mail (nurture-sekvenser m.m.)
--   email_opt_out_at      TIMESTAMPTZ — när flaggan senast sattes (null om
--                         aldrig avböjt)
--   email_opt_out_source  TEXT — 'unsubscribe_link' (kunden klickade på
--                         avregistreringslänken i mailet) eller 'manual'
--                         (hantverkaren togglade på kundkortet)
--
-- Samma toleransmönster som v86: koden (lib/nurture.ts, app/api/email/
-- unsubscribe/route.ts) är byggd för att TÅLA att denna migration inte
-- körts än — kolumn-saknas-fel fångas och behandlas fail-soft, aldrig
-- krasch. Kör den ändå snarast för att opt-out-spärren faktiskt ska ha
-- effekt och avregistreringslänken ska kunna sätta flaggan.

ALTER TABLE customer ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS email_opt_out_at TIMESTAMPTZ NULL;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS email_opt_out_source TEXT NULL;

-- Idempotent CHECK-constraint — samma DO-block-mönster som v86.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_email_opt_out_source_check'
  ) THEN
    ALTER TABLE customer
      ADD CONSTRAINT customer_email_opt_out_source_check
      CHECK (email_opt_out_source IS NULL OR email_opt_out_source IN ('unsubscribe_link', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN customer.email_opt_out IS 'true = kunden har avregistrerat sig från marknadsföringsmail (nurture-sekvenser), v151';
COMMENT ON COLUMN customer.email_opt_out_at IS 'När email_opt_out senast sattes till true (null = aldrig avböjt eller åter opt-in)';
COMMENT ON COLUMN customer.email_opt_out_source IS '''unsubscribe_link'' (klickade avregistreringslänken) eller ''manual'' (togglat på kundkortet)';

-- ─────────────────────────────────────────────────────────────────
-- VERIFIERING
-- ─────────────────────────────────────────────────────────────────

-- Ska visa de tre nya kolumnerna:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'customer' AND column_name LIKE 'email_opt_out%';

-- Ska ge 0 rader initialt (ingen har avregistrerat sig än):
SELECT COUNT(*) AS redan_avregistrerade FROM customer WHERE email_opt_out = true;

-- ROLLBACK (manuellt om behövs):
-- ALTER TABLE customer DROP CONSTRAINT IF EXISTS customer_email_opt_out_source_check;
-- ALTER TABLE customer DROP COLUMN IF EXISTS email_opt_out_source;
-- ALTER TABLE customer DROP COLUMN IF EXISTS email_opt_out_at;
-- ALTER TABLE customer DROP COLUMN IF EXISTS email_opt_out;
