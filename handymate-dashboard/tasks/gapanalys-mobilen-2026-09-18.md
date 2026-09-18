# Gapanalys: mobilappen mot det ombyggda offertflödet

**Datum:** 2026-09-18 · **Appens HEAD:** `d119532` · **Dashboardens gren:** `claude/gracious-brown-07lm99` (PR 91)

Underlag inför nästa EAS-build — den som enligt Andreas blir den vi tar i
produktion när vi börjar sälja — och inför Claude Designs uppdrag. Allt nedan
är läst i koden eller mätt i produktionsdatabasen. Där något är en bedömning
står det uttryckligen.

---

## Det goda beskedet först: appen behöver inget nytt API-lager

`getAuthenticatedBusiness()` (`lib/auth.ts`) läser **`Authorization: Bearer`
före cookien**, och appen skickar redan exakt den headern
(`lib/api.ts:9–15`, Supabase-session i `expo-secure-store`). Varenda rutt
webben använder är alltså redan anropbar från appen med dagens auth. Inget
mobil-API, ingen ny token-väg, ingen ny grind.

Tre av de fyra rutterna appen behöver finns dessutom redan och svarar rätt:

| Rutt | Svar | Status |
|---|---|---|
| `GET /api/job-types` | `{ job_types: [...] }`, aktiva, sorterade | finns |
| `GET /api/job-types/intake-questions?jobType=` | `{ questions, targets, canManage }` | finns |
| `GET /api/quote-templates` | mallar för företaget, favoriter först | finns |
| `POST /api/quotes` | läser **redan** `intake_answers` (`route.ts:481`) | finns |

Det enda som saknas är alltså i appen, inte i tjänsten.

---

## Vad appen gör i dag

`app/(tabs)/quote.tsx`, 1061 rader, fyra steg: **Kund → Jobb → Foton → Matte-förslag**.

Offerten byggs uteslutande av `POST /api/quotes/ai-generate` (ett foto + en
fritextbeskrivning), och raderna redigeras för hand i `LineEditorModal`.

---

## Gapen, ordnade efter vad som blockerar första jobbresan

### 1. Jobbtypen finns inte — och skickas inte ens (blockerande)

Appen har fem hårdkodade jobbtyper (`quote.tsx:30–38`):

```ts
const JOB_TYPES = [maleri, snickeri, el, vvs, annat]
```

Verkligheten i databasen är **14 jobbtyper**, företagsegna och med namn som
"Renovera badrum" och "Installera laddbox". Ingen av appens fem finns som
rad i `job_types`.

Värre: `jobType` skickas **aldrig till något API**. Det används bara i
valideringen och i chipsen. Det finns alltså ingen jobbtyp på offerten som
appen skapar — och jobbtypen är hela ingången till upplägg och frågor.

**Detta är rotgapet.** Utan det når appen varken mallar eller frågor.

### 2. Frågeflödet saknas helt

Ingen motsvarighet finns — verifierat med sökning på `intake`, `questions`,
`fråga` över hela appen. Det enda som sätter mängder är AI-förslaget.

Mätt i produktion: 14 jobbtyper, **0** med sparade `intake_questions`, 39
offerter, 0 med `intake_answers`. Nollan betyder **inte** att flödet är tomt:
`lib/quotes/intake-questions-server.ts:45` gör
`stored ?? seedIntakeQuestions(trade, job.name, targets)` — saknas sparade
frågor härleds de vid läsning ur bransch, jobbtypsnamn och mallens rader.
Appen får alltså frågor från dag ett utan att någon författat dem.

### 3. Upplägg/mallar saknas helt

Ingen referens till `quote_templates`, "mall" eller "upplägg" finns i appen.
Men frågorna pekar på **mallradernas id:n** — utan upplägg finns inga rader
att peka på, och frågeflödet blir meningslöst även om det byggs.

Ordningen är alltså tvingande: jobbtyp → upplägg → frågor. Inte tvärtom.

### 4. Bindningen måste följa med, inte återuppfinnas

`applyIntakeAnswers` (`lib/quotes/intake-questions.ts:413`) är ren TypeScript
utan React- eller Node-beroenden. Den bär den regel som gjorde om hela
paketet: **ett svar sätter mängden på de rader frågan pekar på, aldrig på
alla rader med samma enhet.** Första versionen matchade på enhet och gav
golvytan till både golv och vägg.

