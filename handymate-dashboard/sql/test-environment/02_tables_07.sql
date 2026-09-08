-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE TABLE public."partner_attribution_decision" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "partner_id" uuid,
 "referral_code" text NOT NULL,
 "accepted" boolean NOT NULL,
 "reason" text NOT NULL,
 "referral_id" text,
 "created_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."partner_attribution_decision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."partner_attribution_decision" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."customer_preparation" (
 "id" uuid NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "token" uuid NOT NULL,
 "template" text NOT NULL,
 "context" text NOT NULL,
 "due_date" date,
 "status" text NOT NULL,
 "answers" jsonb NOT NULL,
 "images" jsonb NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "expires_at" timestamp with time zone NOT NULL,
 "submitted_at" timestamp with time zone,
 "reviewed_at" timestamp with time zone,
 "project_id" text,
 "lars_review" jsonb,
 "review_run_id" uuid,
 "review_started_at" timestamp with time zone
);
ALTER TABLE public."customer_preparation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."customer_preparation" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."rate_limit_bucket" (
 "key" text NOT NULL,
 "count" integer NOT NULL,
 "reset_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone
);
ALTER TABLE public."rate_limit_bucket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."rate_limit_bucket" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."portal_review" (
 "id" text NOT NULL,
 "business_id" text NOT NULL,
 "customer_id" text NOT NULL,
 "project_id" text,
 "rating" smallint NOT NULL,
 "tags" text[] NOT NULL,
 "comment" text,
 "forwarded_to_thread" boolean NOT NULL,
 "google_clicked_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL
);
ALTER TABLE public."portal_review" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."portal_review" FROM PUBLIC,anon,authenticated;
