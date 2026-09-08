-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE POLICY "action_log_service_role" ON public."action_log" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "action_log_tenant_member" ON public."action_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "activity_service_role" ON public."activity" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "activity_tenant_member" ON public."activity" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Users can create analyses" ON public."ad_analyses" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own analyses" ON public."ad_analyses" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "admin_actions_log_service_only" ON public."admin_actions_log" AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "admin_audit_log_service_role" ON public."admin_audit_log" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "agent_context_service_role" ON public."agent_context" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "agent_context_tenant_member" ON public."agent_context" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "agent_handoffs_service_role" ON public."agent_handoffs" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "agent_handoffs_tenant_member" ON public."agent_handoffs" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM agent_threads at
  WHERE ((at.id = agent_handoffs.thread_id) AND is_business_member(at.business_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM agent_threads at
  WHERE ((at.id = agent_handoffs.thread_id) AND is_business_member(at.business_id)))));
CREATE POLICY "Service agent_memories" ON public."agent_memories" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User agent_memories" ON public."agent_memories" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service agent_messages" ON public."agent_messages" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User agent_messages" ON public."agent_messages" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "agent_runs_business_access" ON public."agent_runs" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "agent_runs_service_role" ON public."agent_runs" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));
CREATE POLICY "agent_settings_business_access" ON public."agent_settings" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "agent_settings_service_role" ON public."agent_settings" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));
CREATE POLICY "agent_threads_service_role" ON public."agent_threads" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "agent_threads_tenant_member" ON public."agent_threads" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "ai_learned_preferences_service_role" ON public."ai_learned_preferences" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "ai_learned_preferences_tenant_member" ON public."ai_learned_preferences" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "ai_suggestion_service_role" ON public."ai_suggestion" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "ai_suggestion_tenant_member" ON public."ai_suggestion" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "allowance_reports_service_role" ON public."allowance_reports" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "allowance_reports_tenant_member" ON public."allowance_reports" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "allowance_types_service_role" ON public."allowance_types" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "allowance_types_tenant_delete" ON public."allowance_types" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_business_member(business_id));
CREATE POLICY "allowance_types_tenant_insert" ON public."allowance_types" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_business_member(business_id));
CREATE POLICY "allowance_types_tenant_read" ON public."allowance_types" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_business_member(business_id) OR (is_system IS TRUE)));
CREATE POLICY "allowance_types_tenant_update" ON public."allowance_types" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "auto_approve_daily_count_service_role" ON public."auto_approve_daily_count" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "auto_approve_daily_count_tenant_member" ON public."auto_approve_daily_count" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "automation_activity_service_role" ON public."automation_activity" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "automation_activity_tenant_member" ON public."automation_activity" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "automation_queue_business_access" ON public."automation_queue" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "automation_queue_service_role" ON public."automation_queue" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));
CREATE POLICY "automation_rules_business_access" ON public."automation_rules" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "automation_rules_service_role" ON public."automation_rules" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));
CREATE POLICY "automation_settings_service_role" ON public."automation_settings" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "automation_settings_tenant_member" ON public."automation_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "service_benchmark_consent_audit" ON public."benchmark_consent_audit" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "billing_plan_authenticated_read" ON public."billing_plan" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "billing_plan_service_role" ON public."billing_plan" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "booking_service_role" ON public."booking" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "booking_tenant_member" ON public."booking" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "booking_materials_all" ON public."booking_materials" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE ((business_config.user_id)::text = (auth.uid())::text))));
CREATE POLICY "business_config_service_role" ON public."business_config" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_config_tenant_member" ON public."business_config" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "business_counters_service_role" ON public."business_counters" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_counters_tenant_member" ON public."business_counters" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "business_credentials_service_role" ON public."business_credentials" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_credentials_tenant_member" ON public."business_credentials" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "business_insights_service_role" ON public."business_insights" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_insights_tenant_member" ON public."business_insights" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "business_integration_credentials_service_role" ON public."business_integration_credentials" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "Service business_knowledge" ON public."business_knowledge" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User business_knowledge" ON public."business_knowledge" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "business_onboarding_service_role" ON public."business_onboarding" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_onboarding_tenant_member" ON public."business_onboarding" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Business owns patterns" ON public."business_patterns" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service role full access on business_patterns" ON public."business_patterns" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_phone_numbers_service_role" ON public."business_phone_numbers" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_phone_numbers_tenant_member" ON public."business_phone_numbers" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "business_preferences_legacy_v5_service_role" ON public."business_preferences_legacy_v5" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_preferences_legacy_v5_tenant_member" ON public."business_preferences_legacy_v5" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "business_twin_forecast_service_role" ON public."business_twin_forecast" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_usage_service_role" ON public."business_usage" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_usage_tenant_member" ON public."business_usage" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "business_users_own_row" ON public."business_users" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id)::text = (auth.uid())::text));
CREATE POLICY "business_users_service_role" ON public."business_users" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "business_users_tenant_member" ON public."business_users" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "calendar_connection_service_role" ON public."calendar_connection" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "calendar_connection_tenant_member" ON public."calendar_connection" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Service calendar_watches" ON public."calendar_watches" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "call_service_role" ON public."call" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "call_tenant_member" ON public."call" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "call_recording_service_role" ON public."call_recording" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "call_recording_tenant_member" ON public."call_recording" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Users can create campaigns" ON public."campaign_plans" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own campaigns" ON public."campaign_plans" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own campaigns" ON public."campaign_plans" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own campaigns" ON public."campaign_plans" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "canvas_items_service_role" ON public."canvas_items" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "canvas_items_tenant_member" ON public."canvas_items" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "case_record_service_role" ON public."case_record" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "case_record_tenant_member" ON public."case_record" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "checklist_template_service_role" ON public."checklist_template" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "checklist_template_tenant_delete" ON public."checklist_template" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_business_member(business_id));
CREATE POLICY "checklist_template_tenant_insert" ON public."checklist_template" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_business_member(business_id));
CREATE POLICY "checklist_template_tenant_read" ON public."checklist_template" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_business_member(business_id) OR (is_system IS TRUE)));
CREATE POLICY "checklist_template_tenant_update" ON public."checklist_template" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "communication_log_service_role" ON public."communication_log" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "communication_log_tenant_member" ON public."communication_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Service contract_types" ON public."contract_types" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User contract_types" ON public."contract_types" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid())
UNION
 SELECT business_users.business_id
   FROM business_users
  WHERE ((business_users.user_id = auth.uid()) AND (business_users.is_active = true)))));
