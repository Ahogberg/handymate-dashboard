# Rapportera dagens arbete V1 — överlämning

Datum: 2026-08-31. Lokalt byggd och verifierad. **Inte committad, pushad,
deployad eller installerad i pilotens app.** Ingen migration eller ändring
av kunddata. Ingen ny agentmotor, rösttjänst, approval-kö eller fakturaväg.

## Vad som är byggt

På mobilens projektsida finns **Rapportera dagens arbete** med
**Berätta för Matte** och **Skriv istället**. Båda öppnar befintliga
MatteSheet. Inspelningen transkriberas av befintlig tjänst; texten kan
redigeras före skick. Nekad mikrofonbehörighet lämnar en fungerande textväg.

Projekt och rapportdatum följer med till den vanliga chattskärmen om man
väljer **Fortsätt i chatten**. Ett nytt projekt/datum startar avgränsad
historik. Ett väntande kort måste hanteras innan byte. Sena svar från en
övergiven kontext förs inte in i nästa projekt. Personlig rapporthistorik
och bekräftelsetoken lagras inte mellan appstarter.

Matte är ingången, Lars handlägger rapporten via samma modellrunda och
delade tool-router som befintlig chatt. Rapportläget erbjuder bara
`log_time` och `add_work_note` och kontrollerar verktygsvalet igen innan
förslaget returneras. Det gäller även om klienten utelämnar den vanliga
bekräftelseflaggan. Arbetsanteckning föreslås bara när den efterfrågas;
en vanlig tidsbeskrivning ska inte automatiskt bli en andra post.

Varje åtgärd har ett eget signerat bekräftelsekort med serverläst namn,
projekt, datum och exakt innehåll. Tid och anteckning kräver två klick.
Första framgången kvarstår om nästa skrivning misslyckas eller avbryts.
Rapporten avslutar inte projekt, godkänner inte ÄTA, skickar inget till
kunden och skapar ingen faktura. Befintlig intern `time_logged`-hantering
(projektets timunderlag/budgetvarningar) återanvänds oförändrad.

## Säkerhetsgränser

- Företag och business_user_id härleds från autentiserad session.
- Aktiv användare samt projekttilldelning krävs, om rollen inte har
  befintlig `see_all_projects`-behörighet. Kontrolleras igen vid bekräftelse.
- Bara den inloggades tid. Annans explicit angivna person-id avvisas.
  Klient-/modellvalda timpriser, booking_id och customer_id förs inte vidare.
- Tid laddas bara för den egna personen/projektet/dagen. Inga ekonomiska
  portföljer, företagsminnen eller delade projekt-/kundtrådar används som
  rapportkontext. Rapportutkast blir inte företagsminnen.
- Båda befintliga timerkällorna kontrolleras: `time_entry` och
  `time_checkins`. Pågående timer/instämpling blockerar nytt tidförslag,
  inte anteckning. Läsfel behandlas aldrig som noll registrerad tid.
- Tid uttrycks i exakta minuter; inga klockslag uppfinns. Kortet visar
  befintliga tidposter och att ett nytt pass är ett tillägg, inte ersättning.
- Återförsök använder samma signerade request-id och deterministiska
  rad-id:n. Det unika indexet är samtidighetsskyddet, inte en först-läs-
  sedan-skriv-kontroll. Mobilen återställer exakt token vid oklart nätverkssvar.
- Rapportläget använder inte den generella femminutersmatchningen som
  dubblettfacit: ett uttryckligen bekräftat extra pass får en egen rad.
  Generella chatten behåller sitt tidigare beteende.
- Nya anteckningar har `log_report_`-id och filtreras uttryckligen bort
  av kundportalens loggläsare. Detta är en V1-konvention utan ny SQL;
  framtida kundläsare måste bevara gränsen. Ingen generell publiceringsmodell.

## Filer och mobilöverlämning

Dashboardens ändringar ligger i denna arbetskopia:

- `lib/matte/work-report.ts` — ren validering, kontextladdning och korttext.
- `lib/matte/work-report-confirmation.ts` — signerade steg, återverifiering,
  resultat och nästa kort utan automatisk exekvering.
- `lib/agent/external-confirm.ts` — typad rapportmetadata i befintlig token.
- `app/api/matte/chat/route.ts` — avgränsad Lars-kontext/verktygslista,
  befintlig mätning och bekräftelseväg.
- `app/api/agent/trigger/tool-router.ts` — skrivvakten och stabila id:n i
  befintliga tid-/anteckningsskrivare.
- `app/api/portal/[token]/projects/route.ts` — explicit internrapportfilter.
- `tests/work-report.spec.ts` — 53 nya kontroller.
- `scripts/work-report-read-probe.cjs` — transportlåst, läsande PostgREST-prov.

Mobilen byggdes i en separat arbetskopia från GitHub-main
`1d07836480ae41d05c03ac9a5bde5397740c35a0`, inte i Claudes checkout.
Binära assets hämtades från den lokala mobilkopian efter att varje fil
hashverifierats mot denna commits GitHub-träd; inga assets ändrades.
GitHub-connectorns binärläsning gav tomt innehåll, varför textfiler och
binära assets hämtades på olika sätt. Paketversioner är oförändrade.

**Mobilpatch:** [WORK_REPORT_MOBILE_V1.patch](WORK_REPORT_MOBILE_V1.patch).
Patchen innehåller sex ändrade och två nya filer:

