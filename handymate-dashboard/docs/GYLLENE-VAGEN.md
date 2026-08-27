# Gyllene vägen — körboken

*Skapad 2026-08-10 ur en full kodkartläggning. Utökad 2026-08-12 med
livscykelns andra halva (station 11-14: projektstängning → debrief → möten
som minne → nästa offert lär sig) och en adversarial-checklista. Omfattning nu:
station 1-14 + adversarial. Detta är dokumentet man har uppe när en pilot
(Christoffer) kör sin första riktiga resa: konto → första offert → jobb →
faktura → betalning → stängning → nästa offert. Varje station säger vad som
ska hända, var beviset syns, och var man tittar när det inte händer.*

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

## Station 2 — Onboarding (8 UI-steg)

**Vägen:** orkestreras av `app/onboarding/page.tsx` (`TOTAL_STEPS = 8`;
`onboarding_step` skrivs som 10 vid avslut av bakåtkompatibilitetsskäl).

**Ska hända vid avslut:** `seedAllDefaults` seedar pipeline-steg, offertmallar,
standardtexter, reservationstexter, prislista, checklistmallar, automationsregler.

**Bevis:** `/dashboard` öppnas (grinden: `onboarding_completed_at` eller steg ≥ 8 — bara finalize når dit).

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

## Station 11 — Projektet stängs

**Vägen:** Två dörrar stänger ett projekt, och båda kör exakt samma
sidoeffektskedja: webbens `PUT /api/projects` (status → `completed`) och
mobilens klarmarkering `POST /api/booking/complete-job` (sista bokningen i
sekvensen, `is_final_day`). Båda går genom **samma fyra-ögon-grind**
(`lib/projects/four-eyes-gate.ts`, `checkFourEyesGate`) — beslutet läses ur
databasens `budget_amount`, aldrig klientens payload (P1-5-lagningen: ett
anrop med ett förfalskat lågt belopp kunde tidigare hoppa över hela
kontrollen). Är beloppet över tröskeln och avsändaren inte owner/admin läggs
själva **stängningen** som ett godkännandekort — bokningen bockas ändå av på
mobilen, det är PROJEKTET som är grindat, inte hantverkarens arbetsdag.

**Ska hända (bara på övergången inte-klart → klart, aldrig på en upprepad
PUT mot ett redan stängt projekt):** `autoInvoiceOnComplete` (utkastfaktura)
→ `freezeProjectOutcome` (`lib/efterkalkyl/freeze-outcome.ts`) fryser
utfall-vs-offert i `project_outcome` (upsert på `project_id` — idempotent,
kastar aldrig) → `skapaDebriefKort` (`lib/debrief/create-debrief-card.ts`)
lägger `project_debrief`-kortet med 2-3 frågor byggda deterministiskt ur
samma delta (`byggDebriefFragor`, ingen AI) → stegmotorn flyttar till ps-05
→ Lars väcks (`job_completed`-agenttriggern). Varje steg ligger i sitt eget
try/catch — ett förlorat utfall eller kort får aldrig fälla stängningen som
redan skett.

**Bevis:** `SELECT * FROM project_outcome WHERE project_id = '...'` ger en
rad (`job_type`, `hours_diff_pct`, `amount_diff_pct`, `margin_pct`); kortet
"Hur gick [projektnamn]?" ligger i Godkännanden.

**Om det inte händer:**
- Inget i `project_outcome` och inget kort, trots att projektet blev klart →
  kontrollera först om fyra-ögon-grinden fångade STÄNGNINGEN (ett väntande
  godkännandekort för projektstängningen i sig — då har efterkalkylen och
  debriefen inte körts än, de väntar på godkännandet). Är projektet
  verkligen `completed`: `freezeProjectOutcome`/`skapaDebriefKort` sväljer
  alla fel internt, men sedan 2026-08-12 rapporterar debrief-kortets och
  snapshot-vägarnas felgrenar en `failed`-rad till `automation_activity`
  via `rapporteraTystFel` (lib/observability/driftlarm.ts) — de dyker
  därmed upp i driftlarm-digestens dygnssvep. `freezeProjectOutcome`s egna
  interna fel loggas fortfarande bara till serverloggen.