CREATE POLICY "conversations_business_access" ON public."conversations" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "conversations_service_role" ON public."conversations" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));
CREATE POLICY "cost_event_service_role" ON public."cost_event" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "custom_quote_categories_service_role" ON public."custom_quote_categories" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "custom_quote_categories_tenant_member" ON public."custom_quote_categories" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "customer_service_role" ON public."customer" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "customer_tenant_member" ON public."customer" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "customer_activity_service_role" ON public."customer_activity" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "customer_activity_tenant_member" ON public."customer_activity" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "customer_document_service_role" ON public."customer_document" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "customer_document_tenant_member" ON public."customer_document" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "customer_fact_service_role" ON public."customer_fact" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "customer_fact_tenant_member" ON public."customer_fact" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "customer_message_service_role" ON public."customer_message" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "customer_message_tenant_member" ON public."customer_message" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Service segments" ON public."customer_segments" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User segments" ON public."customer_segments" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid())
UNION
 SELECT business_users.business_id
   FROM business_users
  WHERE ((business_users.user_id = auth.uid()) AND (business_users.is_active = true)))));
CREATE POLICY "customer_tag_service_role" ON public."customer_tag" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "customer_tag_tenant_member" ON public."customer_tag" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "customer_tag_assignment_service_role" ON public."customer_tag_assignment" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "customer_tag_assignment_tenant_member" ON public."customer_tag_assignment" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM customer c
  WHERE ((c.customer_id = customer_tag_assignment.customer_id) AND is_business_member(c.business_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM customer c
  WHERE ((c.customer_id = customer_tag_assignment.customer_id) AND is_business_member(c.business_id)))));
