# Snabbofferten — steg-för-steg blir standard, review isoleras

Källa: Andreas skärmdump + fynd (2026-08-14) — review-steget visade allt
samtidigt trots att det "guidar steg för steg". Plan godkänd i plan mode
efter två research-pass (Explore + Plan-agent) som kartlade exakt
render-trädet i `app/dashboard/quotes/new/page.tsx` innan något byggdes.

## Byggt (commit b37a8cbe, 73cd31fa, ce18b524 — pushat, deployat)

- `enterQuickReview()` — delad svans för alla tre startvägar.
- Review/overview isolerat till en egen, minimal region (ny topbar: Offerter-
  länk, kompakt kundväljare, Spara utkast, preferensbanner) i stället för
  att lägga granskningskortet ovanpå hela den befintliga "allt-på-en-gång"-
  vyn. DanielsBedömning + AI-badges omgatade till bara `overview`, inte
  `review`. INGEN duplicering av RowEditSheet/AddRowSheet/
  ReservationReviewSheet/ProductModal — de låg redan utanför grid-diven som
  delade siblings, så en ternary runt bara den regionen räckte (enklare än
  planens ursprungliga "två fulla early-return-grenar").
- Mallvägen går nu genom `enterQuickReview()` i stället för rakt till
  `quickMode=null` (båda `QuoteNewStartChooser`-anropen).
- Ny `QuickBlankStart.tsx` + `onSkipDescription`-länk i `QuickIntake.tsx`:
  tredje startväg (kund+titel, inget AI) som landar i samma granskning med
  0 rader — review-läget tålde redan tomt innehåll (`sectionSummary` gav
  "Inga rader än" som ett vanligt attention-läge, inte en krasch).

## Verifierat

- `npx tsc --noEmit` — noll fel.
- Befintliga facit (offertbyggaren, quote-new-context, quote.spec.ts) —
  15/15 gröna.
- `npx next build` — ren.
- Full svit: 5762 gröna, 0 failed (oförändrat från Project Reality-passet).
- **Riktig, live, skärmdumpad verifiering av alla tre startvägar** (AI,
  mall, blankt) — se auth-genombrottet nedan för hur.

## Auth-genombrott, del 2: riktig browser-inloggning löst på riktigt

Den kända buggen (magic link → studsar till /login) är nu FIXAD, inte bara
kringgången. `tests/auth.setup.ts` postar till `/api/auth` {action:'login'}
— samma `createRouteHandlerClient`/`signInWithPassword`-väg som appens
egen inloggningssida redan använder — i stället för att gissa cookie-
formatet från en admin-genererad magic link. `TEST_USER_PASSWORD` satt en
gång via `admin.updateUserById` (skrevs aldrig till stdout), sparad i
`.env.test` (gitignorad). **Riktig, inloggd Playwright-browserverifiering
fungerar nu igen för ALLA framtida sessioner**, inte bara via verifyOtp-
Bearer-tricket.

En andra, orelaterad bugg hittades under samma verifiering: en färsk
Playwright-profil saknar `handymate_welcome_dismissed` i localStorage
(WelcomeModal.tsx, dag 0-rutan) och blockerade klick med sin backdrop på
varje ny körning. Fixad genom att sätta flaggan en gång i `auth.setup.ts`
innan storageState sparas.

## Skärmdumpar (tagna, granskade, raderade efter — inte checkade in)

Review-läget (AI-väg): minimal topbar, INGEN kundpanel, INGA AI-badges,
INGEN Mer-rad — bara det fokuserade/dimmade dokumentet + "Ser bra ut →".
Blank-väg: samma isolerade vy, ärligt "Inga rader än"/"Offerten har inga
rader" + "+ Lägg till rad". Exakt vad Andreas bad om.

---

# Byt lösenord — ny sida i Inställningar

Källa: Andreas eget testkonto-lösenord slutade fungera efter en admin-
ändring jag gjorde under felsökning, och "Glömt lösenord"-återställningen
visade "Ogiltig länk" på det bifogade mejlet — akut felrapport. Jag sa
initialt fel att man kunde byta lösenord från kontoinställningarna; Andreas
påpekade korrekt att det inte fanns någon sådan yta. "Det behöver vi, bygg
det och lägg på ett vettigt ställe i Inställningar."

