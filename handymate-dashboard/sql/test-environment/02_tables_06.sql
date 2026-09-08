-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE TABLE public."employee_certificate" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "business_user_id" text NOT NULL,
 "cert_type" text NOT NULL,
 "cert_number" text,
 "issued_date" date,
 "valid_until" date,
 "notes" text,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."employee_certificate" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."employee_certificate" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."reservation_texts" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "title" text NOT NULL,
 "content" text NOT NULL,
 "source" text NOT NULL,
 "system_key" text,
 "is_active" boolean NOT NULL,
 "suggest_enabled" boolean NOT NULL,
 "times_suggested" integer NOT NULL,
 "times_accepted" integer NOT NULL,
 "consecutive_rejects" integer NOT NULL,
 "sort_order" integer NOT NULL,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."reservation_texts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."reservation_texts" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."reservation_triggers" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "reservation_id" text NOT NULL,
 "trigger_type" text NOT NULL,
 "product_id" text,
 "category_slug" text,
 "keyword" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."reservation_triggers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."reservation_triggers" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_integration_credentials" (
 "business_id" text NOT NULL,
 "fortnox_access_token" text,
 "fortnox_refresh_token" text,
 "fortnox_token_expires_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."business_integration_credentials" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_integration_credentials" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."demo_reset_audit" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "actor_user_id" uuid,
 "started_at" timestamp with time zone NOT NULL,
 "finished_at" timestamp with time zone,
 "ok" boolean,
 "error_text" text,
 "reset_version" text NOT NULL
);
ALTER TABLE public."demo_reset_audit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."demo_reset_audit" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."cost_event" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "resource" text NOT NULL,
 "units" numeric NOT NULL,
 "cost_ore" integer NOT NULL,
 "price_version" text NOT NULL,
 "ref_type" text,
 "ref_id" text,
 "meta" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."cost_event" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."cost_event" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."email_inbound_route" (
 "address" text NOT NULL,
 "business_id" text NOT NULL,
 "active" boolean NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "last_received_at" timestamp with time zone
);
ALTER TABLE public."email_inbound_route" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."email_inbound_route" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."landing_events" (
 "id" uuid NOT NULL,
 "event" text NOT NULL,
 "session_id" text,
 "payload" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."landing_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."landing_events" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."partner_payout_batch" (
 "id" uuid NOT NULL,
 "partner_id" uuid NOT NULL,
 "period" text NOT NULL,
 "total_sek" numeric NOT NULL,
 "status" text NOT NULL,
 "statement" jsonb,
 "created_at" timestamp with time zone,
 "paid_at" timestamp with time zone,
 "paid_by" text,
 "invoice_number" text,
 "invoice_date" date,
 "due_date" date,
 "subtotal_sek" numeric,
 "vat_rate" numeric,
 "vat_sek" numeric,
 "total_incl_vat_sek" numeric,
 "document_snapshot" jsonb,
 "delivery_status" text NOT NULL,
 "delivered_at" timestamp with time zone,
 "review_status" text NOT NULL,
 "reviewed_at" timestamp with time zone,
 "dispute_reason" text,
 "created_by" text,
 "payment_reference" text,
 "is_final_payout" boolean NOT NULL,
 "final_payout_reason" text
);
ALTER TABLE public."partner_payout_batch" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."partner_payout_batch" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."partner_commission_ledger" (
 "id" uuid NOT NULL,
 "partner_id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "referral_id" text,
 "period" text NOT NULL,
 "customer_month" integer NOT NULL,
 "base_amount_sek" numeric NOT NULL,
 "rate" numeric NOT NULL,
 "amount_sek" numeric NOT NULL,
 "rate_source" text NOT NULL,
 "tier_snapshot" jsonb,
 "source_billing_event_ids" jsonb NOT NULL,
 "status" text NOT NULL,
 "payout_batch_id" uuid,
 "created_at" timestamp with time zone,
 "paid_at" timestamp with time zone,
 "entry_kind" text NOT NULL,
 "source_key" text NOT NULL,
 "adjusts_ledger_id" uuid
);
ALTER TABLE public."partner_commission_ledger" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."partner_commission_ledger" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."partner_followups" (
 "id" uuid NOT NULL,
 "partner_id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "followup_nr" smallint NOT NULL,
 "done_at" timestamp with time zone NOT NULL,
 "note" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."partner_followups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."partner_followups" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."meeting_job" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "booking_id" text,
 "status" text NOT NULL,
 "segment_count" integer NOT NULL,
 "total_duration_seconds" integer NOT NULL,
 "recording_id" text,
 "error" text,
 "claimed_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."meeting_job" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."meeting_job" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."meeting_segment" (
 "id" uuid NOT NULL,
 "job_id" uuid NOT NULL,
 "seq" integer NOT NULL,
 "storage_path" text,
 "duration_seconds" integer,
 "status" text NOT NULL,
 "transcript" text,
 "whisper_segments" jsonb,
 "error" text,
 "retry_count" integer NOT NULL,
 "created_at" timestamp with time zone,
 "transcript_skipped_reason" text,
 "speaker_segments" jsonb
);
ALTER TABLE public."meeting_segment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."meeting_segment" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_lesson" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "quote_id" text,
 "job_type" text,
 "lesson_text" text NOT NULL,
 "impact_hint" text,
 "source" text NOT NULL,
 "confirmed_by" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."project_lesson" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_lesson" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."customer_fact" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "fact_type" text NOT NULL,
 "content" text NOT NULL,
 "source_type" text NOT NULL,
 "source_id" text,
 "evidence_quote" text,
 "confidence" numeric,
 "superseded_by" text,
 "created_at" timestamp with time zone,
 "confirmed_at" timestamp with time zone,
 "due_at" timestamp with time zone,
 "promise_status" text,
 "fulfilled_by_ref" text,
 "fulfilled_at" timestamp with time zone
);
ALTER TABLE public."customer_fact" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."customer_fact" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."next_best_action" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "computed_date" date NOT NULL,
 "top_approval_id" text NOT NULL,
 "reasoning" text NOT NULL,
 "principles_applied" jsonb NOT NULL,
 "ranked_candidates" jsonb NOT NULL,
 "candidate_count" integer NOT NULL,
 "model" text NOT NULL,
 "created_at" timestamp with time zone
);
ALTER TABLE public."next_best_action" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."next_best_action" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."fuel_ledger" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "amount_ore" integer NOT NULL,
 "source" text NOT NULL,
 "stripe_checkout_session_id" text,
 "stripe_payment_intent_id" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."fuel_ledger" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."fuel_ledger" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."business_twin_forecast" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "created_by_business_user_id" text,
 "scenario_kind" text NOT NULL,
 "scenario_version" integer NOT NULL,
 "fingerprint" text NOT NULL,
 "request_snapshot" jsonb NOT NULL,
 "scenario_snapshot" jsonb NOT NULL,
 "predicted_margin_kr" numeric NOT NULL,
 "predicted_margin_pct" numeric NOT NULL,
 "status" text NOT NULL,
 "project_outcome_id" text,
 "actual_margin_kr" numeric,
 "actual_margin_pct" numeric,
 "margin_error_kr" numeric,
 "margin_error_pp" numeric,
 "lead_time_days" integer,
 "verification_blocker" text,
 "created_at" timestamp with time zone NOT NULL,
 "resolved_at" timestamp with time zone
);
ALTER TABLE public."business_twin_forecast" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_twin_forecast" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."benchmark_consent_audit" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "actor_business_user_id" text,
 "enabled" boolean NOT NULL,
 "consent_version" text NOT NULL,
 "created_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."benchmark_consent_audit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."benchmark_consent_audit" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."mission" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "goal_kr" numeric,
 "deadline" date NOT NULL,
 "status" text NOT NULL,
 "plan_snapshot" jsonb NOT NULL,
 "portfolio_generated_at" timestamp with time zone NOT NULL,
 "created_by" text,
 "created_at" timestamp with time zone NOT NULL,
 "resolved_at" timestamp with time zone,
 "goal_type" text NOT NULL,
 "goal_hours" numeric,
 "goal_count" integer
);
ALTER TABLE public."mission" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."mission" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."invoice_evidence_manifest" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "invoice_id" text NOT NULL,
 "project_id" text,
 "manifest_version" integer NOT NULL,
 "readiness_rules_version" integer NOT NULL,
 "readiness_snapshot" jsonb NOT NULL,
 "input_fingerprint" text NOT NULL,
 "status" text NOT NULL,
 "delivery_method" text,
 "prepared_at" timestamp with time zone NOT NULL,
 "delivered_at" timestamp with time zone,
 "reconciled_at" timestamp with time zone,
 "completeness_flags" jsonb NOT NULL
);
ALTER TABLE public."invoice_evidence_manifest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."invoice_evidence_manifest" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."mission_mandate" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "mission_id" text NOT NULL,
 "plan_hash" text NOT NULL,
 "allowed_action_types" text[] NOT NULL,
 "targets" jsonb NOT NULL,
 "daily_cap" integer NOT NULL,
 "total_cap" integer NOT NULL,
 "amount_cap_kr" numeric,
 "expires_at" date NOT NULL,
 "status" text NOT NULL,
 "pause_reason" text,
 "created_by" text,
 "created_at" timestamp with time zone NOT NULL,
 "revoked_at" timestamp with time zone,
 "paused_at" timestamp with time zone
);
ALTER TABLE public."mission_mandate" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."mission_mandate" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."jobbpass" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "selected_photo_ids" jsonb NOT NULL,
 "service_consent" boolean NOT NULL,
 "status" text NOT NULL,
 "token" text,
 "published_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."jobbpass" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."jobbpass" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."operating_experiment" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "hypothesis" text NOT NULL,
 "agent_key" text NOT NULL,
 "job_type" text NOT NULL,
 "source_pattern_id" text,
 "source_project_ids" jsonb NOT NULL,
 "planned_change" jsonb NOT NULL,
 "guard_rails" jsonb NOT NULL,
 "measures" jsonb NOT NULL,
 "min_comparable_projects" integer NOT NULL,
 "enrolled_project_ids" jsonb NOT NULL,
 "status" text NOT NULL,
 "owner_decision" text,
 "decided_at" timestamp with time zone,
 "resulting_rule_id" text,
 "created_at" timestamp with time zone NOT NULL,
 "confirmed_at" timestamp with time zone,
 "concluded_at" timestamp with time zone,
 "frozen_summary" jsonb
);
ALTER TABLE public."operating_experiment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."operating_experiment" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."support_ticket" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "thread_id" uuid NOT NULL,
 "category" text NOT NULL,
 "summary" text,
 "status" text NOT NULL,
 "escalated_at" timestamp with time zone NOT NULL,
 "resolved_at" timestamp with time zone,
 "satisfaction" text,
 "resolved_by" text
);
ALTER TABLE public."support_ticket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."support_ticket" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."karin_custom_event" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "title" text NOT NULL,
 "event_date" date NOT NULL,
 "note" text,
 "created_by" text,
 "created_at" timestamp with time zone NOT NULL,
 "handled_at" timestamp with time zone
);
ALTER TABLE public."karin_custom_event" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."karin_custom_event" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."gtm_account" (
 "id" uuid NOT NULL,
 "org_number" text,
 "company_name" text NOT NULL,
 "legal_form" text NOT NULL,
 "website" text,
 "company_phone" text,
 "company_email" text,
 "municipality" text,
 "county" text,
 "sni_code" text,
 "industry" text,
 "employee_band" text,
 "turnover_band" text,
 "source_name" text NOT NULL,
 "source_url" text,
 "source_checked_at" timestamp with time zone NOT NULL,
 "source_facts" jsonb NOT NULL,
 "factual_notes" text,
 "processing_purpose" text NOT NULL,
 "lawful_basis" text NOT NULL,
 "retention_review_at" timestamp with time zone NOT NULL,
 "primary_contact_name" text,
 "primary_contact_role" text,
 "primary_contact_email" text,
 "primary_contact_phone" text,
 "primary_contact_linkedin" text,
 "contact_basis" text NOT NULL,
 "fit_score" integer NOT NULL,
 "fit_reasons" jsonb NOT NULL,
 "status" text NOT NULL,
 "suggested_channel" text NOT NULL,
 "owner_user_id" uuid,
 "next_action_at" timestamp with time zone,
 "last_contact_at" timestamp with time zone,
 "contact_count" integer NOT NULL,
 "research_summary" text,
 "relevance_hypothesis" text,
 "opening_angle" text,
 "call_opener" text,
 "email_draft" text,
 "linkedin_draft" text,
 "video_script" text,
 "brief_source_snapshot" jsonb,
 "brief_generated_at" timestamp with time zone,
 "brief_generated_by" text,
 "created_by" uuid NOT NULL,
 "updated_by" uuid NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."gtm_account" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."gtm_account" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."gtm_activity" (
 "id" uuid NOT NULL,
 "account_id" uuid NOT NULL,
 "admin_user_id" uuid NOT NULL,
 "channel" text NOT NULL,
 "outcome" text NOT NULL,
 "notes" text,
 "happened_at" timestamp with time zone NOT NULL,
 "next_action_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."gtm_activity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."gtm_activity" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."gtm_suppression" (
 "id" uuid NOT NULL,
 "account_id" uuid,
 "org_number" text,
 "email" text,
 "phone" text,
 "reason" text NOT NULL,
 "notes" text,
 "created_by" uuid NOT NULL,
 "created_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."gtm_suppression" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."gtm_suppression" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."installation" (
 "installation_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "project_id" text,
 "material_id" text,
 "name" text NOT NULL,
 "manufacturer" text,
 "model" text,
 "serial_number" text,
 "serial_pending" boolean NOT NULL,
 "sku" text,
 "supplier_name" text,
 "placement" text,
 "site_address_line" text,
 "site_postal_code" text,
 "site_city" text,
 "site_property_designation" text,
 "installed_at" date,
 "status" text NOT NULL,
 "confirmed_at" timestamp with time zone,
 "source" text NOT NULL,
 "service_interval_months" integer,
 "service_interval_source" text,
 "service_note" text,
 "care_instructions" text,
 "notes" text,
 "created_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."installation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."installation" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_tip_dismissal" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "tip_key" text NOT NULL,
 "outcome" text NOT NULL,
 "task_id" text,
 "decided_by" text,
 "decided_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."project_tip_dismissal" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_tip_dismissal" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."call_retention_audit" (
 "id" bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public."call_retention_audit_id_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1) NOT NULL,
 "business_id" text NOT NULL,
 "recording_id" text NOT NULL,
 "operation" text NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "legal_review_ref" text NOT NULL,
 "provider_deletion_ref" text NOT NULL
);
ALTER TABLE public."call_retention_audit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."call_retention_audit" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."platform_health_check" (
 "check_key" text NOT NULL,
 "status" text NOT NULL,
 "summary" text,
 "detail" jsonb NOT NULL,
 "checked_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."platform_health_check" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."platform_health_check" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."push_dispatch_log" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "dedupe_key" text NOT NULL,
 "approval_type" text NOT NULL,
 "push_class" text NOT NULL,
 "target_user_id" text,
 "delivered" boolean NOT NULL,
 "sent_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."push_dispatch_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."push_dispatch_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."partner_self_billing_sequence" (
 "partner_id" uuid NOT NULL,
 "invoice_year" integer NOT NULL,
 "last_number" integer NOT NULL,
 "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."partner_self_billing_sequence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."partner_self_billing_sequence" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."push_held" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "target_user_id" text,
 "approval_type" text NOT NULL,
 "push_class" text NOT NULL,
 "dedupe_key" text NOT NULL,
 "title" text NOT NULL,
 "body" text NOT NULL,
 "url" text NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "released_at" timestamp with time zone,
 "release_outcome" text
);
ALTER TABLE public."push_held" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."push_held" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."push_subscriptions" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "user_id" text NOT NULL,
 "endpoint" text NOT NULL,
 "p256dh" text NOT NULL,
 "auth" text NOT NULL,
 "created_at" timestamp with time zone
);
ALTER TABLE public."push_subscriptions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."push_subscriptions" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_log_revision" (
 "id" text NOT NULL,
 "log_id" text NOT NULL,
 "business_id" text NOT NULL,
 "order_id" text NOT NULL,
 "changed_by_user_id" text,
 "changed_at" timestamp with time zone,
 "action" text NOT NULL,
 "before" jsonb,
 "after" jsonb
);
ALTER TABLE public."project_log_revision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_log_revision" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."raddningsarende" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "signal" text NOT NULL,
 "severity" text NOT NULL,
 "status" text NOT NULL,
 "summary" text NOT NULL,
 "evidence" jsonb NOT NULL,
 "first_seen_at" timestamp with time zone NOT NULL,
 "last_seen_at" timestamp with time zone NOT NULL,
 "owner" text,
 "atgard" text,
 "resolved_at" timestamp with time zone,
 "resolved_by" text
);
ALTER TABLE public."raddningsarende" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."raddningsarende" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."lanseringsbevis" (
 "id" text NOT NULL,
 "station" text NOT NULL,
 "business_id" text,
 "evidence" text NOT NULL,
 "evidence_url" text,
 "proven_by" text NOT NULL,
 "proven_at" timestamp with time zone NOT NULL,
 "revoked_at" timestamp with time zone,
 "revoke_reason" text
);
ALTER TABLE public."lanseringsbevis" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."lanseringsbevis" FROM PUBLIC,anon,authenticated;