- **`job_type` null** → lärdomarna från det här projektet konsumeras ALDRIG
  av nästa offert (station 14). Sedan sanningsprincipen (2026-08-12)
  returnerar `fetchRecentLessons` en tom lista om ingen jobbtyp finns att
  matcha mot — tidigare visades de tre senaste lärdomarna oavsett typ, vilket
  gav badrumslärdomar på altanoffertar. Kontrollera projektets `job_type`
  (faller tillbaka till offertens `job_type` om projektet självt saknar den,
  aldrig tvärtom).
- Projekt **återöppnas** (klart → aktivt) → fakturan, det frusna utfallet
  och debrief-kortet rullas INTE tillbaka, ett medvetet val — men det loggas
  med en varning så en studsande stängning går att utreda i efterhand.

## Station 12 — Debriefen besvaras

**Vägen:** Svarsmodalen på `project_debrief`-kortet i Godkännanden. Klienten
skickar `action: 'edit'` med `edited_payload.answers` (frågetext → svar) —
det är den enda action som faktiskt slår ihop `edited_payload` i `payload`
innan exekveringen (case `project_debrief` i
`app/api/approvals/[id]/route.ts`).

**Ska hända:** Varje ifylld fråga (tomma hoppas över) blir en egen rad i
`project_lesson` (`lesson_text`, `impact_hint` = frågan, `source: 'debrief'`,
`job_type` följer med från kortets payload, `confirmed_by` = den inloggade
som svarade). Ett helt tomt debrief (allt "Hoppa över") är ett fullt giltigt
godkännande — `saved: 0`, inget sparas, och det visas inte som ett fel.

**Bevis:** `SELECT * FROM project_lesson WHERE project_id = '...'`.

**Om det inte händer:**
- "Hoppa över" på alla frågor → helt förväntat beteende, inget att felsöka.
- Kortet saknar `project_id` → sparar inget, ärligt fel i svaret ("Kortet
  saknar projekt-koppling").
- Ett vanligt **"Avvisa"** (reject, inte edit) på kortet är också ok — inget
  särskilt behöver städas upp, det finns inget att rulla tillbaka.

## Station 13 — Mötet som blir minne

**Vägen:** Mötesassistenten (`components/moten/Motesassistenten.tsx`,
Inkorgens Möte-flik) spelar in i 5-minuterssegment — inspelningen startas om
var 5:e minut så varje fil är en komplett, självständigt avkodbar fil (en
enda lång fil som tappar täckning mot slutet av ett 40-minutersmöte hade
förlorat allt) — upp till 90 minuter totalt. Varje segment laddas upp direkt
när det är klart, så mötet är redan halvvägs säkrat innan hantverkaren ens
trycker "Avsluta". Cron-workern `meeting-worker` (var 5:e minut,
`lib/meetings/process-job.ts`) claimar jobbet (CAS-lås mot dubbel-processning),
transkriberar väntande segment via Whisper, och sätter — när alla segment är
i ett slutgiltigt läge — ihop transkriptet med `assembleTranscript`
(`lib/meetings/assemble-transcript.ts`): ett segment som aldrig lyckades
transkriberas syns som ett explicit `[— avsnitt saknas —]`, ALDRIG som ett
tyst hål (mötestiden går ändå vidare — offseten avancerar med segmentets
uppmätta längd). Ljudfilen raderas direkt efter lyckad transkribering
(retentionsregeln: ljud är en transient buffert, bara texten består).
Transkriptet triggar samma analysendpoint som telefonivägen
(`POST /api/voice/analyze`), men i platsbesöksgrenen
(`arMote = recording.source === 'site_visit'`) med en egen prompt-vinkel.

**Ska hända:** Analysen landar som godkännandekort — INTE i den gamla
`ai_suggestion`-kön: `create_quote_draft` (offert eller ÄTA om tillägg till
pågående jobb nämndes), `meeting_followup` (blir en `task`-rad vid
godkännande), och `customer_fact` (uttryckliga preferenser/begränsningar/
löften/kontaktvägar, max 5 per möte, med ordagrant citat i
`evidence_quote`). Ett `meeting_summary`-kort skapas ALLTID, även när inget
konkret hittades — ärlighetsprincipen: kortet säger vad som fanns, aldrig
"allt är hanterat". Godkänns ett `customer_fact`-kort skrivs raden i
`customer_fact` (samma approvals-route). **Supersede-regeln:**
`contact`/`commitment` markerar tidigare aktiva fakta av samma kund+typ som
ersatta (`superseded_by` sätts på den gamla raden) — ett nytt telefonnummer
ersätter det gamla, ett nytt löfte ersätter det gamla. `preference`/
`constraint` ackumuleras i stället, inget ersätts (systemet kan inte
automatiskt avgöra en motsägelse — en kund kan vilja ha både ek och
halkfritt golv samtidigt). **Åtkomstkodförbudet:** portkoder, larmkoder,
nyckelgömmor och lösenord extraheras ALDRIG, även om de sägs uttryckligen i
mötet — inbyggt som en explicit instruktion i analysprompten, ingen
efterhandsfiltrering att lita på.

**Bevis:** Kortet i Godkännanden; efter godkännande: kundkortets "Det här vet
Handymate" (`app/dashboard/customers/[id]/page.tsx`,
`GET /api/customers/[id]/facts`) och projektsidans "Att tänka på" visar
faktumet.