## Två separata buggar hittades och fixades under felsökningen

1. **Root cause till "lösenordet funkar plötsligt inte"**: min egen admin-
   ändring av testkontots lösenord under en tidigare del av sessionen —
   inte en produktionsbugg.
2. **Verklig, förproducerad bugg, opåverkad av (1)**: `/reset-password`
   läste aldrig hash-fragment-tokens (`#access_token=...`) från
   återställningsmejlet — bara en befintlig cookie-session via
   `/api/auth {action:'check'}`. Samma rotorsaksfamilj som magic link-
   buggen från tidigare i sessionen (ingen kod i kodbasen hanterade
   implicit-flow-hashen någonstans). Detta gjorde att ALLA lösenords-
   återställningar för ALLA konton visade "Ogiltig länk", oavsett giltighet.
   Fixad (commit `b6a21ce6`): `supabase.auth.setSession({access_token,
   refresh_token})` läser hashen och sätter en riktig cookie-session INNAN
   `/api/auth`-kontrollen frågas. Se kod-kommentar i
   `app/reset-password/page.tsx` för full förklaring.

## Byggt (commit d0b00240 — pushat, deployat)

- Ny action `change_password` i `app/api/auth/route.ts`: verifierar
  nuvarande lösenord server-side via `signInWithPassword` INNAN
  `updateUser({password})` anropas — en redan inloggad, olåst session ska
  inte kunna byta lösenord tyst utan att ägaren bekräftar det befintliga.
  Medvetet en egen action, skild från `reset_password` (som i stället
  litar på en färskt konsumerad recovery-token).
- Ny sida `app/dashboard/settings/byt-losenord/page.tsx`: tre fält
  (nuvarande/nytt/bekräfta), samma FALT_CLS/kort-stil som Bolagsprofil,
  visar inloggad e-post, länk till "Glömt lösenord" för den som inte
  minns sitt nuvarande.
- Ny "Mitt konto"-grupp i `app/dashboard/settings/page.tsx` (efter
  "AI & Integrationer"). Synlig för alla roller — inte ägare/admin-gated
  som Bolagsprofil/Intern timkostnad, eftersom var och en äger sitt eget
  lösenord.

## Verifierat

- `npx tsc --noEmit` — noll fel.
- `npx next build` — ren.
- **Riktig, live browserverifiering (scratch-test, raderad efter)**: fel
  nuvarande lösenord avvisas med "Fel nuvarande lösenord" (2 scenarion
  testade), rätt lösenord byts och ger "Lösenordet är bytt".
- **Oberoende serverside-bekräftelse**: `playwright/.auth/user.json`
  raderades och en helt ny inloggning kördes mot det NYA lösenordet —
  lyckades. Bekräftar att bytet verkligen slog igenom i Supabase, inte
  bara en UI-framgångstext.
- Full svit (sista säkerhetskontroll efter denna ändring, då den rörde
  både den delade `app/api/auth/route.ts` och den stora
  `app/dashboard/settings/page.tsx`): **5760 gröna, 0 failed**, exit
  code 0.

---

# Project Reality + Cross-Agent Case (Business Twin #9 V1)

Källa: plan `jaunty-pondering-hummingbird.md` (godkänd). Andreas delade
ChatGPT:s Business Twin-resonemang, valde (AskUserQuestion) den
rekommenderade epiken efter att jag stämt av ChatGPT:s antaganden mot
verklig kod (inte tagit dem för givna).

## Byggt (commit 11247b75, pushat, deployat)

- `lib/jarvis/project-case.ts` — `hittaProjektCase` (ren): grupperar
  godkännanden till projekt-case, kräver ≥2 distinkta signaltyper.
- `lib/projects/project-reality.ts` — `deriveProjectReality`: komposition
  av redan kanoniska `computeProjectEconomics` + `deriveProjectLifecycle`,
  inga nya beräkningar, inget nytt lagrat.
- `app/api/project-cases/route.ts` — GET, samma auth/behörighets-mönster
  som `/api/next-best-action`.
