-- v86: Opt-out/spärrlista för kunder (gap 7, tasks/vilande-pengar-masterplan.md VP1).
-- Kör manuellt i Supabase SQL Editor. Idempotent (kan köras flera gånger).
--
-- BAKGRUND: innan denna migration fanns ingen mekanism för att en kund
-- kunde säga ifrån om agent-SMS (GDPR/varumärkesrisk vid skalning av
-- outbound — Hanna-outbound/kapacitetsfyllnad/avtalsförslag/kundbas-svep).
-- Denna migration lägger tre kolumner på customer (OBS: singular tabellnamn
-- i den faktiska databasen, inte "customers"):
--
--   sms_opt_out        BOOLEAN — true om kunden inte ska få agent-SMS
--   sms_opt_out_at      TIMESTAMPTZ — när flaggan senast sattes (null om aldrig avböjt)
--   sms_opt_out_source  TEXT — 'sms_stop' (kunden svarade STOPP/STOP/SLUTA)
--                        eller 'manual' (hantverkaren togglade på kundkortet)
--
-- Koden (lib/sms-send.ts sendSmsViaElks + app/api/sms/incoming/route.ts) är
-- byggd för att TÅLA att denna migration inte körts än — kolumn-saknas-fel
-- fångas och behandlas som "tillåt sändning + logga varning", aldrig krasch.
-- Kör den ändå snarast för att opt-out-spärren faktiskt ska ha effekt.

ALTER TABLE customer ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS sms_opt_out_at TIMESTAMPTZ NULL;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS sms_opt_out_source TEXT NULL;

-- Idempotent CHECK-constraint — samma DO-block-mönster som v85 (matchar
-- så vi kan namnge/hitta constrainten senare, till skillnad från en bar
-- inline CHECK som inte går att villkora med IF NOT EXISTS).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_sms_opt_out_source_check'
  ) THEN
    ALTER TABLE customer
      ADD CONSTRAINT customer_sms_opt_out_source_check
      CHECK (sms_opt_out_source IS NULL OR sms_opt_out_source IN ('sms_stop', 'manual'));
  END IF;
END $$;

-- Index för opt-out-uppslag utan customer_id (telefonnummer-fallback i
-- sendSmsViaElks/incoming-webhooken) — bara på rader som faktiskt har ett
-- telefonnummer, business_id+phone_number är redan den vanliga sök-kombon.
CREATE INDEX IF NOT EXISTS idx_customer_phone_optout
  ON customer (business_id, phone_number)
  WHERE phone_number IS NOT NULL;

COMMENT ON COLUMN customer.sms_opt_out IS 'true = kunden har avböjt SMS från agenten (GDPR/varumärkesspärr, v86)';
COMMENT ON COLUMN customer.sms_opt_out_at IS 'När sms_opt_out senast sattes till true (null = aldrig avböjt eller åter opt-in)';
COMMENT ON COLUMN customer.sms_opt_out_source IS '''sms_stop'' (kunden svarade STOPP/STOP/SLUTA) eller ''manual'' (togglat på kundkortet)';

-- ─────────────────────────────────────────────────────────────────
-- VERIFIERING
-- ─────────────────────────────────────────────────────────────────

-- Ska visa de tre nya kolumnerna:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'customer' AND column_name LIKE 'sms_opt_out%';

-- Ska ge 0 rader initialt (ingen har avböjt än):
SELECT COUNT(*) AS redan_avbojda FROM customer WHERE sms_opt_out = true;

-- ROLLBACK (manuellt om behövs):
-- DROP INDEX IF EXISTS idx_customer_phone_optout;
-- ALTER TABLE customer DROP CONSTRAINT IF EXISTS customer_sms_opt_out_source_check;
-- ALTER TABLE customer DROP COLUMN IF EXISTS sms_opt_out_source;
-- ALTER TABLE customer DROP COLUMN IF EXISTS sms_opt_out_at;
-- ALTER TABLE customer DROP COLUMN IF EXISTS sms_opt_out;
