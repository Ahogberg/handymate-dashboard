# Onboarding: startpaket och fungerande kundintag

2026-09-11 · Design- och implementationsunderlag, inte levererad runtimefunktion

## Beslut och avgränsning

Behåll onboardingens befintliga steg. Förbättra jobbtypsvalet och kopplingen till artikelregister/offertmall; lägg frågan om huvudsakligt kundintag i befintligt kontaktsteg. Ingen ny onboardingmotor eller parallell prissättning. Elektrikerpaketet nedan är förebild för övriga branscher och ska granskas före produktimplementation.

Välj gärna 3–5 jobbtyper; minst en räcker för en specialist. Egna jobbtyper och tillägg från andra branscher behålls. Förslagen är redaktionella startpaket, inte statistik över de vanligaste arbetena eller tekniska installationsanvisningar.

## Arbete måste finnas i varje jobbupplägg

Varje jobbtyp ska uttryckligen beskriva hur arbetet prissätts. En separat timrad är inte alltid rätt.

| Upplägg | Offertens arbetskostnad | Regel |
|---|---|---|
| Löpande | Arbetsartikel med enhet tim och företagets pris | Timmar anges för det aktuella jobbet; paketet hittar inte på mängden. |
| Fastpris | Arbetskostnad ingår i tydligt beskriven paketartikel eller separat fast arbetspris | Lägg inte samtidigt på ordinarie arbetstimmar för samma omfattning. |
| Blandat | Fast definierad omfattning och separata, avgränsade tillägg | Extra timmar får bara avse arbete utanför den fasta omfattningen. |
| Ej bestämt | Arbetsartikel föreslagen, pris saknas | Visa ofullständigt upplägg. Ingen falsk nollkostnad. |

Första release: gör timbaserade standardrader fullt användbara genom befintliga artikelkopplingar. Fastpris väljs bara genom ett uttryckligt granskat upplägg som befintlig prissättning klarar. Lägg inte in en ny dold flagga som prismotorn saknar stöd för. ROT-underlag och fördelning av arbete/material måste valideras separat innan sådana paket används i ROT-flödet.

## Fyra ytor inom befintliga steg

### A. Vilka jobb gör ni oftast?

Visa branschens fem starttyper med namn och kort omfattning. Text: ”Välj gärna 3–5 att börja med. Du kan lägga till fler senare.” Behåll Visa fler, Lägg till egen och val från andra branscher. Varken nytt branschval eller ny katalogversion får skriva över tidigare kundval.

### B. Förbered offertupplägget

En rad per vald jobbtyp:

| Jobbtyp | Arbete | Artiklar | Nästa handling |
|---|---|---|---|
| Service och felsökning | Gemensamt timpris, ej bekräftat | 1 arbetsartikel + valbara tillägg | Granska upplägget |
| El vid renovering | Samma arbetsartikel | Välj relevanta materialartiklar | Granska upplägget |
| Laddbox | Välj löpande eller eget fastpris | Välj specifik produkt | Granska upplägget |

Detta är exempel på ofullständiga lägen, inte förifyllda kundbeslut. Inget kopieras från hela branschkatalogen utan urval.

### C. Era artiklar och priser

Visa befintlig matchad artikel först, annars ett förslag som kunden kan lägga till. En arbetsartikel kan återanvändas av flera jobbtyper. Kunden kan ändra benämning, enhet och pris samt skapa egen artikel med befintlig editor. Befintliga import-/biblioteksfunktioner behålls.

Prisordning enligt befintlig onboarding: jobbtypens kopplade arbetsartikel → uttryckligen valt standardtimpris → fråga kunden om pris saknas. Material följer befintlig artikel-/påslagslogik, utan ytterligare påslag i mallpaketet. Inga generella branschpriser aktiveras tyst.

### D. Så börjar nästa offert

Visa en förhandsvisning av en vald jobbtyp och skilj källorna åt:

- Arbete: företagets bekräftade arbetsartikel och pris.
- Omfattning och mängd: måste komma från den aktuella förfrågan eller användaren.
- Material: valda artikelreferenser, med saknade specifikationer synliga.
- Tillval: separata, inte automatiskt medräknade.
- Saknas: konkret lista över uppgifter som behöver kompletteras.

