# Wow-genomlysning inför lansering — 2026-09-05

Orkestrerad genomlysning: 8 perspektiv → 28 idéer → 18 efter sammanslagning → 3 motståndare per idé (genomförbarhet på 6 dagar, ärlighet, kundrealism) → 1 överlevde alla tre. 64 agenter.

Tyngsta påståendena verifierade av Claude mot databas och kod 2026-09-05 innan rapporten sparades:
- sms_log senaste 90 dagarna: 96 skickade (senaste 13 aug), 85 misslyckade sedan 3 aug, samtliga "Not enough credits", senaste idag. 27 aug: 20 misslyckade, däribland invoice_reminder.
- call_recording: 1 rad. Lisa-körningar med phone_call: 0. push_subscriptions: 0. Expo-tokens: 1.
- handymate-mobile app/(tabs)/quote.tsx sätter status:'sent' → app/api/quotes/route.ts sätter bara sent_at, inget skickas.
- Inget saldolarm i app/api/cron/driftlarm.

---

# Har vi maximerat potentialen inför den 14:e?

## 1. Svaret

Nej, ni har inte missat något stort — 18 idéer från åtta perspektiv gav exakt ett wow som klarade alla tre prövningar, och det är en loop ni redan byggt men som i dag lovar och gör ingenting. Det verkliga wow:et ni har (Lisa fångar samtalet, kunden får SMS, förfrågan dyker upp) har aldrig körts skarpt i produktion: 46elks-saldot är 0 kr, `call_recording` har noll telefonsamtal, `push_subscriptions` är 0 rader. Fram till den 14:e handlar det inte om att uppfinna mer utan om att laga tre lögner och bevisa en kedja.

## 2. Bygg före den 14:e

### A. Starttiden — signatur i soffan till "Bokat" i telefonen (2–3 dagar)

**Scenen.** Kunden signerar söndag 21:15, väljer "vecka 39" ur riktiga kalenderluckor. Måndag 06:50 push: "Maria vill börja mån 22 sep — Boka 22 sep kl 07:30". Ägaren trycker, 06:51 plingar Marias telefon "Bokat: måndag 22 september kl 07:30 //Rörjour AB".

**Varför den överlever.** Verifierat i dag: producenten (`app/api/quotes/public/[token]/route.ts:355–405`) skapar kortet med texten "Bekräfta så läggs den i kalendern", men executorn (`app/api/approvals/[id]/route.ts:1781–1806`) läser `customer_reply_pending`/`entity.phone` som inte finns i payloaden → `{skipped:'no message or phone'}`. `buildPushTemplate` saknar typen → kortet landar tyst. Vyn är live för alla 123 kunder. Det är en levande ärlighetsbugg — och när den lagas är varje ord kunden ser backat av ett serversvar.

**Byggs.**
- Executor-gren `source==='quote_signing'`: POST `/api/bookings` (samma cookie-forwarding som `create_booking` rad 1074–1083; lägg till `project_id`-passthrough i `app/api/bookings/route.ts`), projektkoppling via `applyBookingPipelineEffects` — inte via `quotes.project_id`, kolumnen finns inte.
- Först när bokningen svarat ok: SMS med texten ur `app/api/actions/route.ts:419` (bryt ut den), `purpose:'transactional'`. Resultat `{ok, booking_id, sms_sent}` — SMS-fel klassas som "bokad, kunden kunde inte nås, ring {nummer}", aldrig som failed, och retry får aldrig POST:a en andra bokning.
- Pushmall klass beslut i `lib/notifications/approval-push.ts`, `approveLabel` "Boka {datum} kl {tid}" i `lib/jarvis/approval-view.ts`, datum/tid-redigering bara på webben.
- Kundtexten i `PortalQuoteSigningModal.tsx` och `quote/[token]/page.tsx`: "Veckor vi har utrymme att börja", inte "har vi ledigt".
- Facit `tests/starttid-loop.spec.ts`: bokning före SMS, SMS aldrig vid bokningsfel, aldrig två bokningar.

**Christoffers mening.** "Första gången en kund skriver på väljer hon själv en vecka ni har plats. Du trycker en gång på måndag morgon — hon har 'Bokat' i telefonen innan hon kommit till jobbet."

### B. Lisas kedja bevisad + push när det faktiskt hänt (1 dag utan kod, 1 dag kod)

**Scenen.** Prospekten ringer numret från sin egen mobil i mötet, ingen svarar, sekunderna efter kommer catch-SMS:et; hon svarar "extra uttag i garaget" och det plingar på Christoffers telefon.

**Varför den överlever.** Kedjan finns (`voice/incoming` → `voice/missed` → seedad regel → `sms/incoming` → Lisa). Alla tre motståndare sa samma sak: bevisa den först, sedan är push-delen liten. Det som fäller demon i dag är inte kod utan saldo.

