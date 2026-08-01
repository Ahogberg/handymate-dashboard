-- demo-auth-email.sql
-- Byter demokontots INLOGGNINGS-mail i Supabase Auth:
--   andreas+demo@byglo.se -> demo@handymate.se
-- Dashboarden tillåter inte redigering av e-post under Users — därför SQL.
-- E-posten lagras på TVÅ ställen (auth.users + auth.identities); båda
-- måste uppdateras, annars fungerar inte inloggning med nya adressen.
-- Lösenordet påverkas INTE. Kontot är redan bekräftat (email_confirm
-- sattes vid skapandet) så ingen bekräftelsemail behövs eller skickas.
--
-- Körs manuellt i Supabase SQL Editor. Kör därefter demo-email-align.sql
-- (synkar business_config.contact_email).

-- 1) Auth-användaren
UPDATE auth.users
SET email = 'demo@handymate.se'
WHERE email = 'andreas+demo@byglo.se';

-- 2) Identity-posten (email-providern) — utan denna misslyckas inloggning
UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}', '"demo@handymate.se"')
WHERE provider = 'email'
  AND identity_data->>'email' = 'andreas+demo@byglo.se';

-- 3) Verifiering: ska visa EN rad med demo@handymate.se på båda ställena
SELECT u.id, u.email, u.email_confirmed_at, i.identity_data->>'email' AS identity_email
FROM auth.users u
JOIN auth.identities i ON i.user_id = u.id AND i.provider = 'email'
WHERE u.email = 'demo@handymate.se';
