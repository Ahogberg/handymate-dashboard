-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE TABLE public."storefront" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "slug" text,
 "is_published" boolean,
 "hero_headline" text,
 "hero_description" text,
 "about_text" text,
 "hero_image_url" text,
 "gallery_images" jsonb,
 "color_scheme" text,
 "service_descriptions" jsonb,
 "meta_title" text,
 "meta_description" text,
 "page_views" integer,
 "contact_form_submissions" integer,
 "sections" jsonb,
 "show_chat_widget" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "certifications" text
);
ALTER TABLE public."storefront" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."storefront" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_ai_log" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "event_type" text NOT NULL,
 "action" text NOT NULL,
 "details" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."project_ai_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_ai_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."quote_items" (
 "id" text NOT NULL,
 "quote_id" text NOT NULL,
 "business_id" text,
 "item_type" text,
 "group_name" text,
 "description" text,
 "quantity" numeric,
 "unit" text,
 "unit_price" numeric,
 "total" numeric,
 "cost_price" numeric,
 "article_number" text,
 "is_rot_eligible" boolean,
 "is_rut_eligible" boolean,
 "sort_order" integer,
 "created_at" timestamp with time zone,
 "rot_rut_type" text,
 "category_slug" text,
 "linked_product_id" text,
 "option_selected" boolean,
 "option_default" boolean,
 "labor_amount" numeric,
 "material_amount" numeric,
 "estimated_hours" numeric,
 "component_snapshot" jsonb,
 "show_components_to_customer" boolean,
 "is_hidden" boolean NOT NULL
);
ALTER TABLE public."quote_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."quote_items" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."quote_templates" (
 "id" text NOT NULL,
 "business_id" text,
 "name" text NOT NULL,
 "description" text,
 "branch" text,
 "category" text,
 "introduction_text" text,
 "conclusion_text" text,
 "not_included" text,
 "ata_terms" text,
 "payment_terms_text" text,
 "default_items" jsonb,
 "default_payment_plan" jsonb,
 "detail_level" text,
 "show_unit_prices" boolean,
 "show_quantities" boolean,
 "rot_enabled" boolean,
 "rut_enabled" boolean,
 "is_favorite" boolean,
 "usage_count" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "terms_text" text,
 "job_type_slug" text
);
ALTER TABLE public."quote_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."quote_templates" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."quote_standard_texts" (
 "id" text NOT NULL,
 "business_id" text,
 "text_type" text NOT NULL,
 "name" text NOT NULL,
 "content" text,
 "is_default" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."quote_standard_texts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."quote_standard_texts" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."invoice_reminders" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "invoice_id" text NOT NULL,
 "reminder_number" integer NOT NULL,
 "sent_at" timestamp with time zone NOT NULL,
 "sent_method" text,
 "fee_amount" numeric(10,2),
 "penalty_interest_amount" numeric(10,2),
 "total_with_fees" numeric(12,2),
 "message" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."invoice_reminders" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."invoice_reminders" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."travel_entry" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "business_user_id" text,
 "time_entry_id" text,
 "project_id" text,
 "customer_id" text,
 "date" date NOT NULL,
 "from_address" text,
 "to_address" text,
 "distance_km" numeric(10,1),
 "vehicle_type" text,
 "mileage_rate" numeric(10,2),
 "total_amount" numeric(10,2),
 "has_overnight" boolean,
 "meals_provided" text,
 "allowance_amount" numeric(10,2),
 "description" text,
 "approved" boolean,
 "invoiced" boolean,
 "created_at" timestamp with time zone
);
ALTER TABLE public."travel_entry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."travel_entry" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."agent_runs" (
 "run_id" text NOT NULL,
 "business_id" text NOT NULL,
 "trigger_type" text NOT NULL,
 "trigger_data" jsonb,
 "steps" jsonb,
 "tool_calls" integer,
 "final_response" text,
 "tokens_used" integer,
 "estimated_cost" numeric(10,4),
 "duration_ms" integer,
 "status" text,
 "error_message" text,
 "created_at" timestamp with time zone,
 "idempotency_key" text,
 "agent_type" text,
 "agent_id" text
);
ALTER TABLE public."agent_runs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."agent_runs" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."conversations" (
 "conversation_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "agent_run_id" text,
 "type" text NOT NULL,
 "phone_number" text,
 "content" text,
 "metadata" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."conversations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."conversations" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."scheduled_actions" (
 "action_id" text NOT NULL,
 "business_id" text NOT NULL,
 "agent_run_id" text,
 "action_type" text NOT NULL,
 "target_id" text,
 "target_type" text,
 "scheduled_for" timestamp with time zone NOT NULL,
 "action_data" jsonb,
 "status" text,
 "executed_at" timestamp with time zone,
 "result" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."scheduled_actions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."scheduled_actions" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."agent_settings" (
 "business_id" text NOT NULL,
 "settings" jsonb NOT NULL,
 "updated_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."agent_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."agent_settings" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."leads" (
 "lead_id" text NOT NULL,
 "business_id" text NOT NULL,
 "phone" text,
 "email" text,
 "name" text,
 "source" text NOT NULL,
 "status" text NOT NULL,
 "score" integer NOT NULL,
 "score_reasons" jsonb,
 "estimated_value" integer,
 "job_type" text,
 "urgency" text NOT NULL,
 "notes" text,
 "assigned_to" uuid,
 "conversation_id" text,
 "customer_id" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "converted_at" timestamp with time zone,
 "lost_reason" text,
 "project_number" text,
 "pipeline_stage_key" text,
 "lead_source_id" uuid,
 "source_ref" text,
 "category" text,
 "referral_customer_id" text,
 "lead_number" text
);
ALTER TABLE public."leads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."leads" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."lead_activities" (
 "activity_id" text NOT NULL,
 "lead_id" text NOT NULL,
 "business_id" text NOT NULL,
 "activity_type" text NOT NULL,
 "description" text,
 "metadata" jsonb,
 "agent_run_id" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."lead_activities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."lead_activities" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."lead_scoring_rules" (
 "rule_id" text NOT NULL,
 "business_id" text NOT NULL,
 "rule_name" text NOT NULL,
 "condition" jsonb NOT NULL,
 "points" integer NOT NULL,
 "enabled" boolean NOT NULL,
 "created_at" timestamp with time zone
);
ALTER TABLE public."lead_scoring_rules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."lead_scoring_rules" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."automation_rules" (
 "rule_id" text NOT NULL,
 "business_id" text NOT NULL,
 "rule_type" text NOT NULL,
 "label" text NOT NULL,
 "description" text,
 "delay_hours" integer NOT NULL,
 "max_attempts" integer NOT NULL,
 "channel" text NOT NULL,
 "enabled" boolean NOT NULL,
 "message_template" text,
 "risk_level" text NOT NULL,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."automation_rules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."automation_rules" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."automation_queue" (
 "queue_id" text NOT NULL,
 "business_id" text NOT NULL,
 "rule_id" text NOT NULL,
 "rule_type" text NOT NULL,
 "target_id" text NOT NULL,
 "target_type" text NOT NULL,
 "customer_id" text,
 "customer_name" text,
 "target_label" text,
 "scheduled_at" timestamp with time zone NOT NULL,
 "executed_at" timestamp with time zone,
 "attempt_number" integer NOT NULL,
 "status" text NOT NULL,
 "agent_run_id" text,
 "agent_instruction" text,
 "error_message" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."automation_queue" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."automation_queue" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."sms_queue" (
 "queue_id" text NOT NULL,
 "business_id" text NOT NULL,
 "phone_to" text NOT NULL,
 "sender_name" text NOT NULL,
 "message" text NOT NULL,
 "send_after" timestamp with time zone NOT NULL,
 "status" text NOT NULL,
 "created_at" timestamp with time zone,
 "sent_at" timestamp with time zone,
 "error_message" text
);
ALTER TABLE public."sms_queue" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."sms_queue" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."sms_log" (
 "sms_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "direction" text NOT NULL,
 "phone_from" text,
 "phone_to" text,
 "message" text,
 "status" text,
 "elks_id" text,
 "error_message" text,
 "message_type" text,
 "related_id" text,
 "trigger_type" text,
 "trigger_id" text,
 "sent_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "sms_parts" integer,
 "cost_ore" integer,
 "price_version" text
);
ALTER TABLE public."sms_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."sms_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."task_activity_log" (
 "id" text NOT NULL,
 "task_id" text NOT NULL,
 "business_id" text NOT NULL,
 "actor" text,
 "action" text NOT NULL,
 "description" text,
 "old_value" text,
 "new_value" text,
 "metadata" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."task_activity_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."task_activity_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."gmail_imported_message" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "lead_id" text,
 "was_lead" boolean NOT NULL,
 "imported_at" timestamp with time zone
);
ALTER TABLE public."gmail_imported_message" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."gmail_imported_message" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_counters" (
 "business_id" text NOT NULL,
 "counter_type" text NOT NULL,
 "last_value" integer
);
ALTER TABLE public."business_counters" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_counters" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."v3_automation_settings" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "work_days" text[],
 "work_start" time without time zone,
 "work_end" time without time zone,
 "night_mode_enabled" boolean,
 "night_queue_messages" boolean,
 "min_job_value_sek" integer,
 "max_distance_km" integer,
 "auto_reject_below_minimum" boolean,
 "require_approval_send_quote" boolean,
 "require_approval_send_invoice" boolean,
 "require_approval_send_sms" boolean,
 "require_approval_create_booking" boolean,
 "lead_response_target_minutes" integer,
 "quote_followup_days" integer,
 "invoice_reminder_days" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "call_handling_mode" text,
 "referral_discount_pending" jsonb,
 "referral_reminder_last_sent" timestamp with time zone,
 "referral_reminder_count" integer,
 "morning_report_sms_enabled" boolean,
 "quote_signed_email_enabled" boolean,
 "job_report_enabled" boolean,
 "earned_autonomy" jsonb
);
ALTER TABLE public."v3_automation_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."v3_automation_settings" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."v3_automation_rules" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "is_active" boolean,
 "is_system" boolean,
 "trigger_type" text NOT NULL,
 "trigger_config" jsonb NOT NULL,
 "action_type" text NOT NULL,
 "action_config" jsonb NOT NULL,
 "requires_approval" boolean,
 "respects_work_hours" boolean,
 "respects_night_mode" boolean,
 "run_count" integer,
 "last_run_at" timestamp with time zone,
 "last_run_status" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "agent_id" text
);
ALTER TABLE public."v3_automation_rules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."v3_automation_rules" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."v3_automation_logs" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "rule_id" text,
 "rule_name" text NOT NULL,
 "trigger_type" text NOT NULL,
 "action_type" text NOT NULL,
 "status" text NOT NULL,
 "context" jsonb,
 "result" jsonb,
 "error_message" text,
 "approval_id" text,
 "created_at" timestamp with time zone,
 "agent_type" text,
 "agent_id" text,
 "channel" text
);
ALTER TABLE public."v3_automation_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."v3_automation_logs" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."pipeline_stages" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "key" text NOT NULL,
 "label" text NOT NULL,
 "sort_order" integer NOT NULL,
 "is_system" boolean,
 "color" text,
 "created_at" timestamp with time zone,
 "creates_project" boolean
);
ALTER TABLE public."pipeline_stages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."pipeline_stages" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."agent_context" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "generated_at" timestamp with time zone,
 "open_leads_count" integer,
 "overdue_invoices_count" integer,
 "todays_jobs" jsonb,
 "pending_approvals_count" integer,
 "business_health" text,
 "key_insights" jsonb,
 "recommended_priorities" jsonb,
 "model_used" text,
 "tokens_used" integer,
 "slow_months" jsonb,
 "peak_months" jsonb
);
ALTER TABLE public."agent_context" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."agent_context" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."learning_events" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "created_at" timestamp with time zone,
 "event_type" text NOT NULL,
 "reference_id" text,
 "reference_type" text,
 "agent_suggestion" jsonb,
 "human_override" jsonb,
 "learned_preference" text,
 "preference_category" text,
 "confidence" double precision
);
ALTER TABLE public."learning_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."learning_events" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_preferences_legacy_v5" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "updated_at" timestamp with time zone,
 "communication_tone" text,
 "pricing_tendency" text,
 "lead_response_style" text,
 "preferred_sms_length" text,
 "custom_preferences" jsonb
);
ALTER TABLE public."business_preferences_legacy_v5" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_preferences_legacy_v5" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."fortnox_sync" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "entity_type" text NOT NULL,
 "entity_id" text NOT NULL,
 "fortnox_id" text,
 "sync_status" text,
 "last_synced_at" timestamp with time zone,
 "error_message" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."fortnox_sync" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."fortnox_sync" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."pricing_intelligence" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "job_type" text NOT NULL,
 "avg_price" numeric NOT NULL,
 "min_price" numeric NOT NULL,
 "max_price" numeric NOT NULL,
 "median_price" numeric NOT NULL,
 "total_quotes" integer NOT NULL,
 "won_quotes" integer NOT NULL,
 "lost_quotes" integer NOT NULL,
 "win_rate" numeric,
 "avg_margin" numeric,
 "price_trend" text,
 "last_analyzed_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."pricing_intelligence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."pricing_intelligence" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."referrals" (
 "id" text NOT NULL,
 "referrer_business_id" text NOT NULL,
 "referred_business_id" text NOT NULL,
 "status" text,
 "referrer_type" text,
 "partner_name" text,
 "referred_email" text,
 "referrer_discount_applied_at" timestamp with time zone,
 "partner_commission_sek" integer,
 "partner_commission_paid_at" timestamp with time zone,
 "converted_at" timestamp with time zone,
 "rewarded_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "partner_id" uuid,
 "commission_month" integer,
 "commission_expires_at" timestamp with time zone,
 "subscription_plan" text,
 "subscription_amount_sek" integer
);
ALTER TABLE public."referrals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."referrals" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."email_conversations" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "gmail_thread_id" text NOT NULL,
 "gmail_message_id" text NOT NULL,
 "customer_id" text,
 "lead_id" text,
 "matched_by" text,
 "from_email" text NOT NULL,
 "from_name" text,
 "subject" text,
 "body_text" text,
 "received_at" timestamp with time zone,
 "direction" text,
 "status" text,
 "agent_handled" boolean,
 "agent_response" text,
 "attachment_count" integer,
 "has_images" boolean
);
ALTER TABLE public."email_conversations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."email_conversations" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."partners" (
 "id" uuid NOT NULL,
 "created_at" timestamp with time zone,
 "email" text NOT NULL,
 "name" text NOT NULL,
 "company" text,
 "password_hash" text NOT NULL,
 "referral_code" text NOT NULL,
 "referral_url" text,
 "commission_rate" double precision,
 "total_earned_sek" integer,
 "total_pending_sek" integer,
 "status" text,
 "approved_at" timestamp with time zone,
 "approved_by" text,
 "webhook_url" text,
 "webhook_secret" text,
 "api_key" text,
 "total_referred" integer,
 "total_converted" integer,
 "webhook_events" jsonb,
 "commission_tiers" jsonb,
 "base_rate_after" numeric,
 "tier_mode" text,
 "ladder_months" integer,
 "agreement_version" text,
 "agreement_hash" text,
 "agreement_accepted_at" timestamp with time zone,
 "agreement_accepted_ip" text,
 "self_billing_legal_name" text,
 "self_billing_org_number" text,
 "self_billing_registered_address" text,
 "self_billing_vat_number" text,
 "self_billing_vat_registered" boolean,
 "self_billing_vat_rate" numeric,
 "self_billing_f_tax_approved" boolean,
 "self_billing_email" text,
 "payout_bankgiro" text,
 "payout_plusgiro" text,
 "payout_account" text
);
ALTER TABLE public."partners" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."partners" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."vehicles" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "created_at" timestamp with time zone,
 "name" text NOT NULL,
 "reg_number" text,
 "billing_type" text,
 "rate" numeric(10,2) NOT NULL,
 "is_active" boolean
);
ALTER TABLE public."vehicles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."vehicles" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."vehicle_reports" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "vehicle_id" text,
 "project_id" text,
 "lead_id" text,
 "business_user_id" text,
 "created_at" timestamp with time zone,
 "report_date" date NOT NULL,
 "start_address" text,
 "end_address" text,
 "distance" numeric(10,1),
 "distance_unit" text,
 "google_maps_url" text,
 "hours" numeric(10,2),
 "days" numeric(10,2),
 "amount" numeric(10,2),
 "billable" boolean,
 "invoiced" boolean,
 "notes" text
);
ALTER TABLE public."vehicle_reports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."vehicle_reports" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."allowance_types" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "type" text NOT NULL,
 "rate" numeric NOT NULL,
 "unit" text,
 "is_taxable" boolean,
 "billable_to_customer" boolean,
 "is_active" boolean,
 "is_system" boolean,
 "created_at" timestamp with time zone
);
ALTER TABLE public."allowance_types" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."allowance_types" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."allowance_reports" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "business_user_id" text,
 "allowance_type_id" text,
 "project_id" text,
 "report_date" date NOT NULL,
 "quantity" numeric NOT NULL,
 "amount" numeric NOT NULL,
 "description" text,
 "billable" boolean,
 "invoiced" boolean,
 "from_address" text,
 "to_address" text,
 "distance_km" numeric,
 "created_at" timestamp with time zone
);
ALTER TABLE public."allowance_reports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."allowance_reports" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."work_orders" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "order_number" text NOT NULL,
 "title" text NOT NULL,
 "scheduled_date" date,
 "scheduled_start" time without time zone,
 "scheduled_end" time without time zone,
 "address" text,
 "access_info" text,
 "contact_name" text,
 "contact_phone" text,
 "description" text,
 "materials_needed" text,
 "tools_needed" text,
 "notes" text,
 "status" text,
 "sent_at" timestamp with time zone,
 "completed_at" timestamp with time zone,
 "assigned_to" text,
 "assigned_phone" text,
 "dispatch_reasoning" jsonb
);
ALTER TABLE public."work_orders" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."work_orders" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."form_templates" (
 "id" text NOT NULL,
 "business_id" text,
 "name" text NOT NULL,
 "description" text,
 "category" text,
 "fields" jsonb NOT NULL,
 "is_system" boolean,
 "is_active" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."form_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."form_templates" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."form_submissions" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text,
 "template_id" text,
 "name" text NOT NULL,
 "fields" jsonb NOT NULL,
 "answers" jsonb NOT NULL,
 "status" text,
 "completed_at" timestamp with time zone,
 "completed_by" text,
 "signed_at" timestamp with time zone,
 "signed_by_name" text,
 "signature_data" text,
 "notes" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."form_submissions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."form_submissions" FROM PUBLIC,anon,authenticated;
