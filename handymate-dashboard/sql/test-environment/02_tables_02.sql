-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE TABLE public."business_users" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "user_id" uuid,
 "role" text NOT NULL,
 "name" text NOT NULL,
 "email" text NOT NULL,
 "phone" text,
 "title" text,
 "hourly_cost" numeric,
 "hourly_rate" numeric,
 "color" text,
 "avatar_url" text,
 "is_active" boolean,
 "can_see_all_projects" boolean,
 "can_see_financials" boolean,
 "can_manage_users" boolean,
 "can_approve_time" boolean,
 "can_create_invoices" boolean,
 "invite_token" text,
 "invite_expires_at" timestamp with time zone,
 "invited_at" timestamp with time zone,
 "accepted_at" timestamp with time zone,
 "last_login_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "hourly_wage" numeric(10,2),
 "employment_type" text,
 "ob1_rate" numeric(5,2),
 "ob2_rate" numeric(5,2),
 "overtime_50_rate" numeric(5,2),
 "overtime_100_rate" numeric(5,2),
 "vacation_days_total" integer,
 "vacation_days_used" integer,
 "skills" jsonb,
 "specialties" text[],
 "internal_hourly_cost" numeric(10,2)
);
ALTER TABLE public."business_users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."business_users" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_assignment" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "order_id" text,
 "business_user_id" text NOT NULL,
 "role" text NOT NULL,
 "assigned_at" timestamp with time zone,
 "assigned_by" text,
 "project_id" text
);
ALTER TABLE public."project_assignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_assignment" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."schedule_entry" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "business_user_id" text NOT NULL,
 "project_id" text,
 "title" text NOT NULL,
 "description" text,
 "start_datetime" timestamp with time zone NOT NULL,
 "end_datetime" timestamp with time zone NOT NULL,
 "all_day" boolean,
 "type" text NOT NULL,
 "status" text NOT NULL,
 "color" text,
 "created_by" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "google_event_id" text,
 "synced_to_google_at" timestamp with time zone,
 "external_source" text,
 "customer_id" text
);
ALTER TABLE public."schedule_entry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."schedule_entry" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."time_off_request" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "business_user_id" text NOT NULL,
 "start_date" date NOT NULL,
 "end_date" date NOT NULL,
 "type" text NOT NULL,
 "status" text NOT NULL,
 "note" text,
 "approved_by" text,
 "approved_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."time_off_request" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."time_off_request" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_document" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "order_id" text NOT NULL,
 "name" text NOT NULL,
 "file_url" text NOT NULL,
 "file_type" text,
 "file_size" integer,
 "category" text,
 "description" text,
 "uploaded_by" text,
 "created_at" timestamp with time zone,
 "project_id" text,
 "file_path" text,
 "mime_type" text,
 "change_id" text
);
ALTER TABLE public."project_document" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_document" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_log" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "order_id" text NOT NULL,
 "business_user_id" text,
 "date" date NOT NULL,
 "weather" text,
 "temperature" integer,
 "description" text,
 "work_performed" text,
 "issues" text,
 "workers_count" integer,
 "hours_worked" numeric,
 "materials_used" text,
 "photos" text[],
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "signed_by_customer" boolean,
 "customer_signed_at" timestamp with time zone,
 "ata_change_id" text,
 "attested_by_user_id" text,
 "attested_at" timestamp with time zone,
 "locked_at" timestamp with time zone,
 "addendum" text
);
ALTER TABLE public."project_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."checklist_template" (
 "id" text NOT NULL,
 "business_id" text,
 "name" text NOT NULL,
 "description" text,
 "branch" text,
 "items" jsonb,
 "is_system" boolean,
 "created_at" timestamp with time zone
);
ALTER TABLE public."checklist_template" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."checklist_template" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_checklist" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "order_id" text,
 "template_id" text,
 "name" text NOT NULL,
 "status" text,
 "items" jsonb,
 "responses" jsonb,
 "completed_at" timestamp with time zone,
 "completed_by" text,
 "customer_signature" text,
 "customer_name" text,
 "created_at" timestamp with time zone,
 "project_id" text,
 "notes" text
);
ALTER TABLE public."project_checklist" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_checklist" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."calendar_connection" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "business_user_id" text NOT NULL,
 "provider" text NOT NULL,
 "account_email" text,
 "calendar_id" text,
 "calendar_name" text,
 "access_token" text,
 "refresh_token" text,
 "token_expires_at" timestamp with time zone,
 "sync_enabled" boolean,
 "sync_direction" text,
 "last_sync_at" timestamp with time zone,
 "sync_error" text,
 "connected_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "gmail_scope_granted" boolean,
 "gmail_sync_enabled" boolean,
 "gmail_last_sync_at" timestamp with time zone,
 "gmail_send_scope_granted" boolean,
 "gmail_lead_import_enabled" boolean,
 "gmail_lead_approved_senders" text,
 "gmail_lead_blocked_senders" text,
 "gmail_lead_last_import_at" timestamp with time zone,
 "gmail_last_polled_at" timestamp with time zone,
 "gmail_last_history_id" text,
 "last_synced_at" timestamp with time zone
);
ALTER TABLE public."calendar_connection" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."calendar_connection" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."job_template" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "branch" text,
 "estimated_hours" numeric,
 "labor_cost" numeric,
 "materials" jsonb,
 "total_estimate" numeric,
 "usage_count" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "items" jsonb,
 "rot_rut_type" text,
 "terms" jsonb,
 "is_favorite" boolean,
 "category" text
);
ALTER TABLE public."job_template" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."job_template" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."customer_message" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "direction" text NOT NULL,
 "message" text NOT NULL,
 "read_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."customer_message" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."customer_message" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."pipeline_stage" (
 "id" text NOT NULL,
 "business_id" text,
 "name" text NOT NULL,
 "slug" text NOT NULL,
 "color" text,
 "sort_order" integer NOT NULL,
 "is_system" boolean,
 "is_won" boolean,
 "is_lost" boolean,
 "created_at" timestamp with time zone
);
ALTER TABLE public."pipeline_stage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."pipeline_stage" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."deal" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "quote_id" text,
 "order_id" text,
 "invoice_id" text,
 "title" text NOT NULL,
 "description" text,
 "value" numeric,
 "stage_id" text NOT NULL,
 "assigned_to" text,
 "source" text,
 "source_call_id" text,
 "priority" text,
 "expected_close_date" date,
 "closed_at" timestamp with time zone,
 "lost_reason" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "lead_source_id" text,
 "lead_source_platform" text,
 "external_lead_id" text,
 "lead_score" integer,
 "lead_temperature" text,
 "deal_number" integer,
 "won_at" timestamp with time zone,
 "lost_at" timestamp with time zone,
 "stage_updated_at" timestamp with time zone,
 "project_id" text,
 "lead_id" text,
 "job_type" text,
 "referral_customer_id" text,
 "lead_score_factors" jsonb,
 "lead_reasoning" text,
 "suggested_action" text,
 "estimated_value" numeric,
 "first_response_at" timestamp with time zone,
 "response_time_seconds" integer,
 "loss_reason_detail" text,
 "won_value" numeric,
 "lost_value" numeric
);
ALTER TABLE public."deal" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."deal" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."pipeline_activity" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "deal_id" text NOT NULL,
 "activity_type" text NOT NULL,
 "description" text,
 "from_stage_id" text,
 "to_stage_id" text,
 "triggered_by" text NOT NULL,
 "ai_confidence" numeric,
 "ai_reason" text,
 "source_call_id" text,
 "undone_at" timestamp with time zone,
 "undone_by" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."pipeline_activity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."pipeline_activity" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."pipeline_automation" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "auto_create_leads" boolean,
 "auto_move_on_signature" boolean,
 "auto_move_on_payment" boolean,
 "auto_move_on_project_complete" boolean,
 "ai_analyze_calls" boolean,
 "ai_auto_move_threshold" integer,
 "ai_create_lead_threshold" integer,
 "show_ai_activity" boolean,
 "created_at" timestamp with time zone
);
ALTER TABLE public."pipeline_automation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."pipeline_automation" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."template_category" (
 "id" text NOT NULL,
 "name" text NOT NULL,
 "slug" text NOT NULL,
 "description" text,
 "icon" text,
 "sort_order" integer,
 "created_at" timestamp with time zone
);
ALTER TABLE public."template_category" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."template_category" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."document_template" (
 "id" text NOT NULL,
 "business_id" text,
 "category_id" text,
 "name" text NOT NULL,
 "description" text,
 "content" jsonb NOT NULL,
 "variables" jsonb NOT NULL,
 "branch" text,
 "is_system" boolean,
 "is_active" boolean,
 "version" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."document_template" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."document_template" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."generated_document" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "template_id" text,
 "project_id" text,
 "customer_id" text,
 "title" text NOT NULL,
 "content" jsonb NOT NULL,
 "variables_data" jsonb,
 "status" text,
 "signed_at" timestamp with time zone,
 "signed_by_name" text,
 "signed_by_ip" text,
 "signature_data" text,
 "customer_signature" text,
 "customer_signed_name" text,
 "customer_signed_at" timestamp with time zone,
 "notes" text,
 "pdf_url" text,
 "created_by" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."generated_document" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."generated_document" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."automation_settings" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "ai_analyze_calls" boolean,
 "ai_create_leads" boolean,
 "ai_auto_move_deals" boolean,
 "ai_confidence_threshold" integer,
 "pipeline_move_on_quote_sent" boolean,
 "pipeline_move_on_quote_accepted" boolean,
 "pipeline_move_on_invoice_sent" boolean,
 "pipeline_move_on_payment" boolean,
 "sms_booking_confirmation" boolean,
 "sms_day_before_reminder" boolean,
 "sms_on_the_way" boolean,
 "sms_quote_followup" boolean,
 "sms_job_completed" boolean,
 "sms_invoice_reminder" boolean,
 "sms_review_request" boolean,
 "sms_auto_enabled" boolean,
 "sms_quiet_hours_start" text,
 "sms_quiet_hours_end" text,
 "sms_max_per_customer_week" integer,
 "calendar_sync_bookings" boolean,
 "calendar_create_from_booking" boolean,
 "fortnox_sync_invoices" boolean,
 "fortnox_sync_customers" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "auto_approve_config" jsonb,
 "auto_approve_enabled" boolean,
 "owner_absence" jsonb
);
ALTER TABLE public."automation_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."automation_settings" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."automation_activity" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "automation_type" text NOT NULL,
 "action" text NOT NULL,
 "description" text,
 "metadata" jsonb,
 "status" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."automation_activity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."automation_activity" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."customer_document" (
 "id" text NOT NULL,
 "customer_id" text,
 "business_id" text NOT NULL,
 "file_name" text NOT NULL,
 "file_url" text NOT NULL,
 "file_type" text,
 "file_size" integer,
 "category" text,
 "uploaded_at" timestamp with time zone,
 "source" text,
 "lead_id" text,
 "storage_path" text,
 "deal_id" text
);
ALTER TABLE public."customer_document" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."customer_document" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."auto_approve_daily_count" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "action_type" text NOT NULL,
 "count_date" date NOT NULL,
 "count" integer
);
ALTER TABLE public."auto_approve_daily_count" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."auto_approve_daily_count" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."nurture_sequence" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "trigger_type" text NOT NULL,
 "is_active" boolean,
 "steps" jsonb NOT NULL,
 "cancel_on" jsonb,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."nurture_sequence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."nurture_sequence" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."nurture_enrollment" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "sequence_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "deal_id" text,
 "current_step" integer,
 "status" text,
 "enrolled_at" timestamp with time zone,
 "next_action_at" timestamp with time zone,
 "completed_at" timestamp with time zone,
 "cancelled_at" timestamp with time zone,
 "cancel_reason" text
);
ALTER TABLE public."nurture_enrollment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."nurture_enrollment" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."communication_log" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text,
 "channel" text NOT NULL,
 "direction" text,
 "subject" text,
 "message" text,
 "status" text,
 "metadata" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."communication_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."communication_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."notification" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "user_id" text,
 "type" text NOT NULL,
 "title" text NOT NULL,
 "message" text,
 "icon" text,
 "link" text,
 "is_read" boolean,
 "read_at" timestamp with time zone,
 "metadata" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."notification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."notification" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."customer_tag" (
 "tag_id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "color" text NOT NULL,
 "created_at" timestamp with time zone
);
ALTER TABLE public."customer_tag" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."customer_tag" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."customer_tag_assignment" (
 "id" text NOT NULL,
 "customer_id" text NOT NULL,
 "tag_id" text NOT NULL,
 "assigned_at" timestamp with time zone
);
ALTER TABLE public."customer_tag_assignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."customer_tag_assignment" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."warranty" (
 "warranty_id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "booking_id" text,
 "invoice_id" text,
 "title" text NOT NULL,
 "description" text,
 "start_date" date NOT NULL,
 "end_date" date NOT NULL,
 "status" text NOT NULL,
 "warranty_type" text,
 "terms" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "project_id" text,
 "installation_id" text,
 "warranty_kind" text,
 "issuer" text,
 "source" text
);
ALTER TABLE public."warranty" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."warranty" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."email_template" (
 "template_id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "subject" text NOT NULL,
 "body" text NOT NULL,
 "category" text NOT NULL,
 "variables" jsonb,
 "is_default" boolean,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."email_template" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."email_template" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."subcontractor" (
 "subcontractor_id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "company_name" text,
 "org_number" text,
 "phone_number" text,
 "email" text,
 "specialization" text,
 "hourly_rate" numeric(10,2),
 "rating" integer,
 "notes" text,
 "status" text NOT NULL,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."subcontractor" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."subcontractor" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."subcontractor_assignment" (
 "assignment_id" text NOT NULL,
 "subcontractor_id" text NOT NULL,
 "business_id" text NOT NULL,
 "booking_id" text,
 "project_id" text,
 "description" text,
 "start_date" date,
 "end_date" date,
 "agreed_rate" numeric(10,2),
 "total_amount" numeric(10,2),
 "status" text NOT NULL,
 "created_at" timestamp with time zone
);
ALTER TABLE public."subcontractor_assignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."subcontractor_assignment" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."task" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "title" text NOT NULL,
 "description" text,
 "status" text,
 "priority" text,
 "due_date" date,
 "due_time" time without time zone,
 "assigned_to" text,
 "customer_id" text,
 "deal_id" text,
 "project_id" text,
 "completed_at" timestamp with time zone,
 "created_by" text,
 "created_at" timestamp with time zone,
 "visibility" text
);
ALTER TABLE public."task" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."task" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."deal_note" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "deal_id" text NOT NULL,
 "content" text NOT NULL,
 "created_by" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."deal_note" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."deal_note" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."lead_source" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "platform" text NOT NULL,
 "name" text NOT NULL,
 "is_active" boolean,
 "config" jsonb,
 "inbound_email" text,
 "leads_imported" integer,
 "last_import_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."lead_source" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."lead_source" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."review_request" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "deal_id" text,
 "sent_via" text NOT NULL,
 "sent_at" timestamp with time zone,
 "clicked_at" timestamp with time zone,
 "review_received" boolean,
 "review_url" text,
 "sms_text" text,
 "status" text
);
ALTER TABLE public."review_request" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."review_request" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."inventory" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "sku" text,
 "category" text,
 "unit" text,
 "quantity" numeric,
 "min_quantity" numeric,
 "unit_cost" numeric,
 "location" text,
 "supplier" text,
 "last_restocked_at" timestamp with time zone,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."inventory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."inventory" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."inventory_transaction" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "inventory_id" text NOT NULL,
 "project_id" text,
 "type" text NOT NULL,
 "quantity" numeric NOT NULL,
 "note" text,
 "created_by" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."inventory_transaction" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."inventory_transaction" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_cost" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "category" text NOT NULL,
 "description" text NOT NULL,
 "amount" numeric NOT NULL,
 "date" date,
 "created_at" timestamp with time zone
);
ALTER TABLE public."project_cost" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_cost" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."widget_conversation" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "session_id" text NOT NULL,
 "visitor_name" text,
 "visitor_phone" text,
 "visitor_email" text,
 "messages" jsonb,
 "lead_created" boolean,
 "deal_id" text,
 "message_count" integer,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."widget_conversation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."widget_conversation" FROM PUBLIC,anon,authenticated;
