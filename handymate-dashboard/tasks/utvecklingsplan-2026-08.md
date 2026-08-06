# Utvecklingsplan — närmaste tiden

**Skriven 2026-08-06** efter genomgång av båda GPT-kartläggningarna, grundade
mot faktisk kod. Ersätter deras kalenderordnade faser med en ordning efter
**färskvara och beroenden**.

De två dokumenten är strategiskt riktiga men vet inte vad som redan är byggt.
Granskningsnoterna ligger överst i respektive fil.

---

## Princip: färskvara före allt annat

Vissa saker går bara att fånga **när de händer**. Fångar vi dem inte nu är de
borta för alltid, och ingen senare utveckling återskapar dem. Andra kan byggas
när som helst — men blir meningsfulla först vid volym.

Vi har **en pilot**. Allt som kräver många kunders data för att fungera
(Job Genome, Trade Packs, benchmarking, Outcome Graph) är inte moat ännu — det
är ett kalkylark. Men varje AI-förslag vi ger den här veckan utan att spara vad
som låg bakom är data vi kastar bort permanent.

---

## SPÅR 0 — Blockerat på dig

Ingen av dem tar mer än några minuter, men de blockerar mätning.

- [ ] **Christoffer testar.** `tasks/pilottest-christoffer.md`. Hela veckans
      arbete vilar på ett citat från honom och fyra planerade checkpoints som
      alla hoppades över.
- [ ] **Kör `sql/v87`** (deal→customer FK) och **`sql/v92`** (vat_number +
      business-assets-bucket).
- [ ] **Ögonkontroll av v89 RLS** — logga in som ägare OCH anställd, öppna Ny
      offert, kontrollera att snabbvalsknapparna visar artiklar.
- [ ] **iOS-kontroll** av scroll och dimning i sektionsgranskningen. Största
      otestade tekniska risken i offertflödet.

---

## SPÅR 1 — Färskvara *(gör nu, oavsett vad piloten säger)*

### 1.1 Beslutsposter — den billigaste moat-investeringen som finns

**Problem.** Ingenting sparar vilken modell, vilken promptversion och vilka
indata som låg bakom ett AI-förslag. Modellnamn är hårdkodade konstanter per
fil. Vi kan alltså inte svara på "blev vår AI bättre?" — bara gissa.

**Och röret läckte.** `learning_events` fångar redan vad agenten föreslog och
vad hantverkaren ändrade till — men `reference_id` var `UUID` medan koden
skickar TEXT, så varje insert avvisades. Felet loggades och **anroparen
kontrollerar aldrig returvärdet**. Lagat i v78 (körd 2026-08-03); allt före det
är borta.

**Att göra:**
- Lägg `model`, `prompt_version` och en hash av indata på varje AI-förslag som
  skapas — `pending_approvals.payload` räcker som bärare, ingen ny tabell.
- Låt `recordLearningEvent` **larma** när insert failar i stället för att
  returnera tyst. Ett facit-test som vaktar att anroparen kontrollerar svaret.
- Versionera prompterna: en konstant per prompt-modul, bumpas vid ändring.

**Varför nu:** varje dag utan detta är en dag av förlorad inlärningsdata.
Litet jobb, kompounderar omedelbart.

### 1.2 Bevis kopplat till fakturering

**Problem.** Foton, egenkontroll, signaturer och tid samlas in — men ingenting
läser dem vid fakturering. `autoInvoiceOnComplete` körs dessutom **före**
`freezeProjectOutcome` och utan någon kontroll.

