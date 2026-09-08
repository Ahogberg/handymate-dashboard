-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE TABLE public."monthly_reviews" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "month" date NOT NULL,
 "data" jsonb NOT NULL,
 "analysis" text NOT NULL,
 "recommendations" jsonb,
 "sent_at" timestamp with time zone,
 "viewed_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."monthly_reviews" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."monthly_reviews" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."job_types" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "slug" text NOT NULL,
 "color" text,
 "icon" text,
 "default_hourly_rate" numeric(10,2),
 "sort_order" integer,
 "is_active" boolean,
 "archived_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."job_types" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."job_types" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."matte_conversations" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "user_id" text,
 "title" text,
 "last_message_preview" text,
 "message_count" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."matte_conversations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."matte_conversations" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."matte_messages" (
 "id" uuid NOT NULL,
 "conversation_id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "role" text NOT NULL,
 "content" text NOT NULL,
 "agent_run_id" text,
 "created_at" timestamp with time zone,
 "delegated_to" text
);
ALTER TABLE public."matte_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."matte_messages" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_workflow_stages" (
 "id" text NOT NULL,
 "business_id" text,
 "name" text NOT NULL,
 "position" integer NOT NULL,
 "color" text NOT NULL,
 "icon" text NOT NULL,
 "is_system" boolean,
 "description" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."project_workflow_stages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_workflow_stages" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_stage_automations" (
 "id" uuid NOT NULL,
 "stage_id" text,
 "business_id" text NOT NULL,
 "agent" text NOT NULL,
 "action_type" text NOT NULL,
 "sms_template" text,
 "delay_hours" integer,
 "is_active" boolean,
 "created_at" timestamp with time zone
);
ALTER TABLE public."project_stage_automations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_stage_automations" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."portal_notification_log" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "event" text NOT NULL,
 "sent_at" timestamp with time zone,
 "email_id" text,
 "opened_at" timestamp with time zone,
 "clicked_at" timestamp with time zone
);
ALTER TABLE public."portal_notification_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."portal_notification_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."fortnox_api_log" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "endpoint" text NOT NULL,
 "method" text NOT NULL,
 "status_code" integer,
 "request_payload" jsonb,
 "response_payload" jsonb,
 "error_message" text,
 "duration_ms" integer,
 "created_at" timestamp with time zone
);
ALTER TABLE public."fortnox_api_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."fortnox_api_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."products" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "name" text NOT NULL,
 "description" text,
 "category" text,
 "sku" text,
 "unit" text NOT NULL,
 "purchase_price" numeric,
 "sales_price" numeric NOT NULL,
 "markup_percent" numeric,
 "rot_eligible" boolean,
 "rut_eligible" boolean,
 "vat_rate" numeric,
 "is_active" boolean,
 "is_favorite" boolean,
 "category_id" text,
 "default_labor_share" numeric
);
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."products" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."agent_threads" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "project_id" text,
 "current_agent_id" text NOT NULL,
 "context_summary" text,
 "handoff_count" integer,
 "last_message_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."agent_threads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."agent_threads" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."agent_handoffs" (
 "id" uuid NOT NULL,
 "thread_id" uuid,
 "from_agent" text NOT NULL,
 "to_agent" text NOT NULL,
 "reason" text,
 "context_summary" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."agent_handoffs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."agent_handoffs" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."thread_message" (
 "id" uuid NOT NULL,
 "thread_id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "role" text NOT NULL,
 "agent" text,
 "content" text NOT NULL,
 "is_handoff_announcement" boolean,
 "metadata" jsonb,
 "created_at" timestamp with time zone,
 "images" jsonb
);
ALTER TABLE public."thread_message" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."thread_message" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_knowledge" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "agent_id" text NOT NULL,
 "knowledge_type" text NOT NULL,
 "title" text NOT NULL,
 "observation" text NOT NULL,
 "suggestion" text,
 "confidence" numeric(3,2),
 "data_basis" jsonb,
 "embedding" vector(1536),
 "status" text,
 "related_approval_id" text,
 "created_at" timestamp with time zone,
 "dismissed_at" timestamp with time zone,
 "dismissed_by" text,
 "resolved_at" timestamp with time zone,
 "dedup_key" text,
 "job_type" text
);
ALTER TABLE public."business_knowledge" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_knowledge" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_insights" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "insight_type" text NOT NULL,
 "title" text NOT NULL,
 "description" text NOT NULL,
 "priority" text,
 "data" jsonb,
 "feedback" text,
 "generated_at" timestamp with time zone,
 "expires_at" timestamp with time zone
);
ALTER TABLE public."business_insights" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_insights" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."admin_impersonation_log" (
 "id" uuid NOT NULL,
 "admin_user_id" text NOT NULL,
 "admin_email" text NOT NULL,
 "target_business_id" text NOT NULL,
 "target_business_name" text,
 "started_at" timestamp with time zone NOT NULL,
 "ended_at" timestamp with time zone,
 "duration_seconds" integer GENERATED ALWAYS AS (
CASE
    WHEN (ended_at IS NOT NULL) THEN (EXTRACT(epoch FROM (ended_at - started_at)))::integer
    ELSE NULL::integer
END) STORED,
 "reason" text,
 "mode" text,
 "admin_ip" text,
 "admin_user_agent" text
);
ALTER TABLE public."admin_impersonation_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."admin_impersonation_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_patterns" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "pattern_key" text NOT NULL,
 "value" jsonb NOT NULL,
 "sample_size" integer NOT NULL,
 "confidence" text NOT NULL,
 "is_stale" boolean NOT NULL,
 "data_window_start" timestamp with time zone,
 "data_window_end" timestamp with time zone,
 "metadata" jsonb NOT NULL,
 "last_calculated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."business_patterns" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_patterns" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."profiles" (
 "id" uuid NOT NULL,
 "email" text NOT NULL,
 "full_name" text,
 "avatar_url" text,
 "department" text,
 "role" text,
 "language" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."profiles" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."personas" (
 "id" uuid NOT NULL,
 "user_id" uuid,
 "name" text NOT NULL,
 "description" text,
 "avatar" text,
 "age_min" integer,
 "age_max" integer,
 "life_stage" text,
 "income_level" text,
 "location" text,
 "traits" text[],
 "goals" text[],
 "pain_points" text[],
 "interests" text[],
 "products_interested" text[],
 "digital_maturity" text,
 "channel_preference" text[],
 "system_prompt" text,
 "response_style" text,
 "is_default" boolean,
 "is_active" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."personas" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."personas" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."ad_analyses" (
 "id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "title" text NOT NULL,
 "image_url" text,
 "video_url" text,
 "ad_copy" text,
 "channel" text,
 "brand_fit_score" integer,
 "performance_score" integer,
 "compliance_score" integer,
 "overall_score" integer,
 "heatmap_data" jsonb,
 "compliance_items" jsonb,
 "ai_suggestions" jsonb,
 "persona_feedback" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."ad_analyses" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ad_analyses" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."generated_copies" (
 "id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "channel" text NOT NULL,
 "objective" text NOT NULL,
 "topic" text,
 "target_market" text,
 "headline" text,
 "subheadline" text,
 "body_copy" text,
 "cta" text,
 "hashtags" text,
 "brand_fit_score" integer,
 "tone_scores" jsonb,
 "is_saved" boolean,
 "is_approved" boolean,
 "created_at" timestamp with time zone
);
ALTER TABLE public."generated_copies" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."generated_copies" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."campaign_plans" (
 "id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "status" text,
 "budget" numeric,
 "currency" text,
 "start_date" date,
 "end_date" date,
 "duration_days" integer,
 "channel_mix" jsonb,
 "audience" jsonb,
 "forecast" jsonb,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."campaign_plans" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."campaign_plans" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."localizations" (
 "id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "source_market" text NOT NULL,
 "source_content" jsonb NOT NULL,
 "target_markets" text[],
 "localized_content" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."localizations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."localizations" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."templates" (
 "id" uuid NOT NULL,
 "user_id" text NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "thumbnail_url" text,
 "config" jsonb NOT NULL,
 "is_favorite" boolean NOT NULL,
 "use_count" integer NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."templates" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."production_jobs" (
 "id" uuid NOT NULL,
 "user_id" text NOT NULL,
 "template_id" uuid,
 "name" text NOT NULL,
 "variants" jsonb NOT NULL,
 "formats" text[] NOT NULL,
 "status" text NOT NULL,
 "total_videos" integer NOT NULL,
 "completed_videos" integer NOT NULL,
 "output_urls" text[] NOT NULL,
 "zip_url" text,
 "error_message" text,
 "created_at" timestamp with time zone NOT NULL,
 "completed_at" timestamp with time zone
);
ALTER TABLE public."production_jobs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."production_jobs" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."qa_runs" (
 "id" uuid NOT NULL,
 "user_id" text NOT NULL,
 "creative_kind" text NOT NULL,
 "creative_ref" text NOT NULL,
 "creative_metadata" jsonb,
 "persona_score" numeric,
 "tov_score" numeric,
 "compliance_score" numeric,
 "heatmap_score" numeric,
 "total_score" numeric,
 "status" text NOT NULL,
 "persona_results" jsonb,
 "tov_results" jsonb,
 "compliance_results" jsonb,
 "heatmap_results" jsonb,
 "blocking_issues" jsonb,
 "warnings" jsonb,
 "suggestions" jsonb,
 "approved_by" text,
 "approved_at" timestamp with time zone,
 "approval_note" text,
 "duration_ms" integer,
 "error_message" text,
 "created_at" timestamp with time zone,
 "completed_at" timestamp with time zone
);
ALTER TABLE public."qa_runs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."qa_runs" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."qa_thresholds" (
 "id" uuid NOT NULL,
 "product_type" text NOT NULL,
 "pass_threshold" numeric,
 "warn_threshold" numeric,
 "persona_weight" numeric,
 "tov_weight" numeric,
 "compliance_weight" numeric,
 "heatmap_weight" numeric,
 "required_disclaimers" jsonb,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."qa_thresholds" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."qa_thresholds" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."ai_generations" (
 "id" uuid NOT NULL,
 "user_id" text NOT NULL,
 "kind" text NOT NULL,
 "provider" text NOT NULL,
 "model" text,
 "prompt" text,
 "params" jsonb,
 "result_url" text,
 "thumbnail_url" text,
 "cache_key" text,
 "cache_hit" boolean,
 "cost_usd" numeric,
 "cost_currency" text,
 "latency_ms" integer,
 "status" text NOT NULL,
 "error_message" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."ai_generations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ai_generations" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."user_credits" (
 "user_id" text NOT NULL,
 "monthly_budget_usd" numeric,
 "current_period_spend_usd" numeric,
 "period_start" date,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."user_credits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."user_credits" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."master_creatives" (
 "id" uuid NOT NULL,
 "name" text NOT NULL,
 "source_format" text NOT NULL,
 "master_config" jsonb NOT NULL,
 "format_overrides" jsonb,
 "created_by" text NOT NULL,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."master_creatives" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."master_creatives" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."creative_briefs" (
 "id" uuid NOT NULL,
 "source" text NOT NULL,
 "title" text NOT NULL,
 "problem" text,
 "audience_description" text,
 "audience_personas" text[],
 "current_perception" text,
 "desired_action" text,
 "key_message" text,
 "unique_value" text,
 "insight" text,
 "tension" text,
 "big_idea" text,
 "key_messages" jsonb,
 "value_props" jsonb,
 "tone_of_voice" text,
 "recommended_formats" text[],
 "recommended_channels" text[],
 "recommended_kpis" jsonb,
 "wizard_state" jsonb,
 "status" text,
 "created_by" text NOT NULL,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."creative_briefs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."creative_briefs" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."campaigns" (
 "id" uuid NOT NULL,
 "name" text NOT NULL,
 "brief_id" uuid,
 "master_creative_ids" uuid[],
 "template_ids" uuid[],
 "production_job_ids" uuid[],
 "status" text,
 "approval_notes" text,
 "created_by" text NOT NULL,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."campaigns" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."campaigns" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."rot_payment_request" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "request_type" text NOT NULL,
 "tax_year" integer NOT NULL,
 "invoice_count" integer NOT NULL,
 "total_requested_kr" bigint NOT NULL,
 "file_name" text NOT NULL,
 "xml_content" text,
 "generated_by_user_id" text,
 "status" text NOT NULL,
 "created_at" timestamp with time zone
);
ALTER TABLE public."rot_payment_request" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."rot_payment_request" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."ai_learned_preferences" (
 "business_id" text NOT NULL,
 "communication_tone" text,
 "pricing_tendency" text,
 "lead_response_style" text,
 "preferred_sms_length" text,
 "custom_preferences" jsonb,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."ai_learned_preferences" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ai_learned_preferences" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."billing_event" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "event_type" text NOT NULL,
 "stripe_event_id" text,
 "data" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."billing_event" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."billing_event" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."product_categories" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "parent_id" text,
 "name" text NOT NULL,
 "sort_order" integer,
 "created_at" timestamp with time zone
);
ALTER TABLE public."product_categories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."product_categories" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."product_components" (
 "id" text NOT NULL,
 "product_id" text NOT NULL,
 "business_id" text NOT NULL,
 "component_type" text NOT NULL,
 "description" text NOT NULL,
 "quantity_per_unit" numeric NOT NULL,
 "unit" text NOT NULL,
 "unit_cost" numeric NOT NULL,
 "sort_order" integer,
 "created_at" timestamp with time zone
);
ALTER TABLE public."product_components" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."product_components" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_outcome" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "quote_id" text,
 "job_type" text,
 "template_id" text,
 "quoted_amount" numeric,
 "quoted_hours" numeric,
 "quoted_labor_kr" numeric,
 "quoted_material_kr" numeric,
 "actual_hours" numeric,
 "actual_labor_kr" numeric,
 "actual_material_purchase_kr" numeric,
 "actual_material_billable_kr" numeric,
 "ata_signed_kr" numeric,
 "invoiced_kr" numeric,
 "margin_kr" numeric,
 "margin_pct" numeric,
 "labor_cost_configured" boolean NOT NULL,
 "hours_diff_pct" numeric,
 "amount_diff_pct" numeric,
 "closed_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL,
 "calculation_version" integer,
 "quote_source_type" text,
 "source_counts" jsonb NOT NULL,
 "completeness_flags" jsonb NOT NULL,
 "time_learning_eligible" boolean NOT NULL,
 "financial_learning_eligible" boolean NOT NULL,
 "learning_blockers" text[] NOT NULL,
 "expected_revenue_kr" numeric,
 "realized_revenue_kr" numeric,
 "realized_margin_kr" numeric,
 "realized_margin_pct" numeric,
 "computed_at" timestamp with time zone,
 "frozen_at" timestamp with time zone,
 "reconciled_at" timestamp with time zone
);
ALTER TABLE public."project_outcome" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_outcome" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."service_agreement_type" (
 "type_id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "interval_months" integer NOT NULL,
 "visit_duration_min" integer NOT NULL,
 "price_items" jsonb NOT NULL,
 "match_keys" text[],
 "is_active" boolean NOT NULL,
 "seeded" boolean NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."service_agreement_type" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."service_agreement_type" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."service_agreement" (
 "agreement_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "title" text NOT NULL,
 "job_type" text,
 "interval_months" integer NOT NULL,
 "visit_duration_min" integer NOT NULL,
 "price_items" jsonb NOT NULL,
 "rot_rut_type" text,
 "next_visit_at" timestamp with time zone,
 "status" text NOT NULL,
 "created_from_project_id" text,
 "notes" text,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."service_agreement" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."service_agreement" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_preferences" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "key" text NOT NULL,
 "value" text NOT NULL,
 "source" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."business_preferences" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_preferences" FROM PUBLIC,anon,authenticated;