- `app/projects/[id].tsx`
- `app/matte/index.tsx`
- `components/MatteSheet.tsx`
- `components/ProjectReportCard.tsx` (ny)
- `lib/api.ts`
- `lib/matte-actions.ts`
- `lib/matte-store.ts`
- `__tests__/work-report.test.tsx` (ny, 13 tester)

`git apply --check` är godkänt mot den ursprungliga källbasen i en separat
valideringskopia. **Kontrollera aktuell mobil-HEAD och arbetskopia före merge.**
Codex försökte läsa status i `C:/Users/Gaming/handymate-mobile`, men Git
stoppade på olika filägare (Gaming respektive CodexSandboxOffline).
Ingen safe.directory-inställning ändrades och inget skrevs i den checkouten.
Claude kan granska och applicera patchen från sin ordinarie miljö; använd
aldrig patchen som en blind ersättning av senare ändringar.

Arbetskopian finns lokalt i
`C:/Users/Gaming/.codex/visualizations/2026/08/07/019fdaf2-270f-7121-9526-1408a2965bc1/mobile-project-report-v1`.
Den har inga inloggningsuppgifter, ingen EAS-build eller deploy har startats.

## Verifiering och vad den faktiskt bevisar

| Kontroll | Resultat |
| --- | --- |
| Dashboard: work-report, matte-time-logging, agent-tool-boundaries, column-contract | 92/92 gröna |
| Dashboard: matte-safety, matte-page-context, voice-boundaries, orchestration, external-actor, permission-contract | 82/82 gröna |
| Mobile: hela Jest-sviten | 130/130 gröna, 19 sviter |
| `tsc --noEmit`, dashboard och mobile | Grönt |
| Dashboard `next build` | Exit 0 |
| Mobile Expo/Hermes-export | Android och iOS exporterade lokalt |
| Mobilpatch mot källbas | `git apply --check`, exit 0 |
| Nya Supabase-läsfrågor via PostgREST | 9/9 godkända, noll rader, bara GET |

Backendtester kör den verkliga verktygsroutern med isolerad databasadapter,
inklusive samtidiga bekräftelser och fel. Modelltestet kör den faktiska
`runAgentTurn`-kroppen och verkliga verktygsdefinitioner/allowlist, med bara
modellsvaret ersatt. Mobiltesterna renderar riktiga Sheet/kort och provar
store/API-koppling, men ersätter native mikrofon och nätverksanrop.

Läsande metadatafrågor mot körande Supabase verifierade kolumner, typer,
nullbarhet, främmande nycklar och constraints. Viktig detalj:
`time_entry.id` är primärnyckeln, medan det faktiska dubblettskyddet här är
`UNIQUE(time_entry_id)` (`time_entry_time_entry_id_key`). `project_log.id`
är primärnyckel. Inga migrationer behövs i denna databas.

`node scripts/work-report-read-probe.cjs` använder redan konfigurerade
`.env.test`-uppgifter och en transport som vägrar allt utom GET mot ett
hårdkodat obefintligt företag. 9/9 frågor godkändes efter godkänd
nätverksåtkomst utanför sandboxen. Inga nycklar eller kundrader skrivs ut.
Det verifierar även PostgREST-filter/sortering/maybeSingle, inte bara SQL.

Detta är **inte** ett skarpt användar-/tvåtenantbevis för hela nya flödet.
Inga riktiga tidposter har skrivits av testerna och ingen fysisk telefon
har provat dessa ändringar. Hela dashboardens tusentals facit har inte
körts; ovan är de riktade regressionssviterna. Next-builden har befintliga
themeColor/dynamisk-rendering-/saknad-lokal-Supabase-konfig-varningar;
exit 0 bevisar kompilering, inte fungerande produktionsintegrationer.
Expo-export är JavaScript/Hermes-bundling, **inte** en native EAS-build.

## Före pilotens nästa appversion

1. Granska/dashboard-merge och mobilpatch mot aktuell main, bevara andras
   ändringar. Deploya backend före appversionen som begär `workReport`.
2. Kör om typkontroll, tester och ordinarie EAS-testbuild i mobilrepon.
3. På fysisk telefon: tilldelad medarbetare säger ”Fyra timmar, monterat
   skåp”, rättar texten och kontrollerar namn/projekt/datum/minuter innan ja.
4. Verifiera en enda ny rad med rätt tenant/person/projekt; upprepa samma
   bekräftelse efter tappat svar och verifiera fortfarande en enda rad.
5. Begär både tid och anteckning. Godkänn tiden, avbryt anteckningen.
   Kontrollera att tiden finns men ingen anteckning, faktura eller kundsignal.
6. Prova pågående timer, nekad mikrofon, datumbyte, fortsatt chatt, kollega
   utan tilldelning och ett projekt i annan tenant. Nekanden får aldrig skriva.
7. Kontrollera arbetsanteckning i intern byggdagbok och att den inte syns
   i kundportalen. Prova även nätverksfel vid det andra godkännandet.

## Separat fynd, inte tyst fixat

Kundportalens befintliga loggfråga använder fortfarande `project_id` och
`work_description`. Körande `project_log` har `order_id` och `work_performed`.
Det kan ge tom `latestLog` trots sparade anteckningar. Detta behöver separat
rättning **med ett uttryckligt beslut om vilka gamla loggar kunden ska se**:
att enbart byta kolumnalias skulle kunna publicera anteckningar som andra
skrivare kallar interna. V1 ändrar inte historiska loggars publicering;
den lägger en uttrycklig spärr för just de nya rapportanteckningarna.
