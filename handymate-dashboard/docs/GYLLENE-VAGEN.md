# Gyllene vägen — körboken

*Skapad 2026-08-10 ur en full kodkartläggning. Detta är dokumentet man har uppe
när en pilot (Christoffer) kör sin första riktiga resa: konto → första offert →
jobb → faktura → betalning. Varje station säger vad som ska hända, var beviset
syns, och var man tittar när det inte händer.*

**Så används den:** följ med piloten station för station. Bocka av bevisen i
ordning. Fastnar körningen — gå direkt till stationens "Om det inte händer"
i stället för att gissa.

---

## Innan körningen — preflight

| # | Kontroll | Hur |
|---|---|---|
| P1 | **Kontot har en owner-rad i `business_users`** | Kör steg 1-SELECTEN i `sql/v105_backfill_pilot_owner.sql`. Admin-skapade piloter före 2026-08-10 saknar raden → 403 på ALLT som räknas (skicka offert/faktura, godkänna kort). Kör backfillen om kontot listas. |
| P2 | Onboardingen är slutförd (`onboarding_completed_at` satt) | Annars har seedningen aldrig körts — pipeline-steg, offertmallar, reservationstexter, prislista saknas, och leads skapar inga deals (tyst). |
| P3 | Telefonnummer tilldelat (`assigned_phone_number`) | Utan det: inga inkommande samtal/SMS till Lisa. |
| P4 | `subscription_status` eller `is_pilot` släpper igenom | Paywall-grinden vid onboarding-avslut blockerar `inactive/cancelled/past_due/unpaid` om inte `is_pilot`. |
| P5 | Push installerad på pilotens telefon (PWA) | Godkännandekorten är avgörande i resan; iOS kräver PWA-installation före push. |

---

## Station 1 — Konto & inloggning

**Vägen:** `/onboarding` steg 1 skapar kontot via `POST /api/auth` (action `register`).
Admin-vägen är `POST /api/admin/create-pilot`.

**Ska hända:** `business_config` (status `trial`, 14 dagar) + **owner-rad i
`business_users`** + referralspårning. E-postverifiering är avstängd — inloggning
funkar direkt.

**Bevis:** piloten loggar in och ser dashboarden.

**Om det inte händer:**
- Inloggad men 403 vid första riktiga handlingen → P1 (owner-raden saknas).
- Sedan 2026-08-10 persisteras `f_skatt_registered` och `secondary_branches`
  från steg 1 (vakt: `tests/pilot-account.spec.ts`). Konton registrerade
  **före** det datumet har `f_skatt_registered = false` oavsett svar —
  rätta i Inställningar → Bolagsprofil.

## Station 2 — Onboarding (7 UI-steg)

**Vägen:** orkestreras av `app/onboarding/page.tsx` (`TOTAL_STEPS = 7`;
`onboarding_step` skrivs som 10 vid avslut av bakåtkompatibilitetsskäl).

**Ska hända vid avslut:** `seedAllDefaults` seedar pipeline-steg, offertmallar,
standardtexter, reservationstexter, prislista, checklistmallar, automationsregler.

**Bevis:** `/dashboard` öppnas (grinden: `onboarding_completed_at` eller steg ≥ 7).

**Om det inte händer:**
- Steg-sparning sväljer fel tyst (`saveProgress`) — en pilot som "tappat" ett
  steg har troligen fått ett tyst skrivfel; kolla `onboarding_data` i DB.
- Telefonköpet i steg 3 kan hamna i "pending" — numret provisioneras då av
  Stripe-webhooken i efterhand; misslyckas även den skapas bara ett
  godkännandekort. Kolla kön.

## Station 3 — Första kunden

**Vägar:** manuellt (`/dashboard/customers` → `POST /api/customers`), import
(Fortnox/CSV i onboarding steg 5), eller via samtal/SMS där **agentverktyget**
`createCustomer` skapar kunden (dedupe på telefonnummer). Lead-vägen
(`lib/leads/golden-path.ts`) skapar kund + lead + deal i pipeline-steget
`new_inquiry`.

