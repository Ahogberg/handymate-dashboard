-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE VIEW public."business_full" WITH (security_invoker=true) AS SELECT bc.business_id,
    bc.business_name,
    bc.phone_number,
    bc.email,
    bc.services_offered,
    bc.service_area,
    bc.timezone,
    bc.working_hours,
    bc.slot_duration_minutes,
    bc.min_lead_time_hours,
    bc.max_advance_booking_days,
    bc.max_bookings_per_customer,
    bc.emergency_number,
    bc.greeting_script,
    bc.decline_messages,
    bc.google_calendar_id,
    bc.created_at,
    bc.updated_at,
    bc.is_active,
    bc.integrations,
    bc.onboarding_status,
    bc.subscription_status,
    bc.subscription_plan,
    bc.trial_ends_at,
    bc.contact_name,
    bc.contact_email,
    bo.step_company_info,
    bo.step_calendar_connected,
    bo.step_sms_configured,
    bo.step_phone_assigned,
    bo.step_test_call_completed,
    bo.step_go_live,
    ( SELECT json_agg(json_build_object('phone_number', business_phone_numbers.phone_number, 'provider', business_phone_numbers.provider, 'is_active', business_phone_numbers.is_active)) AS json_agg
           FROM business_phone_numbers
          WHERE business_phone_numbers.business_id = bc.business_id) AS phone_numbers,
    ( SELECT json_agg(business_credentials.credential_type) AS json_agg
           FROM business_credentials
          WHERE business_credentials.business_id = bc.business_id AND business_credentials.is_active = true) AS active_integrations
   FROM business_config bc
     LEFT JOIN business_onboarding bo ON bc.business_id = bo.business_id;
REVOKE ALL ON public."business_full" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."business_current_usage" WITH (security_invoker=true) AS SELECT bc.business_id,
    bc.business_name,
    COALESCE(bu.inbound_calls, 0) AS inbound_calls,
    COALESCE(bu.sms_sent, 0) AS sms_sent,
    COALESCE(bu.bookings_created, 0) AS bookings_created,
    COALESCE(bu.cost_total_ore, 0)::numeric / 100.0 AS cost_total_sek
   FROM business_config bc
     LEFT JOIN business_usage bu ON bc.business_id = bu.business_id AND bu.period_start = date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)::date;
REVOKE ALL ON public."business_current_usage" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."call_recordings_with_details" WITH (security_invoker=true) AS SELECT cr.id,
    cr.recording_id,
    cr.business_id,
    cr.direction,
    cr.from_number,
    cr.to_number,
    cr.forwarded_to,
    cr.started_at,
    cr.ended_at,
    cr.duration_seconds,
    cr.recording_url,
    cr.recording_fetched,
    cr.transcript_text,
    cr.transcript_segments,
    cr.transcribed_at,
    cr.ai_analysis,
    cr.analyzed_at,
    cr.customer_id,
    cr.case_id,
    cr.booking_id,
    cr.auto_actions_taken,
    cr.requires_followup,
    cr.followup_reason,
    cr.created_at,
    cr.updated_at,
    c.name AS customer_name,
    c.phone_number AS customer_phone,
    bc.business_name,
        CASE
            WHEN (cr.ai_analysis ->> 'sentiment'::text) = 'positive'::text THEN 'Positiv'::text
            WHEN (cr.ai_analysis ->> 'sentiment'::text) = 'negative'::text THEN 'Negativ'::text
            ELSE 'Neutral'::text
        END AS sentiment_display
   FROM call_recording cr
     LEFT JOIN customer c ON cr.customer_id = c.customer_id
     LEFT JOIN business_config bc ON cr.business_id = bc.business_id;
REVOKE ALL ON public."call_recordings_with_details" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."recordings_needing_review" WITH (security_invoker=true) AS SELECT id,
    recording_id,
    business_id,
    direction,
    from_number,
    to_number,
    forwarded_to,
    started_at,
    ended_at,
    duration_seconds,
    recording_url,
    recording_fetched,
    transcript_text,
    transcript_segments,
    transcribed_at,
    ai_analysis,
    analyzed_at,
    customer_id,
    case_id,
    booking_id,
    auto_actions_taken,
    requires_followup,
    followup_reason,
    created_at,
    updated_at,
    customer_name,
    customer_phone,
    business_name,
    sentiment_display
   FROM call_recordings_with_details
  WHERE requires_followup = true
  ORDER BY created_at DESC;
REVOKE ALL ON public."recordings_needing_review" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."agent_activity" WITH (security_invoker=true) AS SELECT ar.run_id,
    ar.business_id,
    bc.business_name,
    ar.trigger_type,
    ar.tool_calls,
    ar.tokens_used,
    ar.estimated_cost,
    ar.duration_ms,
    ar.status,
    ar.final_response,
    ar.created_at
   FROM agent_runs ar
     JOIN business_config bc ON bc.business_id = ar.business_id
  ORDER BY ar.created_at DESC;
