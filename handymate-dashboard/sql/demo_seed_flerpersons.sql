-- demo_seed_flerpersons — engångsriggning av demokontots TEAM
-- (Fas 0.2, planen vad-kan-vi-kopiera-snug-phoenix.md; R2-DoD,
-- tasks/resurs-masterplan.md: "Demokontot bör seedas med flerpersons-
-- schema för säljdemos" — resurstavlan /dashboard/schema demoar tomt/
-- ensamt annars).
--
-- Lägger till 3 extra teammedlemmar (business_users) med olika
-- specialties[] på demokontot (biz_0lovw5vcwzqn, se sql/demo-konto-
-- setup.sql). Samma engångs-riggningsmönster som den filen — INTE en
-- migration, körs EN GÅNG manuellt i Supabase SQL Editor.
--
-- MEDVETET SEPARERAD från lib/demo/seed-demo-account.ts (resetDemoAccount,
-- körs varje gång Christoffer trycker "Återställ demon" på /dashboard/demo):
-- den funktionen rör ALDRIG business_config/business_users/auth (se
-- filhuvudet där) — en destruktiv delete→insert på en tabell som kan vara
-- kopplad till inloggning vore farligt (skulle t.ex. kunna radera
-- presentatörens EGEN inloggade business_users-rad varje reset).
-- Teammedlemmarna här är däremot STRUKTURELL, långlivad data — precis som
-- personal_phone/subscription_plan i demo-konto-setup.sql — och rörs
-- alltså inte av reset-knappen. resetDemoAccount() läser bara vilka
-- AKTIVA business_users som råkar finnas vid varje reset (ingen hård
-- koppling till just dessa tre rader) och bygger veckans bokningar/schema
-- runt dem — kör man ALDRIG den här filen degraderar resurstavla-demot
-- bara snyggt till en enda person (ägaren), aldrig ett fel.
--
-- IDEMPOTENT: UNIQUE(business_id, email) (sql/business_users.sql) gör
-- INSERT ... ON CONFLICT ... DO UPDATE säkert att köra om — uppdaterar
-- bara namn/titel/specialties/färg till samma värden, skapar aldrig
-- dubbletter.
--
-- Kör manuellt i Supabase SQL Editor.

INSERT INTO business_users (
  business_id, name, email, role, title, specialties, color, is_active,
  can_see_all_projects, can_approve_time, created_at
) VALUES
  (
    'biz_0lovw5vcwzqn', 'Erik Nilsson', 'demo-team1@handymate.se', 'employee',
    'Snickare', ARRAY['bygg', 'tak']::TEXT[], '#F59E0B', true,
    false, false, NOW()
  ),
  (
    'biz_0lovw5vcwzqn', 'Sara Lindberg', 'demo-team2@handymate.se', 'employee',
    'Elektriker', ARRAY['el']::TEXT[], '#0F766E', true,
    false, false, NOW()
  ),
  (
    'biz_0lovw5vcwzqn', 'Mattias Karlsson', 'demo-team3@handymate.se', 'employee',
    'VVS-tekniker', ARRAY['vvs']::TEXT[], '#0284C7', true,
    false, false, NOW()
  )
ON CONFLICT (business_id, email) DO UPDATE SET
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  specialties = EXCLUDED.specialties,
  color = EXCLUDED.color,
  is_active = true;

-- Verifiering:
SELECT id, name, email, title, specialties, is_active, created_at
FROM business_users
WHERE business_id = 'biz_0lovw5vcwzqn'
ORDER BY created_at;
