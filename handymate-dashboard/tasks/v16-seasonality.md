# V16 — Säsongsintelligens

## Status: ✅ Klar

## Vad som byggts

### Del 1 — SQL (`sql/v16_seasonality.sql`)
- `seasonality_insights` — månadsvis intäktsanalys per företag (UNIQUE business_id+month)
- `seasonal_campaigns` — genererade kampanjer (UNIQUE business_id+year+month = max 1/mån)
- RLS + index

### Del 2 — Branschanpassade teman (`lib/seasonality/industry-themes.ts`)
- 8 branscher: el, vvs, bygg, måleri, mark, tak, ventilation, allmän
- 3-6 teman per bransch, spridda över året
- `getSeasonalTheme(branch, month)` — returnerar tema eller null
- `normalizeBranch(branch)` — hanterar "Elektricist", "VVS", "Snickare" etc.
- Fallback till `allman` vid okänd bransch

### Del 3 — Analysmotor (`lib/seasonality/analyzer.ts`)
- `analyzeSeasonality(businessId)` — 24 månaders fakturahistorik
- Kräver minst 10 fakturor
- Identifierar slow months (<70% av medel) och peak months (>130%)
- Upsert till `seasonality_insights`

### Del 4 — Kampanjgenerator (`lib/seasonality/campaign-generator.ts`)
- `generateSeasonalCampaign(businessId, branch, month, year)`
- Kollar UNIQUE constraint → max 1 kampanj per månad
- Hämtar kunder med telefonnummer
- Genererar SMS med Claude Haiku (fallback-mall)
- Skapar `pending_approvals` med `approval_type: 'seasonal_campaign'`
- Payload: tema, vinkel, projekttyper, SMS-text, kundlista

### Del 5 — Cron (`app/api/cron/seasonality/route.ts`)
- Måndag 03:00 UTC via `vercel.json`
- Per företag: analysera historik + generera kampanjförslag
- 500ms delay mellan företag (API rate limits)

### Del 6 — Godkännanden
- `seasonal_campaign` tillagd i TYPE_CONFIG (orange tema)
- Specialkort: vinkel, projekttyper som taggar, kundantal
- `executeApprovalPayload`: skapar `sms_campaign` + mottagare vid godkännande
- Befintlig `send-campaigns` cron plockar upp och skickar

### Del 7 — Insights API (`app/api/seasonality/insights/route.ts`)
- GET med auth — returnerar 12 månaders insikter

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build

## Filer
- `sql/v16_seasonality.sql` (ny)
- `lib/seasonality/industry-themes.ts` (ny)
- `lib/seasonality/analyzer.ts` (ny)
- `lib/seasonality/campaign-generator.ts` (ny)
- `app/api/cron/seasonality/route.ts` (ny)
- `app/api/seasonality/insights/route.ts` (ny)
- `app/dashboard/approvals/page.tsx` (ändrad — seasonal_campaign typ + rendering)
- `app/api/approvals/[id]/route.ts` (ändrad — seasonal_campaign execution)
- `vercel.json` (ändrad — ny cron)
