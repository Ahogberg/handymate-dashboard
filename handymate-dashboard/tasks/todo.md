# NÄSTA NATTKÖRNING — A1 Ägarrapporten (planerad 2026-08-10, godkänd av Andreas)

Bakgrund: extern ChatGPT-rapport mappad mot rådsroadmapen — addendum i
`docs/council/ACTIVE_ROADMAP.md` ("Extern rapport 2026-08-10"). A1 är den enda
punkten som är ny, byggbar nu och ogated. Plan-fil:
`C:\Users\Gaming\.claude\plans\grymt-chatgpt-skrev-denna-peppy-bonbon.md`

**Vad:** värde-block på befintliga `/dashboard/monthly-review` (Månadsrapporten) —
INTE en ny sida (rådets NOT NOW: "Andra Economic Copilot-UI: aldrig").

**Fyra block, tre sanningsnivåer som ALDRIG slås ihop:**
- [ ] **Bekräftat** — Värdekvittot för månaden via `getVardekvitto()`
      (`lib/value/vardekvitto.ts`): confirmed_kr + bevisrader (label, kr, agent, dagar).
- [ ] **Uppskattat (märkt)** — admin-tid + samtal via `getWeeklyValue(supabase, bizId,
      månadens dagar)`: time_hours, calls_captured, autonomous_count. Ordet
      "uppskattad" står alltid utskrivet.
- [ ] **Vilande** — Pengar på bordet-totalen (`/api/dashboard/pengar`, ägargrindad).
- [ ] **Retention-raden** — "Handymate har kostat X kr — och bidragit till Y kr
      bekräftat värde." Kostnadskällan VERIFIERAS mot billing_plan/B7-datan FÖRST
      (lesson 2026-05-30: Stripe-speglande fält är cache). Saknas säker källa →
      ingen rad, aldrig en gissning.
- [ ] Ny ren `lib/value/agarrapport.ts` (sammanställaren) + `tests/agarrapport.spec.ts`
      med ärlighetsregler i värdekvittots stil (uppskattat når aldrig bekräftat;
      kostnad/värde separata; tom månad = ärlig nolla; saknad kostnadskälla ⇒ ingen rad).
- [ ] Ev. `GET /api/value/agarrapport` — ägargrindad, in i permission-kontraktets karta.

**Ingår INTE natt 1:** mailutskick (natt 2 — Vercel Hobby max daglig cron, månadsvis OK),
veckovariant, PDF. Verifiering per nattkörningsprotokollet: tsc → build → specs →
commit + push; manuell koll som ägare OCH anställd (ingen pengaläcka).

---

# Tur 4 — Innehållskontraktet fullt ut på /dashboard/hem (nattkörning 2026-08-10)

Plan godkänd av Andreas. Byggreferens: mockupen "Innehållskontrakt" (Tur 2–4).
En commit per etapp, varje etapp grön självständigt (tsc + next build + Playwright-specs) före push.
Fullständig plan: `C:\Users\Gaming\.claude\plans\f-rb-ttring-av-den-nya-dynamic-starlight.md`

## Produktbeslut (bekräftade av Andreas)
- "Godkänn & skicka" på fakturakortet skickar fakturan direkt — bara vid komplett preview, annars fallback till granska-läge. 5 s ångra kvar.
- Hela Tur 4 byggs i mockupens byggordning.
- "Att hämta" ersätter både Fakturor-kortet och Pengar på bordet. Dagens plan, Verksamheten, Karins bolagskalender kvar.
- Skarptest av Godkänn & skicka gör Andreas själv i egen tenant på morgonen — nattkörningen klickar aldrig Godkänn på riktiga prod-kort.

