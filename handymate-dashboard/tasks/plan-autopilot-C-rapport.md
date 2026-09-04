# Pass C: veckorapporten och "sedan du var här senast" (2026-09-04) — EFTER PASS B

Bakgrund: docs/audits/AUTOPILOT_REVISION_2026-09-04.md, åtgärd 6 och 7. Det
här är passet som skapar känslan Andreas beskriver: en anställd som
rapporterar. BÖRJA SKRIVA KOD INOM 10 MINUTER. Ingen migration. Inga commits.

## Del 1 — veckorapporten som SMS på fredag

Innehållet finns: `getWeeklyValue(supabase, businessId, rangeDays)` i
lib/weekly-value.ts (läs interfacet WeeklyValue rad 45–63 först). Det som
saknas är utskicket.

Ny cron app/api/cron/veckorapport/route.ts:
- `verifyCronSecret`. Schema i vercel.json: `0 14 * * 5` (fredag 16:00
  svensk sommartid / 15:00 vintertid — Hobby tillåter dag-of-week).
- Konton: `hamtaKontonMedAktivtTeam` (lib/billing/aktiva-konton.ts).
- Per konto: `getWeeklyValue(supabase, business_id, 7)`. Har veckan NOLL
  bevisrader OCH noll väntande kort ⇒ skicka inget. Tystnad är ärligare än
  "inget hände".
- Texten byggs av en REN funktion `byggVeckorapportSms(v: WeeklyValue,
  vantandeKort: number): string` i lib/rapport/veckorapport.ts så facit kan
  testa den. Form, max 320 tecken (två SMS):
    "Din vecka med Handymate: Karin bevakade 4 fakturor, Daniel följde upp 2
    offerter, Lisa fångade 3 samtal. 2 förslag väntar på dig. /Matte"
  Bara sanna rader: en agent utan händelser nämns inte. Noll väntande kort
  ⇒ meningen utelämnas. Ingen kronsumma i SMS:et om `confirmed_kr` är 0.
  Beloppet med sv-SE-gruppering när det finns.
- Skicka via `sendSmsViaElks` (lib/sms-send.ts:164 — läs SendSmsArgs) till
  ägarens nummer. Hitta hur monthly-review/route.ts (rad ~69) slår upp
  ägarens nummer och gör exakt likadant.
- Dedupe: skriv en rad i automation_activity (automation_type 'veckorapport',
  metadata { vecka: ISO-vecka }) och hoppa över konton som redan har en rad
  för veckan. Då är rapporten också synlig i "Skött utan dig".
- Tyst tid: fredag 16 är dagtid, men respektera `arTystTid` ändå (lib/
  notifications/tyst-tid.ts) — skicka inte om den säger nej.
- Lägg rutten i cron-auth-taket (+1) och route-inventory om den fäller.

## Del 2 — "sedan du var här senast"

lib/jarvis/dygnsdigest.ts har ett rullande 24 h-fönster. Ärligt, men en
hantverkare som varit på bygget tre dagar ser ett tomt kort.

- Läs var JarvisHome bygger `dygnsRader` (components/jarvis/JarvisHome.tsx
  rad ~973) och vad byggDygnsdigest tar in.
- Nytt: fönstret börjar vid MAX(nu − 24 h bakåt-gräns, senaste inloggning),
  med ett tak på 7 dagar. Senaste inloggning: leta efter var den redan
  sparas (grep `last_login`, `last_seen`, `senast_inloggad` i business_users
  / business_config). Finns inget: använd localStorage-nyckeln
  `handymate_senast_sedd` som sätts vid varje laddning av JarvisHome, och
  fall tillbaka på 24 h när den saknas. Ingen migration.
- Rubriken i SkottUtanDig måste följa fönstret: "Skött utan dig sedan i går"
  → "sedan i tisdags" / "sedan du var här senast (3 dagar)". Aldrig en
  rubrik som ljuger om fönstret — det är filens egen regel.
- `byggDygnsdigest` får parametern `sedan: Date` (ren funktion, default 24 h
  bakåt) så tests/dygnsdigest.spec.ts fortsätter gälla.

## Facit: tests/autopilot-rapport.spec.ts (browserlöst)
- byggVeckorapportSms: känd WeeklyValue ⇒ känd sträng; en agent utan
  händelser nämns inte; noll kort ⇒ ingen "väntar"-mening; confirmed_kr 0 ⇒
  ingen kronsumma; längd ≤ 320 för ett rimligt maxfall; riktiga å/ä/ö.
- veckorapport-rutten: verifyCronSecret; hamtaKontonMedAktivtTeam; hoppar
  vid noll bevis; dedupe på ISO-vecka; arTystTid; sendSmsViaElks.
- vercel.json: rutten med `0 14 * * 5`.
- dygnsdigest: `sedan`-parametern finns; tak 7 dagar; SkottUtanDig-rubriken
  byggs av fönstret (ingen hårdkodad "sedan i går" kvar utan villkor).
Lägg facit sist i BÅDE `test:contracts` och contracts.yml.

## Verifiering
```
npx tsc --noEmit
npx playwright test tests/autopilot-rapport.spec.ts tests/dygnsdigest.spec.ts tests/cron-auth.spec.ts $(ls tests | grep -iE "weekly|vecka|jarvis|skott" | sed 's#^#tests/#' | tr '\n' ' ') --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Rapportera ändrade filer, exakta siffror, avvikelser. Inga commits.
