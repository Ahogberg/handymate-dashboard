# Isolated vision test database — 2026-09-08

Target: `codex-vision-test-20260908`, project `eoodwyfxrdjmlqaealhj`, branch UUID `fe6e0093-85ea-48e6-b3b8-48f718efb810`.
Source metadata only: `pktaqedooyzgvzwipslu`. Production was not migrated or seeded.

These manually reviewed recovery/probe scripts intentionally live outside automatic migrations. **Never execute this directory wholesale or against production.** They have already run on the test branch and are generally one-shot.

## Baseline recovery order

The empty branch failed because migration history lacked the baseline needed by v106.

1. `01_empty_branch_and_types.sql` checks the initial empty partial branch before removing its one empty table; no Auth users may exist.
2. Run all seven `02_tables_*.sql` files, then 03–10. RLS and initial access revocation precede restored source grants/policies.
3. `11_resolve_builtin_defaults.sql` repairs UUID default resolution from the initial restore. Current script headers also use implicit pg_catalog precedence.
4. `12_verify_baseline.sql` must match `baseline-fingerprint.json` in all ten categories. Source/test matched exactly before feature migrations: 244 tables, 50 routines, 427 policies, 608 indexes, 808 constraints, 12 views, 9 enum types, 7 sequences, 17 triggers and 6,282 grants.
5. `13_record_baseline_history.sql` requires exact parity, then records the 55 historical versions included in that schema without rerunning them. Supabase rebase subsequently succeeded: FUNCTIONS_DEPLOYED / ACTIVE_HEALTHY.

No customer data, Auth users, storage buckets/objects, environment variables or credentials were copied. Source routines and grants are preserved literally; parity does not imply the inherited schema has no security findings.

## Feature/probe order

Apply existing `supabase/migrations/20260908165615_durable_quote_followup.sql` and `20260908183002_report_continuity.sql`, then:

1. `14_seed_db_actors.sql`: synthetic firms A/B, owner/worker/other-firm actors, customer, quote, project and assignment. Actor user_id values are null: these are not login accounts.
2. `15_verify_client_denials.sql`: actual anon/authenticated denial probes.
3. Existing `sql/operations/enable_durable_quote_followup.sql`: enable test pg_cron; verify a real successful heartbeat.
4. `schedule_followup_probe.sql`: wait for the real scheduler to create a prepared follow-up with exactly one pending approval before continuing. Never send to the fixture phone number.
5. `16_verify_report_rpc.sql`: report claim/receipt probes. A synthetic 75-minute time row is explicitly inserted in SQL; this is not an HTTP agent/tool test.
6. `17_verify_followup_controls.sql`: simulated approval/contact probes roll back; final follow-up cancellation and report discard persist. No provider invocation.
7. `verify_final_state.sql`: inspect saved results and real cron executions.

## Verified results

- Four new tables: RLS enabled, no anonymous/authenticated access, service-role access. Ten new routines: SECURITY INVOKER, empty search_path, no anonymous/authenticated execution grants.
- Direct SQL/RPC client denial probes passed. Cross-company/person claims, concurrent saves and stale actions were rejected.
- Actual scheduler prepared exactly one pending review; manual approval was required. A second send claim was refused. Customer contact blocked the stale plan and expired its card in a rolled-back probe.
- Final persisted report: discarded, completed=1, one saved log_time receipt and one 75-minute time row. Follow-up: cancelled/owner_cancelled, card rejected, send_claimed_at=null. Zero SMS logs and zero Auth users.
- Final read: runner enabled, last_error=null, heartbeat 2026-09-08T20:23:00.042057+00:00, ten successful cron runs. Runner remains enabled; probe follow-up is cancelled.
- Security advisor: no new-feature findings. Inherited findings remain: 22 RLS-without-policy INFO, 29 mutable-search-path WARN, vector placement, and existing client-executable SECURITY DEFINER routines. This work does not resolve baseline findings.

The branch was created without data, nonpersistent, at the confirmed estimate USD 0.01344/hour (about USD 0.32/day). Remove through the branch API when testing ends; do not merge fixtures into production.

Application/Auth/TestFlight gates remain in `docs/handoffs/VISION_TEST_ENVIRONMENT_2026-09-08.md`.

Exported routine bodies retain seven source trailing-whitespace lines so their exact fingerprint remains reproducible. Other generated EOF whitespace was normalized.