## Etapper
- [x] **Etapp 1 — Testdata-filter.** Ny `lib/testdata.ts` (arTestId, arTestNamn versalkänsligt, arTestdataApproval, arTestdataObservation). Läs-sidan: GET /api/approvals, /api/observations, /api/automations/activity, /api/dashboard/pengar. Producent: cron/missed-revenue hoppar testfynd. Ny `tests/testdata-filter.spec.ts`.
- [x] **Etapp 2 — fakturera_projekt.** Ny `lib/invoices/project-invoice-draft.ts` (lyft ur autoInvoiceOnComplete, fail-closed). fakturaKortTitel + versionsbump. Cron persisterar full preview vid komplett underlag. Kontrakt EXECUTABLE_ACTION. Executor-case: idempotens + drift-vakt + createInvoice + /api/invoices/send. Kortet: radtabell + "Godkänn & skicka — X kr".
- [x] **Etapp 3 — Teamet just nu.** Ny `lib/jarvis/bevakning.ts`, watch-block i team-activity (bara antal/datum), `components/jarvis/TeamBevakning.tsx` (kompakt = beslut >= 2), TeamPresenceBand bort. Ny `tests/bevakning.spec.ts`.
- [x] **Etapp 4 — Skrivraden.** Ny `components/jarvis/SkrivRad.tsx` — stor med chips (beslut <= 1), liten pill (beslut >= 2). Källskanning: chip-hrefs finns som sidor.
- [x] **Etapp 5 — Att hämta.** Ny `lib/jarvis/att-hamta.ts` + `components/jarvis/AttHamtaRailCard.tsx` med "väntar ovan"-scroll. PengarRailCard + Fakturor-kortet bort. Ny `tests/att-hamta.spec.ts`.
- [x] **Etapp 6 — Senaste dygnet.** Ny `lib/jarvis/dygnsdigest.ts` (24h rullande + grindar, halsningsBevis). Digest under besluten, agentfärgade prickar, kollapsbar. Ny `tests/dygnsdigest.spec.ts`.
- [x] **Etapp 7 (VALFRI).** Värdekvittot natt 1 — bara om alla sex är gröna och pushade.

## Verifiering per etapp
`npx tsc --noEmit` → `npm run build` → `npx playwright test <berörda specs> --no-deps` → push → kontrollera grön deploy innan nästa etapp (lesson 2026-08-04).

## Review (nattkörningen 2026-08-10, slutförd på morgonen)

Alla sju etapper byggda, gröna (tsc + next build + specs) och pushade:
1. `4b7662fd` testdata-filtret (lib/testdata.ts, 4 läsvägar + 3 producenter, 140 tester gröna)
2. `3fc631af` fakturera_projekt (project-invoice-draft.ts delad kärna, drift-vakt, v2-bump)
3. `5b414acd` Teamet just nu (bevakning.ts + watch-block utan belopp, TeamPresenceBand raderad)
4. `bbe42aab` skrivraden två lägen (SkrivRad.tsx, chips källskannade mot page.tsx)
5. `e2d818e8` Att hämta (att-hamta.ts, PengarRailCard + Fakturor-kortet borta, väntar ovan-scroll)
6. `975c1c22` Senaste dygnet (dygnsdigest.ts 24h-fönster, halsningsBevis, team-presence städad)
7. Värdekvittot natt 1 (vardekvitto.ts fyra ärlighetsregler, GET /api/value/kvitto ägargrindad, ramlös rad)

Utöver planen: `cc2fc1ec` — Andreas skärmdump på morgonen visade att V3-motorns
offertuppföljnings-SMS gick ut med `{{customer_name}}` ordagrant. Rotorsak:
threshold-motorns kvot- och bokningsgrenar la aldrig customer_name i kontexten.
Fixad med separat batch-hämtning (aldrig embed), vaktpost i specen.

**Kvar till Andreas (kan inte göras av nattkörningen):**
- Skarptest av Godkänn & skicka i egen tenant mot egen e-post (produktbeslutet).
- Manuell koll av /dashboard/hem som ägare, anställd och mobil 390px (planens punkt 4).
- Kontrollera att Vercel-deployerna är gröna (7 deployer sedan i natt).
- Efter nästa nattliga missed-revenue-cron: kontrollera räknarna i prod-logg
  (versionsbumpen skriver om pending projekt:*-kort).
- OBS: skärmdumpens offertuppföljning gick ut för en offert som var 140 dagar
  gammal — V3-regelns days_since_sent har ingen övre gräns/dedupe värd namnet.
  Inte åtgärdat i natt (utanför scope) — värt ett eget beslut.

---

# Offertflödet — status 2026-08-06

SQL körda av Andreas: v88 (kategoristädning), v89 (RLS), v90 (dold rad),
v91 (reservationer). **Kvar att köra: v87 (deal-FK) och v92 (vat_number +
business-assets-bucket).**

---

## SNABBOFFERT-SPRINTEN (2026-08-06) — ETAPP A–D KLARA

Bakgrund: piloten Christoffer om offertskaparen — **"för mycket, rörigt, man
får inte med allt — blir galen."** Kartläggningen visade ~33 kontroller på en
TOM offert, sju av fjorton fält bara bakom "Mer"-raden, och flera fält som
samlades in men aldrig nådde kunden.

### Etapp A — kvickfixar (`43957504`, i prod)

- **A1 Dokumentet först på mobil.** Gridden delad i två barn med explicit
  `lg:col-start/row-start`: mobilen får kund → dokument → AI/summering/skicka,
  desktop byte-identisk. Kundvalet kvar överst (enda hårda valideringen).