**Byggs.**
- Dag 1, ingen kod: fyll 46elks, kör `docs/launch/LISA_SHARP_PROOF.md` station 1–7 på demokontot, röstbrevlåda AV, `respects_work_hours` kontrollerat mot mötestider, spara rå whenhangup-payload (`voice/missed/route.ts:62` gissar `state/duration`). PASS eller demon stryks.
- Dag 2: push "Lisa fångade ett samtal från 070-…" när lead-raden finns (`lib/leads/golden-path.ts`) och "Lisa svarade — läs tråden" när `sms_log` har success; aldrig från timer. Rätta testgrenens SMS-text "svarar" → seedad text (`voice/incoming` rad ~120). Ingen mobil-lyssnare — pull-to-refresh räcker i mötet.

**Christoffers mening.** "Ring det här numret från din egen mobil. Jag kommer inte svara. Det där var Lisa — svara henne, så ser du vad som händer på min telefon."

### C. Lögnerna som dödar affären i rummet (1,5 dag)

**Scenen.** Uppstartsmötet: "din första offert går ut medan vi sitter tillsammans" (grundarprogrammet). Ägaren säger offerten i mobilen, appen säger "Kunden har fått offerten". Anders får ingenting.

**Varför.** `handymate-mobile/app/(tabs)/quote.tsx:328–334` POST:ar `status:'sent'` → `app/api/quotes/route.ts:684–687` sätter bara `sent_at`. Dessutom skickar `lib/api.ts:752` fält som `/api/quotes/ai-generate` inte läser → alltid noll rader. Samma felklass som save-lead-buggen.

**Byggs.**
- Mobilen: rätta ai-generate-mappningen, spara utkast, anropa `/api/quotes/send {quoteId, method}`, kvitto med tre utfall ur svaret (skickad via kanal kl HH:MM / väntar på godkännande / kunde inte skickas). Test som förbjuder "skickad" utan send-anrop.
- Kopiapasset fångar/svarar: `company-scan-rows.ts:108,123`, `foretagsskannern/skanna.ts:211`, `bevakning.ts:161,166`, `dygnsdigest.ts:94`, `morning-brief.ts:368`, mobilens `ProofBand.tsx:19`, `Step5Activate.tsx:53` ("dygnet runt" är osant med arbetstidsgrinden), samt `foretagskollen.html:561,575,1021`. Två facit-låsta tester uppdateras.

**Christoffers mening.** "Skickad betyder att den gick. Lisa fångar — du bestämmer."

Summa 5,5–6,5 dagar. ÄTA-kvittot (1 dag, feasibility 5) tas om A landar på dag 2.

## 3. Efter lansering, i ordning

1. **ÄTA-kvitto med PDF** — billigast, ärligast, men kunden har redan PDF:en i portalen; hygien, inte wow.
2. **Kontorets viskning 15 min före (DEL A)** — en dags textbyte i en cron som redan går; tom för alla riktiga kunder tills bokning/faktura/offert delar customer_id.
3. **Kundens egna ord vid missat samtal (DEL C)** — det enda i Lisa-idén hantverkaren berättar om; kräver bevisad kedja (B) först.
4. **Ofakturerade timmar i fredags-SMS:et** — bara raden, aldrig kronor ur `default_hourly_rate` (schema-DEFAULT 500 hos 13/25 konton).
5. **"Jag kunde inte"** — rätt idé, fel klass: `customer.phone_number` är NOT NULL, de riktiga "kunde inte" är 89 SMS på "Not enough credits".
6. **Dagens rad till kunden ur rapportläget** — vänta tills en betalande loggat en dag med rösten; `project_log` har 0 rader.
7. **Karin betalade/ROT** — 0 ROT-fakturor, 0 Fortnox-kopplade; pushen skulle eka ägarens eget klick.
8. **Förtroendetrappan** — längsta streak i prod är 2; laga bara att `autonomy_offer` pushas.
9. **Priset ur samtalet** — inspelning avstängd av juridik; ta bort "baserat på jobbtyp" i `voice/analyze:528` nu.

## 4. Prövat och förkastat

- **Fortnox-historik baklänges dag 0** — noll Fortnox-kopplade konton, olöst licens, `GET /invoices/{n}` aldrig verifierad; "tio minuter" är i verkligheten 13 cronkörningar.
- **Bolagskalendern dag 0** — byrån och Fortnox visar redan datumen; hederlighetsfix (löftet i grundarprogrammet rad 82), inte wow.
- **ROT-besked per tjänst** — 13 av 16 VVS-rader svarar "är det villa eller bostadsrätt?"; el-exemplet stämmer inte ens med tabellen.
- **Kundens svar plingar i bilen** — problemet skapas av alfanumerisk avsändare; `on_my_way` har 0 rader i sms_log. Skicka från numret i stället, 30 minuter.
- **Lars läser kvittot/typskylten** — Vision-vägen har aldrig körts (0 foton i prod), kräver ny Expo-binär + Apple-review, moms inkl/exkl olöst.
- **Dagskvitto vid utstämpling** — `checkin` skriver ägarens uuid för alla anställda; pushen går till fel person.
- **Vad timmen gav** — material alltid noll → smickrande fel siffra på VVS/el; triggern har aldrig avfyrats.

