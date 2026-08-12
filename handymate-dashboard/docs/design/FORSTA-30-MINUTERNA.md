# De första 30 minuterna — wow OCH förståelse

**Datum:** 2026-08-13 · Status: DESIGN (godkännande väntar)
**Mål:** kundens första halvtimme ska ge känslan "teamet jobbar redan åt
mig" OCH lära ut produktens enda kärnmekanik: kort kommer → du godkänner.

## Upptäckt som driver designen (verifierad mot kod 2026-08-13)

Routebytet 2026-08-12 lämnade ALLA förstagångselement på gamla sidan
(`/dashboard/oversikt`): välkomstpopup, OnboardingChecklist,
AgentReadinessCard, setup-påminnelser, cold-start-copyn. Nya startsidan
(JarvisHome) har NOLL förstagångslogik — en ny kund möter "Inget väntar på
dig". Dessutom: `instant-value` (Karins krona-fynd, onboardingens payoff)
konsumeras aldrig efter onboardingen; `welcome_tour_seen` skrivs men läses
aldrig; LiveTourens fyra stopp pekar på ytnamn som inte längre finns
("Godkännanden" ≠ "Det här behöver dig idag"); WelcomeModals knapp "Visa
mig kön" navigerar ingenstans.

## Principen

**Turen går på RIKTIGA ytan, med RIKTIG (eller ärligt seedad) data — inte
en mockad kopia.** Step6LiveTour behåller sin roll som förhandsvisning
INNE i onboardingen, men den riktiga inlärningen sker där kunden ska leva.
Och det viktigaste ögonblicket är inte att SE en yta — det är att
**godkänna sitt första kort**. Kärnmekaniken ska ha hänt i handen inom de
första 15 minuterna.

## Dramaturgin (minut för minut)

**Min 0–12 · Onboardingen (finns, behålls):** konto → Steg 3 (hur du
jobbar, inkl. intern timkostnad) → telefonnummer + aha-ringtestet ("ring
ditt eget nummer — se Lisa fånga det live") → import (Fortnox/CSV eller
hoppa) → Step6LiveTour-payoffen med krona-fyndet → **"Kör igång"**.

**Min 12–17 · Landningen + turen (NYTT):** kunden landar på riktiga
`/dashboard`. Om `welcome_tour_seen` är null startar **Hemturen**: samma
spotlight/placement-mekanik som LiveTour (lyfts ur Step6 till en delad
komponent), men över RIKTIGA DOM-noder, fem stopp:
1. **"Det här behöver dig idag"** — och här ligger redan kort (se
   Startkorten nedan). "Allt teamet vill göra hamnar här. Inget går ut
   utan ditt ja."
2. **"Pengar just nu"** — med krona-fyndet återanvänt: instant-value-datat
   renderas som första innehåll ("Karin hittade 3 förfallna fakturor —
   12 400 kr") i stället för att dö i onboardingen.
3. **"Det här sköter teamet"** — "medan du jobbar håller de ögonen på
   fakturor, offerter och projekt."
4. **"Möte idag?"-kortet** — "spela in nästa platsbesök, Matte skriver
   utkastet."
5. **Skrivraden** — "fråga Matte vad som helst — testa: 'Vilka projekt
   behöver mig?'"
Varje stopp: en mening, aldrig två. Ständig "Hoppa över"-utväg
(B7-lärdomen). `welcome_tour_seen` sätts när turen avslutas — flaggan får
äntligen sin läsare.

**Min 15 · Första godkännandet (kärnan i wow:et) — Startkorten:** ett
splitternytt konto ska ALDRIG ha en tom kö. Vid onboarding-slut seedas 2–3
INFORMATIONAL-kort där teamet presenterar sig genom själva mekaniken:
- Lisa: "Jag vaktar din telefon nu. Missade samtal blir SMS till kunden
  inom en minut. [Jag har läst det]"
- Karin (om import gav data): krona-fyndet som kort — "3 förfallna
  fakturor, 12 400 kr. Vill du att jag förbereder påminnelser?" (riktigt,
  agerbart!). Utan data: "Jag bevakar dina fakturor från och med nu."
- Daniel: "Skicka din första offert så följer jag upp den åt dig."
Att godkänna Lisas kort ÄR utbildningen — kunden har nu gjort produktens
viktigaste handling, med konfetti-mikrofeedback första gången.

**Min 17–30 · De tre första uppdragen:** checklistan ersätts på nya
startsidan av en smalare **"Kom igång"-rail** (tre uppdrag, inte elva
punkter): (1) Ring ditt nummer (aha-testet, om inte gjort i onboardingen),
(2) Spela in ett testmöte ELLER skapa första offerten, (3) Installera
appen på hemskärmen (PWA + push). Varje uppdrag bockas av på RIKTIG data
(inte statiska false som dagens checklista). Full checklista finns kvar
under Inställningar för den som vill.

## Vad som byggs (V1, återanvändning)

1. `components/tour/HemTur.tsx` — spotlight/placement-mekaniken LYFTS UR
   Step6LiveTour (TourTarget/SpotlightOverlay exporteras ur en delad
   modul; Step6 fortsätter använda dem). Gate: `welcome_tour_seen IS NULL`
   + localStorage-skydd. Monteras i JarvisHome.
2. Startkorten: `lib/onboarding/starter-cards.ts` — skapas vid
   onboarding-finalize; Karin-kortet byggs på befintliga
   `lib/onboarding/instant-value.ts`; typer registreras i action-contract
   (INFORMATIONAL + ev. ett EXECUTABLE för påminnelse-förberedelsen).
   Livstids-dedupe per konto.
3. "Kom igång"-railen: ny liten RailCard i JarvisHome, tre uppdrag med
   RIKTIG completion (ringtest: onboarding_data.test_call; möte:
   meeting_job finns; offert: quotes count; PWA: pushprenumeration
   finns). Döljs permanent när alla tre är klara eller vid avfärdande.
4. Småfixar i samma svep: WelcomeModals knapp navigerar till riktiga kön;
   LiveTourens fyra stopptexter uppdateras till nya ytnamnen;
   instant-value-rutten återanvänds av tur-stopp 2.
5. Step6LiveTour förkortas INTE i V1 (mocken har fortsatt värde som
   förhandsvisning) — men dess sista kort säger nu "Nu visar vi dig
   runt på riktigt" så turen känns som en fortsättning, inte en repris.

## Medvetet INTE i V1

Video/animationer, personaliserade turspår per bransch, Claude
Design-mockuprunda (görs som polish EFTER att flödet fungerar), ändringar
i onboardingens steg 1–5.

## Verifiering

tsc + build + facit (tur-stoppen mot riktiga rubriker — källskanning så
turen ruttnar synligt om en rubrik byts; startkortens dedupe; railens
completion-källor). Manuellt: nytt testkonto genom hela flödet — mäta att
första godkännandet sker inom 15 min utan instruktion utifrån.
