-- v81 — Atomiskt fakturanummeruttag (ETAPP 6a, offert-masterplan.md faktura-sprinten)
-- Kör manuellt i Supabase SQL Editor. Idempotent (CREATE OR REPLACE).
--
-- Bakgrund: ÅTTA olika kodvägar skapar fakturor idag (app/api/invoices/route.ts
-- POST, from-quote, from-project, from-time-entries,
-- app/api/projects/[id]/create-final-invoice, lib/projects/
-- auto-invoice-on-complete.ts, lib/agreements/invoice-visit.ts, invoices/
-- credit) och samtliga (utom credit, som har en egen KF-nummerserie) gör
-- samma READ-THEN-WRITE mot business_config.next_invoice_number:
--
--   1. SELECT next_invoice_number FROM business_config WHERE business_id = X
--   2. bygg invoice_number = prefix-YYYY-NNN i applikationskoden
--   3. INSERT INTO invoice (...)
--   4. UPDATE business_config SET next_invoice_number = next_invoice_number + 1
--
-- Två samtidiga requests (t.ex. auto-invoice-on-complete triggat av två
-- projektavslut i samma sekund, eller en hantverkare som dubbelklickar
-- "Skapa faktura") kan båda läsa SAMMA next_invoice_number innan någon
-- hunnit skriva tillbaka — två fakturor får samma nummer. Dubbla
-- fakturanummer är ett bokföringsproblem (Fortnox-synk, kundens egen
-- ekonomi, ev. Skatteverket-rapportering).
--
-- Denna funktion gör steg 1+4 ATOMISKT i en enda UPDATE...RETURNING —
-- Postgres radlås (implicit på UPDATE) garanterar att två samtidiga anrop
-- aldrig kan returnera samma num för samma business_id. Applikationskoden
-- (lib/invoices/create-invoice.ts) anropar denna funktion FÖRST, bygger
-- invoice_number av det returnerade num+prefix, sedan INSERT.
--
-- ⚠️ KÖRORDNING: denna migration är BAKÅTKOMPATIBEL att köra närsomhelst —
-- lib/invoices/create-invoice.ts har en fallback till den gamla read-then-
-- write-kedjan (med en tydlig console.warn) om RPC:n ännu inte finns i
-- prod, så deploy-ordningen kod-före-migration eller migration-före-kod
-- spelar ingen roll för att appen ska fungera. Kör denna migration för att
-- FAKTISKT stänga dubblett-hålet.

-- ═══════════════════════════════════════════════════════════════════════
-- 0. FÖRHANDSVERIFIERING — kolumnerna funktionen läser/skriver ska finnas
-- ═══════════════════════════════════════════════════════════════════════
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'business_config'
  AND column_name IN ('business_id', 'invoice_prefix', 'next_invoice_number')
ORDER BY column_name;
-- Förväntat: 3 rader. business_id (text), invoice_prefix (text, kan
-- sakna default — funktionen COALESCE:ar till 'FV'), next_invoice_number
-- (integer/numeric, bör ha default 1 — funktionen COALESCE:ar till 1 om
-- NULL). Avvikelse i antal rader eller typer → STOPPA och utred innan
-- resten av filen körs.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. FUNKTIONEN
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION next_invoice_number(p_business_id TEXT)
RETURNS TABLE(num INTEGER, prefix TEXT) AS $$
BEGIN
  -- SET skriver alltid ett icke-NULL nytt värde (COALESCE fångar en
  -- ojourförd/NULL kolumn och startar serien om på 1) — RETURNING läser
  -- POST-update-raden, så "nytt värde - 1" ger tillbaka precis det num
  -- som DENNA invoice ska använda, medan kolumnen redan pekar på nästa.
  RETURN QUERY
  UPDATE business_config
  SET next_invoice_number = COALESCE(business_config.next_invoice_number, 1) + 1
  WHERE business_config.business_id = p_business_id
  RETURNING
    business_config.next_invoice_number - 1 AS num,
    COALESCE(business_config.invoice_prefix, 'FV') AS prefix;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. VERIFIERINGSBLOCK — kör manuellt mot en TESTBUSINESS (byt ut id:t),
--    inte mot en riktig hantverkares konto. Kör 2 (SELECT) före och efter
--    ett anrop av funktionen för att se att den faktiskt bumpar+returnerar
--    rätt nummer, och kör funktionen två gånger i rad för att se att
--    numret ökar (inga dubbletter).
-- ═══════════════════════════════════════════════════════════════════════

-- 2a. Nuvarande värde för en testbusiness (byt 'demo' mot ett verkligt
--     business_id innan du kör detta block skarpt)
-- SELECT business_id, invoice_prefix, next_invoice_number FROM business_config WHERE business_id = 'demo';

-- 2b. Första anropet — ska returnera samma num som next_invoice_number VAR
--     innan anropet (t.ex. var det 42 innan, num=42 här), och
--     business_config.next_invoice_number ska nu vara 43.
-- SELECT * FROM next_invoice_number('demo');

-- 2c. Andra anropet direkt efter — ska returnera num=43 (inte 42 igen).
-- SELECT * FROM next_invoice_number('demo');

-- 2d. Om testbusiness saknar en business_config-rad helt (finns inte)
--     returnerar UPDATE noll rader → funktionen returnerar TOM tabell
--     (inte en rad med NULL). Anroparen (lib/invoices/create-invoice.ts)
--     måste hantera det tomma fallet och falla tillbaka till fel/fallback
--     — dokumenterat i den filens kommentar.

NOTIFY pgrst, 'reload schema';
