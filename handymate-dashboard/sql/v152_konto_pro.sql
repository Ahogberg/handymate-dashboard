-- v152: Andreas eget konto + demo@handymate.se → professional, aktiv.
--
-- BAKGRUND (fullsvepet 2026-08-18): testsvitens inloggade session
-- (andreashogberg93@gmail.com) fick 403 trial_expired på feature-grindade
-- rutter (/api/automations, /api/warranties) — kontots subscription_status
-- stod kvar som trial med passerat trial_ends_at. Per garanti-modellen
-- (ingen trial-backfill) sätts befintliga test-/pilotkonton manuellt.
-- Andreas beslut 2026-08-18: båda kontona på professional.
--
-- Datafix, ingen schemaändring.

-- ─── 1. Uppdatera via ägar-kopplingen (business_config.user_id) ─────────
UPDATE business_config bc
SET subscription_plan = 'professional',
    subscription_status = 'active',
    trial_ends_at = NULL
FROM auth.users u
WHERE bc.user_id = u.id
  AND u.email IN ('andreashogberg93@gmail.com', 'demo@handymate.se');

-- ─── 2. Fallback: konton vars koppling bara finns i business_users ──────
-- (om steg 1 redan träffade båda blir detta en no-op)
UPDATE business_config bc
SET subscription_plan = 'professional',
    subscription_status = 'active',
    trial_ends_at = NULL
WHERE bc.business_id IN (
  SELECT bu.business_id
  FROM business_users bu
  JOIN auth.users u ON u.id = bu.user_id
  WHERE u.email IN ('andreashogberg93@gmail.com', 'demo@handymate.se')
    AND bu.is_active = true
);

-- ─── 3. Verifiering — förväntat: professional / active / NULL per konto ─
SELECT bc.business_id, bc.business_name, u.email,
       bc.subscription_plan, bc.subscription_status, bc.trial_ends_at
FROM business_config bc
LEFT JOIN auth.users u ON u.id = bc.user_id
WHERE u.email IN ('andreashogberg93@gmail.com', 'demo@handymate.se')
   OR bc.business_id IN (
     SELECT bu.business_id FROM business_users bu
     JOIN auth.users u2 ON u2.id = bu.user_id
     WHERE u2.email IN ('andreashogberg93@gmail.com', 'demo@handymate.se')
   );