En sparad mall är inte en färdigprissatt offert. Kunden ska kunna fortsätta onboardingen med ofullständigt upplägg och få rätt nästa steg; agenten får då förbereda ett ofullständigt utkast men inte låtsas att priset är klart.

## Elektrikerpaket v1

### Gemensamma artikelroller

Benämningarna nedan är förslag. Identifierare är dokumentets referenser, inte nya produkt-ID:n eller artiklar som redan finns i databasen.

| Referens | Föreslagen artikel | Enhet | Införande |
|---|---|---|---|
| A1 | Elektrikerarbete | tim | Gemensam arbetsartikel; befintlig artikel återanvänds efter verifierad koppling. |
| A2 | Servicebesök/startavgift | st | Valfri. Kunden måste ange vad avgiften täcker och om någon arbetstid ingår. |
| A3 | Resa/servicebil | kundens val | Valfri; enhet och pris bekräftas. Ingen automatisk kombination av flera reseavgifter. |
| M | Material ur företagets register | artikelns enhet | Välj specifik produkt. Ett generellt ord som ”kabel” räcker inte för säkert produktval. |
| P | Eget fastprispaket | st | Valfritt granskat alternativ till timbaserad omfattning; inte ett automatiskt tillägg. |

### 1. Service och felsökning

Omfattar mindre serviceuppdrag och felsökning. Exempel som ”byta uttag” hör hemma här som moment/variant, inte som obligatoriska toppnivåval.

- Grund: A1. Antal timmar saknas tills uppdraget bedömts.
- Valbart: A2, A3 och valda komponenter ur M.
- Agenten behöver veta: kundens problem, omfattning, adress och eventuellt identifierat material.
- Gräns: kombinera inte startavgiftens inkluderade tid med samma debiterade timmar. Felsökning innebär inte ett löfte om att felet kan avhjälpas till ett förutbestämt totalpris.

### 2. El vid renovering

Omfattar elarbete i befintligt kök, badrum eller rum. Nybyggnation och industri visas som fler val, inte inblandade i standardpaketet.

- Grund: A1.
- Valbart material: specificerade uttag, strömbrytare, kabel och installationsmaterial.
- Agenten behöver veta: berörda rum, antal punkter, befintligt underlag och vad som ingår i beställningen.
- Gräns: inga standardantal per rum. Rivning, återställning och andra yrkesgrupper måste avgränsas uttryckligen.

### 3. Elcentral och elsäkerhet

Återkommande offertstruktur för arbete kring elcentral och kontroll. Kunden kan döpa om till exempelvis ”Elcentral” om det bättre beskriver verksamheten.

- Grund: A1 eller P efter uttryckligt val.
- Valbart material: specificerad central, skyddsapparater och andra valda komponenter.
- Agenten behöver veta: befintlig anläggning, efterfrågad omfattning och underlag för produktval.
- Gräns: kontrollmomenten här är offertunderlag, inte tekniskt facit, godkänd säkerhetskontroll eller intyg om behörighet.

### 4. Laddbox

Egen jobbtyp eftersom kunden kan ha ett återanvändbart installationspaket.

- Grund: A1 eller kundens P, aldrig båda för samma arbete.
- Valbart material: specificerad laddbox, lastbalansering, kabel och övriga komponenter enligt uppdraget.
- Agenten behöver veta: vald utrustning, plats, förutsättningar och paketets inkluderade omfattning.
- Gräns: produktmodell, kabelmängd, markarbete och tekniska dimensioner får inte gissas. Skatteavdrag ska inte härledas från jobbtypens namn.

### 5. Belysning

Omfattar installation eller byte av belysning. Kunden väljer om inomhus/utomhus behöver egna varianter.

- Grund: A1.
- Valbart material: specificerade armaturer, drivdon, styrning och installationsmaterial.
- Agenten behöver veta: antal, placering, kundens egen utrustning och åtkomlighet.
- Gräns: kundägt material får inte samtidigt läggas till som såld produkt. Befintlig produkt/enhet måste matcha mallen.

