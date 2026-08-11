# Next Moat Wave — fem koncept mot kodbasen

**Datum:** 2026-08-11
**Metod:** Två djupauditer (lärande/ekonomi-primitiverna; minnes/autonomi-primitiverna)
ovanpå samma dags Meeting Intelligence-audit. Allt filciterat. Koden är sanningen —
inte strategidokumenten.
**Regel för läsning:** Rådets ACTIVE_ROADMAP är AUKTORITATIV och binder rekommendationerna.

---

## Executive Verdict

**Ja — de fem koncepten bildar en försvarbar lärloop, och den kräver ingen
AI-plattform.** Kodbasen har redan loopens ryggrad: approval-rälsen med
action-kontraktet (fail-closed, 43+ typer) och Meeting Intelligence V1/V2:s färska
mönster *AI-fynd → granskningsbart kort → fältlokal skrivning med evidens*
(`meeting_followup` → task-rad är prejudikatet, i prod sedan idag). Den minsta
primitiv som låser upp tre av fem koncept är **ingen tabell utan en konvention**:
varje AI-föreslaget faktum går som kort genom rälsen och skriver fältlokalt vid
godkännande, med `{source_type, source_id, evidence_quote, confidence}` i payload.

Men auditerna visar också att tre av koncepten står på datakvalitet som inte finns
än: ingen förväntad-marginal-baslinje sparas någonstans, två ekonomimotorer är oense
i drift, lärande-tabellerna har varit tyst trasiga i månader, och den autonomi som
redan är skarp saknar beloppsgränser och nåbar nedgradering. **Rekommendationen är
därför två våger små byggen som alla börjar ackumulera proprietär data nu, och att
de dyra koncepten väntar bakom rådets befintliga grindar** — inte en femte stor
satsning.

Ordning: **Våg 0** (fyra skarpa buggar) → **Våg 1 NOW** (autonomi-härdning +
marginal-baslinje + debrief-capture + kundfakta-kort) → **Våg 2 NEXT** (playbook-
mönster, full Margin Guardian efter X2) → **Våg 3 LATER** (Expectation Drift).

---

## Våg 0 — fyra skarpa buggar auditerna hittade (fixas oavsett strategi)

1. **Morgonbriefens lönsamhetssektion har alltid varit tom.**
   `checkProfitabilityWarnings` (`lib/profitability.ts:159`) skriver
   `pending_approvals`; morgonbriefen (`lib/matte/morning-brief.ts:98`) läser
   `project_events` med `type='profitability_warning'` — som ingen någonsin skriver.
   Producent/konsument-mismatch; `pengar-pa-bordet` läser rätt källa och visar hur.
2. **`approve_rate.edited` är strukturellt alltid 0.**
   `lib/patterns/calculators/approve-rate.ts` räknar `status='edited'` — en status
   som aldrig skrivs (`app/api/approvals/[id]/route.ts:184`: edit → `approved` +
   `payload.edited=true`). Förtroendedata överskattar rena godkännanden — direkt
   farligt som underlag för autonomibeslut.
3. **`analyzePriceAdjustments` tillverkar överdrag på blandade offerter.**
   Faktiska timmar nycklas `${quoteId}:all` medan estimaten är per kategori
   (`lib/agent/price-analysis.ts:92`) — varje kategori jämförs mot hela projektets
   timmar.
4. **`findSimilarQuotes` räknar utkast som prishistorik** (status
   `accepted|sent|draft`) och läser legacy-`quotes.items`-JSONB som är tom för nya
   offerter — prisankaret i offertgenereringen formas av förluster och skräp.

---

## Koncept 1 — Säg det en gång / Company Memory

**Current foundation.** Starkare än väntat, men på fel ställe:
- Meeting Intelligence V1/V2 ÄR "säg det en gång" för möten — fynd blir kort med
  evidenscitat, godkännande skriver fältlokalt. Mekanismen finns; den saknar bara
  fler faktatyper.
- Kundtidslinjen (`app/api/customers/[id]/timeline/route.ts`, 9 källor) fungerar och
  är presentationsytan ett minne behöver.
