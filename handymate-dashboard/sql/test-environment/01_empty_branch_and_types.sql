-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
-- Schema-only baseline. Target: a fresh isolated Supabase branch, NEVER production.
DO $$ BEGIN IF (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')) <> 1 OR to_regclass('public.email_inbound_route') IS NULL THEN RAISE EXCEPTION 'Expected only the empty partial email_inbound_route table'; END IF; IF EXISTS(SELECT 1 FROM public.email_inbound_route) OR EXISTS(SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'Refusing to replace a branch with application/auth data'; END IF; END $$;
DROP TABLE public.email_inbound_route;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE TYPE public."case_status" AS ENUM ('open','booked','declined','needs_followup','abandoned');
CREATE TYPE public."urgency_level" AS ENUM ('routine','soon','urgent');
CREATE TYPE public."reservation_status" AS ENUM ('held','confirmed','released','expired');
CREATE TYPE public."booking_status" AS ENUM ('confirmed','cancelled','completed','no_show');
CREATE TYPE public."confirmation_method" AS ENUM ('verbal','sms','email');
CREATE TYPE public."followup_reason" AS ENUM ('no_availability','complex_request','caller_requested_human','pricing_question','existing_booking_issue','identity_uncertain','max_clarification_exceeded','reservation_expired','system_error');
CREATE TYPE public."followup_priority" AS ENUM ('low','normal','high');
CREATE TYPE public."emergency_type" AS ENUM ('fire','gas_leak','medical','electrical_danger','intruder','flood','other');
CREATE TYPE public."release_reason" AS ENUM ('caller_declined','caller_hangup','timeout','error','call_terminated','slot_taken_externally');
CREATE SEQUENCE public."sms_campaign_recipient_id_seq" AS integer INCREMENT 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."sms_conversation_id_seq" AS integer INCREMENT 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."customer_activity_id_seq" AS integer INCREMENT 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."quotes_id_seq" AS integer INCREMENT 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."time_entry_id_seq" AS integer INCREMENT 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."ai_suggestion_id_seq" AS integer INCREMENT 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE;
