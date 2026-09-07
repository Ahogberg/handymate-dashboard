-- v220 — Rollprov: två testföretag med sju identiteter för Codex steg 3
-- (rollgranskningen 2026-09-07, docs/security/role-audit-2026-09-07).
-- Beslut Andreas 2026-09-07: separat testföretag; bara owner/admin raderar projekt.
--
-- Auth-användarna skapas direkt i auth.users/auth.identities (samma form som
-- GoTrue själv skriver: instance_id 0, aud/role authenticated, tomma
-- token-strängar, email_confirmed_at satt). Lösenordshashar sätts vid
-- körning och finns INTE i den här filen — placeholders __HASH_*__.
-- Inloggningsuppgifter lämnas till Andreas via privat kanal, aldrig i repo.
--
-- Idempotent: ON CONFLICT DO NOTHING på identiteter; företagen kan tas bort
-- med v220_rollprov_ta_bort (nederst, utkommenterad).
BEGIN;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000000000000', '2e5721fe-459b-47f9-951f-eecc1d20a992', 'authenticated', 'authenticated',
  'andreashogberg93+rollprov-owner@gmail.com', '__HASH_OWNER__', now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Rollprov Ägare","rollprov":true}', now(), now(),
  '', '', '', '', '', '', '', '', false, false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('2e5721fe-459b-47f9-951f-eecc1d20a992', '2e5721fe-459b-47f9-951f-eecc1d20a992', '{"sub":"2e5721fe-459b-47f9-951f-eecc1d20a992","email":"andreashogberg93+rollprov-owner@gmail.com","email_verified":true}', 'email', now(), now(), now())
ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000000000000', '9f588b0b-2e0a-4186-be1f-664c5895b2ad', 'authenticated', 'authenticated',
  'andreashogberg93+rollprov-admin@gmail.com', '__HASH_ADMIN__', now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Rollprov Admin","rollprov":true}', now(), now(),
  '', '', '', '', '', '', '', '', false, false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('9f588b0b-2e0a-4186-be1f-664c5895b2ad', '9f588b0b-2e0a-4186-be1f-664c5895b2ad', '{"sub":"9f588b0b-2e0a-4186-be1f-664c5895b2ad","email":"andreashogberg93+rollprov-admin@gmail.com","email_verified":true}', 'email', now(), now(), now())
ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000000000000', '85912ae0-f7ad-49b5-9fcd-ed5ddbefe17e', 'authenticated', 'authenticated',
  'andreashogberg93+rollprov-pm-on@gmail.com', '__HASH_PM_ON__', now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Rollprov PM flaggor PÅ","rollprov":true}', now(), now(),
  '', '', '', '', '', '', '', '', false, false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('85912ae0-f7ad-49b5-9fcd-ed5ddbefe17e', '85912ae0-f7ad-49b5-9fcd-ed5ddbefe17e', '{"sub":"85912ae0-f7ad-49b5-9fcd-ed5ddbefe17e","email":"andreashogberg93+rollprov-pm-on@gmail.com","email_verified":true}', 'email', now(), now(), now())
ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000000000000', 'e6c764ed-39dc-4070-90ac-3f0bc07f218a', 'authenticated', 'authenticated',
  'andreashogberg93+rollprov-pm-off@gmail.com', '__HASH_PM_OFF__', now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Rollprov PM flaggor AV","rollprov":true}', now(), now(),
  '', '', '', '', '', '', '', '', false, false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('e6c764ed-39dc-4070-90ac-3f0bc07f218a', 'e6c764ed-39dc-4070-90ac-3f0bc07f218a', '{"sub":"e6c764ed-39dc-4070-90ac-3f0bc07f218a","email":"andreashogberg93+rollprov-pm-off@gmail.com","email_verified":true}', 'email', now(), now(), now())
ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000000000000', '9579851c-5323-444e-b62a-8c17aae8e84a', 'authenticated', 'authenticated',
  'andreashogberg93+rollprov-emp-assigned@gmail.com', '__HASH_EMP_ASSIGNED__', now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Rollprov Anställd tilldelad","rollprov":true}', now(), now(),
  '', '', '', '', '', '', '', '', false, false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('9579851c-5323-444e-b62a-8c17aae8e84a', '9579851c-5323-444e-b62a-8c17aae8e84a', '{"sub":"9579851c-5323-444e-b62a-8c17aae8e84a","email":"andreashogberg93+rollprov-emp-assigned@gmail.com","email_verified":true}', 'email', now(), now(), now())
ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000000000000', '33a2c802-e7e9-4a01-95a5-f6a124a6bb0e', 'authenticated', 'authenticated',
  'andreashogberg93+rollprov-emp-unassigned@gmail.com', '__HASH_EMP_UNASSIGNED__', now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Rollprov Anställd otilldelad","rollprov":true}', now(), now(),
  '', '', '', '', '', '', '', '', false, false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('33a2c802-e7e9-4a01-95a5-f6a124a6bb0e', '33a2c802-e7e9-4a01-95a5-f6a124a6bb0e', '{"sub":"33a2c802-e7e9-4a01-95a5-f6a124a6bb0e","email":"andreashogberg93+rollprov-emp-unassigned@gmail.com","email_verified":true}', 'email', now(), now(), now())
ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000000000000', '052f737d-e22c-4959-abb0-3ba9606528a0', 'authenticated', 'authenticated',
  'andreashogberg93+rollprov-owner-b@gmail.com', '__HASH_OWNER_B__', now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Rollprov Ägare B","rollprov":true}', now(), now(),
  '', '', '', '', '', '', '', '', false, false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES ('052f737d-e22c-4959-abb0-3ba9606528a0', '052f737d-e22c-4959-abb0-3ba9606528a0', '{"sub":"052f737d-e22c-4959-abb0-3ba9606528a0","email":"andreashogberg93+rollprov-owner-b@gmail.com","email_verified":true}', 'email', now(), now(), now())
ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO business_config (business_id, user_id, business_name, display_name, contact_name, contact_email, branch,
  subscription_status, subscription_plan, call_mode, welcome_tour_seen, onboarding_status)