CREATE POLICY "deal_service_role" ON public."deal" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "deal_tenant_member" ON public."deal" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Service deal_auto_tasks" ON public."deal_automation_tasks" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User deal_auto_tasks" ON public."deal_automation_tasks" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "deal_flow_service_role" ON public."deal_flow" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "deal_flow_tenant_member" ON public."deal_flow" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "deal_flow_log_service_role" ON public."deal_flow_log" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "deal_flow_log_tenant_member" ON public."deal_flow_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "deal_note_business_policy" ON public."deal_note" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "demo_reset_audit_service_role" ON public."demo_reset_audit" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "Manage own templates" ON public."document_template" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id = current_setting('app.business_id'::text, true)));
CREATE POLICY "Read system and own templates" ON public."document_template" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((is_system = true) OR (business_id IS NULL) OR (business_id = current_setting('app.business_id'::text, true))));
CREATE POLICY "email_conversations_service_role" ON public."email_conversations" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "email_conversations_tenant_member" ON public."email_conversations" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "service_email_inbound_route" ON public."email_inbound_route" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "email_template_service_role" ON public."email_template" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "email_template_tenant_member" ON public."email_template" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "emergency_escalation_service_role" ON public."emergency_escalation" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "emergency_escalation_tenant_member" ON public."emergency_escalation" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "service_employee_certificate" ON public."employee_certificate" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "user_employee_certificate" ON public."employee_certificate" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service field_report_photos" ON public."field_report_photos" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User field_report_photos" ON public."field_report_photos" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service field_reports" ON public."field_reports" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User field_reports" ON public."field_reports" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "form_submissions_service_role" ON public."form_submissions" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "form_submissions_tenant_member" ON public."form_submissions" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "form_templates_service_role" ON public."form_templates" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "form_templates_tenant_delete" ON public."form_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_business_member(business_id));
CREATE POLICY "form_templates_tenant_insert" ON public."form_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_business_member(business_id));
CREATE POLICY "form_templates_tenant_read" ON public."form_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_business_member(business_id) OR (is_system IS TRUE)));
CREATE POLICY "form_templates_tenant_update" ON public."form_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "fortnox_api_log_service_role" ON public."fortnox_api_log" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "fortnox_api_log_tenant_member" ON public."fortnox_api_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "fortnox_sync_service_role" ON public."fortnox_sync" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "fortnox_sync_tenant_member" ON public."fortnox_sync" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "fuel_ledger_service_role" ON public."fuel_ledger" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "Users can create copies" ON public."generated_copies" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own copies" ON public."generated_copies" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own copies" ON public."generated_copies" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Manage own documents" ON public."generated_document" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id = current_setting('app.business_id'::text, true)));
CREATE POLICY "gmail_imported_message_service_role" ON public."gmail_imported_message" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "gmail_imported_message_tenant_member" ON public."gmail_imported_message" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "grossist_product_service_role" ON public."grossist_product" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "grossist_product_tenant_member" ON public."grossist_product" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "gtm_account_service_role" ON public."gtm_account" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "gtm_activity_service_role" ON public."gtm_activity" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "gtm_suppression_service_role" ON public."gtm_suppression" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "human_followup_queue_service_role" ON public."human_followup_queue" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "human_followup_queue_tenant_member" ON public."human_followup_queue" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "idempotency_cache_service_role" ON public."idempotency_cache" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "impersonation_tokens_service_only" ON public."impersonation_tokens" AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "inbox_item_service_role" ON public."inbox_item" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "inbox_item_tenant_member" ON public."inbox_item" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "installation_service_role" ON public."installation" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "inventory_service_role" ON public."inventory" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "inventory_tenant_member" ON public."inventory" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Business owns inventory_items" ON public."inventory_items" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service inventory_items" ON public."inventory_items" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "Business owns inventory_locations" ON public."inventory_locations" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service inventory_locations" ON public."inventory_locations" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "Business owns inventory_movements" ON public."inventory_movements" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service inventory_movements" ON public."inventory_movements" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "inventory_transaction_service_role" ON public."inventory_transaction" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "inventory_transaction_tenant_member" ON public."inventory_transaction" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "invoice_service_role" ON public."invoice" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "invoice_tenant_member" ON public."invoice" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "invmf_service_role" ON public."invoice_evidence_manifest" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "invoice_reminders_insert" ON public."invoice_reminders" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "invoice_reminders_select" ON public."invoice_reminders" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "job_template_service_role" ON public."job_template" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "job_template_tenant_member" ON public."job_template" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "service_job_types" ON public."job_types" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "user_job_types" ON public."job_types" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "jobbpass_service_role" ON public."jobbpass" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "karin_custom_event_service_role" ON public."karin_custom_event" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "landing_events_service_role" ON public."landing_events" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "landing_leads_public_insert" ON public."landing_leads" AS PERMISSIVE FOR INSERT TO "anon","authenticated" WITH CHECK (true);
CREATE POLICY "landing_leads_service_role" ON public."landing_leads" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "lead_activities_business_access" ON public."lead_activities" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "lead_activities_service_role" ON public."lead_activities" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));
CREATE POLICY "lead_scoring_rules_business_access" ON public."lead_scoring_rules" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "lead_scoring_rules_service_role" ON public."lead_scoring_rules" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));
CREATE POLICY "lead_source_policy" ON public."lead_source" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Business owns lead sources" ON public."lead_sources" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service role full access on lead_sources" ON public."lead_sources" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "leads_business_access" ON public."leads" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "leads_service_role" ON public."leads" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Service leads_monthly_usage" ON public."leads_monthly_usage" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User leads_monthly_usage" ON public."leads_monthly_usage" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service neighbour_campaigns" ON public."leads_neighbour_campaigns" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User neighbour_campaigns" ON public."leads_neighbour_campaigns" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service leads_outbound" ON public."leads_outbound" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User leads_outbound" ON public."leads_outbound" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "learning_events_service_role" ON public."learning_events" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "learning_events_tenant_member" ON public."learning_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Users can create localizations" ON public."localizations" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own localizations" ON public."localizations" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Service manual_supplier_products" ON public."manual_supplier_products" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User manual_supplier_products" ON public."manual_supplier_products" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service manual_suppliers" ON public."manual_suppliers" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User manual_suppliers" ON public."manual_suppliers" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "material_order_service_role" ON public."material_order" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "material_order_tenant_member" ON public."material_order" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "service_matte_conversations" ON public."matte_conversations" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "service_matte_messages" ON public."matte_messages" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "meeting_job_service_role" ON public."meeting_job" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "meeting_segment_service_role" ON public."meeting_segment" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "mission_service_role" ON public."mission" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "mandate_service_role" ON public."mission_mandate" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "service_monthly_reviews" ON public."monthly_reviews" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "user_monthly_reviews" ON public."monthly_reviews" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "next_best_action_service_role" ON public."next_best_action" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "next_best_action_tenant_member" ON public."next_best_action" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_business_member(business_id));
CREATE POLICY "notification_member_delete" ON public."notification" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((is_business_member(business_id) AND ((user_id IS NULL) OR (user_id = (auth.uid())::text))));
CREATE POLICY "notification_member_insert" ON public."notification" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_business_member(business_id) AND ((user_id IS NULL) OR (user_id = (auth.uid())::text))));
CREATE POLICY "notification_member_select" ON public."notification" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_business_member(business_id) AND ((user_id IS NULL) OR (user_id = (auth.uid())::text))));
CREATE POLICY "notification_member_update" ON public."notification" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((is_business_member(business_id) AND ((user_id IS NULL) OR (user_id = (auth.uid())::text)))) WITH CHECK ((is_business_member(business_id) AND ((user_id IS NULL) OR (user_id = (auth.uid())::text))));
CREATE POLICY "notification_service_role" ON public."notification" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "nurture_enrollment_service_role" ON public."nurture_enrollment" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "nurture_enrollment_tenant_member" ON public."nurture_enrollment" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "nurture_sequence_service_role" ON public."nurture_sequence" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "nurture_sequence_tenant_member" ON public."nurture_sequence" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "operating_experiment_service_role" ON public."operating_experiment" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "partner_attribution_decision_service_role" ON public."partner_attribution_decision" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "partner_commission_ledger_service_role" ON public."partner_commission_ledger" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "partner_events_service_role" ON public."partner_events" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "partner_events_tenant_member" ON public."partner_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "partner_followups_service_role" ON public."partner_followups" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "partner_payout_batch_service_role" ON public."partner_payout_batch" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "partner_self_billing_sequence_service_role" ON public."partner_self_billing_sequence" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "partners_service_role" ON public."partners" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "pending_approvals_business_select" ON public."pending_approvals" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM business_users
  WHERE ((business_users.business_id = pending_approvals.business_id) AND (business_users.user_id = auth.uid()) AND (business_users.is_active = true)))));
