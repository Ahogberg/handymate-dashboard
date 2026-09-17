-- v255 (2026-09-17): rensa demokunder som blev kvar efter misslyckade
-- återställningar.
--
-- Återställningen har fallit sedan unique_phone_per_business kom (unikt index
-- på customer(business_id, phone_number)): alla sex demokunder fick ägarens
-- personal_phone, så kund nummer TVÅ kraschade varje gång. Läst ur
-- demo_reset_audit 2026-09-17:
--   "customer_insert_failed: Kunde inte skapa kund mikael: duplicate key
--    value violates unique constraint \"unique_phone_per_business\""
--
-- Koden är rättad (demokunderna får simulerade nummer, se
-- lib/demo/simulerad-telefoni.ts), men två rader ligger kvar från de
-- avbrutna körningarna och skulle annars krocka igen:
--   Anna Lindqvist  0700456357   biz_0lovw5vcwzqn (15 sept, avbruten körning)
--   Andreas Högberg +46708379552 biz_demo_ekstrom (12 sept)
--
-- AVGRÄNSAT: bara rader vars business_id tillhör ett företag med
-- is_demo_tenant = true. Inget riktigt företags kunder kan träffas av den
-- här satsen.
--
-- OBS: indexet unique_phone_per_business finns i produktionen men i ingen
-- fil under sql/ — det är handskapat i Supabase-editorn. Definitionen är
-- dokumenterad här så nästa läsare inte tror att det inte finns:
--   CREATE UNIQUE INDEX unique_phone_per_business
--     ON public.customer USING btree (business_id, phone_number);

DELETE FROM public.customer
WHERE business_id IN (SELECT business_id FROM public.business_config WHERE is_demo_tenant = true);

-- Read-only verifiering efter körning (ska ge 0):
SELECT count(*) AS kvar_pa_demokonton
FROM public.customer c
JOIN public.business_config b ON b.business_id = c.business_id
WHERE b.is_demo_tenant = true;
