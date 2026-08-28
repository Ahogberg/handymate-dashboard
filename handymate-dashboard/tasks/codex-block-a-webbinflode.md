# Uppdrag till Codex — Block A: webbkanalens inflöde, sant (2026-08-28)

Beslut: Andreas 2026-08-28 ("Claudes plan är rätt och filgränsen är bra"),
med Codex korrigering: det finns ingen sparad signal för "senaste
widgetladdning" — statusen får aldrig säga "Kopplad" ur `widget_enabled`.

## Verifierade fakta (källa + prod, 2026-08-28)
- `/api/onboarding/status` auth-luckan: **redan stängd** av Claude (`15ffa72e`, 401 bevisat i prod). Rör inte.
- Två installationsvägar visas: `public/embed.js` + `data-key` (settings/page.tsx:3596–3630, settings/integrations/page.tsx:42 — med en **fabricerad** nyckel `HM-<8 tecken av business_id>` som aldrig autentiserar) och `public/widget/loader.js` + `data-business-id` (settings/website-widget, StorefrontClient).
- `settings/integrations/page.tsx:87` sätter `setWidgetEnabled(false)` ovillkorligt — "Kopplad"-grenen är död kod.
- `app/api/storefront/contact/route.ts` är enda inflödet som inte går genom `createLeadAndDeal` (`lib/leads/golden-path.ts`): egen dedup (exakt match), ingen lead-rad, ingen Fortnox-synk, läser `pipeline_stage` (singular — Golden Path läser `pipeline_stages`), sväljer fel.
- Prod: `widget_conversation` finns (1 rad totalt). **0 företag har `widget_enabled = true`.** `GET /api/widget/config?bid=` är publik och registrerar inte besöket.
- `widget/chat` skapar lead + affär via `createLeadAndDeal` när kontakt lämnas (route.ts:289).

## Filgräns
**Codex äger:** `app/api/storefront/contact/route.ts` · `app/dashboard/settings/integrations/page.tsx` · widget-snippet-blocket i `app/dashboard/settings/page.tsx` · `app/dashboard/settings/website-widget/page.tsx` · widget-snippet i `app/site/[slug]/StorefrontClient.tsx` · ny `app/api/widget/status/route.ts` · (valfritt) `app/api/widget/config/route.ts` + `sql/v178_*.sql` · nya facits `tests/facit-webbinflode-*.spec.ts`.
**Rörs inte:** `public/embed.js` (fortsätter serveras för befintliga installationer) · `app/onboarding/**` · `lib/onboarding/**` · `components/jarvis/**` · `components/tour/**` · `lib/leads/golden-path.ts` (behövs ändring: föreslå, Claude gör den).
**Migrationer:** skriv `sql/v178_*.sql` med BAKGRUND/BESLUT-huvud som v174–v177; kör inte — Andreas säger "kör".

## Delar (en commit per del, `Co-Authored-By: Codex <noreply@openai.com>`)

### A1 — En installationsväg
- Ta bort embed.js-snippeten ur `settings/page.tsx` och `settings/integrations/page.tsx` (den fabricerade nyckeln försvinner med den). Enda installationsytan är website-widget-sidan med `loader.js` + `data-business-id`. Integrationssidans "Hemsida-widget"-rad länkar dit.
- `public/embed.js` lämnas orörd.

### A2 — Sann status (fyra lägen, aldrig "Kopplad" ur en flagga)
Ny `GET /api/widget/status` (auth via `getAuthenticatedBusiness`, `export const dynamic = 'force-dynamic'`) som räknar ur data och svarar med exakt ett läge:
| Läge | Sanning |
|---|---|
| **Inte aktiverad** | `widget_enabled` false/null |
| **Aktiverad, ännu inte verifierad** | `widget_enabled` true, 0 rader i `widget_conversation` |
| **Testad** | ≥1 `widget_conversation` för företaget (visa senaste tidpunkt) |
| **Lead verifierad** | ≥1 konversation som gav lead/affär via `createLeadAndDeal` (visa när) |
Integrationssidan renderar läget ur rutten; `setWidgetEnabled(false)` tas bort.
**Valfritt A2b (rekommenderas):** `business_config.widget_last_seen_at` + `widget_last_seen_host`, skrivna av `GET /api/widget/config` (throttlat, max en skrivning per timme per företag, host ur `Referer`/`Origin`) → extra läge **Installerad** ("sågs på <host> <tid>") mellan Aktiverad och Testad. Kräver v178. Notera i UI att signalen kommer från laddningen, inte från en verifierad konversation.

### A3 — Storefront-formuläret på Golden Path
- `POST /api/storefront/contact` går genom `createLeadAndDeal({ source: 'storefront_contact', … })`. Behåll honeypot `_hp` och lägg rate limit (`checkRateLimitDb` som i `leads/intake`).
- Bort: egna `customer`/`deal`-inserts, `pipeline_stage`-läsningen, `notification`-insert om Golden Path redan notifierar (verifiera i `golden-path.ts`; om inte — behåll notisen efter Golden Path-anropet).
- Fel svaras ärligt (svensk text, rätt status) — inget `console.error` + fortsätt.
- Kundens bekräftelse (om den finns i dag) behålls oförändrad.

### A4 — Facits (i `tests/facit-webbinflode-*.spec.ts`)
1. Inga UI-referenser till `embed.js` eller `data-key=` under `app/` och `components/` (bara `public/`).
2. Alla strukturerade webbinflöden importerar `createLeadAndDeal`: `storefront/contact`, `widget/chat`, `leads/intake`, `public/book/[slug]` — listan är facitets sanning, ny rutt = ny rad.
3. `settings/integrations/page.tsx` innehåller inte `setWidgetEnabled(false)`; statusrutten pinnar de fyra (fem) lägena och skriver aldrig "Kopplad".
4. `storefront/contact` innehåller inte `from('pipeline_stage')` och har rate limit + honeypot.

## Bevis (Claude kör mot prod, committar)
- `npx tsc --noEmit` = 0, facits gröna, CI-grinden grön på HEAD.
- Prod (Provfirman `biz_eaj2vp3xf2`, kund Anna Andersson `cust_mrqxoo8oj`): `POST /api/storefront/contact` med Annas telefon → **ingen** ny kund (dedup), en lead-rad + en affär; sedan ett okänt namn → ny kund + lead + affär.
- Integrationssidan: `widget_enabled` av → "Inte aktiverad"; på → "Aktiverad, ännu inte verifierad"; efter en riktig widget-konversation → "Testad".
- Inga nya utskick (mejl/SMS/push) införs i Block A.

## Regler
- Svenska i UI, aldrig engelska feltexter.
- Kolla att kolumner/tabeller finns (MCP finns) innan en query skrivs — fantomkolumn-klassen (#23/#24/#27) är husets vanligaste bugg.
- Route-filer exporterar bara handlers/`dynamic`/typer (en `export const` bryter `next build`).
- Debug-rutter som skickar något nås av tester bara med `dry_run: true`.

## Efter Block A → Block B (Claude + Codex på befintliga rälsar)
`lib/onboarding/channel-health.ts` (fyra ärliga lägen per kanal: telefon = `test_call.called_at`, e-post = mejlkanalens `last_received_at`, webb = statusrutten ovan) → nya signaler `email_inflow`, `widget_state` i `KomIgangSignals` → railen prioriterar för "Få in fler jobb". Ingen ny onboarding, ingen lanseringsspärr — men kunden får aldrig beskedet att kundinflödet fungerar förrän ett riktigt test gått hela vägen.