**Bevis:** kunden syns i Kunder; lead-vägen ger dessutom en deal i pipelinen
och ett SMS till hantverkaren.

**Om det inte händer:**
- Lead utan deal = pipeline-steget `new_inquiry` saknas (seedningen kördes
  aldrig — P2). Felet är bara en `console.warn`.
- Inkommande samtal/SMS skapar INTE kund av sig självt — det gör agenten i
  konversationen.

## Station 4 — Offert: skapa & skicka

**Vägen:** `/dashboard/quotes/new` — Snabbofferten och fullständiga editorn är
**samma sida och samma sparväg**; allt sparas som `draft` och skickas från
offertens detaljsida (`Skicka`-modalen: SMS/e-post/båda).

**Ska hända vid Skicka (`POST /api/quotes/send`):**
1. Portallänk skapas/återanvänds (`portal_token` + `portal_enabled` på kunden)
   — länken i både SMS och mail går till kundportalen.
2. SMS via 46elks (spärrhake, kostnadsmätare, `sms_log`) och/eller mail
   (Gmail om kopplat, annars Resend) med spårningspixel + PDF-länk.
3. `quotes.status = 'sent'` + `sent_at`; deal flyttas till `quote_sent`.

**Fyra ögon-grinden:** om `four_eyes_enabled` och beloppet ≥ tröskeln och
avsändaren INTE är owner/admin → offerten läggs som godkännandekort i stället
och får status `pending_approval`. **Godkännandet skickar inte** — det låser
upp; skaparen måste trycka Skicka igen. (Owner skickar alltid direkt.)

**Bevis:** SMS framme hos kunden; offerten står som **Skickad**;
aktivitetsraden `sms_sent`/`email_sent` på kunden.

**Om det inte händer:**
- Kunden fick SMS:et men offerten står kvar som Utkast → statusskrivningen
  efter lyckad sändning failade (svaret innehåller bara en `warning`). Detta
  förgiftar ALLT nedströms: öppnad-spårning, uppföljningscron och portalens
  offertlista ser aldrig offerten. Rätta statusen i DB och felsök loggen.
- Mail kom aldrig → Gmail-token utgången (hint i svaret) eller Resend
  okonfigurerat (tyst `false`).

## Station 5 — Offerten öppnas

**Tre ytor, samma endpoint** (`/api/quotes/track`): pixeln i mailet, publika
signeringssidan `/quote/[token]`, och kundportalens offertmodal.

**Ska hända:** `status 'sent' → 'opened'` (statusflippen är isolerad och kräver
exakt `sent`), händelserad i `quote_tracking_events`, räknare (kräver
v16-migrationen), push "Kunden läser din offert nu" vid första öppningen,
nudge-kort vid tredje visningen.

**Bevis:** offerten står som **Öppnad**; pushen kom.

**Om det inte händer:**
- Pixeln dödas av mailklienter som blockerar bilder — men portal-/publika
  sidan rapporterar också, så be piloten öppna via SMS-länken.
- Loggarna säger "är v16 körd?" → kör `sql/v16_quote_tracking.sql`.
- Offert i fel status flippar aldrig (se station 4-fällan).

## Station 6 — Kunden accepterar

**Tre vägar:** publik signering (`/quote/[token]`, atomisk RPC med
signaturdata), kundportalens **Acceptera** (villkorad statusflipp, 409 om
redan besvarad), eller hantverkarens interna "markera accepterad".

**Ska hända (alla vägar):** `status = 'accepted'` → **projekt skapas
automatiskt** (`createProjectFromQuote`: projekt + milstolpar ur arbetsraderna
+ stegmotorn startas på ps-01) → deal till `won` → bekräftelsemail till kunden
→ SMS till ägaren + SMS till kunden med portallänk till projektet.

**Bevis:** projektet finns med steget **Avtal signerat**; ägar-SMS framme;
kortet "skapa projekt manuellt" i kön är ett ÄRLIGT fallback-bevis om
projektskapandet failade.