CREATE POLICY "pending_approvals_business_update" ON public."pending_approvals" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM business_users
  WHERE ((business_users.business_id = pending_approvals.business_id) AND (business_users.user_id = auth.uid()) AND (business_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM business_users
  WHERE ((business_users.business_id = pending_approvals.business_id) AND (business_users.user_id = auth.uid()) AND (business_users.is_active = true)))));
CREATE POLICY "pending_approvals_service_role" ON public."pending_approvals" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Anyone can view default personas" ON public."personas" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((is_default = true) OR (auth.uid() = user_id)));
CREATE POLICY "Users can create personas" ON public."personas" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own personas" ON public."personas" AS PERMISSIVE FOR DELETE TO PUBLIC USING (((auth.uid() = user_id) AND (is_default = false)));
CREATE POLICY "Users can update own personas" ON public."personas" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((auth.uid() = user_id) AND (is_default = false)));
CREATE POLICY "pipeline_activity_service_role" ON public."pipeline_activity" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "pipeline_activity_tenant_member" ON public."pipeline_activity" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "pipeline_automation_service_role" ON public."pipeline_automation" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "pipeline_automation_tenant_member" ON public."pipeline_automation" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "pipeline_stage_service_role" ON public."pipeline_stage" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "pipeline_stage_tenant_delete" ON public."pipeline_stage" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_business_member(business_id));
CREATE POLICY "pipeline_stage_tenant_insert" ON public."pipeline_stage" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_business_member(business_id));
CREATE POLICY "pipeline_stage_tenant_read" ON public."pipeline_stage" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_business_member(business_id) OR (is_system IS TRUE)));
CREATE POLICY "pipeline_stage_tenant_update" ON public."pipeline_stage" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "pipeline_stages_service_role" ON public."pipeline_stages" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "pipeline_stages_tenant_delete" ON public."pipeline_stages" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_business_member(business_id));
CREATE POLICY "pipeline_stages_tenant_insert" ON public."pipeline_stages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_business_member(business_id));
CREATE POLICY "pipeline_stages_tenant_read" ON public."pipeline_stages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_business_member(business_id) OR (is_system IS TRUE)));
CREATE POLICY "pipeline_stages_tenant_update" ON public."pipeline_stages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "portal_review_service_role" ON public."portal_review" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "portal_review_tenant_member" ON public."portal_review" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Service price_list_items_v2" ON public."price_list_items_v2" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User price_list_items_v2" ON public."price_list_items_v2" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid())
UNION
 SELECT business_users.business_id
   FROM business_users
  WHERE ((business_users.user_id = auth.uid()) AND (business_users.is_active = true)))));
