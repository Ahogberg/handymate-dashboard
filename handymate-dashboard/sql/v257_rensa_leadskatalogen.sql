-- v257 (2026-09-17): rensa ut de orörda Platsbanken-importerna ur
-- leadskatalogen.
--
-- Andreas: "de som ligger där just nu vill jag inte ens ha inne."
--
-- Läget före körning, räknat och inte antaget:
--   68 konton, alla source='Platsbanken', importerade 2026-09-15,
--   ALLA med total_score = 15 (en enda unik poängkombination — poängsättningen
--   skiljer dem inte åt), status='identified', contact_state='active',
--   0 kontaktpersoner, 0 aktiviteter, 0 genomgångar, 0 affärer, 0 utkast,
--   0 partnerleads, 0 sekvenser. 69 signaler (annonserna) hänger på dem och
--   följer med i CASCADE.
--
-- AVGRÄNSNINGEN ÄR OCKSÅ SÄKERHETSREGELN, och samma fyra villkor gäller för
-- knappen i Revenue OS (revenue_discard_accounts, v258):
--   1. inga partnerleads — den raden är partnerns historik. Databasen har
--      redan NO ACTION på den FK:n, så detta är bälte OCH hängslen.
--   2. contact_state = 'active' — ett 'opted_out' som raderas är ett NEJ som
--      glöms. Revenue OS skriver inte till gtm_suppression (den listan fylls
--      bara från Launch Desk), så spärren bor på raden. Den får aldrig
--      försvinna.
--   3. inga aktiviteter — har vi hört av oss finns det historik att behålla.
--      Sådana konton stängs som 'lost' med skäl, de raderas inte.
--   4. inga kontaktpersoner — en insamlad kontaktuppgift har en källa och en
--      kontaktgrund. Raderas den tyst tappar vi beviset för varför vi fick
--      spara den.

BEGIN;

-- Räkna före.
SELECT count(*) AS konton_fore FROM public.revenue_accounts;

DELETE FROM public.revenue_accounts a
WHERE a.source = 'Platsbanken'
  AND a.status = 'identified'
  AND a.contact_state = 'active'
  AND NOT EXISTS (SELECT 1 FROM public.revenue_partner_leads l WHERE l.account_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.revenue_activities v WHERE v.account_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.revenue_contacts c WHERE c.account_id = a.id);

COMMIT;

-- Read-only verifiering efter körning.
SELECT count(*) AS konton_efter FROM public.revenue_accounts;
SELECT count(*) AS signaler_kvar FROM public.revenue_signals;
SELECT count(*) AS sparrar_kvar FROM public.gtm_suppression;
