# Tre små kundstartsfixar inför lansering

Bas: dashboard main `ce00347817e9d91ab051eeda22fc644bbc1fe92c` (inklusive PR #20).
Branch: `codex/onboarding-truth-followup-20260907`.

## Genomgången: läsfel är inte en tom firma

`app/onboarding/components/StepGenomgang.tsx` skiljer lyckad tom läsning från HTTP-/nätverksfel och femsekunderstimeout. Fel visar ”Vi kunde inte hämta dina uppgifter just nu” och ”Försök igen”. Det befintliga tomläget visas bara efter en lyckad tom läsning. Kunden kan fortfarande gå vidare till aktivering.

Återförsöket läser om samma endpoint. Cleanup avbryter anropet och hindrar sena svar från en avmonterad effekt att ändra läget. Ett fel sparas inte som en lyckad tom genomgång. Inga ändringar av Stripe, aktivering, import eller betalstatus.

## Tidsvärdet: samma förbehåll även i mejl

Dag 2 och dag 7 säger ”Uppskattningsvis N timmar mindre administration”, med svensk decimalformatering. Länken ”Så uppskattas tiden” går till `/dashboard/oversikt#tidsuppskattning`.

Översikt hade uppskattningsetiketten men ingen adresserbar förklaring. Där finns nu en kort text om registrerade aktiviteter och schabloner, uttryckligen inte uppmätt individuell tidsbesparing. Text och länkdefinition ligger i `lib/value/time-estimate-copy.ts`; länkmålet finns även när veckovärdeskortet är dolt. Värdeberäkningen ändras inte. Mejl med noll tidsvärde visar ingen tidsrad.

## Samma underlag bakom nästa steg

Befintliga kanalfrågor och bevisregler är flyttade oförändrade från HTTP-rutten till `lib/onboarding/channel-health-data.ts`, `loadChannelHealth(supabase, businessId)`. Funktionen gör inga skrivningar.

- HTTP-rutten behåller `getAuthenticatedBusiness` och `force-dynamic`; businessId tas från autentiseringen.
- Cronens befintliga `verifyCronSecret` kvarstår. Den använder företagets id från sin befintliga kandidatläsning.
- Varje flyttad tabellfråga behåller `business_id`-filtret. Telefonbeviset kräver fortfarande testflödets exakta lead-/affärsid, och leadraden måste finnas i samma firma.
- `hamtaKomIgangSignals` inkluderar nu också kanalbevisen. Startsidan och dag 2-/14-mejlen använder samma signaler och `deriveKomIgangTasks`.
- Om ett nödvändigt kanalbevis inte kan läsas kastar hjälparen. Startsidan får läsfel och befintligt återförsök. Mejlens befintliga felhantering utelämnar prioriterade steg och behåller länken till startsidan. Inget okänt underlag blir en gissad prioritering.

Dag 7 behåller sin befintliga uppföljning av ett verkligt väntande beslutskort; dess enda ändring här är tidsformuleringen. Två läsningar vid olika tidpunkter kan självklart visa olika läge när kundens verkliga data ändrats. Ingen ny synkroniseringstabell eller sparad prioritering införs.

Diffjämförelse av gamla kanalruttens query-/beviskropp mot nya hjälparen visar oförändrade frågor och bevisvillkor. Skillnaden är kastade läsfel och ett returvärde som HTTP-rutten omsluter i JSON. Cronen gör därmed fler läsningar vid dag 2/14 än tidigare; antalet frågor beror på vilka lead-/telefonbevis som finns. Ingen ny tabell, kolumn eller migration.

## Verifiering

- Före rättningarna: de nya proven gav 9 röda och 2 gröna (3 browserfel och 6 kod-/beteendefel).
- Efter rättningarna: 94 riktade kod-/kontraktskontroller passerar samt 4 isolerade Chromiumprov. Omkörningen av samma fyra browserprov räknas inte som ytterligare unika tester.
- Chromium vid 375/1280 px: HTTP-fel → återförsök → verkliga rader, separat lyckat tomläge och timeout → återförsök. React StrictMode används. Mobilens felvy är visuellt granskad och har ingen horisontell overflow.
- Dataproven använder en lokal relationell fixture och den riktiga signal-/prioriteringslogiken. De provar verifierat/icke-verifierat kundinflöde, en lead i annan firma, tenantfilter och läsfel. Detta är inte en körning mot Supabase.
- HTML-proven kör de riktiga mejlbyggarna med externa beroenden isolerade. De kräver uppskattningsförbehåll, svensk decimal, rätt förklaringslänk och ingen noll-tidsrad. Inga mejl skickas.
- Befintliga facit för kanalhälsa och kundinflöde följer nu beviskodens nya plats; auth-, tenant- och lead-/affärskraven finns kvar. Första-värde-fixturen hanterar de flyttade läsningarna. De nya proven ingår i befintliga `test:feature-integration`, som redan körs av CI.
- TypeScript `tsc --noEmit`: exit 0.
- Next-produktionsbygge: exit 0.
- Lint inte verifierad: `next lint` öppnar ESLint-konfiguration i detta repo. Dialogens exit 0 är inget lintbevis.

Ingen produktionsmutation, merge, manuell deployment, native-körning, telefon-/SMS-prov, färsk registrering, betalning eller kundkontakt har utförts. PR-CI redovisas separat. Befintlig GO_NO_GO gäller fortsatt.

## Efter granskning

Kundresan med tre typer av testkonton återstår: tom firma, firma med historik och firma via testpartnerlänk. Prova att nästa steg stämmer vid samma dataläge, att ett läsfel går att förstå och återhämta, och att tidsuppskattningens länk når förklaringen. Partnerfallet kräver en testpartnerlänk. Bee Service och Nordström används inte.

Målstyrda första uppdrag, gemensamt kundstartskvitto, partner-/supportsammanfattning och aktivitetsmått baserat på kundnytta är fortsatt arbete efter lansering, inte del av denna PR. Under arbetet landade main-commit `d92260a` som dokumenterar detta i `tasks/efter-lansering.md`; den ändrar ingen av rättningarnas produktfiler.
