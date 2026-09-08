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
