-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE TABLE public."business_config" (
 "business_id" text NOT NULL,
 "business_name" text NOT NULL,
 "phone_number" text,
 "email" text,
 "services_offered" jsonb NOT NULL,
 "service_area" jsonb,
 "timezone" text NOT NULL,
 "working_hours" jsonb NOT NULL,
 "slot_duration_minutes" integer NOT NULL,
 "min_lead_time_hours" integer NOT NULL,
 "max_advance_booking_days" integer NOT NULL,
 "max_bookings_per_customer" integer NOT NULL,
 "emergency_number" text NOT NULL,
 "greeting_script" text,
 "decline_messages" jsonb NOT NULL,
 "google_calendar_id" text,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL,
 "is_active" boolean NOT NULL,
 "integrations" jsonb,
 "onboarding_status" text,
 "subscription_status" text,
 "subscription_plan" text,
 "trial_ends_at" timestamp with time zone,
 "contact_name" text,
 "contact_email" text,
 "recording_settings" jsonb,
 "knowledge_base" jsonb,
 "pricing_settings" jsonb,
 "user_id" uuid,
 "display_name" text,
 "branch" text,
 "assigned_phone_number" text,
 "forward_phone_number" text,
 "call_recording_enabled" boolean,
 "call_recording_consent_message" text,
 "elks_number_id" text,
 "org_number" text,
 "address" text,
 "industry" text,
 "call_mode" text,
 "phone_setup_type" text,
 "onboarding_completed_at" timestamp with time zone,
 "email_confirmed_at" timestamp with time zone,
 "forwarding_confirmed" boolean,
 "onboarding_dismissed" boolean,
 "logo_url" text,
 "is_pilot" boolean,
 "created_by_admin" uuid,
 "fortnox_connected_at" timestamp with time zone,
 "fortnox_company_name" text,
 "fortnox_auto_sync_invoices" boolean,
 "default_hourly_rate" numeric(10,2),
 "time_rounding_minutes" integer,
 "time_require_description" boolean,
 "rot_enabled" boolean,
 "rut_enabled" boolean,
 "f_skatt_nummer" text,
 "plusgiro" text,
 "accent_color" text,
 "default_quote_terms" jsonb,
 "bankgiro" text,
 "auto_invoice_enabled" boolean,
 "auto_invoice_send" boolean,
 "auto_invoice_max_amount" integer,
 "google_review_url" text,
 "google_place_id" text,
 "review_request_enabled" boolean,
 "review_request_delay_days" integer,
 "widget_enabled" boolean,
 "widget_color" text,
 "widget_welcome_message" text,
 "widget_position" text,
 "widget_bot_name" text,
 "widget_max_estimate" integer,
 "widget_collect_contact" boolean,
 "widget_book_time" boolean,
 "widget_give_estimates" boolean,
 "widget_ask_budget" boolean,
 "widget_quick_questions" jsonb,
 "onboarding_step" integer,
 "onboarding_data" jsonb,
 "callout_fee" numeric,
 "lead_sources" text[],
 "lead_email_address" text,
 "default_payment_days" integer,
 "default_payment_method" text,
 "bank_account_number" text,
 "invoice_prefix" text,
 "next_invoice_number" integer,
 "invoice_footer_text" text,
 "penalty_interest" numeric(5,2),
 "reminder_fee" numeric(10,2),
 "max_auto_reminders" integer,
 "f_skatt_registered" boolean,
 "time_rounding" text,
 "require_gps_checkin" boolean,
 "require_project" boolean,
 "standard_work_hours" numeric(4,1),
 "overtime_after" numeric(4,1),
 "break_after_hours" numeric(4,1),
 "default_break_minutes" integer,
 "mileage_rate" numeric(10,2),
 "allowance_full_day" numeric(10,2),
 "allowance_half_day" numeric(10,2),
 "ob1_rate" numeric(5,2),
 "ob2_rate" numeric(5,2),
 "overtime_50_rate" numeric(5,2),
 "overtime_100_rate" numeric(5,2),
 "default_vat_rate" numeric,
 "swish_number" character varying(20),
 "personal_phone" text,
 "public_phone" text,
 "fortnox_client_id" text,
 "referral_code" text,
 "referred_by" text,
 "stripe_customer_id" text,
 "stripe_subscription_id" text,
 "website_api_key" text,
 "autopilot_enabled" boolean,
 "autopilot_auto_book" boolean,
 "autopilot_auto_sms" boolean,
 "autopilot_auto_materials" boolean,
 "autopilot_booking_buffer_days" integer,
 "autopilot_default_duration_hours" integer,
 "leads_addon" boolean,
 "leads_addon_tier" text,
 "overhead_monthly_sek" numeric,
 "margin_target_percent" numeric,
 "four_eyes_enabled" boolean,
 "four_eyes_threshold_sek" integer,
 "number_strategy" text,
 "auto_invoice_on_complete" boolean,
 "quote_template_style" text,
 "specialties" jsonb,
 "hourly_rate_min" numeric,
 "hourly_rate_max" numeric,
 "welcome_tour_seen" timestamp with time zone,
 "auto_reminder_enabled" boolean,
 "auto_reminder_days" integer,
 "late_fee_percent" numeric,
 "reminder_sms_template" text,
 "fortnox_connected" boolean,
 "fortnox_last_synced_at" timestamp with time zone,
 "widget_guardrails" jsonb,
 "default_internal_hourly_cost" numeric(10,2),
 "agents_globally_paused" boolean,
 "agent_cost_cap_usd_daily" numeric(10,4),
 "default_rot_work_category" text,
 "billing_period_start" timestamp with time zone,
 "billing_period_end" timestamp with time zone,
 "website_url" text,
 "vat_number" text,
 "secondary_branches" text[] NOT NULL,
 "company_form" text,
 "fiscal_year_end_month" smallint,
 "vat_period" text,
 "is_employer" boolean,
 "employee_count" smallint,
 "accounting_firm" text,
 "accounting_contact" text,
 "company_profile_source" text,
 "company_profile_fetched_at" timestamp with time zone,
 "is_demo_tenant" boolean NOT NULL,
 "referral_ask_enabled" boolean,
 "revenue_target_annual_sek" numeric,
 "margin_target_set_at" timestamp with time zone,
 "benchmark_consent_enabled" boolean NOT NULL,
 "benchmark_consent_version" text,
 "benchmark_consent_changed_at" timestamp with time zone,
 "inbound_single_brain" boolean NOT NULL,
 "widget_last_seen_at" timestamp with time zone,
 "widget_last_seen_host" text,
 "matte_customer_reply_enabled" boolean,
 "attribution_link_enabled" boolean,
 "deletion_requested_at" timestamp with time zone,
 "deletion_reason" text,
 "address_street" text,
 "address_postal_code" text,
 "address_city" text,
 "deleted_at" timestamp with time zone,
 "deleted_by" text,
 "portal_ata_signature_mode" text NOT NULL,
 "booking_visit_free" boolean NOT NULL
);
ALTER TABLE public."business_config" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_config" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."customer" (
 "customer_id" text NOT NULL,
 "business_id" text NOT NULL,
 "phone_number" text NOT NULL,
 "name" text NOT NULL,
 "email" text,
 "address_line" text,
 "city" text,
 "postal_code" text,
 "region" text,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL,
 "last_contacted_at" timestamp with time zone,
 "personal_number" text,
 "property_designation" text,
 "portal_token" text,
 "portal_token_created_at" timestamp with time zone,
 "portal_last_visited_at" timestamp with time zone,
 "portal_enabled" boolean,
 "customer_type" text,
 "org_number" text,
 "contact_person" text,
 "invoice_address" text,
 "visit_address" text,
 "reference" text,
 "apartment_count" integer,
 "customer_number" text,
 "segment_id" uuid,
 "contract_type_id" uuid,
 "price_list_id" uuid,
 "default_payment_days" integer,
 "invoice_email" boolean,
 "lifetime_value" numeric(12,2),
 "job_count" integer,
 "last_job_date" date,
 "avg_job_value" numeric(10,2),
 "avg_payment_days" integer,
 "ltv_updated_at" timestamp with time zone,
 "portal_welcomed" boolean,
 "portal_welcomed_at" timestamp with time zone,
 "review_request_sent_at" timestamp with time zone,
 "fortnox_customer_number" text,
 "fortnox_synced_at" timestamp with time zone,
 "sms_opt_out" boolean NOT NULL,
 "sms_opt_out_at" timestamp with time zone,
 "sms_opt_out_source" text,
 "email_opt_out" boolean NOT NULL,
 "email_opt_out_at" timestamp with time zone,
 "email_opt_out_source" text,
 "contact_source" text,
 "contact_source_at" timestamp with time zone,
 "gln_number" text,
 "fortnox_sync_error" text
);
ALTER TABLE public."customer" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."customer" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."call" (
 "call_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "phone_number" text NOT NULL,
 "direction" text NOT NULL,
 "vapi_call_id" text,
 "started_at" timestamp with time zone NOT NULL,
 "ended_at" timestamp with time zone,
 "duration_seconds" integer,
 "final_state" text,
 "outcome" text
);
ALTER TABLE public."call" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."call" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."case_record" (
 "case_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "call_id" text NOT NULL,
 "status" case_status NOT NULL,
 "service_type" text,
 "urgency" urgency_level,
 "problem_verbatim" text,
 "problem_notes" text,
 "problem_summary" text,
 "address_line" text,
 "city" text,
 "postal_code" text,
 "region" text,
 "outcome_reason" text,
 "booking_id" text,
 "version" integer NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."case_record" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."case_record" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."reservation" (
 "reservation_id" text NOT NULL,
 "business_id" text NOT NULL,
 "case_id" text NOT NULL,
 "slot_id" text NOT NULL,
 "status" reservation_status NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "expires_at" timestamp with time zone NOT NULL,
 "released_at" timestamp with time zone,
 "release_reason" release_reason,
 "confirmed_at" timestamp with time zone,
 "booking_id" text,
 "idempotency_key" uuid,
 "release_idempotency_key" uuid
);
ALTER TABLE public."reservation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."reservation" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."booking" (
 "booking_id" text NOT NULL,
 "business_id" text NOT NULL,
 "case_id" text,
 "customer_id" text NOT NULL,
 "reservation_id" text,
 "slot_id" text,
 "scheduled_start" timestamp with time zone NOT NULL,
 "scheduled_end" timestamp with time zone NOT NULL,
 "status" booking_status NOT NULL,
 "confirmation_method" confirmation_method NOT NULL,
 "confirmed_at" timestamp with time zone NOT NULL,
 "calendar_event_id" text,
 "notes" text,
 "idempotency_key" uuid,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL,
 "reminder_sent" timestamp with time zone,
 "job_status" text,
 "completed_at" timestamp with time zone,
 "job_notes" text,
 "follow_up_sent" boolean,
 "customer_rating" integer,
 "rating_feedback" text,
 "google_event_id" text,
 "synced_to_google_at" timestamp with time zone,
 "assigned_to" text,
 "assigned_user_id" text,
 "synced_from_google_at" timestamp with time zone,
 "google_calendar_id" text,
 "on_my_way_at" timestamp with time zone,
 "project_id" text,
 "kind" text NOT NULL,
 "agreement_id" text,
 "meeting_reminder_pushed_at" timestamp with time zone,
 "dispatch_reasoning" jsonb
);
ALTER TABLE public."booking" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."booking" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."human_followup_queue" (
 "queue_id" text NOT NULL,
 "business_id" text NOT NULL,
 "case_id" text NOT NULL,
 "reason" followup_reason NOT NULL,
 "priority" followup_priority NOT NULL,
 "notes" text,
 "callback_requested" boolean NOT NULL,
 "preferred_callback" timestamp with time zone,
 "queued_at" timestamp with time zone NOT NULL,
 "claimed_by" text,
 "claimed_at" timestamp with time zone,
 "resolved_at" timestamp with time zone,
 "resolution_notes" text,
 "idempotency_key" uuid
);
ALTER TABLE public."human_followup_queue" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."human_followup_queue" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."emergency_escalation" (
 "escalation_id" text NOT NULL,
 "business_id" text NOT NULL,
 "call_id" text NOT NULL,
 "case_id" text,
 "emergency_type" emergency_type NOT NULL,
 "caller_utterance" text,
 "emergency_number" text NOT NULL,
 "escalated_at" timestamp with time zone NOT NULL,
 "idempotency_key" uuid
);
ALTER TABLE public."emergency_escalation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."emergency_escalation" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."idempotency_cache" (
 "idempotency_key" uuid NOT NULL,
 "tool_name" text NOT NULL,
 "call_id" text,
 "request_hash" text,
 "response_payload" jsonb NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "expires_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."idempotency_cache" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."idempotency_cache" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."transcript" (
 "transcript_id" text NOT NULL,
 "call_id" text NOT NULL,
 "business_id" text NOT NULL,
 "created_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."transcript" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."transcript" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."transcript_turn" (
 "turn_id" text NOT NULL,
 "transcript_id" text NOT NULL,
 "sequence_number" integer NOT NULL,
 "timestamp" timestamp with time zone NOT NULL,
 "speaker" text NOT NULL,
 "utterance" text NOT NULL,
 "intent_detected" text,
 "entities_extracted" jsonb,
 "confidence" numeric(3,2)
);
ALTER TABLE public."transcript_turn" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."transcript_turn" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."action_log" (
 "log_id" text NOT NULL,
 "call_id" text NOT NULL,
 "business_id" text NOT NULL,
 "sequence_number" integer NOT NULL,
 "timestamp" timestamp with time zone NOT NULL,
 "action_name" text NOT NULL,
 "state_before" text,
 "state_after" text,
 "input_payload" jsonb,
 "output_payload" jsonb,
 "error_code" text,
 "error_message" text,
 "duration_ms" integer,
 "idempotency_key" uuid
);
ALTER TABLE public."action_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."action_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_credentials" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "credential_type" text NOT NULL,
 "credential_data" jsonb NOT NULL,
 "is_active" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."business_credentials" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_credentials" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_phone_numbers" (
 "id" uuid NOT NULL,
 "phone_number" text NOT NULL,
 "business_id" text NOT NULL,
 "provider" text,
 "number_type" text,
 "vapi_phone_id" text,
 "vapi_assistant_id" text,
 "is_active" boolean,
 "created_at" timestamp with time zone,
 "recording_enabled" boolean,
 "forward_to" text,
 "whisper_message" text
);
ALTER TABLE public."business_phone_numbers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_phone_numbers" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_onboarding" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "step_company_info" boolean,
 "step_calendar_connected" boolean,
 "step_sms_configured" boolean,
 "step_phone_assigned" boolean,
 "step_test_call_completed" boolean,
 "step_go_live" boolean,
 "completed_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."business_onboarding" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_onboarding" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_usage" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "period_start" date NOT NULL,
 "period_end" date NOT NULL,
 "inbound_calls" integer,
 "outbound_calls" integer,
 "call_minutes" integer,
 "sms_sent" integer,
 "bookings_created" integer,
 "cost_calls_ore" integer,
 "cost_sms_ore" integer,
 "cost_total_ore" integer,
 "created_at" timestamp with time zone
);
ALTER TABLE public."business_usage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_usage" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."call_recording" (
 "id" uuid NOT NULL,
 "recording_id" text NOT NULL,
 "business_id" text NOT NULL,
 "direction" text,
 "from_number" text,
 "to_number" text,
 "forwarded_to" text,
 "started_at" timestamp with time zone,
 "ended_at" timestamp with time zone,
 "duration_seconds" integer,
 "recording_url" text,
 "recording_fetched" boolean,
 "transcript_text" text,
 "transcript_segments" jsonb,
 "transcribed_at" timestamp with time zone,
 "ai_analysis" jsonb,
 "analyzed_at" timestamp with time zone,
 "customer_id" text,
 "case_id" text,
 "booking_id" text,
 "auto_actions_taken" jsonb,
 "requires_followup" boolean,
 "followup_reason" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "phone_number" text,
 "transcript" text,
 "transcript_summary" text,
 "elks_recording_id" text,
 "source" text NOT NULL,
 "call_processing" jsonb NOT NULL,
 "project_id" text,
 "raw_deleted_at" timestamp with time zone,
 "deal_id" text,
 "initiated_by_user_id" text,
 "call_status" text,
 "transcript_skipped_reason" text
);
ALTER TABLE public."call_recording" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."call_recording" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."sms_campaign" (
 "campaign_id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "message" text NOT NULL,
 "status" text NOT NULL,
 "recipient_filter" jsonb,
 "recipient_count" integer,
 "delivered_count" integer,
 "failed_count" integer,
 "scheduled_at" timestamp with time zone,
 "sent_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "campaign_type" text,
 "auto_reply" boolean
);
ALTER TABLE public."sms_campaign" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."sms_campaign" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."sms_campaign_recipient" (
 "id" integer NOT NULL,
 "campaign_id" text NOT NULL,
 "customer_id" text,
 "phone_number" text NOT NULL,
 "status" text NOT NULL,
 "sent_at" timestamp with time zone,
 "delivered_at" timestamp with time zone,
 "error_message" text,
 "elks_id" text
);
ALTER TABLE public."sms_campaign_recipient" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."sms_campaign_recipient" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."sms_conversation" (
 "id" integer NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "phone_number" text NOT NULL,
 "role" text NOT NULL,
 "content" text NOT NULL,
 "created_at" timestamp with time zone,
 "thread_id" uuid,
 "current_agent" text,
 "provider_message_id" text
);
ALTER TABLE public."sms_conversation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."sms_conversation" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."customer_activity" (
 "id" integer NOT NULL,
 "activity_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "business_id" text NOT NULL,
 "activity_type" text NOT NULL,
 "title" text NOT NULL,
 "description" text,
 "recording_url" text,
 "transcript" text,
 "duration_seconds" integer,
 "metadata" jsonb,
 "created_at" timestamp with time zone,
 "created_by" text
);
ALTER TABLE public."customer_activity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."customer_activity" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."quotes" (
 "id" integer NOT NULL,
 "quote_id" text NOT NULL,
 "business_id" text,
 "customer_id" text,
 "status" text,
 "title" text,
 "description" text,
 "items" jsonb,
 "labor_total" numeric,
 "material_total" numeric,
 "subtotal" numeric,
 "discount_percent" numeric,
 "discount_amount" numeric,
 "vat_rate" numeric,
 "vat_amount" numeric,
 "total" numeric,
 "rot_rut_type" text,
 "rot_rut_eligible" numeric,
 "rot_rut_deduction" numeric,
 "customer_pays" numeric,
 "valid_until" date,
 "sent_at" timestamp with time zone,
 "opened_at" timestamp with time zone,
 "accepted_at" timestamp with time zone,
 "declined_at" timestamp with time zone,
 "decline_reason" text,
 "pdf_url" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "deduction_type" text,
 "customer_personal_number" text,
 "property_designation" text,
 "labor_cost" numeric,
 "material_cost" numeric,
 "deduction_amount" numeric,
 "price_after_deduction" numeric,
 "public_token" text,
 "public_token_expires_at" timestamp with time zone,
 "accepted_by_name" text,
 "accepted_by_email" text,
 "accepted_ip" text,
 "signature_data" text,
 "ai_generated" boolean,
 "ai_confidence" numeric,
 "source_image_url" text,
 "source_transcript" text,
 "quote_number" text,
 "terms" jsonb,
 "images" jsonb,
 "duplicated_from" text,
 "template_id" text,
 "personnummer" text,
 "fastighetsbeteckning" text,
 "introduction_text" text,
 "conclusion_text" text,
 "not_included" text,
 "ata_terms" text,
 "payment_terms_text" text,
 "payment_plan" jsonb,
 "reference_person" text,
 "customer_reference" text,
 "project_address" text,
 "detail_level" text,
 "show_unit_prices" boolean,
 "show_quantities" boolean,
 "rot_work_cost" numeric,
 "rot_deduction" numeric,
 "rot_customer_pays" numeric,
 "rut_work_cost" numeric,
 "rut_deduction" numeric,
 "rut_customer_pays" numeric,
 "attachments" jsonb,
 "fortnox_offer_number" text,
 "fortnox_synced_at" timestamp with time zone,
 "job_type" text,
 "outcome" text,
 "outcome_at" timestamp with time zone,
 "outcome_reason" text,
 "version_number" integer,
 "parent_quote_id" text,
 "version_label" text,
 "view_count" integer,
 "first_viewed_at" timestamp with time zone,
 "last_viewed_at" timestamp with time zone,
 "total_view_seconds" integer,
 "follow_up_count" integer,
 "last_follow_up_at" timestamp with time zone,
 "sign_token" text,
 "lead_id" text,
 "signed_at" timestamp with time zone,
 "signed_by_name" text,
 "signed_by_ip" text,
 "template_style" text,
 "deal_id" text,
 "terms_text" text,
 "signed_options" jsonb,
 "created_by" text,
 "reservations_snapshot" jsonb,
 "expected_margin_snapshot" jsonb,
 "lost_reason" text
);
ALTER TABLE public."quotes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."quotes" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."time_entry" (
 "id" integer NOT NULL,
 "time_entry_id" text,
 "business_id" text NOT NULL,
 "booking_id" text,
 "customer_id" text,
 "description" text,
 "work_date" date NOT NULL,
 "start_time" time without time zone,
 "end_time" time without time zone,
 "duration_minutes" integer NOT NULL,
 "hourly_rate" numeric(10,2),
 "is_billable" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "invoice_id" text,
 "work_type_id" text,
 "invoiced" boolean,
 "project_id" text,
 "milestone_id" text,
 "business_user_id" text,
 "start_latitude" numeric,
 "start_longitude" numeric,
 "start_address" text,
 "end_latitude" numeric,
 "end_longitude" numeric,
 "end_address" text,
 "approval_status" text,
 "approved_by" text,
 "approved_at" timestamp with time zone,
 "rejection_reason" text,
 "break_minutes" integer,
 "check_in_time" timestamp with time zone,
 "check_out_time" timestamp with time zone,
 "check_in_lat" numeric(10,7),
 "check_in_lng" numeric(10,7),
 "check_in_address" text,
 "check_out_lat" numeric(10,7),
 "check_out_lng" numeric(10,7),
 "check_out_address" text,
 "overtime_minutes" integer,
 "overtime_type" text,
 "cost_rate" numeric(10,2),
 "work_category" text,
 "internal_notes" text
);
ALTER TABLE public."time_entry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."time_entry" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."ai_suggestion" (
 "id" integer NOT NULL,
 "suggestion_id" text,
 "business_id" text NOT NULL,
 "recording_id" text,
 "customer_id" text,
 "suggestion_type" text NOT NULL,
 "title" text NOT NULL,
 "description" text,
 "priority" text,
 "suggested_data" jsonb,
 "source_text" text,
 "status" text,
 "created_at" timestamp with time zone,
 "actioned_at" timestamp with time zone,
 "auto_approved" boolean,
 "auto_approved_at" timestamp with time zone
);
ALTER TABLE public."ai_suggestion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ai_suggestion" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."supplier" (
 "supplier_id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "customer_number" text,
 "contact_email" text,
 "contact_phone" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."supplier" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."supplier" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."supplier_product" (
 "product_id" text NOT NULL,
 "supplier_id" text,
 "business_id" text NOT NULL,
 "sku" text,
 "name" text NOT NULL,
 "category" text,
 "unit" text,
 "purchase_price" numeric(10,2),
 "sell_price" numeric(10,2),
 "markup_percent" numeric(5,2),
 "in_stock" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."supplier_product" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."supplier_product" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."invoice" (
 "invoice_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "quote_id" text,
 "invoice_number" text NOT NULL,
 "status" text NOT NULL,
 "items" jsonb NOT NULL,
 "subtotal" numeric(12,2) NOT NULL,
 "vat_rate" numeric(5,2) NOT NULL,
 "vat_amount" numeric(12,2) NOT NULL,
 "total" numeric(12,2) NOT NULL,
 "rot_rut_type" text,
 "rot_rut_deduction" numeric(12,2),
 "customer_pays" numeric(12,2),
 "invoice_date" date NOT NULL,
 "due_date" date NOT NULL,
 "paid_at" timestamp with time zone,
 "sent_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL,
 "fortnox_invoice_number" text,
 "fortnox_document_number" text,
 "fortnox_synced_at" timestamp with time zone,
 "fortnox_sync_error" text,
 "deduction_type" text,
 "customer_personal_number" text,
 "property_designation" text,
 "labor_cost" numeric,
 "material_cost" numeric,
 "deduction_amount" numeric,
 "personnummer" text,
 "fastighetsbeteckning" text,
 "rot_rut_status" text,
 "is_credit_note" boolean,
 "original_invoice_id" text,
 "credit_reason" text,
 "reminder_count" integer,
 "last_reminder_at" timestamp with time zone,
 "next_reminder_at" timestamp with time zone,
 "invoice_type" text,
 "credit_for_invoice_id" text,
 "partial_number" integer,
 "partial_total" integer,
 "payment_plan_id" text,
 "introduction_text" text,
 "conclusion_text" text,
 "internal_notes" text,
 "ocr_number" text,
 "bankgiro_number" text,
 "plusgiro_number" text,
 "bank_account" text,
 "penalty_interest" numeric(5,2),
 "reminder_fee" numeric(10,2),
 "rot_work_cost" numeric(12,2),
 "rot_deduction" numeric(12,2),
 "rot_customer_pays" numeric(12,2),
 "rut_work_cost" numeric(12,2),
 "rut_deduction" numeric(12,2),
 "rut_customer_pays" numeric(12,2),
 "rot_personal_number" text,
 "rot_property_designation" text,
 "sent_method" text,
 "viewed_at" timestamp with time zone,
 "payment_reference" text,
 "attachments" jsonb,
 "our_reference" text,
 "your_reference" text,
 "discount_percent" numeric(5,2),
 "discount_amount" numeric(12,2),
 "paid_via" text,
 "rot_application_status" text,
 "manual_paid_marked_at" timestamp with time zone,
 "manual_paid_by_user_id" text,
 "project_id" text,
 "fortnox_sync_status" text,
 "fortnox_sync_attempted_at" timestamp with time zone,
 "rot_payment_request_id" text,
 "rot_work_category" text,
 "rot_hours" numeric(8,2),
 "rot_material_cost" numeric(12,2),
 "rot_property_type" text,
 "rot_brf_org_number" text,
 "rot_apartment_number" text,
 "rot_decision_status" text,
 "rot_decision_amount_kr" bigint,
 "rot_decision_at" timestamp with time zone,
 "rot_decision_message" text,
 "booking_id" text,
 "template_style" text,
 "delivery_status" text,
 "fortnox_einvoice_sent_at" timestamp with time zone,
 "paid_amount" numeric,
 "settled_at" timestamp with time zone,
 "cancelled_at" timestamp with time zone
);
ALTER TABLE public."invoice" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."invoice" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."material_order" (
 "order_id" text NOT NULL,
 "business_id" text NOT NULL,
 "supplier_id" text,
 "quote_id" text,
 "items" jsonb NOT NULL,
 "total" numeric(12,2) NOT NULL,
 "status" text NOT NULL,
 "delivery_address" text,
 "notes" text,
 "ordered_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."material_order" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."material_order" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."activity" (
 "activity_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "activity_type" text,
 "title" text,
 "description" text,
 "metadata" jsonb,
 "created_by" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."activity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."activity" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."inbox_item" (
 "item_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "item_type" text,
 "title" text,
 "preview" text,
 "is_read" boolean,
 "metadata" jsonb,
 "created_at" timestamp with time zone,
 "channel" text,
 "summary" text,
 "status" text,
 "related_id" text
);
ALTER TABLE public."inbox_item" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."inbox_item" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."admin_audit_log" (
 "id" uuid NOT NULL,
 "action" text NOT NULL,
 "admin_user_id" uuid NOT NULL,
 "target_business_id" text,
 "details" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."admin_audit_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."admin_audit_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."impersonation_tokens" (
 "token_id" text NOT NULL,
 "token" text NOT NULL,
 "admin_user_id" text NOT NULL,
 "target_user_id" text NOT NULL,
 "target_business_id" text NOT NULL,
 "expires_at" timestamp with time zone NOT NULL,
 "used" boolean,
 "used_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."impersonation_tokens" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."impersonation_tokens" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."admin_actions_log" (
 "log_id" text NOT NULL,
 "action" text NOT NULL,
 "admin_user_id" text NOT NULL,
 "admin_email" text,
 "target_business_id" text,
 "details" jsonb,
 "ip_address" text,
 "user_agent" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."admin_actions_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."admin_actions_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."work_type" (
 "work_type_id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "multiplier" numeric(4,2),
 "billable_default" boolean,
 "sort_order" integer,
 "created_at" timestamp with time zone
);
ALTER TABLE public."work_type" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."work_type" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project" (
 "project_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "quote_id" text,
 "name" text NOT NULL,
 "description" text,
 "project_type" text,
 "status" text,
 "budget_hours" numeric,
 "budget_amount" numeric,
 "progress_percent" integer,
 "start_date" date,
 "end_date" date,
 "completed_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "ai_health_score" integer,
 "ai_health_summary" text,
 "ai_last_analyzed_at" timestamp with time zone,
 "ai_auto_created" boolean,
 "lead_id" text,
 "source_lead_data" jsonb,
 "project_number" text,
 "actual_hours" numeric(10,2),
 "actual_labor_cost" numeric(10,2),
 "actual_material_cost" numeric(10,2),
 "profitability_status" text,
 "deal_id" text,
 "current_workflow_stage_id" text,
 "workflow_stage_entered_at" timestamp with time zone,
 "workflow_stage_history" jsonb,
 "job_type" text,
 "fortnox_project_number" text,
 "fortnox_synced_at" timestamp with time zone,
 "fortnox_sync_error" text
);
ALTER TABLE public."project" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_milestone" (
 "milestone_id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "budget_hours" numeric,
 "budget_amount" numeric,
 "status" text,
 "sort_order" integer,
 "due_date" date,
 "completed_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "ai_progress_percent" integer
);
ALTER TABLE public."project_milestone" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_milestone" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_change" (
 "change_id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "change_type" text NOT NULL,
 "description" text NOT NULL,
 "amount" numeric,
 "hours" numeric,
 "status" text,
 "approved_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "ata_number" integer,
 "items" jsonb,
 "total" numeric,
 "sign_token" text,
 "sent_at" timestamp with time zone,
 "sent_to_email" text,
 "sent_to_phone" text,
 "signed_at" timestamp with time zone,
 "signed_by_name" text,
 "signed_by_ip" text,
 "signature_data" text,
 "declined_at" timestamp with time zone,
 "declined_reason" text,
 "quote_id" text,
 "invoice_id" text,
 "invoiced_at" timestamp with time zone,
 "notes" text,
 "customer_id" text,
 "vat_rate" numeric
);
ALTER TABLE public."project_change" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_change" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."supplier_connection" (
 "connection_id" text NOT NULL,
 "business_id" text NOT NULL,
 "supplier_key" text NOT NULL,
 "supplier_name" text NOT NULL,
 "credentials" jsonb,
 "is_connected" boolean,
 "connected_at" timestamp with time zone,
 "last_sync_at" timestamp with time zone,
 "sync_error" text,
 "settings" jsonb,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."supplier_connection" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."supplier_connection" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."grossist_product" (
 "product_id" text NOT NULL,
 "connection_id" text,
 "business_id" text NOT NULL,
 "supplier_key" text NOT NULL,
 "external_id" text,
 "sku" text,
 "ean" text,
 "rsk_number" text,
 "e_number" text,
 "name" text NOT NULL,
 "description" text,
 "category" text,
 "unit" text,
 "purchase_price" numeric(10,2),
 "recommended_price" numeric(10,2),
 "image_url" text,
 "in_stock" boolean,
 "stock_quantity" integer,
 "last_price_sync" timestamp with time zone,
 "raw_data" jsonb,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "normal_price" numeric(10,2),
 "watch_price" boolean,
 "price_history" jsonb
);
ALTER TABLE public."grossist_product" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."grossist_product" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_material" (
 "material_id" text NOT NULL,
 "project_id" text NOT NULL,
 "business_id" text NOT NULL,
 "grossist_product_id" text,
 "supplier_product_id" text,
 "name" text NOT NULL,
 "sku" text,
 "supplier_name" text,
 "quantity" numeric(10,2) NOT NULL,
 "unit" text,
 "purchase_price" numeric(10,2),
 "sell_price" numeric(10,2),
 "markup_percent" numeric(5,2),
 "total_purchase" numeric(10,2),
 "total_sell" numeric(10,2),
 "invoiced" boolean,
 "invoice_id" text,
 "notes" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "from_inventory" boolean,
 "inventory_item_id" uuid,
 "supplier_invoice_id" text
);
ALTER TABLE public."project_material" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_material" FROM PUBLIC,anon,authenticated;
