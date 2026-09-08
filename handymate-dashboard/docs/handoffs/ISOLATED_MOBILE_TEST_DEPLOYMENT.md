# Isolated mobile test deployment

Project: handymate-vision-test (prj_XggvvjhoAe7Ubtr08mizCHjVQta8).
Primary URL: https://handymate-vision-test.vercel.app/
Branch tracking: codex/vision-integration-20260908.
Application root: handymate-dashboard. Framework: Next.js.

The test project's server credentials were saved with explicit user approval. Only the isolated Supabase project eoodwyfxrdjmlqaealhj is configured. Separate CRON_SECRET. Public Supabase settings, APP_URL and NEXT_PUBLIC_APP_URL target this environment. WORK_REPORT_CONTINUITY_ENABLED and DURABLE_QUOTE_FOLLOWUP_ENABLED are true. STRIPE_SECRET_KEY is an invalid sk_test_disabled placeholder. No SMS/email/AI provider keys were copied. Vercel Cron Jobs is Disabled; test Supabase pg_cron remains enabled. Existing Vercel Standard Protection is unchanged.

This documentation-only commit triggers the configured Git deployment after the cloud browser transport failed. Application source is unchanged from the previously tested integration candidate 8c3ed2516f52b618d2a4aa0cabd87d49cda3a73e. Verify Vercel status, public HTTP unauthenticated JSON 401, and authenticated test journeys before TestFlight. Deployment trigger alone is not a release acceptance result. The original production project and main are unchanged.
