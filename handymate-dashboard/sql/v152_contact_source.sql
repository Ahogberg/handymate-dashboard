-- v152: Kontaktproveniens för kunder (contact_source).
-- Kör manuellt i Supabase SQL Editor. Idempotent (kan köras flera gånger).
--
-- BAKGRUND: varje customer-rad som skapas utan en registrerad källa blir
-- dyrt granskningsarbete längre fram — går inte i efterhand att avgöra HUR
-- eller VARFÖR en viss kontakt hamnade i registret (manuellt inlagd av
-- hantverkaren, CSV-importerad, ett gammalt telefonsamtal, ett webbformulär
-- ...), vilket blir kritiskt den dag kontaktmedgivande/proveniens behöver
-- kunna redovisas. Denna migration lägger två kolumner på customer
-- (OBS: singular tabellnamn i den faktiska databasen, inte "customers"):
--
--   contact_source     TEXT — hur kunden först kom in i registret
--   contact_source_at  TIMESTAMPTZ — när contact_source sattes
--
-- Källkoden (lib/customers/contact-source.ts + samtliga customer-insert-
-- vägar, se tasks/*) är byggd för att TÅLA att denna migration inte körts
-- än — kolumn-saknas-fel fångas och behandlas fail-soft (spara utan de två
-- fälten, logga en varning), aldrig krasch. Kör den ändå snarast så att nya
-- kunder faktiskt får en registrerad proveniens.
--
-- VÄRDELISTAN (stängd CHECK, matchar lib/customers/contact-source.ts
-- ContactSource-typen — ändras listan: uppdatera BÅDA ställena):
--   manual        — hantverkaren skapade kunden själv i dashboarden/agenten
--   csv_import    — CSV-massimport (onboarding eller /api/customers/import)
--   gmail_import  — auto-skapad ur Gmail-lead-import eller obesvarad mailtråd
--   lead_form     — webbformulär/inledande kontakt (website_form, inbound_sms, ...)
--   portal        — reserverad: kundportalen skapar idag inga nya kunder,
--                    bara länkar till befintliga — värdet finns för framtida bruk
--   referral      — via en befintlig kunds rekommendationslänk
--   widget        — reserverad: chattwidgeten går idag via Golden Path/
--                    website_form — värdet finns för framtida direktflöden
--   phone_call    — telefonsamtal (röstagenten, eller ett AI-förslag härlett
--                    ur en inspelning)
--   fortnox_sync  — synkad in från Fortnox bokföring (fanns redan där, inte
--                    en ny "kontakt" i egentlig mening — egen källa för att
--                    kunna skiljas ut i granskningen)
--   unknown       — okänd/historisk (backfill av rader som fanns innan
--                    denna migration)

ALTER TABLE customer ADD COLUMN IF NOT EXISTS contact_source TEXT NULL;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS contact_source_at TIMESTAMPTZ NULL;

-- Idempotent CHECK-constraint — samma DO-block-mönster som v86/v151.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_contact_source_check'
  ) THEN
    ALTER TABLE customer
      ADD CONSTRAINT customer_contact_source_check
      CHECK (contact_source IS NULL OR contact_source IN (
        'manual',
        'csv_import',
        'gmail_import',
        'lead_form',
        'portal',
        'referral',
        'widget',
        'phone_call',
        'fortnox_sync',
        'unknown'
      ));
  END IF;
END $$;

-- Backfill: alla befintliga rader utan en registrerad källa markeras
-- 'unknown' i stället för att lämnas NULL — annars är NULL tvetydigt
-- (betyder det "okänd" eller "migrationen har inte kört för den här
-- raden"?). now() vid körningstillfället är en ärlig markör: vi vet inte
-- NÄR kontakten faktiskt uppstod, bara att vi backfyllde den nu.
UPDATE customer SET contact_source = 'unknown', contact_source_at = NOW() WHERE contact_source IS NULL;

COMMENT ON COLUMN customer.contact_source IS 'Kontaktproveniens — hur kunden först kom in i registret. Underlag för framtida kontaktmedgivande-/granskningsbeslut, v152';
COMMENT ON COLUMN customer.contact_source_at IS 'När contact_source sattes (backfill = migrationskörningstillfället, inte kundens faktiska ursprungsdatum)';

-- ─────────────────────────────────────────────────────────────────
-- VERIFIERING
-- ─────────────────────────────────────────────────────────────────

-- Ska visa de två nya kolumnerna:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'customer' AND column_name LIKE 'contact_source%';

-- Ska ge 0 rader efter backfill (ingen ska vara NULL längre):
SELECT COUNT(*) AS fortfarande_null FROM customer WHERE contact_source IS NULL;

-- Fördelning per källa (sanity check):
SELECT contact_source, COUNT(*) FROM customer GROUP BY contact_source ORDER BY 2 DESC;

-- ROLLBACK (manuellt om behövs):
-- ALTER TABLE customer DROP CONSTRAINT IF EXISTS customer_contact_source_check;
-- ALTER TABLE customer DROP COLUMN IF EXISTS contact_source_at;
-- ALTER TABLE customer DROP COLUMN IF EXISTS contact_source;
