-- demo_seed_internal_cost — engångsriggning av demokontots INTERNA TIMKOSTNAD
-- (2026-08-12, "hela livscykeln"-utökningen av demokontot).
--
-- Sätter business_config.default_internal_hourly_cost på demokontot
-- (biz_0lovw5vcwzqn, se sql/demo-konto-setup.sql) så computeProjectEconomics
-- (lib/projects/compute-economics.ts) kan räkna arbetskostnad på de
-- tidrapporter (time_entry) som lib/demo/seed-demo-account.ts seedar vid
-- varje "Återställ demon". Utan denna rad blir arbetskostnad_konfigurerad
-- FALSE och marginalen null på alla projekt — ärlighetsprincipen i
-- compute-economics.ts vägrar gissa en kostnad, så demot skulle annars
-- visa "ej konfigurerad" istället för riktiga marginal-siffror.
--
-- MEDVETET SEPARERAD från lib/demo/seed-demo-account.ts (resetDemoAccount,
-- körs varje gång Christoffer trycker "Återställ demon"): den funktionen
-- rör ALDRIG business_config (se filhuvudet där) — samma resonemang som
-- sql/demo_seed_flerpersons.sql (business_users). default_internal_hourly_
-- cost är STRUKTURELL, långlivad konfiguration, inte demo-story-data, och
-- rörs alltså inte av reset-knappen.
--
-- Körs manuellt EN GÅNG i Supabase SQL Editor (inte en migration —
-- samma engångs-riggningsmönster som demo_seed_flerpersons.sql).
-- IDEMPOTENT: en ren UPDATE, säker att köra om.

UPDATE business_config
SET default_internal_hourly_cost = 380
WHERE business_id = 'biz_0lovw5vcwzqn';

-- Verifiering:
SELECT business_id, business_name, default_internal_hourly_cost
FROM business_config
WHERE business_id = 'biz_0lovw5vcwzqn';