CREATE POLICY "Service price_lists_v2" ON public."price_lists_v2" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User price_lists_v2" ON public."price_lists_v2" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid())
UNION
 SELECT business_users.business_id
   FROM business_users
  WHERE ((business_users.user_id = auth.uid()) AND (business_users.is_active = true)))));
CREATE POLICY "pricing_intelligence_service_role" ON public."pricing_intelligence" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "pricing_intelligence_tenant_member" ON public."pricing_intelligence" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Service product_categories" ON public."product_categories" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User product_categories" ON public."product_categories" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service product_components" ON public."product_components" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User product_components" ON public."product_components" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service products" ON public."products" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User products" ON public."products" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE ((business_config.user_id)::text = (auth.uid())::text)
UNION
 SELECT business_users.business_id
   FROM business_users
  WHERE ((business_users.user_id)::text = (auth.uid())::text))));
CREATE POLICY "Users can update own profile" ON public."profiles" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = id));
CREATE POLICY "Users can view own profile" ON public."profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = id));
CREATE POLICY "project_service_role" ON public."project" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_tenant_member" ON public."project" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "project_ai_log_service_role" ON public."project_ai_log" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_ai_log_tenant_member" ON public."project_ai_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "project_assignment_service_role" ON public."project_assignment" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_assignment_tenant_member" ON public."project_assignment" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "project_change_service_role" ON public."project_change" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_change_tenant_member" ON public."project_change" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "project_checklist_service_role" ON public."project_checklist" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_checklist_tenant_member" ON public."project_checklist" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "project_cost_service_role" ON public."project_cost" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_cost_tenant_member" ON public."project_cost" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "project_document_service_role" ON public."project_document" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_document_tenant_member" ON public."project_document" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Service project_events" ON public."project_events" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User project_events" ON public."project_events" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "project_lesson_service_role" ON public."project_lesson" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_lesson_tenant_member" ON public."project_lesson" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "project_log_service_role" ON public."project_log" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_log_tenant_member" ON public."project_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "project_log_revision_service_role" ON public."project_log_revision" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_log_revision_tenant_member" ON public."project_log_revision" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "project_material_service_role" ON public."project_material" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_material_tenant_member" ON public."project_material" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "project_milestone_service_role" ON public."project_milestone" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "project_milestone_tenant_member" ON public."project_milestone" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "service_project_outcome" ON public."project_outcome" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "user_project_outcome" ON public."project_outcome" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service project_photos" ON public."project_photos" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User project_photos" ON public."project_photos" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "stage_automations_all" ON public."project_stage_automations" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE ((business_config.user_id)::text = (auth.uid())::text))));
CREATE POLICY "Service project_stages" ON public."project_stages" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User project_stages" ON public."project_stages" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "project_tip_dismissal_service_role" ON public."project_tip_dismissal" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "workflow_stages_select" ON public."project_workflow_stages" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((business_id IS NULL) OR (business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE ((business_config.user_id)::text = (auth.uid())::text)))));
CREATE POLICY "push_tokens_delete_own" ON public."push_tokens" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((business_id IN ( SELECT business_users.business_id
   FROM business_users
  WHERE (business_users.user_id = auth.uid()))));
CREATE POLICY "push_tokens_insert_own" ON public."push_tokens" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((business_id IN ( SELECT business_users.business_id
   FROM business_users
  WHERE (business_users.user_id = auth.uid()))));
CREATE POLICY "push_tokens_select_own" ON public."push_tokens" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((business_id IN ( SELECT business_users.business_id
   FROM business_users
  WHERE (business_users.user_id = auth.uid()))));
