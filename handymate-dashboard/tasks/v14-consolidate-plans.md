# V14 — Konsolidera plan-kolumner i business_config

## Status: Klar (build OK, tsc OK)

## Sammanfattning

Konsoliderade tre duplicerade plan-kolumner (`plan`, `billing_plan`, `billing_status`) till `subscription_plan` och `subscription_status`.

## SQL Migration
- [x] `sql/v14_consolidate_plans.sql` — **Kör manuellt i Supabase SQL Editor INNAN deploy!**
  - Steg 1: Migrera data till subscription_plan med COALESCE
  - Steg 2: DROP plan, billing_plan
  - Steg 3: Migrera subscription_status + DROP billing_status

## Ändrade filer

### Kärna
- [x] `lib/BusinessContext.tsx` — `plan` → `subscription_plan` i interface
- [x] `lib/get-plan.ts` — Läser bara `subscription_plan`
- [x] `lib/useBusinessPlan.ts` — `business.subscription_plan`
- [x] `lib/auth.ts` — `getBusinessPlanFromConfig()` förenklad
- [x] `lib/usage-tracking.ts` — `.select('subscription_plan')`
- [x] `lib/partners/webhook.ts` — `business.subscription_plan`
- [x] `lib/partners/commission.ts` — `business.subscription_plan`

### API-rutter
- [x] `app/api/auth/route.ts` — Returnerar `subscription_plan` istället för `plan`
- [x] `app/api/billing/webhook/route.ts` — Skriver `subscription_plan` + `subscription_status`
- [x] `app/api/billing/route.ts` — Läser `subscription_plan` + `subscription_status`
- [x] `app/api/billing/usage/route.ts` — Läser `subscription_plan`
- [x] `app/api/billing/checkout/route.ts` — Läser `subscription_plan`
- [x] `app/api/admin/metrics/route.ts` — Läser bara `subscription_plan` + `subscription_status`
- [x] `app/api/partners/dashboard/route.ts` — `.select('subscription_plan')`
- [x] `app/api/gdpr/export/route.ts` — Exporterar `subscription_plan`
- [x] `app/api/quote-templates/route.ts` — Plan-check

### Frontend
- [x] `components/Sidebar.tsx` — `business.subscription_plan`
- [x] `app/admin/page.tsx` — Interface + rendering
- [x] `app/site/[slug]/page.tsx` — Select-query
- [x] `app/site/[slug]/StorefrontClient.tsx` — Interface + usage
- [x] `app/dashboard/website/page.tsx` — Plan-check
- [x] `app/dashboard/settings/quote-templates/page.tsx` — Plan-check

## EJ ändrade (korrekt)
- `.from('billing_plan')` — detta är **tabellnamnet** för plan-definitioner, inte kolumnen
- `billing?.plan?.name` i billing-sidan — detta är API-responsens nested object
- `ref.plan` i partners dashboard — mappar redan korrekt via API

## Verifiering
- `npx tsc --noEmit` — 0 fel
- `npx next build` — ren build
- `grep billing_plan` — Kvarvarande = bara `.from('billing_plan')` (tabell)
- `grep billing_status` — 0 kvarvarande
- `grep business.plan` — 0 kvarvarande