- `lib/matte/resolver.ts` är hämtvägen (kund → projekt/deals/fakturor/historik) men
  konversationshistoriken är SMS-only, sista 10, telefonnycklad — email-upplösning
  ger tom historik trots att typen deklarerar `channel: 'sms' | 'email'`.
- Moments-flödet (`lib/moments/derive.ts`) har rätt avbrottsfilosofi ("INTE CLIPPY")
  men är ett pengafynds-flöde, inte ett hörda-fakta-flöde.

**Det befintliga "minnet" är fel byggt:** `agent_memories` är bred Haiku-extraktion
efter varje agentkörning/chatt — exakt den form rådet avvisade för Promise Ledger —
utan kundkoppling (bara business_id), med `embedding` som alltid är NULL
(`generateEmbedding` returnerar ovillkorligen null), retrieval som ignorerar sin
context-parameter (topp-5 på frusen importance), och ilike-dedup som läcker.
Det kan inte svara på "vad sa kunden om golvvärmen" — inget länkar minne till kund.

**Missing primitives.** En enda: strukturerad kundfakta-lagring. `customer` har
INGEN preferens-/faktakolumn alls — allt operativt fastnar i `booking.notes`,
`customer_activity.description` (tabell utan migrationsfil!) och `leads.notes`.

**Reusable.** Approval-rälsen, action-kontraktet, kortröst-härledningen,
decision-record-stämpeln, kundtidslinjen, resolver, mötesanalysens extraktion.

**Data quality blockers.** `agent_memories` innehåll är obekräftad extraktion —
migrera inte in det; frys det (skriv-stopp) och låt det dö.

**Architecture recommendation (minsta robusta).** INGEN faktabas. En ny korttyp
`customer_fact` (EXECUTABLE i kontraktet): mötes-/samtalsanalysen får extrahera
kundpreferenser/nyckelfakta som kort med citat + källa; godkännande skriver en rad i
en liten `customer_fact`-tabell (customer_id, fact_type, content, source_type,
source_id, evidence_quote, confidence, superseded_by, confirmed_at). Motsägelser:
nytt bekräftat faktum sätter `superseded_by` på det gamla — senast bekräftad vinner,
historiken består. Detta är fältlokal lagring med omedelbara konsumenter
(rådets regel 1): resolver-kontexten, offertgenereringens prompt, kundkortet,
tidslinjen. "Vad har vi lovat Andersson?" besvaras med SELECT — ingen RAG behövs på
denna volym.

**UX.** Kort på Idag: "Matte hörde: Andersson vill ha ek i stället för ask —
[Möte idag 14:32] Stämmer det?" → Godkänn skriver faktumet, syns på kundkortet
under "Det här vet Handymate". Rejekterade fakta försvinner tyst.

**Agent ownership.** Matte (ytan); extraktionen bor i befintliga analysvägen.

**Safety boundary.** Faktaskrivning = alltid kort (aldrig ambient). Undantag som
kan auto-exekvera senare (efter förtjänad autonomi): rena kontaktfakta med hög
konfidens. Kundkommunikation aldrig.

**MVP.** `customer_fact`-kortet ur mötesgrenen + kundkortssektion + resolver-läsning.
**V2.** Telefon- och e-postgrenarna matar samma korttyp; sök via Matte-chat.
**Moat.** 9/10 — år av bekräftade kundfakta per firma är okopierbart.
**Effort.** MEDIUM. **Värde.** 8. **Timing.** NOW.

---

## Koncept 2 — Project Debrief → Firmans Playbook

**Current foundation.** Kroken är perfekt och outnyttjad: projektstängningen
(`app/api/projects/route.ts:520-760` + mobildörren `booking/complete-job`) har det
frusna utfallet I HANDEN (`freezeProjectOutcome` → `project_outcome` med
quoted/actual-diffar) exakt där en debrief skulle ställas. Voice-input finns
(mobil-Matte). Per-jobbtyp-aggregering finns (`aggregateOutcomesByJobType`,
MIN_SAMPLE_SIZE=3). Efterkalkyl-bannern i offert-nya är den färdiga
återkopplingsytan (`QuoteNewEfterkalkylBanner`).