- `components/jarvis/ProjektCaseKort.tsx` — inga egna knappar (fyra-ögon-
  regeln, samma som completion_batch_id).
- `components/jarvis/JarvisHome.tsx` — fetch + rendering ovanför kön.
- `docs/strategy/BUSINESS_TWIN_IDEA_BACKLOG.md` — återskapad (refererades
  från tre ställen, fanns inte i repot), #9 uppdaterad + #11–#17 nya idéer
  med status/spärrar.
- Byggt av två Sonnet 5-bakgrundsagenter (kod + facit; dokumentation) för
  att hushålla med tokens, granskat och ihopkopplat av huvudsessionen.

## Verifierat

- `npx tsc --noEmit` — noll fel.
- 26 nya facit-tester (`tests/project-case.spec.ts`,
  `tests/project-reality.spec.ts`) — alla gröna.
- `npx next build` — ren.
- Full svit efter bygget: **5762 gröna, 0 failed**.
- **Riktig, live, autentiserad verifiering mot prod** — se nästa avsnitt.

## Auth-genombrott: kringgick den kända browser-luckan

Den tidigare dokumenterade buggen (magic link i webbläsare studsar till
/login, se Veckomötet-avsnittet ovan) blockerar fortfarande
`tests/auth.setup.ts`. Men för den här verifieringen behövdes ingen
webbläsare: ett engångsskript genererade en magic link server-side och
konsumerade den direkt via `supabase.auth.verifyOtp({token_hash, type:
'magiclink'})` i stället för att navigera en sida dit — gav ett riktigt
`access_token`, använt som `Authorization: Bearer` mot den skarpa routen.

Seedad testdata (2 signaler, olika typ, samma riktiga projekt "Renovering"
för biz_al7pjuu5smi) → `GET /api/project-cases` → **HTTP 200**, exakt
förväntat svar: ett case, två signaler med korrekt agentId (karin/daniel),
`fasLabel: "Pågår"`, marginal korrekt `null` (projektet saknar registrerad
kostnad — hellre tyst än gissat). Städat direkt efter, 0 kvar.

Det här är alltså BÅDE ett bevis på att den nya funktionen fungerar
skarpt, OCH en fungerande omväg förbi auth-luckan för framtida
verifieringar utan att röra den delade `auth.setup.ts`-filen. Värt att
överväga som permanent fix av `tests/auth.setup.ts` i ett separat pass —
inte gjort här (utanför detta uppdrag, kräver ett medvetet beslut om
test-inloggningsstrategin).

## Verkligt fynd: nästan ingen data att visa upp än

Bred sökning i hela prod (alla företag): **noll** naturligt förekommande
case existerar idag. Av de fyra signaltyperna har bara `missad_intakt`
några rader alls (2 pending, 1 rejected) — `profitability_warning`,
`create_ata_draft` och `fakturera_projekt` har ZERO rader i hela
databasen. Funktionen är korrekt byggd men väntar på verklig signalvolym
— samma mönster som Måndagsmötet/NBA tidigare i natt. Inget att åtgärda,
bara ärligt att veta.

---

# Veckomötet — Digital CFO+COO-mötet (ersätter Måndagsmötets takeover)

Källa: Claude Design-projekt "Digital CFO + COO-mötet" (b33a9e8b-...), fil
`Veckomötet - Digital CFO+COO.dc.html`, hämtad via DesignSync-MCP och läst i sin
helhet. Andreas beslut (AskUserQuestion): (1) ersätt Måndagsmötet direkt, samma
triggerpunkt; (2) besluts-korten byggs på RIKTIG NBA-rankning från start, inte
mockupens exempeldata.

## Vad som INTE ändras (blast radius minimeras)
- `lib/jarvis/monday-brief.ts` — orört, äger fortfarande n>0-regeln för de fyra sektionerna.
- `components/jarvis/MandagskortCard.tsx` — orört, används fortfarande oförändrat av `app/dashboard/approvals/page.tsx`s vanliga listvy.
- Godkänn-vägen — fortfarande `queueAction`/`executeSend` → `POST /api/approvals/:id`, ingen ny endpoint.
- "RAM 2: Sida"-varianten i mockupen byggs INTE — bara popup-modalen (det befintliga takeover-mönstret). Sidvarianten var Claude Designs egen dubbel-preview, ingen egen beställd yta.
- "Beslut från veckomötet"-kön-kategorin (Andreas idé, tidigare i konversationen) är INTE del av detta pass — mockupens dismiss-beteende (pill + återöppna) matchar redan befintlig banner-mekanik.