VALUES ('biz_rollprov_a', '2e5721fe-459b-47f9-951f-eecc1d20a992', 'TEST Rollprov A', 'TEST Rollprov A', 'Rollprov', 'andreashogberg93+rollprov-owner@gmail.com', 'el',
  'comp', 'starter', 'human_first', now(), 'completed')
ON CONFLICT (business_id) DO NOTHING;
INSERT INTO business_config (business_id, user_id, business_name, display_name, contact_name, contact_email, branch,
  subscription_status, subscription_plan, call_mode, welcome_tour_seen, onboarding_status)
VALUES ('biz_rollprov_b', '052f737d-e22c-4959-abb0-3ba9606528a0', 'TEST Rollprov B', 'TEST Rollprov B', 'Rollprov', 'andreashogberg93+rollprov-owner-b@gmail.com', 'el',
  'comp', 'starter', 'human_first', now(), 'completed')
ON CONFLICT (business_id) DO NOTHING;
INSERT INTO business_users (id, business_id, user_id, role, name, email, is_active,
  can_see_all_projects, can_see_financials, can_manage_users, can_approve_time, can_create_invoices,
  internal_hourly_cost, hourly_cost, hourly_rate, accepted_at)
VALUES ('bu_rollprov_owner', 'biz_rollprov_a', '2e5721fe-459b-47f9-951f-eecc1d20a992', 'owner', 'Rollprov Ägare', 'andreashogberg93+rollprov-owner@gmail.com', true,
  true, true, true, true, true,
  320, 320, 850, now())
ON CONFLICT (business_id, email) DO NOTHING;
INSERT INTO business_users (id, business_id, user_id, role, name, email, is_active,
  can_see_all_projects, can_see_financials, can_manage_users, can_approve_time, can_create_invoices,
  internal_hourly_cost, hourly_cost, hourly_rate, accepted_at)
VALUES ('bu_rollprov_admin', 'biz_rollprov_a', '9f588b0b-2e0a-4186-be1f-664c5895b2ad', 'admin', 'Rollprov Admin', 'andreashogberg93+rollprov-admin@gmail.com', true,
  true, true, true, true, true,
  330, 330, 850, now())
ON CONFLICT (business_id, email) DO NOTHING;
INSERT INTO business_users (id, business_id, user_id, role, name, email, is_active,
  can_see_all_projects, can_see_financials, can_manage_users, can_approve_time, can_create_invoices,
  internal_hourly_cost, hourly_cost, hourly_rate, accepted_at)
