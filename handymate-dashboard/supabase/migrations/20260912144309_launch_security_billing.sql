-- No customer data is modified. Browser access is narrowed; service_role keeps access.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.can_manage_business(target_business_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.business_config b where b.business_id = target_business_id and b.user_id::text = auth.uid()::text)
    or exists (select 1 from public.business_users u where u.business_id = target_business_id
      and u.user_id::text = auth.uid()::text and u.is_active is true and u.role in ('owner','admin'))
  );
$$;
revoke all on function private.can_manage_business(text) from public, anon;
grant execute on function private.can_manage_business(text) to authenticated, service_role;

-- The application uploads through authenticated server routes and serves private files
-- with short-lived signed URLs. A browser must never enumerate, sign or delete them.
drop policy if exists "DELETE 1t7nrt5_0" on storage.objects;
drop policy if exists "DELETE 1t7nrt5_1" on storage.objects;
drop policy if exists "INSERT 1t7nrt5_0" on storage.objects;
drop policy if exists "SELECT 1t7nrt5_0" on storage.objects;
create policy launch_storage_read_boundary on storage.objects as restrictive for select
to anon, authenticated using (bucket_id in ('business-assets','team-avatars'));
create policy launch_storage_insert_boundary on storage.objects as restrictive for insert
to anon, authenticated with check (false);
create policy launch_storage_update_boundary on storage.objects as restrictive for update
to anon, authenticated using (false) with check (false);
create policy launch_storage_delete_boundary on storage.objects as restrictive for delete
to anon, authenticated using (false);

-- Team mutations and private personnel fields only through permission-checked APIs.
revoke all on public.business_users from public, anon, authenticated;
grant select (id,business_id,user_id,role,name,email,phone,title,color,avatar_url,is_active)
on public.business_users to authenticated;
drop policy if exists business_users_tenant_member on public.business_users;
create policy business_users_tenant_read on public.business_users for select
to authenticated using (public.is_business_member(business_id));

-- OAuth tokens must never be selectable through the browser Data API.
revoke all on public.calendar_connection from public, anon, authenticated;
grant select (id,business_id,business_user_id,provider,account_email,calendar_id,calendar_name,
sync_enabled,sync_direction,last_sync_at,connected_at,created_at,gmail_scope_granted,
gmail_sync_enabled,gmail_last_sync_at,gmail_send_scope_granted)
on public.calendar_connection to authenticated;
grant update (sync_direction) on public.calendar_connection to authenticated;
drop policy if exists calendar_connection_tenant_member on public.calendar_connection;
create policy calendar_connection_tenant_read on public.calendar_connection for select
to authenticated using (public.is_business_member(business_id));
create policy calendar_connection_manager_update on public.calendar_connection for update
to authenticated using (private.can_manage_business(business_id))
with check (private.can_manage_business(business_id));

-- Keep existing SELECT * clients compatible. Only managers can edit an explicit
-- settings allowlist. Subscription, ownership, demo and provisioning fields are server-only.
revoke all on public.business_config from public, anon, authenticated;
grant select on public.business_config to authenticated;
grant update (
business_name,contact_name,contact_email,phone_number,services_offered,service_area,working_hours,
greeting_script,org_number,google_place_id,default_payment_days,bankgiro,plusgiro,bank_account_number,
f_skatt_registered,swish_number,invoice_prefix,next_invoice_number,invoice_footer_text,penalty_interest,
reminder_fee,max_auto_reminders,reminder_sms_template,auto_reminder_enabled,auto_reminder_days,
late_fee_percent,default_hourly_rate,time_rounding_minutes,time_require_description,standard_work_hours,
overtime_after,break_after_hours,default_break_minutes,require_gps_checkin,require_project,mileage_rate,
allowance_full_day,allowance_half_day,ob1_rate,ob2_rate,overtime_50_rate,overtime_100_rate,
auto_invoice_enabled,auto_invoice_send,auto_invoice_max_amount,auto_invoice_on_complete,updated_at,
website_api_key,google_review_url,review_request_enabled,review_request_delay_days,referral_ask_enabled,
attribution_link_enabled,autopilot_enabled,autopilot_auto_book,autopilot_booking_buffer_days,
autopilot_default_duration_hours,autopilot_auto_sms,autopilot_auto_materials,four_eyes_enabled,
four_eyes_threshold_sek,default_internal_hourly_cost,overhead_monthly_sek,margin_target_percent,
accent_color,quote_template_style,booking_visit_free,phone_setup_type,forwarding_confirmed,
widget_enabled,widget_color,widget_welcome_message,widget_position,widget_bot_name,widget_max_estimate,
widget_collect_contact,widget_book_time,widget_give_estimates,widget_ask_budget,widget_quick_questions,
widget_guardrails,knowledge_base,onboarding_data,onboarding_dismissed,welcome_tour_seen,revenue_target_annual_sek
) on public.business_config to authenticated;
drop policy if exists business_config_tenant_member on public.business_config;
create policy business_config_tenant_read on public.business_config for select
to authenticated using (public.is_business_member(business_id));
create policy business_config_manager_update on public.business_config for update
to authenticated using (private.can_manage_business(business_id))
with check (private.can_manage_business(business_id));

revoke all on function public.rate_limit_check(text,integer,bigint) from public,anon,authenticated;
revoke all on function public.rate_limit_cleanup() from public,anon,authenticated;
grant execute on function public.rate_limit_check(text,integer,bigint) to service_role;
grant execute on function public.rate_limit_cleanup() to service_role;
alter function public.rate_limit_check(text,integer,bigint) set search_path=public,pg_temp;
alter function public.rate_limit_cleanup() set search_path=public,pg_temp;

-- A shared attempt across onboarding/settings and all server instances. Immutable
-- Stripe parameters + one idempotency key survive double clicks and uncertain responses.
create table public.billing_checkout_attempt (
  business_id text primary key references public.business_config(business_id),
  id uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  params jsonb not null,
  stripe_session_id text
);
alter table public.billing_checkout_attempt enable row level security;
revoke all on public.billing_checkout_attempt from public,anon,authenticated;
grant all on public.billing_checkout_attempt to service_role;
create policy billing_checkout_attempt_service on public.billing_checkout_attempt
for all to service_role using (true) with check (true);