## Filer

- [x] `lib/jarvis/mandagsmote.ts` — nya rena funktioner:
  - `byggVeckomoteRepliker(payload)` → `{agentId, text}[]`, ordning resultat→lärdomar→risker→förtroende (samma ordning som `mandagsmoteSectionOrder`), en replik per sektion UTOM förtroende (en per rad, egen agent per rad).
  - `beslutText(n)` — "ett beslut" / "N beslut" (svensk pluralisering, samma stil som `mandagskortBeskrivning`).
- [x] `tests/mandagsmote-takeover.spec.ts` — facit för de nya funktionerna ovan + uppdaterade de assertions som pekade på GAMMAL rendering.
- [x] `app/api/next-best-action/route.ts` — additiv utökning: `recommendations`-fält (topp 3).
- [x] `components/jarvis/MandagsmoteTakeover.tsx` — omskriven till dialogform.
- [x] `components/jarvis/JarvisHome.tsx` — fetch + nya props kopplade.

## Verifiering

- [x] `npx tsc --noEmit` — noll fel.
- [x] Facit gröna (75/75 i mandagsmote-takeover.spec.ts).
- [x] `npx next build` — ren build.
- [x] Full testsvit: 5467 gröna/0 failed vid den tidpunkten.
- [x] Datakontrakt MCP-verifierat (seedad testdata, städad).
- [ ] Riktig inloggd browser-klick-genom — BLOCKERAD, se auth-fyndet nedan.

## Review

**Byggt och skeppat** (commit 838561be + d96ded4c, pushat, deployat):
alla filer i planen ovan, exakt som beskrivet. `npx tsc --noEmit` rent,
`npx next build` rent, full testsvit 5467 gröna/0 failed (upp från 5451 —
+16 nya/uppdaterade tester i tests/mandagsmote-takeover.spec.ts).

**Verifierat via Supabase MCP** (seedad testdata för biz_al7pjuu5smi,
sedan städad — sista SELECT bekräftar 0 kvar): `next_best_action`-radens
form matchar exakt vad `/api/next-best-action`s nya `recommendations`-fält
förväntar sig, och `pending_approvals`-payloaden för `monday_brief` matchar
exakt vad `byggVeckomoteRepliker` konsumerar. Detta bevisar datakontraktet,
INTE den faktiska renderingen/interaktionen i webbläsaren.

**INTE verifierat vid det här passets slut — en riktig, oberoende upptäckt:**
`tests/auth.setup.ts`s magic link-inloggning (via
`supabase.auth.admin.generateLink`) studsar tillbaka till `/login` inom
någon sekund för testkontot (`andreashogberg93@gmail.com` /
`biz_al7pjuu5smi`) — reproducerat tre gånger, även mot en helt orörd,
existerande test (`tests/navigation.spec.ts`). Trolig orsak: admingenererade
länkar är inte kompatibla med appens PKCE-baserade `/auth/callback`
(`exchangeCodeForSession` väntar en `?code=`-parameter; adminlänkar levererar
troligen sessionen som url-fragment istället, vilket aldrig når servern).

**UPPDATERING (Project Reality-passet, samma kväll):** hittade en fungerande
omväg — `supabase.auth.verifyOtp({token_hash, type:'magiclink'})` server-side
i stället för browser-navigering ger ett riktigt access_token, användbart
som Bearer-header direkt mot skarpa API-rutter. Löser INTE
`tests/auth.setup.ts`/den delade Playwright-riggen (som fortfarande
navigerar en browser och fortfarande studsar), men bevisar att API-lagret
går att verifiera skarpt utan den riggen. Värt ett eget litet pass att
portera fixen in i `tests/auth.setup.ts` — inte gjort här.