**Att göra:** en `evidence checklist` per projekt som **varnar, aldrig
blockerar** ("Projektet är klart, men tre bevis saknas innan fakturan bör
skickas"). Samma sparsamhetsprincip som resten av produkten.

**Varför nu:** bevis som inte kopplas när de skapas går inte att koppla i
efterhand — kopplingen är själva datan.

### 1.3 Revenue Recovery: de tre saknade reglerna

**Problem.** 3 av 6 detektionsregler finns. Och de som finns är *reaktiva
triggers*, inte svep — missas fakturan vid projektavslut hittas den aldrig.

**Att göra:** ett nattligt svep som letar (a) godkänd ÄTA utan faktura,
(b) material ej fakturerat, (c) avslutat projekt utan faktura *i efterhand*.
Samma kortform som vilande pengar, samma attributionskedja
(`lib/value/recovered-revenue.ts`) så återvunna kronor mäts.

**Varför nu:** varje regel är direkt mätbar i kronor, och det är det enda
argument som håller i ett säljsamtal.

---

## SPÅR 2 — Bygg där vi redan leder *(efter Christoffers svar)*

### 2.1 Field-to-cash *(kartläggning 1 §8.2)*

Röst → ÄTA → fakturaunderlag. Högst ROI av produktidéerna eftersom primitiven
just byggts: `hooks/useAudioRecording.ts`, `/api/matte/transcribe`,
godkännande-kön, `create_ata_draft`, och B4:s "godkännandet sparar det du såg".

**Blockerad tills Christoffer validerat sektionsgranskningen** — flödet bygger
på exakt de primitiv han ska testa.

### 2.2 Förtjänad autonomi till en riktig nivåmodell *(kartläggning 2)*

`lib/autonomy/earned-autonomy.ts` **finns och fungerar**: 15 raka godkännanden
över 60 dagar, inkopplad på fem ställen, automatisk nedgradering vid avvisning.
Konkurrensanalysen säger att ingen konkurrent skeppar approval-kö-autonomi.

Begränsningen är att trappan har **två lägen** över **fyra** av dussintals
åtgärdstyper, och att den lever parallellt med tre andra axlar
(`risk_level`, auto-approve-confidence, global paus) som inte känner till
varandra.

**Att göra:** slå ihop axlarna till en 0–4-modell, bredda allowlisten,
policy-snapshot per autonom handling. Vägen dit är kortare än dokumentet antar.

---

## SPÅR 3 — Säkerhet, andra vågen *(bounded, när som helst)*

- [ ] **~50 kvarvarande rutter** i `SENSITIVE_ROUTES`. Kräver omdöme per rutt:
      samtalsinspelningar och SMS-trådar är känsliga, kundlistan är rimligen
      inte det. Jag nästan bröt ett fungerande flöde när jag grindade
      körjournalen — samma risk här.
- [ ] **De 31 handrullade grindarna** använder tre olika svenska felsträngar.
- [ ] `getCurrentUser` saknar `business_id`-filter på 31 äldre anropsställen.

---

## SPÅR 4 — Städa dött *(litet, sänker brus)*

- [ ] **`lib/e2e-deal-flow.ts`** — 11-stegsmotor utan anropare. Redan flaggad i
      `tasks/value-chain-plan.md:98`. Ta bort eller koppla in.
- [ ] **`docs/api/openapi.yaml`** — dokumenterar en endpoint och pekar på fel
      server. Dött.
- [ ] **`lib/auto-approve.ts`** — hela `DEFAULT_CONFIG` är `enabled: false`,
      enda anroparen är röstanalysen. Överlappar earned-autonomy.
- [ ] **`analyzeJobImage`** i `lib/ai-quote-generator.ts:281` — ser urkopplad ut
      till förmån för bild-i-prompt. Verifiera och ta bort.
- [ ] **`signed`** skrivs aldrig till `quotes.status` — död medlem i
      `WON_QUOTE_STATUSES`.
- [ ] **`create_quote`** i tool-routern godtar modellens priser okontrollerat.
      Peka om till `generateQuoteFromInput` nu när B1 finns.
- [ ] Tre döda `animate-in`-ställen; grön teknik renderas bara i edit-läge;
      förlustanalysens yta saknas (motorn finns).

---

## Uttryckligen INTE nu

Från moat-dokumentet, med skäl:

- **Job Genome, Trade Packs som delbar produkt, benchmarking** — kräver många
  kunders data. Med en pilot är det ett kalkylark, inte en moat.
- **Outcome Graph som verklig graf** — id-kolumnerna finns men saknar FK:er.
  Värt att göra när kedjan faktiskt traverseras av något; i dag gör inget det.
- **Handymate Protocol / integrationsprotokoll** — nedströms partners vi inte
  har.
- **Eventmodell (`lib/events`)** — 34 cronjobb plus `pending_approvals` som kö
  bär kedjan i dag. En eventbuss är rätt när flera konsumenter behöver samma
  händelse; nu har vi en per händelse.
- **35 % av kapaciteten på datagrund** — plattformsbygge före
  produkt-marknadspassning.

---

## Ordningen, kort

1. **Spår 0** — du. Blockerar mätning.
2. **Spår 1** — jag, nu. Färskvara, oberoende av pilotens svar.
3. **Spår 2** — när Christoffer svarat. Håller sektionsgranskningen bygger vi
   Field-to-cash ovanpå den; håller den inte är det bättre att veta före en
   sprint till.
4. **Spår 3 och 4** — fyllnad mellan de andra.
