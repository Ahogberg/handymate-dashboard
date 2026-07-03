# Aha-onboardingen ("Ring ditt nummer nu") — design-spec

_Datum: 2026-07-03 · Status: design godkänd av Andreas ("ser grymt ut")_
_Beslut låsta: placering FÖRE betalningen (fas i steg 3) · armerat testfönster + direktsändning · SMS omedelbart vid inkommande · test-lead behålls märkt med radera-knapp_

## Mål

Hantverkaren ska **uppleva** sin första fångade kund innan kortet dras — inte höra
om den. Sista momentet före Stripe-steget: ring ditt nya nummer, hör Lisas
hälsning, få catch-SMS:et på din egen telefon medan du håller den, se leadet
tändas live på skärmen. Aha:t är säljclosen.

**Upplevelsen är PÅ RIKTIGT** — riktigt samtal, riktigt SMS, riktigt lead.
Ingen simulering (fejk bränner förtroendet vi säljer).

## Varför en dedikerad test-väg (inte regelmotorn)

Verifierat mot kod:
- Default-reglerna (inkl. catch-SMS på `call_missed`) seedas **först vid
  onboarding-completion** → regeln finns inte under onboardingen.
- Alla seedade regler **respekterar nattläge** (21–08 → skipped) → kvälls-test
  skulle tyst misslyckas.
- Transfer-grenen är odeterministisk vid själv-samtal (koppla till den egna
  upptagna telefonen).

→ Testet får en egen, deterministisk väg: **armerat fönster + direktsändning**
via `sendSmsViaElks`, helt inneslutet i armerings-checken (noll påverkan på
normala samtal).

## UX-flöde (fas i `Step4PhoneNumber`, INGEN steg-omnumrering)

CLAUDE.md-läxan: rubba aldrig onboarding-steg-index. Testet är en **fas** i
befintliga steg 3-komponenten (`app/onboarding/components/Step4PhoneNumber.tsx`),
som växlar vy efter att numret reserverats:

1. Numret visas STORT + "Ring det nu från din mobil".
2. Vid vy-mount: armera (POST arm). Live-checklista pollas varannan sekund:
   - 📞 Samtal upptäckt
   - 💬 SMS skickat — kolla din telefon
   - ✅ Lead fångat
3. Success-vy: "Det där var Lisa. Precis så snabbt möter hon dina kunder.
   Nu aktiverar vi henne på riktigt." → onNext (Stripe-steget).
   + "Ta bort testet"-knapp (raderar test-leadet) + behåll-alternativ
   (pedagogiskt: "så här ser ett lead ut — det här är du").
4. **"Testa senare"-knapp alltid synlig** — testet blockerar ALDRIG onboardingen.
5. Efter 90 s utan samtal: felsöknings-tips ("dolt nummer? prova igen").
   SMS-fel visas ärligt ("samtalet fångades, men SMS:et kunde inte skickas
   just nu").

All copy svensk, inga tekniska termer (CLAUDE.md).

## Datamodell — ingen SQL-migrering

Allt state i befintliga `business_config.onboarding_data` (JSONB), under nyckeln
`test_call`:

```json
{ "armed_until": "<iso>", "called_at": "<iso>|null", "sms_sent": true|false,
  "sms_error": "<str>|null", "lead_id": "<id>|null", "customer_id": "<id>|null",
  "deal_id": "<id>|null" }
```

## API

- **`POST /api/onboarding/test-call/arm`** (auth): skriver
  `test_call = { armed_until: nu+10 min }` (nollställer tidigare state).
  Om 46elks-env saknas → `{ available: false }` (UI hoppar snyggt, ingen krasch).
  Re-armering tillåten (prova igen).
- **`GET /api/onboarding/test-call/status`** (auth): returnerar `test_call`-staten.
- **`DELETE /api/onboarding/test-call/lead`** (auth): raderar lead/deal/kund
  skapade av testet — scopat till EXAKT id:na i `test_call` (aldrig fri radering).

## Fångst-grenen i `voice/incoming`

Tidigt i handlern (efter business-uppslag, före mode-routing): läs
`onboarding_data.test_call`. Om `armed_until > nu`:

1. **Skicka catch-SMS omedelbart** till `from` via `sendSmsViaElks`
   (onboarding-copy: "Hej! Det här är Lisa på {företagsnamn}. Precis så här
   snabbt svarar jag dina kunder när du inte hinner 🚀") — SMS:et landar medan
   de håller telefonen. Utanför regelmotorn → natt-/seed-oberoende.
2. **Skapa leadet som vanligt** (`createLeadAndDeal`) men med titel/markering
   "🧪 Testsamtal (du)".
3. **Uppdatera `test_call`-staten** (called_at, sms_sent/sms_error, lead_id,
   customer_id, deal_id) → poll-endpointen ser stegen.
4. **Returnera `play`** med Lisas hälsning (befintliga `/api/voice/greeting`) +
   `whenhangup` med `handled=1` (ingen dubbel call_missed) — INGEN transfer.
5. Avarmera (`armed_until = null`) efter fångst → nästa samtal behandlas normalt.

Hela grenen är innesluten i armerings-checken; normala samtal påverkas inte.
Felhantering: SMS-fel → `sms_sent:false, sms_error` (samtalet är ändå fångat,
UI:t visar ärligt läge). Gren-fel får ALDRIG krascha samtalsflödet (try/catch →
fall vidare till normal routing).

## Kända förutsättningar (verifieras i implementationsplanen, gissas ej)

- **Numret måste vara aktivt direkt vid reservation** (steg 3) med
  `voice_start`-webhooken pekad mot `/api/voice/incoming` — verifieras mot
  nummer-reservations-API:t. Om webhooken sätts senare (vid completion) måste
  reservationen även sätta webhooken.
- `onboarding_data` skrivs från onboarding-flödet idag — arm/status-endpoints
  måste läsa/skriva utan att klippa andra nycklar (spread-merge).
- 46elks-signaturverifiering i voice/incoming gäller oförändrat.

## Verifiering (acceptanskrav)

- `npx tsc --noEmit` 0 fel · `npx next build` ren.
- Enhetstester där logik är ren (armerings-fönster/statusform om utbrytbar).
- **Manuellt (obligatoriskt, riktig enhet):** armera → ring numret → hör
  hälsningen → SMS på egna telefonen inom sekunder → checklistan tänds →
  leadet märkt 🧪 → "Ta bort testet" raderar → nästa samtal (oarmerat)
  behandlas normalt. Kvällstest (efter 21) ska också fungera.
- Regress: oarmerat inkommande samtal → exakt dagens beteende.

## Utanför scope

LiveTour-versionen (visa leadet poppa på dashboarden i steg 5 — "Båda"-optionen
valdes bort), ändringar i seeding-timing, Pengar in-radarn (egen spec).