**Fixat i samma veva** (commit d96ded4c, litet och oberoende): `setup`-
projektets `storageState: undefined` gav ENOENT på en färsk checkout utan
`playwright/.auth/user.json` — samma fälla som `golden-path-setup` redan
dokumenterar i samma fil. Ett explicit tomt state löser det.

---

# COGS-mätaren etapp 1 — de tre största omätta LLM-ytorna

Källa: `tasks/cost-cap-analysis.md` §7 (kostnadsmodell-underlaget). Andreas:
"kan vi på ett säkert sätt nu efter inventering... bygga en usage-mätare per
konto?" → "Yes, kör!" — etapp 1 = agent-triggern, Matte-chatten, widgeten
(de tre största mätluckorna; svansen av mindre ytor är etapp 2, inte gjord).

## Byggt (commit 7d0d13a9 — pushat, deployat)

- **`app/api/agent/trigger/route.ts`**: bytte den platta $9/Mtok-blandtaxan
  (`totalTokens * 0.000009`, samma taxa oavsett Sonnet/Haiku) mot
  `llmCostUsd(cumulativeUsage, MODEL)` — riktig kostnad per faktisk modell,
  inklusive cache-tokens (systemprompten cachas). Skriver nu `cost_event`
  via `meterDirectLlmCall`, vilket den aldrig gjorde förut — kodbasens
  största LLM-volym var alltså helt osynlig i COGS-boken.
- **`app/api/matte/chat/route.ts`**: usage ackumuleras nu över HELA
  requesten (alla specialiststeg i orkestreringsloopen, `runAgentTurn`
  returnerar `usage`), bokförs en gång per tur på BÅDA return-vägarna
  (klart-svar och `pending_confirmation`). Tidigare helt omätt — upp till
  ~15 Sonnet-anrop/meddelande syntes ingenstans.
- **`app/api/widget/chat/route.ts`**: Sonnet → Haiku (styrt system-prompt
  med fasta regler/kort svar — kundvärdet ligger i att den FÖLJER
  guardrails, inte i modellens allmänna resonemangsförmåga) + mätning.
  Rate-limit fanns redan (IP-spärr 50/dygn + 500 konv/dygn + 20 msg/konv) —
  korrigerar min tidigare formulering "helt otakad" till Andreas, det var
  bara kostnaden som var omätt, inte volymen okontrollerad.

## Verifierat

- `npx tsc --noEmit` — noll fel.
- Nytt facit i `tests/cogs-matare.spec.ts` (3 nya tester): flat-taxan är
  borta, Matte bokför på båda return-vägarna, widgeten kör Haiku. Den
  befintliga "en skrivare per faktum"-invarianten (bara `cost-guard.ts` får
  skriva `resource:'llm'`) står KVAR intakt — inget nytt direktskrivande.
- `npx next build` — ren.
- Full svit: 5766 gröna, 0 failed.
- **Riktig, skarp verifiering i prod, alla tre ytor, riktiga `cost_event`-
  rader:**
  - Matte-chatt (Sonnet): `ref_type:'matte_chat_turn'`, 26 öre.
  - Widget: `ref_type:'widget_conversation'`, 1 öre (Haiku, kort svar).
  - agent/trigger: `ref_type:'agent_run'`, 14 öre, `meta.model:'claude-haiku-4-5-20251001'`
    — samma körning gav `agent_runs.estimated_cost = 0.0144` USD för 366
    tokens (den gamla taxan hade gett $0.0033 — nästan 4× fel, konkret bevis
    på att fixen ändrar verkliga siffror, inte bara kod).
  - Testkontots `widget_enabled` och `trial_ends_at` tillfälligt ändrade för
    att kunna trigga live-anrop, återställda till exakt ursprungsvärde
    direkt efteråt (verifierat med en avslutande SELECT).

## Kvar (etapp 2, inte gjord)

Svansen av mindre ytor från cost-cap-analysis.md §7-8: offertgenerering,
intent-klassificering, gmail-leadfilter, autopilot, leads-brev, insights-
cron, monthly-review, Whisper-luckorna (matte/transcribe, jobbkompisen,
voice/process), och den fortfarande medvetet omätta samtalskostnaden.
