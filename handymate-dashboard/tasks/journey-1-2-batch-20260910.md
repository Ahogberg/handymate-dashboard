# Samlad genomgång av kundresa 1 och fortsatt resa 2 — 2026-09-10

## Arbetsbeslut

Andreas vill ha hela resor genomarbetade, med samlad rapport per resa och automatisk fortsättning till nästa oblockerade del. Kontaktformulär/widget/public book ligger efter lansering. Detta dokument ersätter inte kundprovet eller de fyra gemensamma godkännandekraven.

Ingen resa är slutgodkänd. Kodprov med isolerad databas/modell/provider visar programbeteende, inte att en verklig kund har nått resultatet. Ingen main-merge, produktionsmigration, fakturasändning eller kundkommunikation har gjorts i detta pass.

## Resa 1: företagsstart till första användbara offertutkast

| Steg | Kundens handling | Automation och sparat resultat | Genomgånget/förändrat | Kvar till kundgodkännande |
|---|---|---|---|---|
| 1. Konto och företag | Skapar konto, anger organisationsnummer, granskar firman | Registrering, Bolagsverket-uppslag och `business_config` | Koden använder uppslag och manuell komplettering. Läsfel i återupptagning visas nu som fel med återförsök, inte som ny firma. | Verklig providerträff och tomt testkonto i rätt preview. |
| 2. Arbetssätt och första arbetsunderlag | Anger bransch, jobbtyper, pris och exempel | Onboardingdata, prisinställningar och jobbtyper sparas | Alla sparande steg väntar på serverkvittens. Dubbelklick stoppas. Misslyckad läsning av befintlig JSON får inte skriva över tidigare svar/priser. | Klicka nätavbrott/omladdning, inklusive registreringens state-byte. Samtidiga flikar har inget nytt atomiskt JSON-mergekontrakt. |
| 3. Telefon | Väljer telefonväg | Sparad telefoninställning, separat provisionering | Befintlig motor och tillståndsgrindar bevarade. | Nummer, saldo, vidarekoppling, faktiskt inkommande samtal och agentresultat. |
| 4. Historik och företagsbild | Väljer Fortnox/CSV eller fortsätter utan import | Importerade kunder/fakturor, skanning och granskningsunderlag | Fortnox/CSV finns i startsteget. Google OAuth begär kalenderbehörigheter; Gmail aktiveras inte av denna onboarding. | Live Fortnox/CSV-resa. Gmail-onboarding är fortfarande ej implementerad, inte bara en saknad inloggning. Microsoft är också öppet. |
| 5. Granska och aktivera | Granskar uppgifter och genomför betalning | Serververifierad betalstatus | Betalspärren bevarad. PUT kan inte hoppa till färdig onboarding. Saknad betalning stoppar finalisering före effekter. | Verkligt godkänt Stripe-test inklusive avbrutet checkout och retur. |
| 6. Grundkonfiguration | Bekräftar sina val | Branschprodukter, mallar, standardtexter, pipeline och regler | Finalisering använder sparad bransch/extrabranscher/pris även när klienten skickar `{}`. Nödvändig seeding måste lyckas innan klart-markeringen. Läs-/skrivfel räknas som fel. Återförsök behåller stabila mall-ID:n. | Kontrollera verkliga rader i målmiljön. Valfria äldre seed-delar behåller sina befintliga undantag. |
| 7. Första offertstart | Väljer jobbtyp och upplägg | Sparad onboarding, återverifierat upplägg, verkliga artikelpriser och offertbyggare | Befintlig `completeFirstQuoteOnboarding` granskas tillsammans med den nya finaliseringsgrinden. | Rätt Studio-yta i aktuell preview; inga gamla demonstrationssteg som substitut. |
| 8. Spara och återöppna | Sparar utkast, öppnar det igen | Faktisk POST → kanonisk offertbyggare → quotes/quote_items → GET → edit-mappning | Nytt sammanhängande kodprov kör alla dessa riktiga moduler med isolerad DB. Priser, artikelkopplingar och reservationer överlever. Misslyckad radskrivning ger fel/rollback. Misslyckad radläsning ger 503, inte tom redigerbar offert. | Verklig databas/klick/omladdning/PDF. Ny offert vid förlorad POST-kvittens har ännu inte fått ett beständigt klientnyckelkontrakt; kalla inte den delen dublettsäker. |

