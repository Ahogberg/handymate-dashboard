-- v134_margin_target_explicit.sql (2026-08-14)
--
-- Goal-driven Margin Guardian V1. business_config.margin_target_percent
-- har historiskt DEFAULT 50, vilket betyder att värdet 50 inte bevisar att
-- ägaren faktiskt har valt ett mål. En separat tidsstämpel gör skillnaden
-- mellan systemets default och ett uttryckligen sparat mål verifierbar.
--
-- KÖRS MANUELLT i Supabase SQL Editor. Körs aldrig programmatiskt.

ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS margin_target_set_at TIMESTAMPTZ;

COMMENT ON COLUMN public.business_config.margin_target_set_at IS
  'När marginalmålet senast sparades uttryckligen. NULL betyder att margin_target_percent fortfarande kan vara systemets default och därför inte får styra agentbeslut.';

-- Ett befintligt värde som avviker från schema-defaulten 50 kan inte ha
-- uppstått ur defaulten och är därför säkert att betrakta som uttryckligt.
-- Exakt 50 är tvetydigt och lämnas NULL tills användaren sparar inställningen
-- igen. Hellre inget mål än ett påhittat mål.
UPDATE public.business_config
SET margin_target_set_at = now()
WHERE margin_target_set_at IS NULL
  AND margin_target_percent IS NOT NULL
  AND margin_target_percent <> 50;

CREATE OR REPLACE FUNCTION public.stamp_margin_target_set_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- UPDATE OF-triggern kör när kolumnen finns i SET-listan, även om värdet
  -- råkar vara oförändrat. Därför räknas även ett medvetet sparat 50 %-mål.
  NEW.margin_target_set_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_config_margin_target_explicit
  ON public.business_config;

CREATE TRIGGER trg_business_config_margin_target_explicit
BEFORE UPDATE OF margin_target_percent ON public.business_config
FOR EACH ROW
EXECUTE FUNCTION public.stamp_margin_target_set_at();

-- MANUELL VERIFIERING EFTER KÖRNING:
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'business_config'
--   AND column_name = 'margin_target_set_at';
--
-- SELECT trigger_name, event_manipulation, action_timing
-- FROM information_schema.triggers
-- WHERE event_object_schema = 'public'
--   AND event_object_table = 'business_config'
--   AND trigger_name = 'trg_business_config_margin_target_explicit';