REVOKE ALL ON public."agent_activity" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."pending_actions" WITH (security_invoker=true) AS SELECT sa.action_id,
    sa.business_id,
    sa.agent_run_id,
    sa.action_type,
    sa.target_id,
    sa.target_type,
    sa.scheduled_for,
    sa.action_data,
    sa.status,
    sa.executed_at,
    sa.result,
    sa.created_at,
    bc.business_name
   FROM scheduled_actions sa
     JOIN business_config bc ON bc.business_id = sa.business_id
  WHERE sa.status = 'pending'::text AND sa.scheduled_for <= now()
  ORDER BY sa.scheduled_for;
REVOKE ALL ON public."pending_actions" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."lead_pipeline_stats" WITH (security_invoker=true) AS SELECT business_id,
    status,
    count(*) AS lead_count,
    COALESCE(sum(estimated_value), 0::bigint) AS total_value,
    round(avg(score), 1) AS avg_score
   FROM leads
  GROUP BY business_id, status;
REVOKE ALL ON public."lead_pipeline_stats" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."active_leads" WITH (security_invoker=true) AS SELECT lead_id,
    business_id,
    name,
    phone,
    email,
    source,
    status,
    score,
    score_reasons,
    estimated_value,
    job_type,
    urgency,
    notes,
    customer_id,
    created_at,
    updated_at,
    ( SELECT la.description
           FROM lead_activities la
          WHERE la.lead_id = l.lead_id
          ORDER BY la.created_at DESC
         LIMIT 1) AS last_activity
   FROM leads l
  WHERE status <> ALL (ARRAY['won'::text, 'lost'::text])
  ORDER BY (
        CASE urgency
            WHEN 'emergency'::text THEN 0
            WHEN 'high'::text THEN 1
            WHEN 'medium'::text THEN 2
            WHEN 'low'::text THEN 3
            ELSE NULL::integer
        END), score DESC;
REVOKE ALL ON public."active_leads" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."automation_preview" WITH (security_invoker=true) AS SELECT aq.queue_id,
    aq.business_id,
    aq.rule_type,
    ar.label AS rule_label,
    aq.target_id,
    aq.target_type,
    aq.customer_name,
    aq.target_label,
    aq.scheduled_at,
    aq.status,
    aq.attempt_number,
    ar.max_attempts,
    aq.created_at
   FROM automation_queue aq
     JOIN automation_rules ar ON ar.rule_id = aq.rule_id
  WHERE aq.status = 'pending'::text
  ORDER BY aq.scheduled_at;
REVOKE ALL ON public."automation_preview" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."automation_history" WITH (security_invoker=true) AS SELECT aq.queue_id,
    aq.business_id,
    aq.rule_type,
    ar.label AS rule_label,
    aq.target_id,
    aq.target_type,
    aq.customer_name,
    aq.target_label,
    aq.scheduled_at,
    aq.executed_at,
    aq.status,
    aq.attempt_number,
    aq.agent_run_id,
    aq.error_message,
    aq.created_at
   FROM automation_queue aq
     JOIN automation_rules ar ON ar.rule_id = aq.rule_id
  WHERE aq.status <> 'pending'::text
  ORDER BY aq.executed_at DESC NULLS LAST;
REVOKE ALL ON public."automation_history" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."mobile_user_plan" WITH (security_invoker=true) AS SELECT user_id,
    business_id,
    subscription_plan,
        CASE
            WHEN subscription_plan = ANY (ARRAY['professional'::text, 'business'::text]) THEN true
            ELSE false
        END AS is_pro
   FROM business_config bc;
REVOKE ALL ON public."mobile_user_plan" FROM PUBLIC,anon,authenticated;

CREATE VIEW public."prisloop_metrics" AS SELECT bc.business_id,
    bc.business_name,
    bc.created_at::date AS konto_skapat,
    count(p.id) FILTER (WHERE p.is_active) AS artiklar_aktiva,
    count(p.id) FILTER (WHERE p.is_active AND p.sales_price > 0::numeric) AS prissatta,
    count(p.id) FILTER (WHERE p.is_active AND p.sales_price <= 0::numeric) AS prislosa,
    round(100.0 * count(p.id) FILTER (WHERE p.is_active AND p.sales_price > 0::numeric)::numeric / NULLIF(count(p.id) FILTER (WHERE p.is_active), 0)::numeric, 1) AS prissatt_andel_pct,
    ( SELECT count(*) AS count
           FROM quote_items qi
          WHERE qi.business_id = bc.business_id AND qi.created_at > (now() - '30 days'::interval)) AS offertrader_30d,
    ( SELECT count(*) AS count
           FROM quote_items qi
          WHERE qi.business_id = bc.business_id AND qi.created_at > (now() - '30 days'::interval) AND qi.linked_product_id IS NOT NULL) AS lankade_rader_30d
   FROM business_config bc
     LEFT JOIN products p ON p.business_id = bc.business_id
  GROUP BY bc.business_id, bc.business_name, bc.created_at;
REVOKE ALL ON public."prisloop_metrics" FROM PUBLIC,anon,authenticated;