### Vilken Matte-onboarding?

- `preview/setup-studio`: **3e68aab20a06a5b1691359e8a24f34cabdfc2fcf**. Verifierad branch-ref. Historisk Vercel-status success den 4 september, deployment `DEYifiCTQB2QpVKnXLdaasTuxnDV`. Den använder SetupStudioShell/MatteSetupGuide runt niostegsmotorn. En aktuell klickbar deployment med flaggan är ännu inte verifierad.
- Dagens motor på PR37 innehåller samma typ av Studio-skal bakom `NEXT_PUBLIC_SETUP_STUDIO_ENABLED=true`. `?studio=1` räcker inte utan byggflaggan, bortsett från befintlig demoväg. `?classic=1` är den dokumenterade jämförelsevägen.
- `feat/matte-onboarding-v3`: **e33a8db58f18632f0d6edb50505f377baa87f2e5**. Den separata äldre `/onboarding/v3`-prototypen har gamla priser/betalflöden och statiskt demoläge. Den får inte förväxlas med Setup Studio eller flyttas in som produktionsmotor. Den tidigare kartans antagande att detta var den enda nya Matte-kandidaten var ofullständigt.
- Följ `docs/runbooks/TVAKONTOSBEVIS_ONBOARDING.md`: samma aktuella build, separata tomma testföretag och verifierad flagga. Ingen sådan inloggad körning genomfördes nu. Tillgängliga browserflikar stod på Vercel Login respektive Handymates `/login?redirect=%2Fdashboard`.

### Större produktlucka: mejl

`lib/google-calendar.ts` begär calendar.readonly, calendar.events och userinfo.email. Callbacken skriver Gmail-scopeflaggorna som false. Importsteget erbjuder Fortnox/CSV. Därför kan löftet ”vi läser kundkonversationerna direkt efter onboarding” inte lämnas för den här implementationen.

Den avsiktliga kalenderbegränsningen finns dokumenterad i koden. En riktig Gmail-leverans behöver eget uttryckligt samtycke, kontroll av faktiskt beviljade scopes, sparad/återupptagbar retur till onboarding, synlig importstatus och prov på kundens första återfunna konversation. Appregistrering/scopetillstånd måste verifieras; de får inte antas finnas. PR36:s förbättrade polling ersätter inte detta. Microsoft kräver motsvarande egen integration.

## Resa 2: korrigerad överlämning från agent till faktisk uppföljning

Reproducerat mot tidigare kod: två aktuella offerter + lyckad agentkörning utan något verktygsresultat gav HTTP 200, `follow_ups_sent: 2`, räknare `[1,1]` och **noll godkännandekort**. Det var falsk framgång och kunde förbruka kundens uppföljningsomgångar.

Ändrat i PR37:

- En agentkörning gäller en offert, en skickcykel och en omgång. Verktygsgrinden tillåter bara underlagsläsning och meddelandeförslag i angiven kanal; ingen vidaredelegering eller nya artefakter från den körningen.
- Kort-ID är deterministiskt per företag/offert/skickcykel/omgång. Faktisk sparad kvittens krävs; samtidiga körningar och återförsök återanvänder kortet.
- Kortet bär kund, offert, related_id, kanal, omgång och fryst underlagsfingeravtryck. Agentkörning räknas aldrig som sändning.
- Pending, avvisat, utgånget eller osäkert kort håller sin omgång. Endast sparad framgång + kanalens sändreferens + exekveringstid kan avancera räknaren, med compare-and-set.
- Granskning och exekvering läser om offert, kund, rader och kopplad inkommande kontakt. Accept/nej/utgång, ändrat underlag/mottagare och inkommande kundkontakt stoppar sändningen. Enbart öppning av offerten är tillåten.
- Ett beständigt sändanspråk tas före provideranrop och släpps aldrig automatiskt. Förlorad HTTP-kvittens kan inte ge blind omsändning via det nya kortet. Manuell avstämning krävs även om ett reserverat försök sedan stoppas före sändning; bättre återhämtning för bevisat oskickade försök återstår.
- Offertens överlämningsyta visar när ett sådant kort är avvisat/utgånget/osäkert. Den får då inte lova nästa automatiska omgång.
- Skapande-API:t tillåter endast utkast. Det kan inte sätta `sent`/`accepted` utan riktig sänd-/beslutsväg.