## 5. Det ingen motståndare fångade

Varje wow i listan levereras genom exakt två kanaler, och båda är döda i produktion. SMS: 89 misslyckade på 90 dagar, samtliga "Not enough credits" — inklusive tre påminnelser ägaren godkände den 27 augusti och som aldrig gick, utan att någon fick veta. Det finns inget saldolarm i driftlarmet, ingen DLR-webhook, så "skickat" betyder "46elks tog emot". Push: 0 prenumerationer, 1 Expo-token (Nordström El, grundarens). Ni lagade igår att push *kan* nå kunden, men ingen kund har sagt ja.

Det betyder att A, B och C ovan är värdelösa på lanseringsdagen om två icke-kodsaker inte sker: (1) 46elks fylls på med autopåfyllning och ett larm i `app/api/cron/driftlarm` när saldot går under en veckas förbrukning, plus att ett godkänt kort vars SMS fallerar på saldo ALLTID skriver "kunde inte skickas — fel hos Handymate" på kortet; (2) push-prenumerationen blir ett obligatoriskt steg i Andreas uppstartsmöte med kunden, bockat i `kom-igang-tasks`, innan något annat visas. Utan det arbetar teamet, som revisionen sa, i en låda ingen vet finns — och det spelar ingen roll hur bra loopen i A är.

---

## Rådata

```json
{
 "antal_ideer": 18,
 "behall": [
  {
   "title": "Starttiden — från signatur i soffan till 'Bokat' i telefonen utan ett enda samtal (laga en loop som idag lovar och gör ingenting)",
   "snitt": 4,
   "dagar": 2
  }
 ],
 "uppskjutna": [
  {
   "title": "ÄTA-kvittot — villaägaren har sin signerade PDF i telefonen innan hantverkaren gått till bilen",
   "snitt": 4
  },
  {
   "title": "\"Ring mig nu\" — den riktiga kedjan som demo på prospektens egen mobil och som dag-0-ringtest på kundens eget konto (då startar garantiklockan)",
   "snitt": 3.6666666666666665
  },
  {
   "title": "Samma dag pengarna kommer säger Karin vad som gick igenom — 'det var påminnelsen du godkände' — och vad Skatteverket nu ska betala dig",
   "snitt": 3.3333333333333335
  },
  {
   "title": "Lisa lämnar över med kundminnet — 'Ringer nu' innan du svarar, 'du missade det' med reskontra och offert, och kundens egna ord när hen skriver",
   "snitt": 3.3333333333333335
  },
  {
   "title": "\"Jag kunde inte\" — teamet säger rakt ut vad det inte kunde göra och ber om det som saknas",
   "snitt": 3.3333333333333335
  },
  {
   "title": "Säg det en gång i bilen — kunden får dagens rad med dina egna ord, och teamet minns vad du lovade",
   "snitt": 3
  },
  {
   "title": "Inför besöket — Lars lapp kvällen innan och kontorets viskning 15 minuter före du kliver in",
   "snitt": 3
  },
  {
   "title": "Provanställningen syns — Karin måste få rätt 15 gånger innan hon får skicka själv",
   "snitt": 3
  },
  {
   "title": "Fredagens ofakturerade timmar — Karin har redan fyllt i fakturan",
   "snitt": 2.6666666666666665
  },
  {
   "title": "Offerten ur det som sades — priset du nämnde i luren följer med in i utkastet, och offerten du säger i bilen går ut med sant kvitto och ROT-frågan ställd",
   "snitt": 2.6666666666666665
  }
 ],
 "dodade": [
  "Fortnox-historiken läses baklänges på dag 0 — Hanna hittar dina tysta kunder innan du betalat, Lars hittar installationerna ni fakturerat",
  "Karin lade in dina myndighetsdatum innan du loggat in (bolagskalendern dag 0: bolagsform ur org.nr + tre svar i genomgången)",
  "ROT-beskedet per tjänst med Skatteverket som källa — innan första offerten (hemsidans tjänster i genomgången före betalning + prislistan i onboardingsteg 7)",
  "Kundens svar plingar i bilen — Lisa fångar svaret och ger det till den som är på väg",
  "Lars läser fotot du ändå tar — kvittot blir materialrader på rätt jobb med kvittots egna priser, typskylten blir installationen i kundens register",
  "Dagskvittot i fickan — 'din tisdag är registrerad' vid utstämpling, och en pling när chefen attesterat",
  "Vad timmen faktiskt gav — Lars räknar på första jobbet"
 ]
}
```
