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
| Historik och äldre räknare | Källfel synliggörs, tillgänglig historik behålls och sena svar skyddas. Äldre kärnläsningar har explicita företagsfilter och okända räknare vid fel. Faktiska route-regressioner är gröna; slutlig preview återstår. |
| Verkligt roll-/företagsbyte | Ej verifierat. Kontomenyn saknar väljare. Read-only medlemskontroll: en aktiv owner med user_id och en employee utan user_id i testföretaget. Legitima ytterligare testsessioner krävs. |
| Mobil | Ingen separat kunddetaljvy i mobilrepots aktuella app-träd. Webbvyn behöver prövas smalt; aktuell cloud-browser annonserar ingen viewport-/device-emulering. Detta är inte native-build-proof. |
| Publicering och slutlig preview | Lokalt slutpaket granskat och verifierat; publicering/preview återstår. |

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