CREATE POLICY "push_tokens_service_role" ON public."push_tokens" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));
CREATE POLICY "quote_categories_authenticated_read" ON public."quote_categories" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "quote_categories_service_role" ON public."quote_categories" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "quote_items_service_role" ON public."quote_items" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "quote_items_tenant_member" ON public."quote_items" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "quote_standard_texts_service_role" ON public."quote_standard_texts" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "quote_standard_texts_tenant_member" ON public."quote_standard_texts" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "quote_templates_service_role" ON public."quote_templates" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "quote_templates_tenant_member" ON public."quote_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Service quote_tracking" ON public."quote_tracking_events" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User quote_tracking" ON public."quote_tracking_events" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "quotes_service_role" ON public."quotes" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "quotes_tenant_member" ON public."quotes" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "service_rate_limit" ON public."rate_limit_bucket" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "referrals_service_role" ON public."referrals" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "referrals_tenant_member" ON public."referrals" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_business_member(referrer_business_id) OR is_business_member(referred_business_id)));
CREATE POLICY "reservation_service_role" ON public."reservation" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "reservation_tenant_member" ON public."reservation" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Service reservation_texts" ON public."reservation_texts" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User reservation_texts" ON public."reservation_texts" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE ((business_config.user_id)::text = (auth.uid())::text)
UNION
 SELECT business_users.business_id
   FROM business_users
  WHERE ((business_users.user_id)::text = (auth.uid())::text))));
CREATE POLICY "Service reservation_triggers" ON public."reservation_triggers" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User reservation_triggers" ON public."reservation_triggers" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE ((business_config.user_id)::text = (auth.uid())::text)
UNION
 SELECT business_users.business_id
   FROM business_users
  WHERE ((business_users.user_id)::text = (auth.uid())::text))));
CREATE POLICY "review_request_policy" ON public."review_request" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "service_review_request" ON public."review_request" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "rot_payment_request_service_role" ON public."rot_payment_request" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "rot_payment_request_tenant_member" ON public."rot_payment_request" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "schedule_entry_service_role" ON public."schedule_entry" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "schedule_entry_tenant_member" ON public."schedule_entry" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "scheduled_actions_business_access" ON public."scheduled_actions" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "scheduled_actions_service_role" ON public."scheduled_actions" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Service seasonal_campaigns" ON public."seasonal_campaigns" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User seasonal_campaigns" ON public."seasonal_campaigns" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service seasonality_insights" ON public."seasonality_insights" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User seasonality_insights" ON public."seasonality_insights" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "service_service_agreement" ON public."service_agreement" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "user_service_agreement" ON public."service_agreement" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "service_service_agreement_type" ON public."service_agreement_type" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "user_service_agreement_type" ON public."service_agreement_type" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "sms_campaign_service_role" ON public."sms_campaign" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "sms_campaign_tenant_member" ON public."sms_campaign" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "sms_campaign_recipient_service_role" ON public."sms_campaign_recipient" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "sms_campaign_recipient_tenant_member" ON public."sms_campaign_recipient" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM sms_campaign sc
  WHERE ((sc.campaign_id = sms_campaign_recipient.campaign_id) AND is_business_member(sc.business_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM sms_campaign sc
  WHERE ((sc.campaign_id = sms_campaign_recipient.campaign_id) AND is_business_member(sc.business_id)))));
CREATE POLICY "sms_conversation_service_role" ON public."sms_conversation" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "sms_conversation_tenant_member" ON public."sms_conversation" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "sms_log_service_role" ON public."sms_log" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "sms_log_tenant_member" ON public."sms_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "sms_queue_service_role" ON public."sms_queue" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "sms_queue_tenant_member" ON public."sms_queue" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Business owns sms_usage" ON public."sms_usage" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "Service can manage sms_usage" ON public."sms_usage" AS PERMISSIVE FOR ALL TO "service_role" USING (true);
CREATE POLICY "storefront_service_role" ON public."storefront" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "storefront_tenant_member" ON public."storefront" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "subcontractor_service_role" ON public."subcontractor" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "subcontractor_tenant_member" ON public."subcontractor" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "subcontractor_assignment_service_role" ON public."subcontractor_assignment" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "subcontractor_assignment_tenant_member" ON public."subcontractor_assignment" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "supplier_service_role" ON public."supplier" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "supplier_tenant_member" ON public."supplier" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "supplier_connection_service_role" ON public."supplier_connection" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "supplier_connection_tenant_member" ON public."supplier_connection" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "supplier_invoices_service_role" ON public."supplier_invoices" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "supplier_invoices_tenant_member" ON public."supplier_invoices" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "supplier_product_service_role" ON public."supplier_product" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "supplier_product_tenant_member" ON public."supplier_product" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "support_ticket_service_role" ON public."support_ticket" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "task_business_policy" ON public."task" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "task_activity_log_service_role" ON public."task_activity_log" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "task_activity_log_tenant_member" ON public."task_activity_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Anyone can read categories" ON public."template_category" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "thread_message_service_role" ON public."thread_message" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "thread_message_tenant_member" ON public."thread_message" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "Service time_checkins" ON public."time_checkins" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "User time_checkins" ON public."time_checkins" AS PERMISSIVE FOR ALL TO PUBLIC USING ((business_id IN ( SELECT business_config.business_id
   FROM business_config
  WHERE (business_config.user_id = auth.uid()))));
