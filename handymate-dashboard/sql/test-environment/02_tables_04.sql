-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE TABLE public."supplier_invoices" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "supplier_name" text NOT NULL,
 "invoice_number" text,
 "invoice_date" date,
 "due_date" date,
 "amount_excl_vat" numeric(12,2) NOT NULL,
 "vat_amount" numeric(12,2),
 "total_amount" numeric(12,2) NOT NULL,
 "markup_percent" numeric(5,2),
 "billable_to_customer" boolean,
 "show_to_customer" boolean,
 "status" text,
 "paid_at" timestamp with time zone,
 "receipt_url" text,
 "notes" text,
 "subcontractor_id" text,
 "fortnox_supplier_invoice_number" text,
 "fortnox_supplier_number" text,
 "fortnox_synced_at" timestamp with time zone,
 "fortnox_project_number" text,
 "fortnox_cost_center" text,
 "fortnox_reference" text,
 "fortnox_rows" jsonb,
 "match_source" text,
 "matched_at" timestamp with time zone
);
ALTER TABLE public."supplier_invoices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."supplier_invoices" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."canvas_items" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text NOT NULL,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone,
 "canvas_data" jsonb,
 "thumbnail_url" text,
 "entity_type" text,
 "entity_id" text
);
ALTER TABLE public."canvas_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."canvas_items" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."push_tokens" (
 "id" uuid NOT NULL,
 "business_id" text,
 "token" text NOT NULL,
 "platform" text,
 "created_at" timestamp with time zone,
 "last_used_at" timestamp with time zone,
 "user_id" text
);
ALTER TABLE public."push_tokens" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."push_tokens" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."quote_categories" (
 "id" uuid NOT NULL,
 "slug" text NOT NULL,
 "label" text NOT NULL,
 "rot_eligible" boolean,
 "rut_eligible" boolean,
 "is_system" boolean,
 "sort_order" integer
);
ALTER TABLE public."quote_categories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."quote_categories" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."custom_quote_categories" (
 "id" uuid NOT NULL,
 "business_id" text,
 "slug" text NOT NULL,
 "label" text NOT NULL,
 "rot_eligible" boolean,
 "rut_eligible" boolean,
 "created_at" timestamp with time zone
);
ALTER TABLE public."custom_quote_categories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."custom_quote_categories" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."partner_events" (
 "id" uuid NOT NULL,
 "partner_id" uuid,
 "business_id" text,
 "event_type" text NOT NULL,
 "amount_sek" integer,
 "meta" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."partner_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."partner_events" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."lead_sources" (
 "id" uuid NOT NULL,
 "business_id" text,
 "name" text NOT NULL,
 "portal_code" text NOT NULL,
 "api_key" text NOT NULL,
 "is_active" boolean,
 "created_at" timestamp with time zone,
 "notes" text,
 "default_category" text,
 "source_type" text,
 "color" text
);
ALTER TABLE public."lead_sources" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."lead_sources" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."customer_segments" (
 "id" uuid NOT NULL,
 "business_id" text,
 "name" text NOT NULL,
 "description" text,
 "color" text,
 "is_default" boolean,
 "sort_order" integer,
 "created_at" timestamp with time zone
);
ALTER TABLE public."customer_segments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."customer_segments" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."contract_types" (
 "id" uuid NOT NULL,
 "business_id" text,
 "name" text NOT NULL,
 "type" text NOT NULL,
 "description" text,
 "is_default" boolean,
 "sort_order" integer,
 "created_at" timestamp with time zone
);
ALTER TABLE public."contract_types" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."contract_types" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."price_lists_v2" (
 "id" uuid NOT NULL,
 "business_id" text,
 "name" text NOT NULL,
 "description" text,
 "segment_id" uuid,
 "contract_type_id" uuid,
 "is_default" boolean,
 "hourly_rate_normal" numeric(10,2),
 "hourly_rate_ob1" numeric(10,2),
 "hourly_rate_ob2" numeric(10,2),
 "hourly_rate_emergency" numeric(10,2),
 "material_markup_pct" numeric(5,2),
 "callout_fee" numeric(10,2),
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."price_lists_v2" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."price_lists_v2" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."price_list_items_v2" (
 "id" uuid NOT NULL,
 "price_list_id" uuid,
 "business_id" text,
 "name" text NOT NULL,
 "description" text,
 "unit" text,
 "price" numeric(10,2) NOT NULL,
 "category_slug" text,
 "is_rot_eligible" boolean,
 "is_rut_eligible" boolean,
 "sort_order" integer
);
ALTER TABLE public."price_list_items_v2" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."price_list_items_v2" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."pending_approvals" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "agent_run_id" text,
 "approval_type" text NOT NULL,
 "title" text NOT NULL,
 "description" text,
 "payload" jsonb NOT NULL,
 "status" text,
 "risk_level" text,
 "created_at" timestamp with time zone,
 "expires_at" timestamp with time zone,
 "resolved_at" timestamp with time zone,
 "resolved_by" text,
 "package_id" text,
 "package_type" text,
 "package_data" jsonb,
 "routed_agent" text,
 "routed_by" text,
 "routing_role" text,
 "routed_business_user_id" text,
 "snoozed_until" timestamp with time zone
);
ALTER TABLE public."pending_approvals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."pending_approvals" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_stages" (
 "id" uuid NOT NULL,
 "project_id" text NOT NULL,
 "business_id" text NOT NULL,
 "stage" text NOT NULL,
 "label" text NOT NULL,
 "completed_at" timestamp with time zone,
 "completed_by" text,
 "note" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."project_stages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_stages" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_photos" (
 "id" uuid NOT NULL,
 "project_id" text NOT NULL,
 "business_id" text NOT NULL,
 "url" text NOT NULL,
 "caption" text,
 "type" text,
 "uploaded_at" timestamp with time zone
);
ALTER TABLE public."project_photos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_photos" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."quote_tracking_events" (
 "id" uuid NOT NULL,
 "quote_id" text NOT NULL,
 "business_id" text NOT NULL,
 "event_type" text NOT NULL,
 "session_id" text,
 "duration_seconds" integer,
 "ip_hash" text,
 "user_agent" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."quote_tracking_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."quote_tracking_events" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."seasonality_insights" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "month" integer NOT NULL,
 "avg_revenue" numeric(10,2),
 "avg_job_count" integer,
 "is_slow_month" boolean,
 "is_peak_month" boolean,
 "last_analyzed_at" timestamp with time zone
);
ALTER TABLE public."seasonality_insights" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."seasonality_insights" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."seasonal_campaigns" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "year" integer NOT NULL,
 "month" integer NOT NULL,
 "theme" text NOT NULL,
 "branch" text,
 "approval_id" text,
 "customer_count" integer,
 "status" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."seasonal_campaigns" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."seasonal_campaigns" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."inventory_locations" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "is_default" boolean,
 "created_at" timestamp with time zone
);
ALTER TABLE public."inventory_locations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."inventory_locations" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."inventory_items" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "location_id" uuid,
 "product_id" uuid,
 "name" text NOT NULL,
 "unit" text,
 "current_stock" numeric(10,2),
 "min_stock" numeric(10,2),
 "cost_price" numeric(10,2),
 "sell_price" numeric(10,2),
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."inventory_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."inventory_items" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."inventory_movements" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "item_id" uuid,
 "project_id" text,
 "order_id" text,
 "movement_type" text NOT NULL,
 "quantity" numeric(10,2) NOT NULL,
 "note" text,
 "created_by" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."inventory_movements" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."inventory_movements" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."time_checkins" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "user_id" text NOT NULL,
 "user_name" text,
 "project_id" text,
 "project_name" text,
 "checked_in_at" timestamp with time zone NOT NULL,
 "checked_out_at" timestamp with time zone,
 "duration_minutes" integer,
 "lat_in" numeric(10,7),
 "lng_in" numeric(10,7),
 "lat_out" numeric(10,7),
 "lng_out" numeric(10,7),
 "address_in" text,
 "status" text,
 "approved_by" text,
 "approved_at" timestamp with time zone,
 "note" text,
 "created_at" timestamp with time zone,
 "business_user_id" text
);
ALTER TABLE public."time_checkins" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."time_checkins" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."field_reports" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "project_id" text,
 "customer_id" text,
 "title" text NOT NULL,
 "description" text,
 "work_performed" text,
 "materials_used" text,
 "report_number" text,
 "status" text,
 "signed_at" timestamp with time zone,
 "signed_by" text,
 "signature_token" text,
 "customer_note" text,
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."field_reports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."field_reports" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."field_report_photos" (
 "id" uuid NOT NULL,
 "report_id" uuid,
 "business_id" text NOT NULL,
 "url" text NOT NULL,
 "caption" text,
 "type" text,
 "uploaded_at" timestamp with time zone
);
ALTER TABLE public."field_report_photos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."field_report_photos" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."leads_outbound" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "property_address" text NOT NULL,
 "property_type" text,
 "built_year" integer,
 "energy_class" text,
 "purchase_date" date,
 "owner_name" text,
 "letter_content" text,
 "letter_edited" boolean,
 "status" text,
 "sent_at" timestamp with time zone,
 "cost_sek" numeric(10,2),
 "postnord_tracking_id" text,
 "converted" boolean,
 "batch_id" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."leads_outbound" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."leads_outbound" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."leads_monthly_usage" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "month" text NOT NULL,
 "letters_sent" integer,
 "letters_quota" integer,
 "extra_letters" integer,
 "extra_cost_sek" numeric(10,2)
);
ALTER TABLE public."leads_monthly_usage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."leads_monthly_usage" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."leads_neighbour_campaigns" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "job_id" text,
 "job_type" text,
 "source_address" text NOT NULL,
 "neighbour_addresses" jsonb,
 "neighbour_count" integer,
 "letter_content" text,
 "letter_edited" boolean,
 "status" text,
 "sent_at" timestamp with time zone,
 "cost_sek" numeric(10,2),
 "quota_used" integer,
 "extra_cost_sek" numeric(10,2),
 "converted_count" integer,
 "revenue_generated" numeric(10,2),
 "created_at" timestamp with time zone
);
ALTER TABLE public."leads_neighbour_campaigns" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."leads_neighbour_campaigns" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."manual_suppliers" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "contact_name" text,
 "contact_phone" text,
 "contact_email" text,
 "website" text,
 "notes" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."manual_suppliers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."manual_suppliers" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."manual_supplier_products" (
 "id" uuid NOT NULL,
 "supplier_id" uuid,
 "business_id" text NOT NULL,
 "name" text NOT NULL,
 "article_number" text,
 "normal_price" numeric(10,2) NOT NULL,
 "unit" text,
 "category" text,
 "watch_price" boolean,
 "current_price" numeric(10,2),
 "last_updated" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."manual_supplier_products" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."manual_supplier_products" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."agent_memories" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "agent_id" text NOT NULL,
 "memory_type" text NOT NULL,
 "content" text NOT NULL,
 "embedding" vector(1536),
 "importance_score" double precision,
 "created_at" timestamp with time zone,
 "last_accessed_at" timestamp with time zone,
 "access_count" integer,
 "superseded_by" text,
 "confirmed_at" timestamp with time zone,
 "source_type" text,
 "source_id" text,
 "customer_id" text,
 "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('swedish'::regconfig, COALESCE(content, ''::text))) STORED
);
ALTER TABLE public."agent_memories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."agent_memories" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."agent_messages" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "from_agent" text NOT NULL,
 "to_agent" text NOT NULL,
 "message_type" text NOT NULL,
 "content" text NOT NULL,
 "metadata" jsonb,
 "status" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."agent_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."agent_messages" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."sms_usage" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "month" text NOT NULL,
 "sms_sent" integer,
 "sms_quota" integer,
 "extra_sms_sent" integer,
 "extra_sms_cost_sek" numeric(10,2),
 "created_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."sms_usage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."sms_usage" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."deal_automation_tasks" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "deal_id" text NOT NULL,
 "task_type" text NOT NULL,
 "scheduled_at" timestamp with time zone NOT NULL,
 "executed_at" timestamp with time zone,
 "cancelled_at" timestamp with time zone,
 "payload" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."deal_automation_tasks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."deal_automation_tasks" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."deal_flow" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "deal_id" text NOT NULL,
 "current_step" text NOT NULL,
 "status" text NOT NULL,
 "started_at" timestamp with time zone,
 "completed_at" timestamp with time zone,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."deal_flow" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."deal_flow" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."deal_flow_log" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "deal_id" text NOT NULL,
 "step_key" text NOT NULL,
 "status" text NOT NULL,
 "data" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."deal_flow_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."deal_flow_log" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."project_events" (
 "id" uuid NOT NULL,
 "project_id" text NOT NULL,
 "business_id" text NOT NULL,
 "type" text NOT NULL,
 "description" text NOT NULL,
 "created_by" text,
 "metadata" jsonb,
 "created_at" timestamp with time zone
);
ALTER TABLE public."project_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."project_events" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."billing_plan" (
 "plan_id" text NOT NULL,
 "name" text NOT NULL,
 "price_sek" integer NOT NULL,
 "stripe_price_id" text,
 "features" jsonb,
 "is_active" boolean,
 "sort_order" integer,
 "created_at" timestamp with time zone,
 "limits" jsonb,
 "billing_interval" text NOT NULL
);
ALTER TABLE public."billing_plan" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."billing_plan" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."calendar_watches" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "calendar_connection_id" text NOT NULL,
 "channel_id" text NOT NULL,
 "resource_id" text NOT NULL,
 "expires_at" timestamp with time zone NOT NULL,
 "is_active" boolean,
 "created_at" timestamp with time zone
);
ALTER TABLE public."calendar_watches" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."calendar_watches" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."landing_leads" (
 "id" uuid NOT NULL,
 "email" text,
 "company_name" text,
 "source" text,
 "created_at" timestamp with time zone,
 "name" text,
 "phone" text,
 "payload" jsonb
);
ALTER TABLE public."landing_leads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."landing_leads" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."website_orders" (
 "id" uuid NOT NULL,
 "company_name" text,
 "org_number" text,
 "industry" text,
 "city" text,
 "phone" text,
 "email" text,
 "existing_url" text,
 "services" jsonb,
 "usp" text,
 "about" text,
 "style" text,
 "primary_color" text,
 "contact_name" text,
 "contact_phone" text,
 "contact_email" text,
 "opening_hours" text,
 "handymate_customer" boolean,
 "scraped_data" jsonb,
 "status" text,
 "vercel_url" text,
 "deployed_at" timestamp with time zone,
 "created_at" timestamp with time zone
);
ALTER TABLE public."website_orders" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."website_orders" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."booking_materials" (
 "id" uuid NOT NULL,
 "booking_id" text,
 "business_id" text,
 "description" text,
 "quantity" numeric,
 "unit" text,
 "created_at" timestamp with time zone
);
ALTER TABLE public."booking_materials" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."booking_materials" FROM PUBLIC,anon,authenticated;