**Om det inte händer:**
- Inget `customer_fact`-kort trots att kunden uttryckligen nämnde en
  preferens → ingen kund kunde härledas säkert. `recording.customer_id`
  kan vara null för ett fysiskt platsbesök utan telefonkoppling — koden
  försöker då kundens id via kopplad bokning (`call_recording.booking_id` →
  `booking.customer_id`), men hittas ingen kund alls hoppas
  fakta-extraktionen tyst över. Inte en bugg, ett förväntat läge.
- `[— avsnitt saknas —]` i transkriptet → ett segment gav upp efter 2
  misslyckade Whisper-försök (mobilnät på bygget) — resten av mötet
  analyseras ändå på det som finns.
- Långa möten (transkript över map-reduce-tröskeln) analyseras i flera pass
  (per-chunk-extraktion + merge med dedup) — samma slutformat, ingen
  synlig skillnad för hantverkaren.

## Station 14 — Cirkeln sluts

**Vägen:** Nästa offert på samma jobbtyp (`lib/ai-quote-generator.ts`) läser
BÅDA minnena parallellt vid genereringen: `fetchRecentLessons`
(`project_lesson`, kräver EXAKT `job_type`-match, max 3 senaste — ingen
jobbtyp given ger en tom lista, se station 11) och
`fetchCustomerFactsForQuote` (`customer_fact`, bara `preference`/
`constraint`, `superseded_by IS NULL`, max 8) — båda vävs in i
offertprompten. Guardian (`lib/projects/margin-guardian.ts`, körs via
`checkProfitabilityWarnings` i `lib/profitability.ts`) vakar samtidigt det
NYA projektet: >75 % av kalkylerad kostnad använt → `at_risk`, >95 % →
`over_budget`, med orsaksrader (KÄNT: förbrukat arbete/material/väntande
osignerad ÄTA, UPPSKATTAT: en prognos som bara visas vid ≥10 %
tidsförbrukning) och en deeplink till ett väntande ÄTA-förslag som stått
obesvarat i minst 5 dagar.

**Ska hända:** `profitability_warning`-kortet på Godkännanden visar
orsaksraderna (UPPSKATTAT-rader gråa/kursiva, KÄNT-rader vanliga) och länkar
vidare till projektet; `over_budget` pushar hantverkaren, `at_risk` gör det
inte (notiströtthet — 75 %-varningen är väntad i de flesta projekt mot
slutet). Värdekvittot/fyrstegsvyn (`/dashboard/pengar`,
`lib/value/ledger.ts`) visar månadens spår som fyra separata sanningsnivåer
som ALDRIG summeras ihop: identifierat ⊇ agerat ⊇ fakturerat ⊇ betalt — en
identifierad möjlighet är inte en intäkt, ett fakturerat belopp är inte
bekräftat betalt.

