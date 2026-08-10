# Google-synk-diagnosen — "funkar för Andreas, inte för Christoffer"

*Explore-recon 2026-08-10 mot hela Google-integrationen. Kort version här;
fullständig kartläggning gjordes i sessionen (OAuth, tokens, synkvägar,
felhantering).*

## ⚡ Viktigaste insikten: v105 kan REDAN ha löst det

Huvudmisstänkten (H1): alla Google-rutter kräver `getCurrentUser`, som
returnerar null när `business_users`-raderna ≠ exakt 1 — och Google-rutterna
anropar den UTAN businessId-argumentet (lib/permissions.ts:155). Christoffer är
ett admin-skapat pilotkonto som fram till 2026-08-10 SAKNADE business_users-rad
→ 401 på alla Google-rutter → UI visar "Ej ansluten" oavsett vad han gör.
**v105-backfillen (körd+verifierad idag) skapade exakt den raden.**

**FÖRSTA ÅTGÄRD: be Christoffer testa Google-kopplingen igen NU.** Funkar det —
klart. Annars: fortsätt nedan.

## Grenvalsfrågan till Christoffer (30 sekunder)

*"När du klickar Anslut Google Kalender — kommer du till Googles kontoväljare,
eller händer inget / åker du till inloggningssidan?"*

- Kommer till Google men blockeras DÄR → **H3** (appen i Testing-läge)
- Kommer inte dit alls / hamnar på login → **H4** (cookie-parsningen)
- Kommer igenom men "Ej ansluten" efteråt → **H1/H2** (business_users/koppling)

## Hypoteser, rankade