VALUES ('bu_rollprov_pm_on', 'biz_rollprov_a', '85912ae0-f7ad-49b5-9fcd-ed5ddbefe17e', 'project_manager', 'Rollprov PM flaggor PÅ', 'andreashogberg93+rollprov-pm-on@gmail.com', true,
  true, true, false, true, true,
  340, 340, 850, now())
ON CONFLICT (business_id, email) DO NOTHING;
INSERT INTO business_users (id, business_id, user_id, role, name, email, is_active,
  can_see_all_projects, can_see_financials, can_manage_users, can_approve_time, can_create_invoices,
  internal_hourly_cost, hourly_cost, hourly_rate, accepted_at)
VALUES ('bu_rollprov_pm_off', 'biz_rollprov_a', 'e6c764ed-39dc-4070-90ac-3f0bc07f218a', 'project_manager', 'Rollprov PM flaggor AV', 'andreashogberg93+rollprov-pm-off@gmail.com', true,
  false, false, false, false, false,
  350, 350, 850, now())
ON CONFLICT (business_id, email) DO NOTHING;
INSERT INTO business_users (id, business_id, user_id, role, name, email, is_active,
  can_see_all_projects, can_see_financials, can_manage_users, can_approve_time, can_create_invoices,
  internal_hourly_cost, hourly_cost, hourly_rate, accepted_at)
VALUES ('bu_rollprov_emp_assigned', 'biz_rollprov_a', '9579851c-5323-444e-b62a-8c17aae8e84a', 'employee', 'Rollprov Anställd tilldelad', 'andreashogberg93+rollprov-emp-assigned@gmail.com', true,
  false, false, false, false, false,
  360, 360, 850, now())
ON CONFLICT (business_id, email) DO NOTHING;
INSERT INTO business_users (id, business_id, user_id, role, name, email, is_active,
  can_see_all_projects, can_see_financials, can_manage_users, can_approve_time, can_create_invoices,
  internal_hourly_cost, hourly_cost, hourly_rate, accepted_at)
VALUES ('bu_rollprov_emp_unassigned', 'biz_rollprov_a', '33a2c802-e7e9-4a01-95a5-f6a124a6bb0e', 'employee', 'Rollprov Anställd otilldelad', 'andreashogberg93+rollprov-emp-unassigned@gmail.com', true,
  false, false, false, false, false,
  370, 370, 850, now())
ON CONFLICT (business_id, email) DO NOTHING;
INSERT INTO business_users (id, business_id, user_id, role, name, email, is_active,
  can_see_all_projects, can_see_financials, can_manage_users, can_approve_time, can_create_invoices,
  internal_hourly_cost, hourly_cost, hourly_rate, accepted_at)
VALUES ('bu_rollprov_owner_b', 'biz_rollprov_b', '052f737d-e22c-4959-abb0-3ba9606528a0', 'owner', 'Rollprov Ägare B', 'andreashogberg93+rollprov-owner-b@gmail.com', true,
  true, true, true, true, true,
  380, 380, 850, now())
ON CONFLICT (business_id, email) DO NOTHING;
-- Kund + projekt i A. P1 tilldelat (PM PÅ som lead, anställd tilldelad som member),
-- P2 otilldelat med ekonomi, P3 och P4 tomma för raderingsprovet (nekad + tillåten).
INSERT INTO customer (customer_id, business_id, name, phone_number, email, address_line, contact_source)
VALUES ('cust_rollprov_a1', 'biz_rollprov_a', 'Rollprov Kund AB', '+46700000901', 'rollprov-kund@example.com', 'Solvägen 12, 123 45 Teststad', 'manual')
ON CONFLICT (business_id, phone_number) DO NOTHING;
INSERT INTO quotes (quote_id, business_id, customer_id, title, status, labor_total, total, job_type)
VALUES ('quote_rollprov_p1', 'biz_rollprov_a', 'cust_rollprov_a1', 'Badrum Solvägen 12', 'accepted', 80000, 120000, 'badrum')
ON CONFLICT (quote_id) DO NOTHING;
INSERT INTO project (project_id, business_id, customer_id, quote_id, name, status, project_number, budget_hours, budget_amount, actual_labor_cost, actual_material_cost, profitability_status, job_type) VALUES
 ('proj_rollprov_p1', 'biz_rollprov_a', 'cust_rollprov_a1', 'quote_rollprov_p1', 'P1 Solvägen 12 – badrum (tilldelat)', 'active', 'RP-1', 120, 120000, 24000, 6500, 'on_track', 'badrum'),
 ('proj_rollprov_p2', 'biz_rollprov_a', 'cust_rollprov_a1', NULL, 'P2 Ekvägen 3 – kök (otilldelat)', 'active', 'RP-2', 80, 90000, 12000, 3000, 'on_track', 'kok'),
 ('proj_rollprov_p3', 'biz_rollprov_a', NULL, NULL, 'P3 Tomt – raderingsprov nekad', 'planning', 'RP-3', NULL, NULL, 0, 0, 'on_track', NULL),
 ('proj_rollprov_p4', 'biz_rollprov_a', NULL, NULL, 'P4 Tomt – raderingsprov tillåten', 'planning', 'RP-4', NULL, NULL, 0, 0, 'on_track', NULL)
