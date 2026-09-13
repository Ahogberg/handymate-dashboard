# Slice 4 — stängningskontroll

Användarens instruktion: slutför slice 4 innan slice 5. Stäng inte på basis av enbart kod eller unit-tester.

## Slutkriterium

Kundvyn ska visa vad Handymate vet om relationen, vad som är öppet och nästa administrativa steg. Inga spekulativa personbedömningar, nya tabeller eller nya motorer.

| Grind | Bevis/status |
| --- | --- |
| Bekräftat minne | Publicerat; faktiskt tomläge och omladdning verifierade. Löftesstatus har isolerade regressioner, inga aktiva löftesrader finns att prova live. |
| Synliga öppna uppgifter | Publicerat; faktisk tom lista verifierad, privata/rollstyrda rader och sena svar prövade i route-/loaderregressioner. |
| Nästa aktiva bokning | Publicerat; befintlig bokning, korrekt lokalt datum, länk och tomläge verifierade. Produktionsenum rättad till confirmed. |
| Kundkopplade ärenden och senaste offert | Implementerat och granskat lokalt. Befintlig routing och quote handoff återanvänds. Kundkopplade informationsärenden får neutral presentation, utan ny Godkänn-knapp. |
| Nästa administrativa steg | Implementerat med samma läsningar som översikten; okända källor blockerar ett definitivt besked. |
| Historik och äldre räknare | Källfel synliggörs, tillgänglig historik behålls och sena svar skyddas. Äldre kärnläsningar har explicita företagsfilter och okända räknare vid fel. Faktiska route-regressioner och inloggad preview är gröna; schemafelet i äldre affärsläsning är rättat. |
| Verkligt roll-/företagsbyte | Ej verifierat. Kontomenyn saknar väljare. Read-only medlemskontroll: en aktiv owner med user_id och en employee utan user_id i testföretaget. Legitima ytterligare testsessioner krävs. |
| Mobil | Ingen separat kunddetaljvy i mobilrepots aktuella app-träd. Webbvyn behöver prövas smalt; aktuell cloud-browser annonserar ingen viewport-/device-emulering. Detta är inte native-build-proof. |
| Publicering och slutlig preview | Slutpaket och runtime-rättning publicerade och inloggad preview verifierad. Se versionsbundet bevis nedan. |

## Avgränsning

Slice 5 påbörjas inte. Providerleverans behöver inte simuleras för denna läsmodell; inga utskick eller verkliga beslut görs för att få gröna resultat. Ingen falsk rollväxling, ändring av sessionstoken eller behörighetsförbikoppling används för livegrinden.

## Kvarvarande avgränsningar

- Historiken är en begränsad hämtad lista per källa, inte ett bevis på full historisk täckning.
- Äldre dokument-, serviceavtals-, referral- och separat Gmail-läsning ingår inte i det nya nästa-steg-underlaget. Deras tidigare tysta/valfria felvägar är inte generellt sanerade i detta paket.
- Ärendeläsaren inkluderar bara explicit stödda kundreferenser; den påstår inte att alla företagets ärendetyper kan härledas till en kund. Den läser sidan efter rad 1 000 och avbryter med synligt fel vid för stor kö eller databasfel.
- Bekräftade livebevis från tidigare paket gäller deras respektive versioner. Det nya slutpaketet behöver egen previewkontroll.

## Lokal verifiering — 2026-09-11

Typkontroll med `NODE_OPTIONS=--max-old-space-size=8192` och diffkontroll är gröna. Slutkörningen av customer-open-work-summary, customer-project-timeline och feature-test-parity är 28/28 grön. Tidigare körning inklusive customer-context-trail var 41/41 grön före de fyra sista feltesterna.

Faktisk transpilierad GET provas för paginerad kundärendeläsning efter rad 1 000, snooze, annan tenant, motstridiga kundreferenser, routingavslag och sidfel. Historikens faktiska GET provas med SMS-källfel samtidigt som en giltig bokning bevaras, samt fatal kontextläsning. Offertöverlämningens nätverksfel och felaktiga svar bevarar verifierad offert och ärenden. Dessa tester är isolerade; de ersätter inte verkliga roll-/företagsbyten. Båda berörda specfilerna är kopplade till kontraktsworkflow och lokal kontraktslista.

## Livekontroll av slutpaketet — 2026-09-11

Kod `0af3fc4eb85af288754e575d7e74ff9d9ff2a6ad`: samtliga 13 CI-checkar och båda Vercelbyggen gröna. Inloggad preview visar två kundkopplade SMS-ärenden, rätt senaste offert med Utkast och kanonisk överlämning. Öppna offerten leder till samma offertnummer och kund. En annan kund visar verifierat tomma ärenden/offerter/uppgifter och en riktig bokning den 11 september kl. 12:00; nästa steg blir att förbereda bokningen och länken pekar på rätt boknings-ID. Samma resultat efter omladdning. Historiken visar kundens bokningar. Inga utskick eller beslut utfördes.

Den nya felvisningen blottlade ett äldre schemafel: kundsidans affärsläsning använder `pipeline_stage.label`, medan read-only runtimekontroll bevisar `name`. Rättningen till `label:name` och okända flikräknare vid läsfel är lokalt granskad. Typkontroll, diffkontroll och 15 riktade tester är gröna. Rättningen publicerad som `edf411790bee87bf98c2a844480b3858161b22ea`. Båda Vercelbyggen gröna. Inloggad omladdning visar att kärnläsningens felmeddelande försvunnit, bokningsantalet är två och nästa bokning/nästa steg är oförändrat korrekta. Vid checkpointen var 11/13 CI-checkar gröna och två kontraktskörningar pågick, utan rapporterade fel.

## Kvotprioritering

Användaren uttryckte oro för veckoanvändningen. Ingen ytterligare breddning av slice 4 eller start av slice 5 efter denna checkpoint. Fortsätt först med legitima roll-/företagssessioner och smal webbkontroll. Prioritera därefter återstående helgarbete efter konkret lanseringsnytta; ett avgränsat Sol-paket och en samlad planerings-/granskningsomgång åt gången. Ingen garanti ges att hela helgplanen ryms i kvarvarande kvot.

## Beslut om arbetsordning

Användaren godkände därefter att gå till slice 5 utan ytterligare testmiljöarbete. Slice 4 behåller sina öppna livegrindar. Read-only kontroll visar att testanställdens medlemskap är korrekt, men testföretagets onboarding är steg 1 och sparat companyName avviker från business_name. Ingen kundresa verifierades som anställd; ingen medlemskoppling eller onboardinggrind ändrades.
