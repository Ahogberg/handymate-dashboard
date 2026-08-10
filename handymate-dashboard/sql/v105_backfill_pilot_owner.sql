-- ============================================================================
-- v105 — Backfill: owner-rad i business_users för admin-skapade pilotkonton
-- ============================================================================
-- Körs MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND (2026-08-10, gyllene vägen-kartläggningen):
-- /api/admin/create-pilot skapade bara business_config — aldrig någon rad i
-- business_users. getCurrentUser (lib/permissions.ts) läser ENBART
-- business_users, så en admin-skapad pilot ser ut att fungera (login,
-- dashboard) men får 403 på allt behörighetsgrindat: skicka offert, skicka
-- faktura, godkänna kort. Rutten är rättad i kod (commit 5dc032da) —
-- den här migrationen lagar konton som skapades FÖRE rättningen.
--
-- REV 2 (2026-08-10): första körningen föll på FK:n mot auth.users —
-- det finns business_config-rader vars user_id pekar på en RADERAD
-- auth-användare (föräldralösa konton; kan aldrig logga in). De ska
-- hoppas över, inte backfillas. Varje steg kräver nu att användaren
-- faktiskt finns, och steg 0 listar de föräldralösa separat.
--
-- Idempotent: rör bara konton som saknar owner-rad; kan köras flera gånger.
-- ============================================================================

-- Steg 0 — Föräldralösa konton: user_id pekar på en raderad auth-användare.
-- Dessa RÖRS INTE av backfillen. Granska listan — gamla testkonton kan
-- städas senare (manuellt beslut, ingen DELETE här).
SELECT bc.business_id,
       bc.business_name,
       bc.contact_email,
       bc.user_id AS raderad_user_id,
       bc.created_at
FROM business_config bc
WHERE bc.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = bc.user_id);

-- Steg 1 — TITTA FÖRST: vilka LEVANDE konton saknar owner-rad?
-- (Kör denna SELECT ensam innan du kör inserten. Förväntat: admin-skapade
--  piloter. Ser du ett konto här som du VET har fungerande godkännanden —
--  stanna och undersök innan du fortsätter.)
SELECT bc.business_id,
       bc.business_name,
       bc.contact_email,
       bc.is_pilot,
       bc.created_by_admin IS NOT NULL AS skapad_av_admin,
       bc.created_at
FROM business_config bc
WHERE bc.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = bc.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM business_users bu
    WHERE bu.business_id = bc.business_id
      AND bu.user_id = bc.user_id
  );

-- Steg 2 — Backfill: spegla owner-raden från registreringsvägen
-- (samma fält som app/api/auth/route.ts skriver vid vanlig registrering).
INSERT INTO business_users (
  business_id,
  user_id,
  role,
  name,
  email,
  phone,
  accepted_at,
  can_see_all_projects,
  can_see_financials,
  can_manage_users,
  can_approve_time,
  can_create_invoices
)
SELECT bc.business_id,
       bc.user_id,
       'owner',
       COALESCE(bc.contact_name, bc.business_name),
       bc.contact_email,
       bc.phone_number,
       NOW(),
       true, true, true, true, true
FROM business_config bc
WHERE bc.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = bc.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM business_users bu
    WHERE bu.business_id = bc.business_id
      AND bu.user_id = bc.user_id
  );

-- Steg 3 — Verifiera: ska returnera noll rader (föräldralösa exkluderade).
SELECT bc.business_id, bc.business_name
FROM business_config bc
WHERE bc.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = bc.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM business_users bu
    WHERE bu.business_id = bc.business_id
      AND bu.user_id = bc.user_id
  );