ON CONFLICT (project_id) DO NOTHING;
INSERT INTO project_assignment (business_id, project_id, order_id, business_user_id, role, assigned_by) VALUES
 ('biz_rollprov_a', 'proj_rollprov_p1', 'proj_rollprov_p1', 'bu_rollprov_pm_on', 'lead', 'bu_rollprov_owner'),
 ('biz_rollprov_a', 'proj_rollprov_p1', 'proj_rollprov_p1', 'bu_rollprov_emp_assigned', 'member', 'bu_rollprov_owner')
ON CONFLICT (order_id, business_user_id) DO NOTHING;
INSERT INTO project_milestone (milestone_id, business_id, project_id, name, budget_hours, budget_amount, status) VALUES
 ('ms_rollprov_p1_1', 'biz_rollprov_a', 'proj_rollprov_p1', 'Rivning', 16, 14000, 'completed'),
 ('ms_rollprov_p1_2', 'biz_rollprov_a', 'proj_rollprov_p1', 'Tätskikt och kakel', 60, 60000, 'in_progress'),
 ('ms_rollprov_p2_1', 'biz_rollprov_a', 'proj_rollprov_p2', 'Demontering', 12, 10000, 'pending')
ON CONFLICT (milestone_id) DO NOTHING;
INSERT INTO time_entry (time_entry_id, business_id, customer_id, project_id, milestone_id, business_user_id, work_date, duration_minutes, hourly_rate, cost_rate, is_billable) VALUES
 ('time_rollprov_1', 'biz_rollprov_a', 'cust_rollprov_a1', 'proj_rollprov_p1', 'ms_rollprov_p1_1', 'bu_rollprov_emp_assigned', current_date - 3, 480, 850, 340, true),
 ('time_rollprov_2', 'biz_rollprov_a', 'cust_rollprov_a1', 'proj_rollprov_p1', 'ms_rollprov_p1_2', 'bu_rollprov_pm_on', current_date - 1, 240, 950, 360, true),
 ('time_rollprov_3', 'biz_rollprov_a', 'cust_rollprov_a1', 'proj_rollprov_p2', 'ms_rollprov_p2_1', 'bu_rollprov_admin', current_date - 2, 180, 850, 330, true)
ON CONFLICT (time_entry_id) DO NOTHING;
INSERT INTO project_material (material_id, business_id, project_id, name, quantity, unit, purchase_price, sell_price, markup_percent, total_purchase, total_sell) VALUES
 ('mat_rollprov_1', 'biz_rollprov_a', 'proj_rollprov_p1', 'Kakel 30x60 vit', 12, 'm2', 250, 400, 60, 3000, 4800),
 ('mat_rollprov_2', 'biz_rollprov_a', 'proj_rollprov_p1', 'Tätskiktssystem', 1, 'st', 3500, 5200, 48.6, 3500, 5200),
 ('mat_rollprov_3', 'biz_rollprov_a', 'proj_rollprov_p2', 'Köksstommar', 8, 'st', 375, 600, 60, 3000, 4800)
ON CONFLICT (material_id) DO NOTHING;
COMMIT;

-- Städning (kör bara medvetet):
-- DELETE FROM auth.users WHERE raw_user_meta_data->>'rollprov' = 'true';  -- cascade via FK SET NULL på business_users
-- DELETE FROM business_config WHERE business_id IN ('biz_rollprov_a','biz_rollprov_b');  -- cascade på business_users/project_assignment; project/customer/quotes/time_entry/material måste tas bort per business_id först