**Missing primitives.** Allt av själva konceptet: `debrief`/`playbook`/`lessons`
finns ingenstans i kod (verifierat: noll träffar). Ingen lesson-lagring, ingen
frågeström vid stängning, ingen ägarbekräftad mönsterinferens
(`ai_learned_preferences` infereras utan någon bekräftelseväg — motsatsen till
konceptets "Ja, så jobbar vi"-UX).

**Reusable.** Stängningsflödet, project_outcome, approval-rälsen (debrief-kort =
REVIEW_REQUIRED-klass), job_report-mönstret (samlar redan "vad utfördes" vid
stängning), business_preferences (source-kolumnen finns för user-bekräftat).

**Data quality blockers — och konceptets trumfkort.** X2-skulden (timheuristiken
som gör ROT-kvantiteter till "timmar", amount_diff som jämför kostnad mot pris,
materialdubbelräkningsrisken) gör AUTOMATISK inlärning opålitlig — men **debriefen
kringgår hela skulden**: en ägare som säger "rivningen tog en dag mer" är bekräftad
sanning vid källan, oberoende av telemetrins fullständighet. Det gör detta till det
billigaste pålitliga lärandet i hela systemet.

**Architecture recommendation.** Vid stängning: ett `project_debrief`-kort (tre
frågor, röst eller text, går att avfärda) → svar + utfallsdeltat blir en
`project_lesson`-rad (project_id, job_type, lesson_text, impact_hint, confirmed_by,
source='debrief'). Playbook = Våg 2: när ≥N lärdomar/beteenden samlas per jobbtyp
föreslås mönstret som kort ("På 7 av 8 badrum…[Ja, så jobbar vi]") → bekräftat
mönster skrivs till `business_preferences` med source='user' och konsumeras av
offertgenereringen och agenter. Aldrig tyst deklarerade regler.

**UX.** Matte vid stängning: "Storgatan är klar — tre snabba innan jag stänger?"
Mikrofonknapp. 30 sekunder. Nästa liknande offert: Daniel: "Senast underskattades
rivningen med ~8 timmar. Ta höjd?"

**Agent ownership.** Matte ställer frågorna (stängningen är hans), Daniel
konsumerar i offertflödet, Lars i projektplanering.

**Safety boundary.** Lärdomar skrivs vid ägarens svar (det ÄR bekräftelsen).
Mönster → alltid kort. Hårda regler (t.ex. "skriftlig ÄTA över X kr") vs mjuka
preferenser: hårda kräver explicit bekräftelse + syns i inställningar.

**MVP.** Debrief-kortet + lesson-raden + Daniels banner-rad. **V2.** Playbook-
mönster med bekräftelsekort; onboarding-läsvy ("så jobbar vi på Anderssons").
**Moat.** 10/10 — detta är moat-tesens kärna ordagrant. **Effort.** LOW-MEDIUM.
**Värde.** 9. **Timing.** NOW (capture) / NEXT (playbook). Varje stängning utan
debrief är förlorad data — capture ska ut tidigt.

---

## Koncept 3 — Expectation Drift

**Current foundation.** Deterministisk baslinje finns delvis: accepterad offert har
innehållslås (40 COMMERCIAL_FIELDS avvisas efter accept) och starkast vid signering
(`sign_quote_with_options`, atomär, skriver totals + signed_options); signerad ÄTA
har riktig livscykel med lås. Bokningar bär tider. Meeting V1 producerar
konversationsförväntningar MED evidens (korten). Men: **inget innehålls-hash, ingen
accepted_snapshot, quote_items oversionerade** — låset är route-nivå och
service-role-kod går förbi. Och två ÄTA-definitioner lever samtidigt i drift
(canonical räknar signed/invoiced; legacy bara approved).

**Missing primitives.** Förväntningsrepresentationen (vad kunden tror, med
proveniens), jämförelsemotorn, superseded-semantiken, trösklar mot falsklarm.

**Data quality blockers.** Störst av alla fem: prognossidan (färdigdatum,
förväntad intäkt) kräver X2-pålitlighet; förväntningssidan kräver Company Memory.
Falsklarm förstör förtroendet — promptens egen varning är korrekt.

