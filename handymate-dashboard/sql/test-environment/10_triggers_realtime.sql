-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE TRIGGER trigger_business_config_updated BEFORE UPDATE ON business_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TRIGGER trigger_customer_updated BEFORE UPDATE ON customer FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TRIGGER trigger_booking_updated BEFORE UPDATE ON booking FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TRIGGER trigger_case_record_updated BEFORE UPDATE ON case_record FOR EACH ROW EXECUTE FUNCTION update_case_record();


CREATE TRIGGER update_time_entry_updated_at BEFORE UPDATE ON time_entry FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_set_ata_number BEFORE INSERT ON project_change FOR EACH ROW EXECUTE FUNCTION set_ata_number();


CREATE TRIGGER trg_update_profitability AFTER INSERT OR DELETE OR UPDATE ON time_entry FOR EACH ROW EXECUTE FUNCTION update_project_profitability();


CREATE TRIGGER trg_update_material_cost AFTER INSERT OR DELETE OR UPDATE ON project_material FOR EACH ROW EXECUTE FUNCTION update_project_material_cost();


CREATE TRIGGER deals_stage_timestamp BEFORE UPDATE ON deal FOR EACH ROW EXECUTE FUNCTION update_deal_stage_timestamp();


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();


CREATE TRIGGER templates_touch_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


CREATE TRIGGER trg_two_level_categories BEFORE INSERT OR UPDATE ON product_categories FOR EACH ROW EXECUTE FUNCTION enforce_two_level_categories();


CREATE TRIGGER trg_business_config_margin_target_explicit BEFORE UPDATE OF margin_target_percent ON business_config FOR EACH ROW EXECUTE FUNCTION stamp_margin_target_set_at();


CREATE TRIGGER trg_project_assign_number BEFORE INSERT ON project FOR EACH ROW EXECUTE FUNCTION project_assign_number();


CREATE TRIGGER guard_call_processing_fields BEFORE INSERT OR UPDATE ON call_recording FOR EACH ROW EXECUTE FUNCTION guard_call_processing_fields();


CREATE TRIGGER trg_protect_business_config_referred_by BEFORE UPDATE OF referred_by ON business_config FOR EACH ROW EXECUTE FUNCTION protect_business_config_referred_by();


CREATE TRIGGER preparation_project_scope BEFORE INSERT OR UPDATE OF project_id, business_id, customer_id ON customer_preparation FOR EACH ROW EXECUTE FUNCTION check_preparation_project();


ALTER PUBLICATION supabase_realtime ADD TABLE public.project_stages;