**Om det inte händer:**
- Interna vägen ("markera accepterad") skickar INTE bekräftelsemail och
  skapar INTE fallback-kortet — känd divergens; använd den bara för
  offerter som gjorts upp utanför systemet.
- Projekt utan steg (tom stegrad) = stegmotorns init failade tyst; flytta
  manuellt till Avtal signerat så tar kedjan vid.

## Station 7 — Projektsteget flyttar sig självt

**Motorn:** `lib/project-stages/automation-engine.ts` — ps-01 Avtal signerat →
ps-02 Startmöte bokat → ps-03 Jobb igång → ps-04 Milstolpe → ps-05 Slutbesiktning
→ ps-06 Faktura skickad → ps-07 Faktura betald → ps-08 Omdöme.

**Producenterna (det som flyttar):** bokning för kunden (ps-02, kräver att
projektet står exakt på ps-01) · incheckning i tidrapporten (ps-03,
framåt-endast) · nattsvepet i maintenance-cronen (ps-03 i efterhand för
projekt med tidposter/passerade bokningar) · milstolpar klara (ps-04/ps-05) ·
faktura skickad (ps-06) · betalning (ps-07) · omdöme mottaget (ps-08).

**Vid varje flytt:** rad i `v3_automation_logs` (matar dygnsdigesten),
portalmail till kunden (utom ps-07/ps-08), och stegets automationer läggs
**alltid som godkännandekort** — aldrig direktkörning. ps-01/ps-03 köar
kund-SMS; ps-07 köar tack-SMS + omdömesförfrågan (+3 dagar).

**Bevis:** stegremsan på projektsidan flyttar sig utan att någon rör den;
korten dyker upp i kön.

**Om det inte händer:**
- Bokning flyttade inte till ps-02 → projektet stod redan på ps-03
  (incheckning hann före) — korrekt beteende, motorn går aldrig bakåt.
- Ingen flytt alls vid incheckning → flytten är fire-and-forget; kolla
  serverloggen, och nattsvepet lagar det i efterhand.

## Station 8 — Fakturan

**En enda underlagskälla:** `byggProjektFakturaUnderlag` (fail-closed:
projekt/kund saknas, faktura finns redan, eller noll rader → tydligt skäl).
Offertrader är sanningen; godkända/signerade ÄTA följer med.

**Tre vägar till faktura:**
1. **Projektet blir klart** → utkast skapas ALLTID som `draft` (aldrig
   "skickad"-lögnen) + granskningskort med full förhandsvisning i kön + SMS
   till ägaren. OBS: inställningen "fakturera automatiskt vid avslut" har
   aldrig kunnat skicka (intern 401) — den degraderar ärligt till utkast+kort.
2. **Nattsvepet** (missad intäkt, 06:40 UTC) → `fakturera_projekt`-kort med
   förhandsvisning; godkännandet återbygger underlaget, vägrar vid drift
   ("underlaget har ändrats"), skapar utkast och skickar med klickarens
   session.
3. **Manuellt** från projektet/fakturasidan.

**Skicka (`POST /api/invoices/send`):** PDF (Chromium), Swish-QR, OCR,
portal skapas om den saknas, mail/SMS, `status = 'sent'`, ps-06, portalnotis.
Fortnox-vägen sätter `sent` först när Fortnox bekräftat.

**Bevis:** kortet i kön med rätt belopp; efter godkännande: fakturan som
**Skickad**, kunden ser den i portalen, projektet på ps-06.

**Om det inte händer:**
- Kort som säger "underlaget har ändrats" är en VAKT, inte ett fel — öppna
  projektet, granska, fakturera därifrån.
- Utkast utan kort = kortinserten failade tyst; utkastet syns ändå på
  fakturasidan.
- PDF-timeout (30 s-gräns i Vercel) är en realistisk felkälla — försök igen.

## Station 9 — Betalningen

**Fyra vägar till `paid`:** manuellt "markera betald" · statusbytet i
fakturavyn · **kundens "Jag har betalat" i portalen → `confirm_payment`-kort
som en människa godkänner** (kravlöst påstående blir aldrig sanning av sig
självt) · Fortnox-synken (varannan timme).