| # | Hypotes | Kontroll | Åtgärd |
|---|---------|----------|--------|
| H1 | business_users-rad saknades (pre-v105) eller dubblerad → getCurrentUser=null → 401 | Q1 | 0 rader: skapa owner-rad. ≥2: behåll äldsta, peka om calendar_connection. KODFIX: skicka businessId till getCurrentUser i alla app/api/google/* (parametern finns sedan 2026-08-06) |
| H2 | Kopplingen sitter på fel business_user_id (status-rutten läser per business_user, synken per business — kan ge "funkar delvis") | Q3+Q2 | UPDATE calendar_connection SET business_user_id = rätt id |
| H3 | Google Cloud-appen i "Testing" → bara allowlistade testanvändare släpps in. docs/PRODUCTION_SETUP.md:171 har verifierings-checkpunkten OBOCKAD | Google Cloud Console → OAuth consent screen → Publishing status + Test users (10 sek) | Lägg Christoffers Google-konto som test user ELLER publicera appen. OBS: med bara kalenderscopes = billig sensitive-review, INTE restricted-audit — ta samtidigt bort Gmail-scopes ur consent-skärmen (koden begär dem inte sedan 8718c59c) |
| H4 | Chunkad/base64-prefixad Supabase-cookie → lib/auth.ts:66-83-regexen missar `.0`-suffix → connect redirectar till /login. KONTOSPECIFIKT: create-pilot fyller user_metadata (större JWT → chunkning) | DevTools → Cookies: finns `sb-…-auth-token.0`? | Byt cookie-läsning till createRouteHandlerClient/@supabase/ssr i connect-rutten |
| H5 | refresh_token saknas/ogiltig i DB — callback skriver `refresh_token: undefined` utan validering | Q2 | Koppla om via disconnect→connect. KODFIX: validera tokens.refresh_token i callback, skriv aldrig över befintlig med undefined |
| H6 | sync_enabled=false → integrations-sidan visar "Ej kopplad" | Q2 | UPDATE ... SET sync_enabled=true |
| H7 | GOOGLE_REDIRECT_URI saknas i Vercel-miljön — ODOKUMENTERAD env-var (.env.local.example listar den inte!) | Vercel env vars | Sätt + registrera samma URI hos Google |
| H8 | Cron når aldrig kontot: MAX_CONNECTIONS_PER_RUN=10 utan sortering | Vercel cron-loggar | Sortera på last_sync_at ASC |

**Avfärdat:** behörighetsgrind (ingen Google-rutt kräver owner/admin), prompt/offline-params (båda finns).

## Kända systemfel (drabbar ALLA, inte bara Christoffer)

1. **Tyst token-refresh-död** (lib/google-calendar.ts:279 `catch { return null }` utan logg): en död koppling ser ut som "aldrig kopplad" i UI:t, rensas aldrig, och rotorsaken går inte att avläsa. Pre-launch-auditens M3 (2026-05-19, "30 min") — fortfarande ogjord. **Fixa först i sprinten**: logga felkod + skriv till calendar_connection.sync_error.
2. **Gmail är de facto dött by design**: inga Gmail-scopes begärs sedan 8718c59c (2026-04-27); `gmail_scope_granted` sätts ALDRIG true → gmail-poll + gmail-lead-import-cronen (var 15:e min) matchar noll rader; gmail_send försöker ändå och faller tyst tillbaka på Resend. → Relevant för lead-Epic B: "företagsmailen" ska byggas på Postmark-spåret, INTE Gmail (restricted-scope-audit krävs annars).
3. **Realtids-webhooken trasig för alla**: calendar_watches.calendar_connection_id är UUID men calendar_connection.id är TEXT → watch-inserten failar tyst → "Unknown channel". Fix: kolumntyp TEXT + felkontroll + last_synced_at→last_sync_at.
4. **Riktningsväljaren i settings** skriver direkt via klient-Supabase mot RLS som aldrig matchar → uppdateringen träffar sannolikt aldrig DB.

## Diagnos-queries (kör i Supabase / via MCP)

```sql
-- Q0: hitta Christoffers konto
SELECT business_id, user_id, business_name, contact_email, is_pilot, created_by_admin
FROM business_config
WHERE contact_email ILIKE '%christoffer%' OR business_name ILIKE '%bee%';

-- Q1 (H1): exakt 1 aktiv business_users-rad?
SELECT id, business_id, user_id, role, email, is_active, created_at
FROM business_users WHERE business_id = '<BUSINESS_ID>' ORDER BY created_at;

-- Q2: kopplingens tillstånd
SELECT id, business_user_id, account_email,
       (access_token IS NOT NULL AND access_token <> '') AS har_access,
       (refresh_token IS NOT NULL AND refresh_token <> '') AS har_refresh,
       token_expires_at, (token_expires_at < now()) AS utgangen,
       sync_enabled, sync_direction, last_sync_at, sync_error, created_at
FROM calendar_connection WHERE business_id = '<BUSINESS_ID>';

-- Q3 (H2): pekar kopplingen på en levande business_user?
SELECT cc.id, cc.business_user_id, bu.id AS bu_id, bu.is_active,
       CASE WHEN bu.id IS NULL THEN 'FÖRÄLDRALÖS'
            WHEN bu.is_active IS NOT TRUE THEN 'INAKTIV' ELSE 'OK' END AS diagnos
FROM calendar_connection cc
LEFT JOIN business_users bu ON bu.id = cc.business_user_id
WHERE cc.business_id = '<BUSINESS_ID>';

-- Q4: jämför mot Andreas fungerande konto
SELECT bc.business_name,
       (SELECT count(*) FROM business_users bu WHERE bu.business_id = bc.business_id AND bu.is_active) AS antal_bu,
       cc.account_email, cc.sync_enabled, (cc.refresh_token IS NOT NULL) AS har_refresh,
       cc.token_expires_at, cc.last_sync_at, cc.sync_error
FROM business_config bc
LEFT JOIN calendar_connection cc ON cc.business_id = bc.business_id
WHERE bc.business_id IN ('<CHRISTOFFER_ID>', '<ANDREAS_ID>');

-- Q5: har någon synk skett?
SELECT count(*) FILTER (WHERE external_source = 'google') AS importerade,
       count(*) FILTER (WHERE synced_to_google_at IS NOT NULL) AS exporterade
FROM schedule_entry WHERE business_id = '<BUSINESS_ID>';
```

## Kodfixar som ingår i sprinten (oavsett Christoffer-utfall)

- [ ] `getCurrentUser(request, businessId)` i alla app/api/google/*-rutter (H1-kodfixen)
- [ ] Logga + persistera token-refresh-fel (M3 — lib/google-calendar.ts:279)
- [ ] Validera refresh_token i callback; skriv aldrig över befintlig med undefined (H5)
- [ ] Watch-tabellens typkonflikt (UUID vs TEXT) + felkontroll + kolumnnamnet (systemfel 3)
- [ ] Sortera cron-synken på last_sync_at ASC (H8)
- [ ] Dokumentera GOOGLE_REDIRECT_URI i .env.local.example + skill-referensen (H7)
- [ ] Google Cloud Console: verifiera publiceringsstatus, städa consent-skärmens scopes (H3 — Andreas, manuellt)
