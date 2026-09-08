> Current status: the dedicated test project is deployed successfully at https://handymate-vision-test.vercel.app. Unauthenticated `/api/day-close?view=reports` returns HTTP 401 with application/json and the application login message, without a Vercel login redirect. Three confirmed test Auth accounts are linked. Earlier blockers below are historical; authenticated HTTP journeys, native signing and TestFlight remain pending.

# Vision: database prepared, application connection pending

Backend PR #32: remote commit `8c3ed2516f52b618d2a4aa0cabd87d49cda3a73e`, branch `codex/vision-integration-20260908`. All 13 checks across five workflows passed; Vercel Ready.

Mobile PR #4: remote commit `5595e099a7b65e9790449b0412044f6d0f4d782f`, branch `codex/mobile-vision-20260908`. Typecheck, 214 Jest tests, CJS harnesses and iOS Expo/Hermes export passed. No signed IPA/TestFlight build was produced.

Supabase test project `eoodwyfxrdjmlqaealhj` has the recovered baseline, both feature migrations, and successful live SQL/RPC/cron probes. Scripts, exact baseline fingerprint and results: `sql/test-environment/README.md`. No production schema/data changes or provider sends were performed.

## Remaining application gates

Vercel's GitHub login returned “Incorrect username or password.” No authenticated Vercel configuration change completed. The candidate still redirects unauthenticated access to Vercel login HTML, so it cannot yet be the native API:

https://handymate-dashboard-git-codex-7ca747-andreas-projects-f2b98374.vercel.app

After completing provider login:

1. Set branch-specific Preview values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from the TEST project. Retrieve provider-issued values securely; do not reuse production credentials or commit keys.
2. Set the exact candidate `APP_URL` and signing secret. Enable `WORK_REPORT_CONTINUITY_ENABLED=true` and `DURABLE_QUOTE_FOLLOWUP_ENABLED=true`; real DB runner heartbeat is verified. Review inherited SMS/email settings before connecting synthetic fixtures.
3. Configure deployment protection for this test hostname so native requests can reach application authentication. Redeploy; verify exact commit, environment and hostname.
4. Create test Auth accounts and map owner/worker/other-firm actors. Currently there are zero Auth users and the seeded DB actors cannot log in. Verify login, refresh, sign-out and cross-company denial through HTTP.
5. Test actual application report save/resume/discard and signed approval flows. SQL probes do not establish HTTP, agent, messaging-provider or native acceptance.

## Native build gates

Use mobile PR #4's `vision-testflight` EAS profile and Preview environment. Set explicit `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the same test environment. API requests must return application responses, not Vercel login HTML.

Complete EAS login and Apple signing, build a signed iOS artifact, submit to TestFlight, then run the iPhone checklist in `VISION_TESTBUILD_2026-09-08.md`. EAS was not logged in. The complete vision and native release are not marked finished.

## Follow-up: credentials configured and Auth fixtures linked

Vercel and Supabase GitHub logins now succeed. Thirteen overrides were saved for Preview branch `codex/vision-integration-20260908` only. Seven server/config values were stored as Secret: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, CRON_SECRET, WORK_REPORT_CONTINUITY_ENABLED, DURABLE_QUOTE_FOLLOWUP_ENABLED and APP_URL. Three NEXT_PUBLIC values point to the isolated Supabase project and exact preview hostname. ELKS_API_USER, ELKS_API_PASSWORD and RESEND_API_KEY are invalid `vision-test-disabled` placeholders because Vercel rejects empty form values. No provider-send acceptance is claimed. The existing provider-issued legacy service_role key was verified to contain the test project reference; no key is included here.

Vercel bulk saving was partially successful despite reporting public-prefix validation errors. Reloading confirmed the seven server values, then the six remaining config values saved successfully. Production scope was excluded before both saves.

Redeployment of commit 8c3ed2516f52b618d2a4aa0cabd87d49cda3a73e was started with no build cache:
https://vercel.com/andreas-projects-f2b98374/handymate-dashboard/HhFNEoJufyXmaKHgssAZabGyik2D

Three synthetic Auth accounts were created through Supabase admin UI with email auto-confirmed, no invitation email and generated passwords. `18_bind_auth_accounts.sql` binds them to existing DB actors and verifies confirmation:

| Actor | Auth ID | Company | Role |
| --- | --- | --- | --- |
| bu_vision_owner | 9ab26d3a-8d8c-454e-9e9f-7389df286d6b | biz_vision_test_a | owner |
| bu_vision_worker | e0aef347-5578-434f-8347-64a044af5d9c | biz_vision_test_a | employee |
| bu_vision_other | b18856d1-4b87-43a7-b187-f1065c525bc2 | biz_vision_test_b | owner |

Earlier zero-Auth-user observations refer to the initial DB probe, before this step. Generated passwords were not committed. Actual application login/refresh/HTTP acceptance remains unverified.

Deployment Protection Exceptions are disabled under the current Vercel configuration and require the displayed USD 150/month Advanced Deployment Protection add-on. No upgrade or project-wide protection change was made. Prefer a separately configured test-only Vercel project with its own access settings before native acceptance; do not embed the existing project-wide automation bypass secret in the mobile application.

The new Vercel deployment completed successfully: Ready, build duration 4m 32s. Runtime commit is unchanged; no native build was submitted.

## Dedicated mobile test project created

Vercel project `handymate-vision-test` (ID `prj_XggvvjhoAe7Ubtr08mizCHjVQta8`) now exists in Andreas' projects. Framework Next.js, root directory `handymate-dashboard`, repository Ahogberg/handymate-dashboard. Branch tracking for this test project's primary environment was changed from main to `codex/vision-integration-20260908` and Vercel confirmed the save. The automatically started initial main build was cancelled. Vercel Cron Jobs is verified Disabled; the separate Supabase test pg_cron runner is unaffected.

Primary address: https://handymate-vision-test.vercel.app/
Settings: https://vercel.com/andreas-projects-f2b98374/handymate-vision-test/settings

The project still has no environment variables and no successful deployment. The public address returns DEPLOYMENT_NOT_FOUND. Default Standard Protection remains configured; no access controls in the original project were changed.

Automatic approval review rejected copying the test Supabase service-role credential and new signing secret into this NEW project, requesting explicit destination-specific user authorization. The earlier authorization covered the original project's Preview branch. Pending approval, do not retry that credential transmission. After approval: save only test credentials/config, set both app URL variables to the verified primary address, leave external providers unconfigured, deploy the integration branch as this test project's primary environment, verify unauthenticated JSON 401 and real test-account HTTP journeys, then configure mobile's vision-testflight environment. No paid protection add-on was activated.

## Dedicated project credentials approved and saved

The user explicitly approved credential transmission to `handymate-vision-test`. Supabase service-role values and a separate CRON_SECRET were saved as Secret in that project's primary environment. Config values include test Supabase URL/publishable key, APP_URL/NEXT_PUBLIC_APP_URL pointing to https://handymate-vision-test.vercel.app, both feature flags true, and a nonfunctional Stripe placeholder. No SMS/email/AI keys were copied to this project. The original project's credentials were not changed.

The cloud browser transport closed after successful saves. A documentation-only integration commit triggered the existing Git deployment instead: `647793c6c7380a32cd9f06545ff641c1a9ce38bd`. Application source remains equivalent to 8c3ed25. New deployment:
https://vercel.com/andreas-projects-f2b98374/handymate-vision-test/xb5ZoNDo2Pn7uUD7AcwpYkEGkuLs

Mobile `vision-testflight` environment values after public API verification:
- EXPO_PUBLIC_API_URL=https://handymate-vision-test.vercel.app
- EXPO_PUBLIC_SUPABASE_URL=https://eoodwyfxrdjmlqaealhj.supabase.co
- EXPO_PUBLIC_SUPABASE_ANON_KEY: test publishable key from provider (not the server key).

The primary environment label is Production only within this test-only Vercel project; it does not refer to app.handymate.se or production Supabase.

## Dedicated deployment verified

Both Vercel commit statuses report success for integration commit `647793c6c7380a32cd9f06545ff641c1a9ce38bd`. The dedicated project deployment is `xb5ZoNDo2Pn7uUD7AcwpYkEGkuLs`. A fresh unauthenticated network request to `https://handymate-vision-test.vercel.app/api/day-close?view=reports` returned HTTP 401, Content-Type application/json, body `{"error":"Logga in för att kontrollera din rapport."}`, with no Vercel authentication redirect. This verifies public routing to application authentication; it does not verify login, authenticated database access, AI, external sends or native acceptance.

The test project setup is complete. Remaining acceptance: real test-account login/refresh/logout and company isolation through HTTP, report save/resume/discard and signed approval flows, then EAS credentials/signing and the iPhone/TestFlight checklist. AI and messaging providers are unconfigured in this dedicated project.