**Architecture recommendation.** Byggs SIST, och startas deterministiskt:
- Drift-signal 1 (kan byggas tidigt, gratis): "möjligt ÄTA-kort skapat för N dagar
  sedan — varken godkänt eller avfärdat" — ren kö-ålder på befintliga kort.
- Drift-signal 2: bokad sluttid vs projektets prognos — när prognosen finns (X2).
- Full Drift: förväntningar = bekräftade customer_facts av typ commitment +
  accepterad offert + signerad ÄTA; jämförs i nattliga per-projekt-passet;
  kort med källcitat på BÅDA sidor ("Kunden tror: klart fredag [möte 3/8] —
  Prognos: tisdag [schema]").

**UX.** Karin/Lars-kort: "Kundens bild och verkligheten skiljer sig på 2 punkter —
[Visa skillnader] [Förbered kundmeddelande]". Aldrig auto-kommunikation.

**Agent ownership.** Lars (tid/scope), Karin (pris) — Matte sammanfattar.

**Safety boundary.** Allt är kort; kundmeddelanden alltid godkännande.

**MVP.** Drift-signal 1 (kö-ålder på ÄTA-signalkort). **V2.** Full jämförelse.
**Moat.** 8/10. **Effort.** HIGH. **Värde.** 9 (starkast differentiering när den
funkar). **Timing.** LATER — efter Memory + X2.

---

## Koncept 4 — Earned Autonomy UX

**Current foundation.** Nästan allt finns — det här är UX + policy, inte
infrastruktur (precis vad promptens fråga 12 hoppades):
`lib/autonomy/earned-autonomy.ts` (4 hårdkodade nycklar, streak 15/60 dagar,
offer-kort, grant/revoke i `v3_automation_settings.earned_autonomy`),
Förtroendetrappan-panelen, tre autonoma cron-konsumenter, edited-stämpling,
`execution_result` per kort (ärligt "gick det ut"-facit), `v3_automation_logs`
med approval_id-attribution.

**Missing primitives — och de ÄR konceptet:**
- **Ingen beloppsgräns**: en påminnelse på 500 000 kr tar samma autonoma väg som
  500 kr. `risk_level` skrivs av ~25 producenter och läses av NOLL konsumenter.
- **Ingen nåbar nedgradering efter grant** för motornycklarna (specen erkänner det:
  "auto-nedgradering via avvisning är onåbar post-grant"); edit triggar varken
  offer eller revoke; körningsfel rör aldrig autonomin (bara en push).
- **Tre inkompatibla acceptansberäkningar** (60d-streak / 30d-approve_rate /
  6mån-learning) med tre edited-semantiker — plus Våg 0-bugg 2. Förtroendebevis-UI:t
  kräver EN kanonisk definition.
- `tryAutoApprove` (ai_suggestion-vägen) är ett separat, vilande system — ska inte
  byggas vidare på; långsiktigt pensioneras med Epic 6.

**Rådets ram:** "Ingen autonomi är ännu bevisat säker" — härdningen är alltså
mandatet, inte ett tillval. Ingen nivåstege (LEVEL 0-4) behövs: befintliga
semantiken (föreslå → kort → autonom per nyckel) är bättre än godtyckliga nivåer.

**Architecture recommendation.** I ordning: (1) beloppsgräns per nyckel —
`autonomy_amount_cap` med default per typ; över taket → kort trots grant, med
kortcopy "Karin skickar vanligtvis själv, men detta belopp avviker"; (2) nedgradering:
körningsfel ≥2 inom fönster → revoke + kort som förklarar; edit på keyed typ →
streak-reset (inte bara skip); (3) EN kanonisk beräkning (`computeApprovalTrust` i
earned-autonomy.ts, ersätter alla tre; fixar Våg 0-bugg 2 i samma drag);
(4) förtroendebevis-UI i panelen ("Karin har hanterat 37 — 36 oförändrade, 1
redigerad, 0 återkallade") på riktig data.

**UX.** Trappan finns — den får siffror som stämmer, beloppsspärr som syns, och
nedgradering som förklarar sig själv.

**Agent ownership.** Per nyckel (Karin/Lars/Daniel/Hanna); Matte äger trappytan.

**Safety boundary.** Aldrig autonomt: offerter, fakturor (skapande), ÄTA,
prisändringar, all ny kundkommunikationstyp — allowlisten förblir hela riskmodellen,
utökas bara med bevis.

**MVP.** Punkt 1–3. **V2.** Punkt 4 + stickprovs-gating (var N:e autonoma åtgärd
blir kort ändå — håller nedgraderingsvägen levande). **Moat.** 6/10 (mekaniken är
kopierbar; förtroendehistoriken är det inte). **Effort.** LOW-MEDIUM. **Värde.** 7.
**Timing.** NOW — säkerhetsluckor i skarp autonomi.

---

## Koncept 5 — Margin Guardian

**Current foundation.** Varningar finns (`profitability_warning`-kort med
projected_overrun + push, trösklar 75/95 %), kanoniska ekonomimotorn har
ärlighetsflaggor (kostnads-fullständighetströskel, vägrar marginal utan
konfigurerad arbetskostnad), pengar-på-bordet räknar utestående, ÄTA-signalen ur
möten finns (V1) — komponenten "möjligt ofakturerat scope" existerar redan
end-to-end.

**Missing primitives.**
- **Förväntad marginal vid accept SPARAS INTE** — `calculateQuoteMargin` är
  UI-only; ingen kolumn, ingen snapshot. "28 % → 21 %" går inte att säga idag och
  går inte att rekonstruera retroaktivt (cost_price ofta tom).
- Kausal dekomposition (orsaksraderna) och koppling varning ↔ återvinningsbart.

**Data quality blockers.** Störst av de byggbara: legacy-motorn (V25) läser stale
snapshots och missar kundsignerade ÄTA men äger varningarna; materialdubbelräkning
(supplier_invoices + project_material, X2d); timheuristiken (X2e). Rådet:
Margin Insurance gated på X2; **"Andra Economic Copilot-UI: ALDRIG"** — Guardian
måste VARA Karin, inte en ny yta.

**Architecture recommendation.** MVP nu, full efter X2:
- MVP: (a) Våg 0-fix 1 (varningarna når morgonbriefen); (b)
  `quotes.expected_margin_snapshot` (JSONB: margin_kr/pct, isPartial,
  computed_at) skrivet vid accept/signering ur befintliga `calculateQuoteMargin` —
  baslinjen börjar ackumuleras NU; (c) flytta varningsproduktionen till kanoniska
  motorn (X2a:s "frys ut legacy ur inlärning" — enforce:as här); (d) berika
  varningskortet med deterministiska orsaksrader motorn redan kan bevisa
  (timmar vs budget, ofakturerat material-flagga, utestående ÄTA-signalkort) med
  KNOWN/ESTIMATED/POSSIBLE-märkning.
- Full (efter X2): trend expected→forecast, återvunnen-kr-mätning
  (Värdekvitto-klass attribution — kort → ÄTA → fakturerad).

**UX.** Karins kort: "Storgatan: förväntad marginal var ~28 % vid accept, bokförda
kostnader pekar mot ~21 %. Tre orsaker → [Skapa ÄTA-utkast] [Visa projekt]".
Aldrig "du förlorar X kr" utan bevis.

**Agent ownership.** Karin, odelat.

**Safety boundary.** Allt är kort; ÄTA-utkast via befintliga `create_ata_draft`
(som nu skapar riktig project_change).

**MVP/V2** enligt ovan. **Moat.** 7/10. **Effort.** MEDIUM (MVP) / HIGH (full).
**Värde.** 9. **Timing.** Baslinje + fixar NOW; full Guardian NEXT (efter X2).

---

## Ranking

| Koncept | Kundvärde | Moat | Befintlig grund | Effort | Risk | Timing |
|---|---:|---:|---:|---|---|---|
| Earned Autonomy härdning+UX | 7 | 6 | 9/10 | LOW-MED | Low | **NOW** |
| Company Memory (kundfakta-kort) | 8 | 9 | 8/10 | MEDIUM | Low-Med | **NOW** |
| Debrief → Playbook | 9 | 10 | 6/10 | LOW-MED | Low | **NOW / NEXT** |
| Margin Guardian | 9 | 7 | 5/10 | MED / HIGH | Medium | **baslinje NOW / full NEXT** |
| Expectation Drift | 9 | 8 | 4/10 | HIGH | High | **LATER** |

## De tio svaren

1. **Först:** Våg 1 som paket — fyra små oberoende byggen (autonomi-härdning,
   marginal-baslinje, debrief-capture, kundfakta-kort). Måste ETT väljas:
   autonomi-härdningen (säkerhetsluckor i skarp drift).
2. **Sedan:** Playbook-mönstren + full Margin Guardian (bakom X2-grinden).
3. **Väntar:** Expectation Drift (utom gratis-signalen "gammalt oåtgärdat
   ÄTA-signalkort").
4. **Delar primitiv:** Memory, Debrief, Guardian-orsaker och Drift-förväntningar
   delar alla kort-som-sanningsgrind + fältlokal skrivning + proveniens-payload.
5. **Den enda lilla primitiven:** proveniens-KONVENTIONEN
   `{source_type, source_id, evidence_quote, confidence}` i kortpayload +
   fältlokal landning. Ingen ny plattform. Prejudikat i prod sedan idag.
6. **Starkaste demo:** Margin Guardian ("28 % → 21 %, tre orsaker, 7 800 kr att
   rädda" — pengar på skärmen).
7. **Starkaste daglig retention:** Company Memory-korten på Idag (varje möte/samtal
   producerar något att kvittera).
8. **Starkaste proprietära datamoat:** Debrief → Playbook (bekräftade lärdomar per
   firma, ackumulerade per jobbtyp).
9. **Starkaste mätbara ROI:** Margin Guardian (återvunnen kr via kort → ÄTA →
   faktura, Värdekvitto-klass attribution).
10. **Svårast för Easoft/Bygglet att kopiera:** Playbook + Memory — funktionen kan
    kopieras, åratal av bekräftade firmaspecifika fakta kan inte.

## Loopen — minimiarkitekturen

```
HANDYMATE HÖR          möten (V1/V2 ✓), telefon (✓), SMS/email (✓)
      ↓
FÖRSTÅR                befintlig analys → MatteDecision-format (✓)
      ↓
FÖRESLÅR SOM KORT      approval-rälsen + proveniens-konventionen (✓ + Våg 1)
      ↓
MÄNNISKAN BEKRÄFTAR    godkännande = sanningsgrinden (✓)
      ↓
MINNS FÄLTLOKALT       customer_fact / project_lesson / expected_margin_snapshot (Våg 1)
      ↓
JÄMFÖR & SKYDDAR       Guardian-orsaker (Våg 1 MVP → Våg 2), Drift (Våg 3)
      ↓
AGERAR MED RÄTT NIVÅ   förtjänad autonomi + beloppsgräns + nedgradering (Våg 1)
      ↓
OBSERVERAR UTFALL      execution_result (✓), frozen project_outcome (✓, X2 förbättrar)
      ↓
LÄR FIRMANS SÄTT       debrief-lärdomar → playbook-kort → business_preferences (Våg 1→2)
      ↓
BÄTTRE NÄSTA BESLUT    offertgenerering + agentkontext läser bekräftade fakta (Våg 1)
```

Grindarna består: numerisk prisinlärning bakom X2 (som är bakom X1-pilotbevis);
autonomi utökas bara med bevis per nyckel; ambient extraktion förblir förbjuden —
allt går genom kort. `agent_memories` fryses (skriv-stopp), pensioneras.

**Moat-tesen bekräftas av kodläget:** konkurrenten kan kopiera varje enskild
funktion här. Det som inte går att kopiera är innehållet konventionen ackumulerar —
vad just denna firma säger, lovar, ändrar, godkänner och lär sig av varje avslutat
jobb. Ju tidigare capture-punkterna (debrief, kundfakta, marginal-baslinje) är ute,
desto längre blir försprånget.