- **A2 En sanning per kontroll.** Skicka bort ur summeringen (headern är
  sticky och vinner). Giltighetsfältet bort ur kundsektionen. ROT-togglen
  BEHÖLLS — de tre ROT-ytorna gör tre olika saker (bulk, per rad,
  personnummer); det dubbla var BELOPPET, som nu bara står i summeringen.
- **A3 Statusprickar på Mer-raden.** `lib/quotes/panel-status.ts`, 21 tester.
  Amber används sparsamt: bara ROT utan personnummer och betalplan som inte
  summerar.
- **A4 Tre fält som aldrig nådde kunden.** `ata_terms`, `payment_plan` och —
  värst — `reservations` i live-läget (`onReservationRemove` fanns, listan
  skickades aldrig in). Renderat i alla vägar: QuoteDocument, premium,
  friendly, jsPDF. Plus: publika token-routen läste business_config med en
  kolumnlista som utelämnade `vat_number`/`tagline`.

### Etapp B — datafundamentet (`875b496f`, i prod)

- **B1 AI-rader kopplas till produktbanken.** Handtag ([P1], [P2]) i prompten,
  `lib/products/match-generated-items.ts` med hallucinationsvakt. Hellre missa
  än gissa: handtag kräver namnöverlapp, fuzzy kräver samma enhetsfamilj,
  oavgjort är ingen träff. Matchningen körs INNE i generatorn så alla fyra
  anropsvägar får den.
- **B2** Radgräns 8 → 12 (styrt på struktur, inte antal), max_tokens
  2000 → 3000, och trunkering skiljs nu från andra fel i felmeddelandet.
- **B3** `notIncludedSuggestions` — enda AI-genererade villkorsfältet, för att
  det är genuint jobbspecifikt. Fylls bara i när fältet är tomt.
- **B4** Godkännandet materialiserar `payload.preview` i stället för att
  generera om. Hantverkaren såg A och fick B sparad. Omgenerering kvar som
  reserv för matte-kort, ÄTA-förslag och äldre kort i kön.

### Etapp C — Snabbofferten (denna commit)

Ett LÄGE i `new/page.tsx`, inte en ny route — allt den behöver finns redan där.
"Öppna i fullständiga editorn" är bokstavligen `quickMode = null`.

- **Mekaniken:** samtliga `QuoteDocumentHandlers` är nu optionella, så ett
  partiellt objekt uttrycker "bara den här sektionen är redigerbar".
  `data-section`-attribut + `focusSection` sköter dimningen (opacity +
  pointer-events, ALDRIG transform — DocumentScaler transformerar redan).
- **C1 Intag:** `QuickIntake` — tre kontroller mot editorns ~33. Rösten via ny
  delad `hooks/useAudioRecording.ts` (webm→mp4-fallback för iOS) och den
  färdiga men oanvända `/api/matte/transcribe`. Transkriptet landar
  redigerbart, aldrig som svart låda. Kund är frivillig med flit.
- **C2 Byggkänsla:** `QuickBuilding` — dokumentskelett med det som redan är
  känt + skimmer, ärlig statusrad i tre lägen, och ett "tar längre än
  vanligt"-läge efter 25 s.
- **C3 Sektionsgranskning:** `lib/quotes/section-handlers.ts` (50 tester) +
  `QuickReviewBar`. Progressprickarna är tappbara och "Hoppa till översikt"
  finns alltid — granskningen är navigering, inte grindar.
- **C4 Kvitto:** `QuickReceipt` — bock per sektion, amber-chips som är
  ingångar tillbaka. Skicka spärras ALDRIG av amber; produkten föreslår,
  hantverkaren beslutar.

### Etapp D — inlärning

`lib/quotes/quick-preferences.ts` (12 tester). Efter fem genomförda
snabbofferter landar utkastet direkt i översikten. Räknas när offerten
FAKTISKT skickas, aldrig när utkastet byggdes.

---

## KVAR ATT BYGGA

**Claude Design.** ~~Intagsskärmen (C1)~~ — designpasset gjort 2026-08-10 på
Andreas fynd (kort-yta, exempelchips, editorlänk i headern, mall som riktig
sekundärknapp, förklaring på inaktiv knapp). Kvar: reveal-koreografin (C2),
granskningsbaren (C3) och kvittokortet (C4). Ramarna: ren CSS (framer-motion finns inte i projektet),
teal `#0F766E`, bottom sheet-mönstret från RowEditSheet, 44px träffytor.
Mekaniken är byggd först med flit — DOM-strukturen är nu bestämd, så designen
läggs ovanpå en fungerande yta i stället för att gissa mot en mockup.