**Ska hända:** `status = 'paid'` + `paid_at` → ps-07 → tack-SMS-kort +
omdömesförfrågan i kön → portalkvitto till kunden → **Värdekvittot** räknar
beloppet om en godkänd utåtriktad handling ledde hit inom 14 dagar.

**Bevis:** fakturan **Betald**; projektet på ps-07; omdömeskortet i kön.

**Om det inte händer:**
- Kundens Swish-påstående utan att någon godkänner kortet = fakturan står
  kvar som obetald och påminnelsekedjan FORTSÄTTER — godkänn eller avvisa
  kortet samma dag.
- Fortnox-vägen skickar inget portalkvitto (känd divergens).
- Betald men projektet står på ps-06 → efterbetalningsautomationerna
  failade tyst; flytta steget manuellt.

## Station 10 — Bevisytorna (det piloten ska SE)

| Yta | Var | Tänds av |
|---|---|---|
| **Senaste dygnet** (dygnsdigest) | Hem | Rullande 24 h ur automationsloggar + agentkörningar — varje stegflytt och agenthandling med läsbar beskrivning |
| **Kräver ditt beslut** | Hem | Alla kort ur stationerna ovan — HELA resan går via kön |
| **Att hämta** | Hem | Obetalda fakturor, ofakturerade avslut, obesvarade offerter |
| **Värdekvittot** | Hem (raden) + `/api/value/kvitto` | Godkänd utåtriktad handling → accepterad offert/betald faktura inom fönstret. En offert som accepteras UTAN föregående godkänt kort ger ärliga 0 kr |
| **Ägarrapporten** | Månadsrapporten | Bekräftat (kvittot) + uppskattat (märkt) + vilande — aldrig hopblandade. Kostnadsraden kräver aktivt abonnemang; en pilot på trial får ingen retention-mening (korrekt) |

---

## Nattens motorer (det som händer utan att någon klickar)

| UTC | Cron | Roll i resan |
|---|---|---|
| 03:00 | maintenance | Utgångna kort + **ps-03-svepet** (jobb som bevisligen startat) |
| 06:40 | missed-revenue | Intjänat-ofakturerat → `fakturera_projekt`-kort (max 5/natt) |
| 07:00 | check-overdue | `sent` → `overdue` efter förfallodag + väcker Karin |
| 08:00 | quote-follow-up | Utgångna offerter + påminnelser före utgång |
| 10:00 | send-reminders | Fakturapåminnelsekedjan |
| varannan h | fortnox-sync | Betalstatus från Fortnox |

---

## Tysta felen — snabbregister vid felsökning

1. **Owner-rad saknas** (admin-skapad pilot före 2026-08-10) → 403 på allt. `sql/v105_backfill_pilot_owner.sql`.
2. **Skickad-status failade efter lyckad sändning** → offerten osynlig för öppnad-spårning, uppföljning, portal. `app/api/quotes/send/route.ts`.
3. **Seedning kördes aldrig** (onboarding ej slutförd) → leads utan deals, inga mallar. `lib/seed-defaults.ts`.
4. **"Fakturera automatiskt vid avslut" skickar aldrig** (intern 401, känd) — utkast + kort är det riktiga beteendet.
5. **Interna "markera accepterad"** hoppar över bekräftelsemail + fallback-kort.
6. **Fortnox-betalvägen** hoppar över portalkvittot.
7. **v16 ej körd** → öppnad-räknare tysta (statusflippen överlever, isolerad).
8. **Kundens betalpåstående utan godkänt kort** → påminnelser fortsätter mot en kund som betalat.

*Fullständig station-för-station-detalj med fil:rad finns i kartläggningen som
föregick detta dokument (2026-08-10). Vakt-specs: `tests/pilot-account.spec.ts`,
`tests/stegkedjan.spec.ts`, `tests/quote-open-tracking.spec.ts`,
`tests/missed-revenue.spec.ts`, `tests/vardekvitto.spec.ts`.*