Samma sak gäller vakten `intakeRowTakesQuantity` (rad 219): en mängd får bara
sättas på en rad med artikelkoppling. Utan den tar ett "st"-svar Bee Services
mall från ~170 000 kr till ~2 000.

**Beslut som behövs (Andreas):** kopiera modulen till appen, eller bryta ut
den till ett delat paket båda repona drar in. Kopian divergerar garanterat;
det delade paketet kostar bygginfrastruktur i två repon. Min rekommendation
är kopia **med ett kontraktstest i båda repon som låser samma utfall**, för
att ett npm-paket mellan två privata repon är mer maskineri än frågan är
värd just nu.

### 5. Summan räknas på två ställen — och det är farligast av allt

Appen räknar `netto * 1.25` i klienten (`quote.tsx:63` och `:638`), och
skickar aldrig `rot_enabled` trots att `createQuote` har parametern.

Dashboarden har en hel kedja för ROT/RUT-uppdelning, arbetskostnad och
"varav arbetskostnad" — och mains senaste arbete gick just ut på att summan
ska räknas **ur raderna** så att talet och underlaget inte kan glida isär.
En app som räknar sin egen moms är per definition en andra sanning, och för
en hantverkare som säljer ROT-jobb blir den fel.

### 6. Mindre, men bör med i samma svep

- Endast `photos[0]` skickas trots att nio foton kan väljas (`quote.tsx:210, 337`)
- `sendQuote` hårdkodar `method: 'sms'` (`:346`) fast typen tillåter e-post
- `createCustomer` skriver **direkt mot Supabase-tabellen** `customers`
  (`lib/api.ts:1894`), inte via API — förbi varje servergrind

---

## Vad Claude Design måste leverera för appen

Tre ytor, alla i 375 px och med minst 44 px träffyta:

1. **Jobbtypsvalet** — riktiga jobbtyper från `GET /api/job-types`, inte fem
   fasta chips. Listan är företagsegen och kan vara 14+ poster lång.
2. **Frågeflödet** — motsvarigheten till `components/quotes/IntakeQuestionFlow.tsx`.
   En skärm, alla frågor, varje fråga överhoppbar. **Den avgörande detaljen:**
   under varje fråga står vad svaret ändrar — *"Sätter: Kakel golv, Tätskikt"*
   / *"Kryssar: Golvvärme"*. Utan den vet hantverkaren inte vilken rad talet
   hamnar på, och det är hela skillnaden mot enhetsmatchningen vi rev.
3. **Offertdokumentet** — webbens dokument är sedan rivningen den enda
   radeditorn. Appens `LineEditorModal` är en annan modell. De ska inte vara
   identiska, men de ska visa samma sanning: raderna, vad som är dolt, och
   summan räknad ur raderna.

---

## En fälla i bygget som måste redas ut före nästa build

`eas.json` har en profil `vision-testflight` som sätter
`EXPO_PUBLIC_API_URL=https://handymate-vision-test.vercel.app` och pekar på
ett **annat Supabase-projekt** (`eoodwyfxrdjmlqaealhj`), inte produktionens
`pktaqedooyzgvzwipslu`. `scripts/vision-build-env.cjs` vaktar dessutom att
den profilen *inte* får peka på `app.handymate.se`.

Profilen `production` använder default-URL:en, alltså app.handymate.se.
**Den build som ska säljas måste alltså byggas med `production`, inte med
`vision-testflight`** — annars levereras en app som talar med testmiljön.
`appVersionSource: "remote"` och `autoIncrement: true` gör att EAS styr
versionsnumret; `version 1.0.0` och `buildNumber 1` i `app.json` är alltså
inte det som hamnar i butiken.

---

## Ordning jag föreslår

1. `GET /api/job-types` in i appen, jobbtypen med i `POST /api/quotes` —
   litet, och låser upp allt annat
2. Upplägget hämtas och raderna förifylls
3. Frågeflödet + `applyIntakeAnswers` med kontraktstest i båda repon
4. Summan: bort med klientmomsen, ROT med i payloaden
5. De tre småsakerna i punkt 6
6. Först därefter EAS `production`-build

## Verifiering

- Appens `npm run check:readiness` (tsc + jest + `scripts/check-contracts.cjs`)
- Nytt jest-prov som låser att jobbtypen faktiskt **skickas** — dagens
  `quote-send-receipt.test.ts` låser sändningen, ingenting låser jobbtypen
- Kontraktstest i båda repon för `applyIntakeAnswers`: samma indata, samma rader ut
- Klickprov på riktig telefon: jobbtyp → frågor → offert → skicka
