-- V76: time_checkins.business_user_id (Etapp 1, tasks/multi-employee-parity-plan.md)
-- Kör manuellt i Supabase SQL Editor. Idempotent (kan köras flera gånger).
--
-- Bakgrund: time_checkins.user_id är en auth-UUID (TD-1, tasks/tech-debt.md:38),
-- inte en business_users.id — routes som joinar mot business_users för att
-- attribuera en incheckning till en specifik anställd (checkin/approve,
-- approvals/[id] time_attestation-caset) gör idag en ad-hoc-join varje
-- gång. Denna kolumn gör kopplingen explicit och indexerad på time_checkins
-- självt, och backfyller historiska rader så äldre incheckningar också får
-- rätt anställd-attribuering retroaktivt (påverkar inte redan skapade
-- time_entry-rader — bara framtida läsningar av time_checkins).

-- 1. Ny nullbar kolumn + FK mot business_users.id
ALTER TABLE time_checkins
  ADD COLUMN IF NOT EXISTS business_user_id TEXT REFERENCES business_users(id);

-- 2. Backfill: matcha på BÅDE business_id och user_id (en person kan vara
--    anställd/ägare i flera businesses med samma auth-uuid — utan
--    business_id-matchningen kan backfillen råka peka på fel företags rad).
--    ::text-cast på båda sidor (2026-08-03, körfel): schemat har glidit
--    sedan v17/business_users.sql skrevs — business_users.user_id är UUID
--    i prod idag (auth.uid() jämförs mot den överallt i RLS/appkod), inte
--    TEXT som den ursprungliga migrationsfilen deklarerade. Casta explicit
--    så det fungerar oavsett vilken sida som faktiskt är UUID.
UPDATE time_checkins tc
SET business_user_id = bu.id
FROM business_users bu
WHERE bu.user_id::text = tc.user_id::text
  AND bu.business_id = tc.business_id
  AND tc.business_user_id IS NULL;

-- 3. Index för framtida filtrering/joins (t.ex. löneexport, per-person-vyer)
CREATE INDEX IF NOT EXISTS idx_time_checkins_business_user
  ON time_checkins(business_user_id);

-- 4. Verifiering — kör efter migrationen, kontrollera att backfillen
--    faktiskt fyllde i rimligt många rader. total = alla rader,
--    matched = rader som fick ett business_user_id, unmatched = rader där
--    ingen business_users-rad hittades för (business_id, user_id)-paret
--    (t.ex. borttagna/inaktiverade konton — förväntat att vara > 0 för
--    gamla testdata, men bör vara nära 0 för aktiva businesses).
SELECT
  COUNT(*) AS total_checkins,
  COUNT(business_user_id) AS matched,
  COUNT(*) - COUNT(business_user_id) AS unmatched
FROM time_checkins;
