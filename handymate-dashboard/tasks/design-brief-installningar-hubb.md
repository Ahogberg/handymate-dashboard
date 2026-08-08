# Designbrief till Claude Design — Inställningshubben

*Skriven 2026-08-07. Klistra in avsnittet "Prompten" i Claude Design.
Resten är underlag för oss.*

---

## Prompten

> Du har tillgång till Handymate-repot. Jag vill ha en **omdesign av
> Inställningar** — en yta som vuxit okontrollerat och nu är produktens
> svåraste sida att förstå.
>
> ### Vad som är fel i dag
>
> `app/dashboard/settings/page.tsx` är **4 826 rader** och renderar 27 menyval
> i fyra grupper, plus 23 egna underrutter. Vissa val är flikar inuti sidan,
> andra navigerar till en egen sida — och skillnaden syns inte för användaren.
>
> Fyra funktioner har **två gränssnitt samtidigt**: Telefoni, Prenumeration,
> Integrationer och Intern timkostnad finns både som inbyggd flik och som
> separat sida. De kan utvecklas åt olika håll, och gör det redan —
> Integrationer-sidan använder det nya Fortnox-rutträdet medan den inbyggda
> fliken har kvar gamla anrop.
>
> **Elva sidor är inte länkade från hubben alls.** `email-templates` är länkad
> från noll ställen i hela appen. `billing`, `knowledge`, `products`,
> `my-prices`, `reservations`, `form-templates` och de separata
> `integrations`/`phone`-sidorna nås bara via kontextlänkar någon annanstans.
>
> **Läs `docs/HANDYMATE_DESIGN_SYSTEM.md` först.** Ljust tema, teal `#0F766E`
> som primärfärg — aldrig mörkt, aldrig lila. All text på svenska, inga
> tekniska termer.
>
> ### Den bärande principen
>
> **Kundens mentala modell, inte vår datamodell.**
>
> Skillnaden mellan "Företag" och "Bolagsprofil" är intern arkitektur —
> hantverkaren tänker bara "mina företagsuppgifter". Skillnaden mellan
> "Prislista", "Prisstruktur" och "Produkter & priser" betyder ingenting för
> honom. Designen ska gruppera efter *vad han försöker göra*, inte efter var
> data råkar ligga.
>
> Andra principen: **han sitter på ett tak med telefonen i handen.** Fram till
> i dag var hela offertkonfigurationen omöjlig att nå på mobil — menyn slängde
> tyst bort varje post som navigerade till en egen sida. Det är lagat, men
> lagningen är funktionell, inte designad. **Den responsiva formen är din
> uppgift.** Bygg inte horisontella flikchips igen; de var orsaken till buggen.
>
> ### Målstrukturen — sex områden
>
> Varje område ska ha **2–4 tydliga kort eller undersektioner**. Inte en ny lång
> lista med 26 länkar. Det som är sällan använt eller tekniskt läggs ett steg
> längre in, under "Avancerat".
>
> Här är **hela** innehållet, mappat mot verkliga rutter. Ingenting utanför den
> här listan finns:
>
> **1. Företag**
> Företagsuppgifter · Bolagsprofil (bolagsform, momsperiod, räkenskapsår —
> endast ägare/admin) · Logotyp · Öppettider
>
> **2. Kundkontakt**
> Telefoni (`settings/phone` är sanningskällan, den inbyggda fliken avvecklas) ·
> Samtalsinställningar · SMS · E-postmallar (`settings/email-templates` — i dag
> helt oåtkomlig) · Recensionsförfrågningar
>
> **3. Offerter & fakturor**
> Dokumentstil · Offertmallar · Standardtexter · Förbehåll · Offertkategorier ·
> Formulärmallar · Produkter & priser · Mina priser · Prisstruktur ·
> Fakturainställningar
>
> **4. Arbete & ekonomi**
> Tidrapportering · Intern timkostnad (slås ihop med Ekonomi — de skriver
> delvis samma företagsvärde) · Marginalmål · Jobbtyper · Serviceavtal ·
> Reservationer
>
> **5. Automatisering**
> Så ska Handymate arbeta (AI-assistent + Autopilot + Preferenser slås ihop) ·
> Kunskap & jobbstil · Godkännanden · Försäljningsflöde (hette "Pipeline") ·
> Var kunderna kommer från (hette "Lead-källor") · Automationer
>
> **6. Anslutningar & konto**
> Google · Outlook · Fortnox (`settings/integrations` är sanningskällan) ·
> Abonnemang & fakturering (`settings/billing` är sanningskällan, inte den
> inbyggda prenumerationsfliken) · Användning · Betalningshistorik
>
> ### Två saker om innehållet
>
> **Preferensvyn ska inte tas bort, men inte heller visas rå.** Den innehåller
> nycklar som `min_job_value_sek`. Det är ägarens enda väg att rätta vad agenten
> lärt sig om företaget — översätt till svensk klartext, ta inte bort funktionen.
>
> **Fyra sammanslagningar där två gränssnitt blir ett.** Telefoni, Integrationer,
> Prenumeration och Intern timkostnad: den separata sidan vinner i samtliga fall,
> den inbyggda fliken avvecklas som navigationsyta. Designen ska visa hur den
> kvarvarande sidan tar emot det som fanns i fliken — för Telefoni betyder det
> att installationsguiden blir kvar och de vardagliga inställningarna hamnar
> ovanför den.
>
> ### Vad som INTE ska finnas med
>
> Följande är lanseringsdolt och ska inte ritas: Fordon, Lager & Material,
> Grossistprislista, Materialbeställningar, Underleverantörer, Systemhälsa,
> AI på hemsidan, Min hemsida. Koden finns kvar men kunden ska inte kunna
> hitta dem. Se `lib/launch-visibility.ts`.
>
> ### Vad jag vill ha
>
> Fungerande HTML-mockup, självbärande, i två tillstånd:
>
> 1. **Hubben** — de sex områdena som landningsvy, desktop och mobil
> 2. **Ett område öppnat** — visa "Offerter & fakturor", det tyngsta, med sina
>    kort och med "Avancerat" i hopfällt läge
>
> Mobilvyn är inte en efterhandsanpassning. Rita den först om du vill — det är
> där problemet var värst. Varje inställning ska gå att nå med tummen, och det
> ska synas om ett val leder vidare till en egen sida eller öppnas på plats.