**Bevis:** Nästa offert på samma jobbtyp bär lärdomarna/kundfakta i
AI-genereringens underlag; `profitability_warning`-kortet med orsaksrader i
kön; `/dashboard/pengar` visar fyra kronbelopp för månaden.

**Om det inte händer:**
- Ingen lärdom syns i nästa offert → jobbtyperna matchar inte exakt
  (stavning/kapitalisering på `job_type`), eller v121/v122-migrationerna är
  inte körda än (fail-safe: tom lista, offerten fungerar precis som innan
  denna feature fanns).
- Guardian-kort uteblir trots hög kostnadsandel → projektet saknar
  `budget_amount > 0` (motorn behöver ett golv att räkna mot) eller står
  inte längre på `status = 'active'`.
- Guardian-kort dubbleras INTE vid upprepade cron-körningar samma dygn —
  dedup är mot `status = 'pending'` (inte hela historiken): samma
  pending-kort uppdateras i stället för att ett nytt staplas.

---

## Adversarial-checklistan

*Punktlista att gå igenom INNAN piloten trycker på knapparna på riktigt —
varje rad är verifierad mot koden, inte gissad. Förväntad utgång per
scenario:*

| # | Scenario | Förväntad utgång | Verifierat mot |
|---|---|---|---|
| A1 | **Offert avvisas** (fyra-ögon-kortet) | Offerten sätts TILLBAKA till `draft` av reject-hanteringen — utan detta fastnar den i `pending_approval`, en status varken uppföljning, expiry-cron eller portal känner igen. | `app/api/approvals/[id]/route.ts`, case `four_eyes_quote` |
| A2 | **Faktura förfaller** | Påminnelsetrappan (`send-reminders`, 10:00) fyra nivåer: friendly → firm → formal → final (avgift/ränta läggs på från och med firm/formal). Autonomt utskick bara om `invoice_reminder`-nyckeln är förtjänad OCH beloppet ≤ taket (default 25 000 kr) — annars godkännandekort. | `app/api/cron/send-reminders/route.ts`, `lib/autonomy/earned-autonomy.ts` |
| A3 | **ÄTA avvisas** | Raden markeras `declined`/`rejected` — räknas ALDRIG som signerad eller fakturerad; varken fakturaunderlaget, Guardians `ata_signerat_kr` eller efterkalkylen ser en avvisad ÄTA. | `app/api/ata/[id]/route.ts`, `lib/projects/compute-economics.ts` (`isSigned`/`isDeclined`) |
| A4 | **Godkännande REDIGERAS** (action `edit`) | `payload.edited = true` stämplas — bryter autonomistreaken precis som en avvisning. Förtjänad autonomi kräver 15 raka OREDIGERADE godkännanden (`STREAK_TARGET`), inte bara 15 icke-avvisade. | `lib/autonomy/earned-autonomy.ts`, `computeStreakFromRows` |
| A5 | **Autonomt utskick failar** | `recordAutonomyFailure` anropas ENDAST från den autonoma cron-vägen (aldrig godkännande-vägen) — ≥2 fel inom 14 dagar nedgraderar nyckeln + ett informationskort ("... lämnar tillbaka nyckeln") förklarar varför; kan förtjänas tillbaka med 15 nya godkända i rad. | `lib/autonomy/earned-autonomy.ts`, `FAILURE_THRESHOLD`/`FAILURE_WINDOW_DAYS` |
| A6 | **Möte där segment saknas** | Explicit `[— avsnitt saknas —]`-markör i transkriptet, mötestiden går vidare (offset avancerar med segmentets uppmätta längd) — aldrig ett tyst hål som ser ut som att inget hände där. | `lib/meetings/assemble-transcript.ts` |
| A7 | **Dubbel cron-körning** | Agentkedjan är idempotent per `idempotency_key`: samma nyckel andra gången ger `duplicate: true` + samma `run_id` tillbaka, ingen ny körning. Guardian-kortet dedupas mot `status='pending'` (uppdaterar i stället för att stapla). Debrief-kortet har LIVSTIDS-dedupe (oavsett status, aldrig bara pending). | `app/api/agent/trigger/route.ts`, `lib/value` (Guardian-dedup i `lib/profitability.ts`), `lib/debrief/create-debrief-card.ts` |
| A8 | **Två användare samtidigt** (samma kort) | CAS på `pending_approvals`: UPDATE med `.eq('status','pending')` — bara requesten som faktiskt flippar statusen exekverar payloaden; den andra får 409 "Approval already resolved". Gäller även retry-vägen (`'failed'`→`'retrying'`-flippen). | `app/api/approvals/[id]/route.ts` |
| A9 | **Anställd utan ekonomibehörighet** | Pengar-API:er (fakturor, lönsamhet, pipeline-belopp) kollar `hasPermission(currentUser, 'see_financials')` och svarar 403 vid saknad behörighet — mönstret vaktas explicit av en regex-test som fångar den vanliga bugg-varianten (filtrerar svaret utan att blockera anropet). Klienten döljer Ekonomi-fliken och strippar ÄTA-priser server-side (`prices_redacted`). | `tests/permission-contract.spec.ts`, `app/dashboard/projects/[id]/page.tsx` |
| A10 | **Fortnox otillgängligt** | `fortnox-sync`-cronen (varannan timme) filtrerar på `fortnox_connected = true` — företag utan koppling hoppas tyst över, inget fel. Fakturor via Fortnox-vägen sätts `sent` först när Fortnox faktiskt bekräftat (station 8) — ingen falsk "skickad"-status vid avbrott. | `app/api/cron/fortnox-sync/route.ts` |
| A11 | **Google frånkopplad** | Mailutskick (offert/faktura) försöker Gmail först och faller tillbaka till Resend vid fel — kunden får ändå mailet. | `app/api/quotes/send/route.ts` |
| A12 | **Kund utan e-post** | `method: 'email'` → 400 "Kunden saknar email" (hårt fel, du bad specifikt om mail). `method: 'both'` → degraderar tyst till bara SMS, inget fel visas. | `app/api/quotes/send/route.ts` |
| A13 | **Superseded faktum** | `fetchCustomerFactsForQuote` OCH kundkortets fakta-lista filtrerar båda på `superseded_by IS NULL` — en ersatt kontaktuppgift eller ett inaktuellt löfte läcker aldrig in i en ny offert eller "Det här vet Handymate". | `lib/ai-quote-generator.ts`, `app/api/customers/[id]/facts/route.ts` |
| A14 | **Projekt utan intern timkostnad** | Guardian räknar kostnaden UTAN arbetskostnaden (golv, aldrig fabricerad) och lägger en explicit KÄNT-orsaksrad: "Intern timkostnad ej konfigurerad — arbetskostnaden ingår inte i siffran". `project_outcome.labor_cost_configured = false` bär samma ärlighetsprincip vidare till efterkalkylen. | `lib/projects/margin-guardian.ts`, `lib/efterkalkyl/freeze-outcome.ts` |
| A15 | **PWA på iOS Safari** | Push fungerar INTE alls förrän appen är installerad som PWA (Lägg till på hemskärmen) — iOS ger inga push-notiser till en webbflik. Se preflight P5: visa alltid iOS-specifik installationsinstruktion innan piloten förlitar sig på godkännandekorten. | Preflight P5 (ovan) |

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
| var 5:e min | meeting-worker | Station 13 — claimar mötesjobb, transkriberar segment (Whisper), sätter ihop transkriptet, triggar analysen. Tillkom 2026-08-11 (bccd1088) — kräver `sql/v119_meeting_v2.sql` körd. |
| var 5:e min | meeting-reminders | Förmötespush — bokningar 10-20 min fram med kund → "Möte om 15 min: {kund}" till tilldelad användare. Samma commit/migrationskrav som ovan. |

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