## Övriga branscher: första redaktionella urvalet

| Bransch | Fem förslag |
|---|---|
| VVS | Service och reparation; Badrum; Kök och vatteninstallationer; Värmeinstallation; Avlopp |
| Bygg/snickeri | Invändig renovering; Köksrenovering; Altan och utebyggnation; Fönster och dörrar; Tillbyggnad |
| Måleri | Invändig målning; Fasadmålning; Snickerimålning; Tapetsering; Underhållsmålning |
| Tak/plåt | Takomläggning; Takservice och reparation; Takavvattning; Takfönster; Byggnadsplåtslageri |
| Mark/anläggning | Markförberedelse; Dränering och dagvatten; Stenläggning och uppfart; Grundarbete; Utomhusmiljö |
| Totalentreprenad | Bostadsrenovering; Badrum; Kök; Tillbyggnad; Nybyggnation |
| Övrigt | Egna jobbtyper först, med exempel och samma artikel-/prissättningsstruktur. |

Varje paket behöver samma granskning som elektrikerpaketet: omfattning, arbetskostnad, möjliga materialartiklar, nödvändiga frågor och risk för dubblering. Namnöverlapp som ”Underhållsmålning” måste prövas med en branschperson; detta är inte en låst katalog för samtliga företag.

## Frågan om kundintag

Text: ”Var kommer flest nya kundförfrågningar in?” Alternativ: Telefon, E-post, Hemsida/formulär, Annat eller vet inte. E-postvalet följs av vilken lösning kunden använder. Alternativ som rekommendationer/sociala medier kan beskriva kundens ursprung utan att innebära att den plattformen är integrerad; fråga vid behov hur själva förfrågan når företaget.

Svaret prioriterar befintlig aktiveringshjälp. Det aktiverar ingen integration i sig och ändrar inte agenternas mandat. Tillåt ”Gör senare” med synlig konsekvens och ett kvarvarande nästa steg.

## Integrationsaudit mot lokal kod 2026-09-11

Endast kodstatus, inga externa flöden har körts i detta arbete.

| Kanal | Observerat | Lanseringsregel och konkret gate |
|---|---|---|
| Bolagsverket | Klient och org.nr-steg finns. Klienten dokumenterar antagna schemafält. | Verifiera officiellt aktuellt gratiserbjudande, behörighet, schema och ett verkligt svar. Manuell fortsättning ska fungera. |
| Telefon | Step4PhoneNumber har nummerkedja och test-call arm/status. | Nummer tilldelat ≠ samtal mottaget ≠ transkription klar ≠ lead skapad. Prova delarna; även SMS separat. |
| E-post vidarebefordran | email-lead-API, inkommande adress och kanalhälsa finns. | Visa aktivt mottagande först när ett provmejl kommit fram till rätt företag. Svar/avsändare behöver eget prov; vidarebefordran bevisar inte full brevlådesynk. |
| Google Kalender | /api/google/connect och callback finns. Callback återgår till inställningarna. | Kontrollera scopes, konto, tokenförnyelse och faktisk kalenderläsning. Gör säker återgång till befintligt onboardingsteg före införande där. |
| Gmail | Import-/bearbetningskod finns, men Google-callback sätter gmail_scope_granted och gmail_send_scope_granted till false; kommentaren säger att bara kalenderscope begärs. | Får inte presenteras som fungerande mejlkoppling via nuvarande Google-knapp. Eget färdigt auktoriserings-/verifieringsflöde krävs. |
| Microsoft/Outlook | Ingen motsvarande connect/callback hittad i genomsökta lib/app/api-delar. Outlook nämns i inställningstext. | Visa inte aktiv ”Koppla Outlook”-knapp innan implementation och prov. Vidarebefordran kan erbjudas tydligt som eget begränsat alternativ. |
| Webbintag | channel-health stödjer widget/formulär och verifierad lead/affär. | Installerad/laddad widget ≠ mottagen förfrågan. Prova inskick till rätt företag. |
| Fortnox | Separat connect/callback och onboardingimport finns. Demo har egen simulering. | Verklig anslutning och avgränsat importprov; demo är inte providerbevis. Full faktura-/betalningskedja är separat. |