### Avgränsningar i resa 2 — inte slutgodkänt

Detta rättar **legacy-cronens normala agentuppföljning**. V3-regelmotorn, autonoma förfallonudgar, andra historiska kort och uttryckligt schemalagd `agent_followup` har egna vägar och måste verifieras tillsammans innan all uppföljning kallas komplett. Befintliga räknare som tidigare steg fel återställs inte på chans. Inkommande poster utan customer_id omfattas inte av den nya kontaktkontrollen; provider-/länkningsprovet måste bevisa detta separat.

Per-offert-körningar kräver målmiljöprov av tidsbudget och kapacitet; cron kör idag dagligen. Ingen ny heartbeat/produktion eller garanterad handläggningstid har bevisats. Utskick/accept/projektskapande i PR35 har tidigare kodbevis men ännu inget nytt inloggat kundprov på denna stack. Deal-länkning efter offertskrivning behöver också avbrottsprov; lyckad offertskrivning ensam bevisar inte hela affärskedjan.

## Reproducerbara kodbevis

Lokalt Node 24, databas/provider isolerade:

```sh
node --experimental-vm-modules tests/sprint/onboarding-completion.cjs
node --experimental-vm-modules tests/sprint/onboarding-seeding.cjs
node tests/sprint/onboarding-transitions.cjs
node --experimental-vm-modules tests/sprint/first-quote-persistence.cjs
node --experimental-vm-modules tests/sprint/quote-followup-round.cjs
```

10 + 15 + 8 + 6 + 27 = **66 riktade scenarier**. De ingår också i `npm run test:six-outcomes`, där projektets TypeScript används. De äldre första-offert-proven simulerade återläsning av en payload; de får inte ensamma beskrivas som prov av faktisk POST/persistens. Den nya första-offert-sviten kör verkliga route-/skriv-/läsmoduler, fortfarande mot isolerad DB.

Onboarding/radläsning före sista skapandestatusgrinden: **2aa57aeaaa4d0e0c65010371ffcfc5a04e854803**, samtliga fem Actions-grindar gröna, Kontraktsgrind #514. Slutlig SHA/CI för hela passet registreras i sprintplanens checkpoint efter avläsning.

## Fortsätt utan nytt ”kör”

1. Avläs slutlig CI och rätta verkliga fel. Verifiera filhashar mot GitHub och spara denna karta/plan.
2. Återanvänd en giltig browser-session om den finns; annars håll klickproven öppna och fortsätt kod. För resa 1 krävs aktuell Studio-preview och tomt testföretag, inte ett redan onboardat produktionskonto.
3. Följ resa 2:s återstående verkliga intäktskedja: offertens affärslänk, samtliga aktiva uppföljningsproducenter, kundbeslut och projekt. Bygg inte kontaktformulär/widget nu.
4. Kör resa 3 på samma kund/projekt: rapportdelarnas kvittenser → intern granskning → kundgodkänd ÄTA → källor och belopp i fakturautkast → separat providerprov. Behåll mobil-/backend-SHA och målmiljö synkade.
5. Återkom till den kvarvarande Gmail-implementationen och första-offert-POSTens förlorade svar. Dessa är öppna tekniska delar och får inte gömmas under ”kundtest återstår”.