**Idé 2b — förlustanalysens yta.** Motorn finns (`summarizeDeclineReasons` +
`buildDeclineInsight`, facit-testade); kortet som visar det saknas. Naturlig
plats: /dashboard/analytics eller offertlistan. Litet jobb.

**Etapp 4 — offertkoll före utskick.** Regelbaserad checklista i
skickadialogen. Överlappar nu delvis med C4:s kvitto — värt att omvärdera
scopet innan det byggs.

**Idé 5b — fråga per RAD.** Backend tar redan emot `item_id`. Kundvyn skickar
i dag bara en allmän fråga.

**Etapp D2 — "vill du alltid börja så här?"** ~~dialogen är inte byggd~~ —
FELAKTIG SKULD, verifierad 2026-08-10: banderollen, ja/nej-hanteringen,
kallstartsrespekten OCH vägen tillbaka finns alla i new/page.tsx
(QuickStartPreferenceBanner, rad ~2157–2191). Skulden var ett inaktuellt
minne, inte ett hål.

---

## ÖPPNA PUNKTER

- **v87 och v92 behöver köras** i Supabase SQL Editor.
- **Scroll och dimning på iOS Safari** inuti DocumentScalers transform är
  fortfarande otestat på riktig telefon — det är den största kvarvarande
  osäkerheten i C3.
- **Fuzzy-matchningens falska positiver:** tröskeln är satt konservativt
  (0,6 Jaccard + enhetsfamilj) och `matchType` loggas, men träffkvaliteten
  behöver mätas på verklig data innan tröskeln sänks.
- **v89 (RLS) behöver ögonkontroll:** logga in som ägare OCH som anställd,
  öppna Ny offert och kontrollera att snabbvalsknapparna visar artiklar.
- **Backfill av produktbanken** via POST /api/admin/backfill-products
  (dryRun: true först).
- **Prisnivåerna i seed-datan** behöver Christoffers branschkoll.
- **`create_quote` i agentens tool-router** godtar modellens priser
  okontrollerat — bör pekas om till `generateQuoteFromInput` nu när B1 finns.
- **Grön teknik-avdraget** renderas bara i edit-läget (masterplan-lucka 4).
- **`signed` skrivs aldrig** till quotes.status — död medlem i
  WON_QUOTE_STATUSES.
- **E2E-sviten** (127 tester) kräver inloggad session, kan inte köras
  med `--no-deps`.

---

# Pågående — Roadmap + X1 Revenue Recovery (2026-08-08)

- [x] Uppdatera `docs/council/ACTIVE_ROADMAP.md` till faktiskt nuläge.
- [x] Dokumentera kvarvarande gyllene-vägen- och cross-tenant-grind.
- [x] Kartlägg projekt-, ÄTA-, material- och fakturafält för X1.
- [x] Ersätt dagens "entydiga" fynd med explicit konservativ klassning.
- [x] Begränsa framtida utkastskandidat till avslutad signerad ÄTA efter review.
- [x] Gör avfärdandededupe och cronfel synliga.
- [x] Lägg browserlösa facit för fastpris, löpande, blandat, manuell faktura och omkörning.
- [x] Kör TypeScript, browserlös helsvit och Next-build.
- [x] Granska slutdiff och skapa separat X1-commit.

## Review

- Roadmapen uppdaterades i separat commit `4e88194d` med faktiskt nuläge,
  kvarvarande gyllene-vägen-grind och separat produktions-tenanttest.
- Missad-intäkt-svepet klassar nu fynd som `LIKELY_UNBILLED` eller
  `NEEDS_REVIEW`; ingen nuvarande regel får påstå `CONFIRMED_UNBILLED`.
- Pågående/avgående ÄTA, fastprismaterial och källrader med fakturakoppling
  räknas inte som säker potential. Gamla felaktiga pendingkort avförs som
  `expired`; giltiga legacykort klassas om på plats.
- Cronfel och insert/update-fel blir synliga som HTTP 500, och alla
  omskrivningar är tenant- och statusfiltrerade.
- Verifierat: `npx tsc --noEmit`, riktat facit 128/128, hela browserlösa
  kontraktssviten i bokstavsgrupper samt `npx next build` (410 sidor) gröna.
- Ingen migration skapades eller kördes. Ett live-schema-anrop kunde inte
  göras lokalt eftersom Supabase-URL/nycklar saknas i tillgänglig `.env.test`;
  SQL-baserade kolumnkontraktet är grönt och inga databasvärden skrevs.