Återanvänd channel-healths nivåer: inte aktiverad → aktiverad men oprövad → kanal verifierad → lead och affär verifierade. Komplettera med synliga fel/utgången anslutning där befintlig status ger stöd. Håll verifieringen knuten till aktuell anslutning, inte bara ett gammalt prov.

## Implementation efter designgranskning

1. Revidera nya katalogförslag i `lib/job-type-catalog.ts`; behåll befintliga kunders namn, sluggar, mallar och artikelkopplingar.
2. Anpassa urvalet i `Step3HowYouWork` utan fler huvudsteg. Behåll egna val och tillägg från andra branscher.
3. Paketera valt startunderlag i befintliga `StepProductRegister`, `JobTypeQuoteSetup`, job-standard-/quote-setup-API:er och produkteditor. Offertmallar och jobbtypsupplägg ska sakna antalstak enligt användarens korrigering 2026-09-11; 3–5 är endast en rekommendation.
4. Inför explicit artikelurval och idempotent återanvändning, aldrig okontrollerad mass-seedning eller matchning enbart på liknande namn. Ingen ny prismotor.
5. Lägg kundintagsfrågan i befintligt kontaktsteg. Verifiera hur svaret ska sparas i befintligt schema före bygge; skapa inte en separat kanalmodell.
6. Koppla endast de integrationsvägar som har fungerande återgång och status. Gmail/Outlook ska inte framställas som färdiga genom designen.

## Acceptans för första paketet

- Fem starttyper kan visas, 3–5 rekommenderas, en eller egen typ tillåts.
- Alla valda jobbtyper har uttrycklig arbetsprissättning eller synlig lucka.
- Befintliga artiklar/priser återanvänds utan dubbletter eller överskrivning.
- Fastpris och inkluderad tid kan inte dubbelräknas genom mallvalet.
- Saknat pris, produkt eller fel enhet ger ett begripligt stopp/granskningsbehov.
- Verkliga mängder och omfattning hämtas från jobbet, inte från obekräftad exempelmall.
- Förhandsvisningen visar källa och vad som saknas; utskick kräver befintlig granskning.
- Integrationsknapp, avbruten anslutning, nekad åtkomst, återkomst och utgången koppling har korrekt nästa steg.
- Företagsgräns, behörighet och återupptagen onboarding bevaras.

## Källor i repot

`lib/job-type-catalog.ts`, `app/onboarding/components/Step3HowYouWork.tsx`, `app/onboarding/components/StepProductRegister.tsx`, `lib/onboarding/pricing-start.ts`, `lib/quotes/job-type-setup.ts`, `lib/quotes/job-type-start.ts`, `lib/quotes/job-standard-server.ts`, `lib/onboarding/channel-health.ts`, `app/api/google/connect/route.ts`, `app/api/google/callback/route.ts`, `lib/bolagsverket/client.ts`.

Detta dokument ska följa med Claude Design-briefen. Det ändrar inte appen och uppgraderar ingen integrationsstatus till verifierad.

## Förberedelser för Gmail och Microsoft 365

Se [implementations- och lanseringsplan](../runbooks/MAIL_INTEGRATIONS_PREPARATION.md), [verifieringsunderlag](../runbooks/MAIL_PROVIDER_VERIFICATION.md) och [acceptansprotokoll](../runbooks/MAIL_INTEGRATIONS_ACCEPTANCE.md). Underlagen är förberedda 2026-09-11; integrationerna är inte aktiverade eller liveverifierade genom dokumentleveransen.

## Implementationsuppdatering

Se [branschpaket och onboarding](BRANSCHPAKET_ONBOARDING_LAUNCH.md) för genomfört kodpaket för samtliga sju namngivna branscher, kundkanal och borttagna malltak. Befintliga kundval bevaras. Underhållsmålning har ersatts av Trapphus och gemensamma utrymmen i måleriets starturval.
