# Kundvärde: återstående acceptans efter V1 och C6

2026-09-14. Denna leverans rättar befintlig webbyta; den aktiverar inte V1 eller kernel i produktion och är inte hela V2/V3.

## Levererad webbförbättring

Startsidan, agentsidan och Pengar använder samma veckokvitto. Registrerat betalt och accepterade offerter visas separat. Betalningsbelopp följer ledgerns befintliga regel (`paid_amount`, inklusive kundbetald ROT-faktura); ett saknat belopp får bara falla tillbaka till totalen för en helt betald äldre faktura. Belopp innebär inte bevisad kausal merintäkt. Värdekvittots metodversion höjs till 3 för den korrigerade betalningsläsningen.

Tid visas som minuter med explicit schablon. Uppmätt genomloppstid mellan arbetssteg hålls skild från sparad arbetstid. Tomma perioder visar en konkret väg till första offert. Ledgerns underlag länkar till faktura eller ursprungligt godkännandekort.

Vecko-API:t kräver ägare/admin. Läsfel blir fel med återförsök, aldrig ett påhittat nollutfall. Företagsbyte avbryter gamla läsningar och tömmer föregående företags vy. Onboardingens åtta underlagsläsningar måste alla lyckas innan ett kvitto beräknas.

## V2: pengar från kernelns händelser — fortfarande implementation kvar

V2-skissen i CUSTOMER_VALUE_PACKAGE_LOG.md kräver en C3-konsument och en kontrollerad växling till kernel som enda källa. Följande måste ingå i det granskade kontraktet:

- Konsumenten tar ett kanoniskt event-id. Tenant, faktura, komponent, valuta och belopp hämtas server-side från kernel; klientbelopp accepteras inte.
- Återleverans och krasch mellan beständig projektion och ack ger exakt en projektion per källhändelse. Ingen utskickseffekt i konsumenten.
- Fakturerat följer `invoice_issued`. Kundbetalt måste ha explicit facit för delbetalning, slutbetalning, ROT-komponenten, överbetalning, kreditering och reverserad allokering. Summera inte kumulativa betalningsögonblick som om de vore nya betalningar.
- Betalningar utanför fasaden måste kopplas via allokering och fordran. Enbart `fin_invoice_…`-korrelation är otillräcklig för PSP-vägen.
- Generisk `append_value_event` får inte skapa de reserverade pengahändelserna. En betrodd RPC validerar ursprung och idempotens.
- Fel/halt syns i driftvyn; återupptagning är manuell. En flaggad läsare får inte falla tillbaka till den gamla pengakällan vid fel.
- PGlite-facit: fel tenant, fel fordran, dubblett/replay, krasch före ack, ROT, delbetalning, kredit/reversal och identiska pengar före/efter växling för pilotens verkliga underlag.

Detta dokument avgör inte nya bokföringsregler. Den befintliga skissen är ännu inte ett fullständigt facit för fallen ovan; de ska granskas innan en ny pengakälla införs.

## V3: Impact — fortfarande implementation kvar

Webben har nu ett gemensamt veckokvitto och befintlig fyrastegsledger med underlagslänkar. Full V3 ska läsa V1/V2 via samma kontrakt på webb och native mobil, utan egen beloppshärledning. Acceptans omfattar identiska perioder, valuta, belopp och metod, behörighetsfel, nätverksfel/återförsök och företagsbyte på båda klienterna. Native-appen har inte ändrats eller verifierats i denna leverans.

## Onboarding och första verkliga arbete

Befintligt arbetsprov tar kundens text, förbereder ett prislöst offertunderlag, sparar det vid Fortsätt och återupptar det i offertbyggaren. Det är ett förberedande resultat. Det bevisar inte att en offert har skickats eller att pengar tjänats. Kanalanslutningar fortsätter i PR #69; duplicera inte det arbetet här.

Pilotprovet återstår: namngivet företag, verklig förfrågan, granskat och beständigt underlag, faktisk godkänd handling samt ett kvitto med klickbart bevis. Mät serverstämplad start till första bevisade handling. Redovisa både misslyckanden och tider över 15 minuter; tidsmålet får inte anges som uppnått från fixtures eller lokala komponenttester.

## Aktiveringsgrindar

Read-only kontroll 2026-09-14: `value_events`, `financial_effect_intents`, `financial_kernel_rollout` och `ensure_effect_intents` saknas i produktion; noll företag har kernel-flaggan på.

- Kernel: v239 → v240 → v242, cron-aktivering, namngivet pilotföretag och C6:s skuggjämförelse/sekventiella svenska kalenderdagar enligt Financial Kernel-loggen.
- V1: beslutad gallring/anonymisering, v241, backfill per företag, metodjämförelse och därefter flagga enligt V1-loggen. Att slå av visningsflaggan ersätter inte ett beslut om insamlingen.
- V2/V3: implementation och granskning samt pilotbevis enligt ovan. Ingen produktionsaktivering utförd i denna leverans.
