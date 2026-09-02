-- OBS: kördes i Supabase under sitt ursprungliga nummer (v194/v195/v196, 2026-09-02) — filen omdöpt eftersom numren togs av ÄTA/dagbok/partner-migrationer på main samma natt. Innehållet oförändrat.
-- v199: Mattes autonoma kundsvar bakom en tenant-grind (2026-09-02).
--
-- Launch Truth Gate punkt 8 (docs/reality-week/pass2-block-a-2026-08-28.md
-- §F): Mattes SMS-svar till kund på inkommande SMS och mejl var den enda
-- kundriktade automationen utan någon som helst grind — modellens eget
-- "autonomous"-beslut avgjorde om ett LLM-skrivet SMS gick till kunden.
--
-- Ny kolumn, default false (fail-closed, samma idiom som
-- referral_ask_enabled/auto_reminder_enabled). Med false blir svaret ett
-- send_sms-kort som ägaren godkänner (lib/matte/action-executor.ts).
-- Ingen UI-toggle ännu — slås på per företag när Matte bevisat sig.

ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS matte_customer_reply_enabled BOOLEAN DEFAULT false;

-- Facit efter körning:
--   SELECT column_default FROM information_schema.columns
--    WHERE table_name = 'business_config' AND column_name = 'matte_customer_reply_enabled';
--   → false