---

## Underlag (inte till Design)

### Varför just nu

Etapp 1 är byggd och committad (`e7cfcae5`): lanseringsdöljning med egen axel
skild från abonnemangsgrinden, routegrind i middleware, och mobilbristen lagad
funktionellt. Etapp 2 är omstruktureringen — och den är ett designbeslut, inte
ett byggbeslut, därför den här briefen.

### Mobilbristen som motiverar tonläget

`app/dashboard/settings/page.tsx:1421` filtrerade bort varje post vars id började
med `_link_`. Konsekvens före lagningen:

| Grupp | Oåtkomligt på mobil |
|---|---|
| Försäljning | **6 av 6** |
| Drift | 7 av 10 |
| Företag | Bolagsprofil |

Lagningen renderar dem som länkar, precis som desktopmenyn redan gjorde. Det
löser åtkomsten men inte formen — flikremsan är fortfarande fel svar på 27 val.

### De elva som inte är länkade från hubben

`billing` · `email-templates` (noll länkar i hela appen) · `form-templates` ·
`integrations` · `knowledge` · `my-prices` · `phone` · `products` ·
`reservations` · `system-health` · `website-widget`

De två sista ska förbli oåtkomliga. De övriga nio ska in i den nya strukturen —
det är en av de starkaste anledningarna till att göra om hubben alls.

### Risk att bära in i bygget

`CompanySettings` i `handymate-mobile/components/SettingsModals.tsx:125` skriver
företagsnamn, orgnummer, adress och telefon till **samma `business_config`-fält**
som Företag/Bolagsprofil. Slår vi ihop sidorna får fältmängden och valideringen
inte ändras utan att appens modal tas med — annars finns två skrivare med olika
bild av samma rad. Etapp 2 rör därför bara presentation och navigation.
