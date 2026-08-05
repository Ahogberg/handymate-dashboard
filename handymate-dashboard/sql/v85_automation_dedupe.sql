-- v85: Dashboard-städpaketet — dedupe av automationsregler + godkännandekort.
-- Kör manuellt i Supabase SQL Editor. Idempotent (kan köras flera gånger).
--
-- BAKGRUND (Andreas, dashboard-städsprinten): dubblettkort på dashboarden
-- spårades till två rotorsaker:
--   1. seed_v3_rules() (v3_automation_rules.sql) saknar en unik-spärr på
--      (business_id, name) — omkörning av seed-funktionen har dubblat
--      systemregler för samma företag (PK är uuid, så ON CONFLICT DO NOTHING
--      på insert-satsen skyddar inte mot detta).
--   2. Två KONKURRERANDE 7-dagars fakturaregler har seedats parallellt via
--      olika vägar: "Faktura eskalering dag 7" (sql/v3_seed_rules.sql,
--      create_approval — kanonisk, godkännandeflöde) och "Påminn om förfallen
--      faktura" (lib/seed-defaults.ts + sql/backfill_v3_automation_rules.sql,
--      send_sms med requires_approval — samma tröskel, annan väg). Företag
--      som fått båda ser två kort för samma faktura.
--
-- Denna migration:
--   A. Städar bort regel-dubbletter (behåller ÄLDSTA raden per business+name)
--      och lägger sedan en UNIQUE-spärr så de inte kan återuppstå.
--   B. Inaktiverar "Påminn om förfallen faktura" (den icke-kanoniska
--      regeln) för befintliga företag. lib/seed-defaults.ts är uppdaterad
--      separat (kodändring, del av samma commit) så NYA företag aldrig får
--      den regeln — de får "Faktura eskalering dag 7" i stället.
--   C. Lägger ett partiellt unikt index på pending_approvals så två
--      godkännandekort för samma entitet+approval_type aldrig kan vara
--      pending samtidigt, även vid race conditions (app-lagrets dedupe i
--      lib/automation-engine.ts:handleCreateApproval är den primära
--      spärren — detta är en DB-nivå backstop).
--
-- ─────────────────────────────────────────────────────────────────
-- A. Städa regel-dubbletter, sedan UNIQUE(business_id, name)
-- ─────────────────────────────────────────────────────────────────

-- Radera alla utom äldsta raden (lägst created_at, id som tie-break) per
-- (business_id, name)-grupp. Körs INNAN unique-indexet skapas nedan —
-- annars misslyckas CREATE UNIQUE INDEX om dubbletter finns kvar.
DELETE FROM v3_automation_rules a
USING v3_automation_rules b
WHERE a.business_id = b.business_id
  AND a.name = b.name
  AND (a.created_at, a.id) > (b.created_at, b.id);

-- Idempotent unik-spärr — matchar mönstret i övriga v85+-migrationer
-- (DO $$ ... IF NOT EXISTS-block) snarare än CREATE UNIQUE INDEX IF NOT
-- EXISTS, eftersom vi vill kunna namnge/hitta constrainten senare.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'v3_automation_rules_business_name_unique'
  ) THEN
    ALTER TABLE v3_automation_rules
      ADD CONSTRAINT v3_automation_rules_business_name_unique UNIQUE (business_id, name);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- A2. Interpolerad titel/beskrivning på den kanoniska regeln (del A i
--     dashboard-städpaketet — matchar lib/automation-engine.ts:
--     handleCreateApproval interpolerar {{invoice_number}}/{{customer_name}}
--     från payloaden, och tål regler med gamla statiska texter (ingen
--     platshållare → ingen ersättning, kraschar inte).
-- ─────────────────────────────────────────────────────────────────

UPDATE v3_automation_rules
SET action_config = jsonb_set(
      jsonb_set(
        action_config,
        '{title}',
        to_jsonb('Faktura {{invoice_number}} — obetald 7+ dagar'::text)
      ),
      '{description}',
      to_jsonb('Fakturan till {{customer_name}} har varit obetald i minst 7 dagar. Godkänn för att skicka formell påminnelse.'::text)
    ),
    updated_at = NOW()
WHERE name = 'Faktura eskalering dag 7' AND is_system = true;

-- ─────────────────────────────────────────────────────────────────
-- B. Inaktivera den icke-kanoniska 7-dagarsregeln
-- ─────────────────────────────────────────────────────────────────

-- "Faktura eskalering dag 7" (create_approval) är kanonisk och behålls
-- aktiv. "Påminn om förfallen faktura" (send_sms, samma tröskel) stängs av
-- — is_system-avgränsat så en hantverkares egen custom-regel med samma namn
-- (osannolikt, men) inte träffas av misstag.
UPDATE v3_automation_rules
SET is_active = false, updated_at = NOW()
WHERE name = 'Påminn om förfallen faktura'
  AND is_system = true
  AND is_active = true;

-- ─────────────────────────────────────────────────────────────────
-- C. Partiellt unikt index på pending_approvals (entity + approval_type)
-- ─────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_approvals_entity_dedupe
  ON pending_approvals (business_id, (payload->>'entity_id'), approval_type)
  WHERE status = 'pending' AND payload->>'entity_id' IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- VERIFIERING
-- ─────────────────────────────────────────────────────────────────

-- Ska ge 0 rader (inga kvarvarande regel-dubbletter):
SELECT business_id, name, COUNT(*) FROM v3_automation_rules
GROUP BY business_id, name HAVING COUNT(*) > 1;

-- Ska ge 0 rader (inga kvarvarande pending-dubbletter på samma entitet):
SELECT business_id, payload->>'entity_id' AS entity_id, approval_type, COUNT(*)
FROM pending_approvals
WHERE status = 'pending' AND payload->>'entity_id' IS NOT NULL
GROUP BY business_id, payload->>'entity_id', approval_type HAVING COUNT(*) > 1;

SELECT COUNT(*) AS inaktiverade_dubbelregler FROM v3_automation_rules
WHERE name = 'Påminn om förfallen faktura' AND is_active = false;

-- ROLLBACK (manuellt om behövs):
-- DROP INDEX IF EXISTS idx_pending_approvals_entity_dedupe;
-- ALTER TABLE v3_automation_rules DROP CONSTRAINT IF EXISTS v3_automation_rules_business_name_unique;
-- UPDATE v3_automation_rules SET is_active = true WHERE name = 'Påminn om förfallen faktura' AND is_system = true;