CREATE POLICY "time_entry_service_role" ON public."time_entry" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "time_entry_tenant_member" ON public."time_entry" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "time_off_request_service_role" ON public."time_off_request" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "time_off_request_tenant_member" ON public."time_off_request" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "transcript_service_role" ON public."transcript" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "transcript_tenant_member" ON public."transcript" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "transcript_turn_service_role" ON public."transcript_turn" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "transcript_turn_tenant_member" ON public."transcript_turn" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM transcript t
  WHERE ((t.transcript_id = transcript_turn.transcript_id) AND is_business_member(t.business_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM transcript t
  WHERE ((t.transcript_id = transcript_turn.transcript_id) AND is_business_member(t.business_id)))));
CREATE POLICY "travel_entry_service_role" ON public."travel_entry" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "travel_entry_tenant_member" ON public."travel_entry" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "v3_automation_logs_service_role" ON public."v3_automation_logs" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "v3_automation_logs_tenant_member" ON public."v3_automation_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "v3_automation_rules_service_role" ON public."v3_automation_rules" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "v3_automation_rules_tenant_member" ON public."v3_automation_rules" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "v3_automation_settings_service_role" ON public."v3_automation_settings" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "v3_automation_settings_tenant_member" ON public."v3_automation_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "vehicle_reports_service_role" ON public."vehicle_reports" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "vehicle_reports_tenant_member" ON public."vehicle_reports" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "vehicles_service_role" ON public."vehicles" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "vehicles_tenant_member" ON public."vehicles" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "warranty_service_role" ON public."warranty" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "warranty_tenant_member" ON public."warranty" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "widget_conversation_service_role" ON public."widget_conversation" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "widget_conversation_tenant_member" ON public."widget_conversation" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "work_orders_service_role" ON public."work_orders" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "work_orders_tenant_member" ON public."work_orders" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "work_type_service_role" ON public."work_type" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "work_type_tenant_member" ON public."work_type" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
ALTER TABLE public."business_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_config" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."call" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."call" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."case_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."case_record" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reservation" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."booking" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."human_followup_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."human_followup_queue" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."emergency_escalation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."emergency_escalation" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."idempotency_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."idempotency_cache" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."transcript" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."transcript" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."transcript_turn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."transcript_turn" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."action_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."action_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_credentials" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_phone_numbers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_phone_numbers" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_onboarding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_onboarding" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_usage" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."call_recording" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."call_recording" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."sms_campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_campaign" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."sms_campaign_recipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_campaign_recipient" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."sms_conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_conversation" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."customer_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_activity" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quotes" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."time_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."time_entry" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."ai_suggestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_suggestion" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_product" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invoice" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."material_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."material_order" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."activity" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."inbox_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inbox_item" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."admin_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_audit_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."impersonation_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."impersonation_tokens" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."admin_actions_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_actions_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."work_type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."work_type" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_milestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_milestone" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_change" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_change" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_connection" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."grossist_product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."grossist_product" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_material" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_material" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_users" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_assignment" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."schedule_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."schedule_entry" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."time_off_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."time_off_request" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_document" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."checklist_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."checklist_template" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_checklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_checklist" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."calendar_connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."calendar_connection" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."job_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."job_template" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."customer_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_message" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."pipeline_stage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pipeline_stage" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deal" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."pipeline_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pipeline_activity" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."pipeline_automation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pipeline_automation" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."template_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."template_category" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."document_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."document_template" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."generated_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."generated_document" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."automation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."automation_settings" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."automation_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."automation_activity" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."customer_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_document" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."auto_approve_daily_count" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."auto_approve_daily_count" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."nurture_sequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."nurture_sequence" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."nurture_enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."nurture_enrollment" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."communication_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."communication_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notification" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."customer_tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_tag" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."customer_tag_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_tag_assignment" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."warranty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."warranty" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."email_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."email_template" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."subcontractor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subcontractor" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."subcontractor_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subcontractor_assignment" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."deal_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deal_note" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."lead_source" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."lead_source" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."review_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."review_request" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_transaction" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_cost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_cost" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."widget_conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."widget_conversation" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."storefront" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."storefront" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_ai_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_ai_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."quote_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quote_items" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."quote_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quote_templates" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."quote_standard_texts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quote_standard_texts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."invoice_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invoice_reminders" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."travel_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."travel_entry" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."agent_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_runs" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."conversations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."scheduled_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."scheduled_actions" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."agent_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_settings" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."leads" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."lead_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."lead_activities" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."lead_scoring_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."lead_scoring_rules" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."automation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."automation_rules" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."automation_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."automation_queue" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."sms_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_queue" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."sms_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."task_activity_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_activity_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."gmail_imported_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gmail_imported_message" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_counters" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."v3_automation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."v3_automation_settings" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."v3_automation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."v3_automation_rules" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."v3_automation_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."v3_automation_logs" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."pipeline_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pipeline_stages" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."agent_context" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_context" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."learning_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."learning_events" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_preferences_legacy_v5" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_preferences_legacy_v5" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."fortnox_sync" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fortnox_sync" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."pricing_intelligence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pricing_intelligence" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."referrals" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."email_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."email_conversations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partners" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vehicles" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."vehicle_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vehicle_reports" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."allowance_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."allowance_types" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."allowance_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."allowance_reports" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."work_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."work_orders" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."form_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."form_templates" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."form_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."form_submissions" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_invoices" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."canvas_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."canvas_items" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."push_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_tokens" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."quote_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quote_categories" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."custom_quote_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."custom_quote_categories" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."partner_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_events" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."lead_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."lead_sources" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."customer_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_segments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."contract_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contract_types" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."price_lists_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."price_lists_v2" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."price_list_items_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."price_list_items_v2" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."pending_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pending_approvals" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_stages" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_photos" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."quote_tracking_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quote_tracking_events" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."seasonality_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seasonality_insights" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."seasonal_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seasonal_campaigns" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_locations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_items" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_movements" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."time_checkins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."time_checkins" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."field_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."field_reports" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."field_report_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."field_report_photos" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."leads_outbound" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."leads_outbound" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."leads_monthly_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."leads_monthly_usage" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."leads_neighbour_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."leads_neighbour_campaigns" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."manual_suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."manual_suppliers" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."manual_supplier_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."manual_supplier_products" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."agent_memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_memories" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."agent_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_messages" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."sms_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_usage" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."deal_automation_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deal_automation_tasks" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."deal_flow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deal_flow" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."deal_flow_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deal_flow_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_events" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."billing_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."billing_plan" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."calendar_watches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."calendar_watches" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."landing_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."landing_leads" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."website_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."website_orders" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."booking_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."booking_materials" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."monthly_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."monthly_reviews" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."job_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."job_types" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."matte_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."matte_conversations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."matte_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."matte_messages" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_workflow_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_workflow_stages" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_stage_automations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_stage_automations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."portal_notification_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_notification_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."fortnox_api_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fortnox_api_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."products" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."agent_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_threads" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."agent_handoffs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_handoffs" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."thread_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."thread_message" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_knowledge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_knowledge" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_insights" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."admin_impersonation_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_impersonation_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_patterns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_patterns" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."personas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."personas" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."ad_analyses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_analyses" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."generated_copies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."generated_copies" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."campaign_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."campaign_plans" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."localizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."localizations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."templates" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."production_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."production_jobs" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."qa_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."qa_runs" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."qa_thresholds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."qa_thresholds" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."ai_generations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_generations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."user_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_credits" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."master_creatives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."master_creatives" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."creative_briefs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."creative_briefs" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."campaigns" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."rot_payment_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rot_payment_request" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."ai_learned_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_learned_preferences" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."billing_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."billing_event" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_categories" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."product_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_components" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_outcome" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_outcome" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."service_agreement_type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."service_agreement_type" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."service_agreement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."service_agreement" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_preferences" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."employee_certificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employee_certificate" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reservation_texts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reservation_texts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reservation_triggers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reservation_triggers" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_integration_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_integration_credentials" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."demo_reset_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."demo_reset_audit" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."cost_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cost_event" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."email_inbound_route" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."email_inbound_route" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."landing_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."landing_events" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."partner_payout_batch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_payout_batch" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."partner_commission_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_commission_ledger" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."partner_followups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_followups" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_job" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_segment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_segment" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_lesson" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_lesson" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."customer_fact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_fact" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."next_best_action" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."next_best_action" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."fuel_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fuel_ledger" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."business_twin_forecast" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_twin_forecast" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."benchmark_consent_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."benchmark_consent_audit" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mission" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."invoice_evidence_manifest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invoice_evidence_manifest" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mission_mandate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mission_mandate" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."jobbpass" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."jobbpass" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."operating_experiment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."operating_experiment" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."support_ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_ticket" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."karin_custom_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."karin_custom_event" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."gtm_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gtm_account" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."gtm_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gtm_activity" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."gtm_suppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gtm_suppression" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."installation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."installation" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_tip_dismissal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_tip_dismissal" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."call_retention_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."call_retention_audit" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."platform_health_check" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_health_check" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."push_dispatch_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_dispatch_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."partner_self_billing_sequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_self_billing_sequence" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."push_held" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_held" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_subscriptions" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."project_log_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_log_revision" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."raddningsarende" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."raddningsarende" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."lanseringsbevis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."lanseringsbevis" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."partner_attribution_decision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_attribution_decision" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."customer_preparation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_preparation" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."rate_limit_bucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rate_limit_bucket" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."portal_review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_review" NO FORCE ROW LEVEL SECURITY;
