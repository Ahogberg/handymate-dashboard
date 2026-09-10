# Tre hela värderesor — lanseringskartläggning 2026-09-09

## Bedömningsregel

En resa är komplett först när alla fyra gemensamma krav är uppfyllda:

1. Kontext, objektkoppling, nästa steg och ansvar följer hela vägen.
2. Avbrott, nekad behörighet, dubbelklick, tappat svar och återförsök har säkra verifierade utfall.
3. Varje påstått resultat har en sparad kvittens; mottaget, skapat, skickat, levererat och betalt blandas inte ihop.
4. Andreas och Christopher klarar ett verkligt byggscenario utan utvecklarhjälp.

Kodprov är tekniskt bevis. Läsande produktionsklick bevisar bara det som redan är driftsatt. Varken ett mockat prov, en gammal deployment eller ett grönt PR ersätter kundprovet.

## 1. Företagsstart → första användbara resultat

| Övergång | Kundens handling | Handymates automation | Sparat resultat / kvittens | Status och kvarvarande brott |
|---|---|---|---|---|
| Konto → firma | Anger organisationsnummer och kontrollerar uppgifterna | `Step2Business` validerar numret och anropar `/api/onboarding/bolagsverket-lookup`; verifierade tomma fält fylls från Bolagsverket, manuella värden skrivs inte över | onboardingutkast + `business_config` via `/api/onboarding` | Byggt och kontraktstestat. Riktig providerträff i en ny onboarding är öppen. |
| Firma → arbetssätt | Väljer bransch, specialiteter, pris och arbetssätt | Matte-guiden visar bara vad de vanliga stegen faktiskt sparat | `onboarding_data`, pris- och jobbtypsinställningar | Nuvarande motor har återupptagning. Behörighets-/avbrottsprov finns i kod; kundprov öppet. |
| Historik → företagsbild | Väljer Fortnox/CSV eller fortsätter utan historik | Import och `company-scan` räknar verkliga poster och visar uttryckligen tomt läge | importerade kunder/fakturor + skanningsrader | Gmail/Outlook är inte en del av detta onboardingsteg. Gmail-kärnan är tekniskt förbättrad på PR36 men riktig OAuth-onboarding saknas. Microsoft är externt/produktmässigt öppet. |
| Aktivering → prisbibliotek | Kunden betalar och granskar jobbtyper/artiklar | Stripe verifieras server-side; jobbtypsstarten hämtas om från servern | betalstatus, produkt-/jobbtypsval | Ingen query-string får ensam påstå betalt. Riktigt Stripe-avbrott/kundprov öppet. |
| Färdig onboarding → första offert | Väljer ett verifierat offertupplägg | `completeFirstQuoteOnboarding` sparar val, finaliserar onboarding och navigerar först efter båda kvittenserna | `onboarding_completed_at` + intern URL med jobbtyp/mall; offertbyggaren verifierar om serverdata och skriver inte över påbörjat innehåll | Detta är nuvarande, säkra time-to-value-motor. Kundens första sparade offertutkast måste fortfarande klickprovas. |

### Matte-kandidatens identitet

- Gren: `feat/matte-onboarding-v3`
- SHA: `e33a8db58f18632f0d6edb50505f377baa87f2e5`
- Git-status mot main vid granskningen: 17 egna commits och 1 448 commits efter main; mergebas `6680f...`.
- GitHub visar en historisk lyckad Vercel-status för SHA:t, men bara en Vercel-projektlänk. Ingen aktuell, publik preview-URL kunde verifieras.
- Produktionens `/onboarding` omdirigerade det redan klara Nordström-kontot till `/dashboard`, vilket är rätt men inte ett test av ny onboarding.

Slutsats: v3-grenen är en designkälla, inte en säker lanseringskandidat. Den får inte mergas eller klickgodkännas som om den byggde på dagens motor. Portningen ska utgå från aktuell onboarding och ta över endast beslutad guidning. Dagens motor innehåller redan `MatteSetupGuide`, Bolagsverket, återupptagning, företagsskanning och första-offert-handoff; de delarna får inte tappas.

**Komplett-status:** 1/4. Kontext/sparad progression finns tekniskt. Ny Matte-yta på aktuell kod, riktig Bolagsverket-träff, första sparade offert och tvåpersoners kundprov återstår.

## 2. Förfrågan → underlag → offert → uppföljning → kundbeslut → projekt

| Övergång | Kundens handling | Handymates automation | Sparat resultat / kvittens | Status och kvarvarande brott |
|---|---|---|---|---|
| Portal → mottaget inflöde | Leverantör/kund skickar förfrågan | Portalen sparar original + idempotensnyckel lokalt före HTTP; servern tar beständig receipt före kund/lead/deal | intake receipt, kund, lead och deal i en transaktion; 202 betyder mottaget men inte klart | PR36 tekniskt verifierad i isolerad test-DB. Riktigt HTTP-/portalklick och andra inflödeskanaler är öppna. |
| Lead → underlag | Ägaren granskar kvalificering och saknade uppgifter | Daniel kan föreslå offertutkast; lead/deal/customer-ID bärs in i offertbyggaren | lead/deal + offertutkast | Vägen finns i kod. Verkligt scenario utan utvecklarhjälp är inte nattprovat. |
| Offert → väntar på beslut | Ägaren granskar och skickar | Skickad/öppnad offert hamnar i uppföljningskö; schemalagd uppföljning ska stanna vid svar/nej/signering | offertstatus, händelselogg, uppföljningskort | Läsande produktionsprov reproducerade att `/dashboard/quotes?status=sent` ignorerades och visade alla 16 offerter. Rättat på denna gren: URL-filtret styr nu arbetskön och flikvalet blir delbart. Provider-/heartbeatprov är öppet. |
| Kundaccept → projekt | Kunden signerar eller accept registreras internt | Gemensamma `finalizeAcceptedQuote` journalför projekt, vunnen deal och osäkert/bekräftat mejl; projektskapandet dedupliceras på offert | accepterad offert + `quote_acceptance_completion` + projekt-ID + vunnen deal | PR35 tekniskt verifierad. Produktion visade accepterad offert, e-signatur, händelselogg, tydlig handoff och länk till projekt. Det bevisar driftsatt äldre kod, inte PR35. |
| Projekt → ansvar | Ägaren kontrollerar bemanning/start | Offertsidan visar ”det här har hänt / nästa steg / när du behövs” | projekt med offert-, kund-, lead- och budgetkoppling | Synligt i Nordström-provet. Tvåpersoners kundprov och avbruten acceptåterhämtning är öppna. |

**Komplett-status:** 2/4 tekniskt nära. Objektkoppling och sparade resultat finns; avbrotts-/replayfacit är starkt i PR35/36. Riktig portal, uppföljningsprovider och tvåpersoners resa återstår.

## 3. Utfört jobb → rapport → ÄTA → fakturaunderlag → ekonomisystem

| Övergång | Kundens handling | Handymates automation | Sparat resultat / kvittens | Status och kvarvarande brott |
|---|---|---|---|---|
| Arbetsdag → rapportdelar | Medarbetaren beskriver tid, anteckning, material och ÄTA-förslag och godkänner del för del | `/api/matte/chat` skapar beständig `work_report_session`; varje del får deterministisk confirmation-ID och journalkvittens | rapportsession, delstatus, tids-/material-/anteckningsrad eller ÄTA-utkast | Webbmotorn har återupptagning. Mobil PR7 sparar textutkast lokalt. Tappat första chattsvar innan mobilen får report-ID måste fortfarande klick-/nätprovas. |
| Rapport → kunddokument | Ägaren granskar exakt mottagare, PDF och text | `prepareJobReport` läser tenant-skopat projekt/kund/brand/foton och förbereder utan skrivning eller utskick | versionsbundet dokument + separat approval | Tekniskt granskningskontrakt finns. Riktigt kundutskick är avsiktligt inte utfört. |
| ÄTA-förslag → kundgodkänd ÄTA | Ägaren granskar/skickar; kunden godkänner | ÄTA har egen livscykel, PDF/signering och får inte blandas ihop med intern jobbrapport | `project_change` med uttrycklig status/signatur | Produktion visade fyra ÄTA-rader med Skickad/Fakturerad samt länk till faktura. Inget skarpt beslut togs. Kundprov och tappad providerkvittens är öppna. |
| Projekt/offertrader/ÄTA → fakturautkast | Ägaren väljer ”Förbered faktura” eller godkänner projektavslut | `byggProjektFakturaUnderlag` komponerar en sanning: valda offertrader, rabatter och fakturerbar ÄTA; stoppar vid läsfel, saknad kund, tomt underlag eller befintlig faktura | fakturautkast + källmarkering; inget kundutskick | PR35 och tidigare kedjeprov är tekniskt gröna. Produktion visade ett klart projekt med 85 500 kr kvar enligt en yta men 2 017 kr ”redo/ofakturerat” enligt en annan; detta kräver ett verkligt scenario och gemensamt beloppsfacit. |
| Startsida → saknat underlag | Ägaren följer ”Pengar just nu” | `PengarBand` visar källor med belopp eller antal, aldrig uppfunna kronor | navigerbar granskningskö | Reproducerat kodfel: okänt belopp gav falskt ”Inget kräver uppmärksamhet”. Rättat på denna gren; okända belopp visas nu i antal utan `0 kr`. |
| Fakturautkast → Fortnox/kund | Ägaren granskar och väljer skicka | `sendInvoice` synkar till Fortnox först när anslutning finns; Fortnox-fel blockerar kundleverans; e-faktura och mejl/SMS skiljs | Fortnox-dokumentnummer/synkstatus + leveransresultat + fakturastatus | Inget providerprov kört. Produktionens gamla testfaktura innehöll offertformuleringar i intro/avslut; det kan vara legacydata och är inte bevisat som dagens generatorfel, men måste ingå i kundprovet. |

**Komplett-status:** 1/4 kundmässigt. Källkomposition och flera replay-/tenantgrindar är tekniskt starka, men det sammanhängande mobil→rapport→ÄTA→faktura→Fortnox-provet, beloppspariteten och tvåpersoners kundprov är öppna.

## Prioriterad nästa arbetsordning

1. Låt CI/preview verifiera denna grens två användarnära rättningar och klicka om `?status=sent` på preview.
2. Porta beslutad Matte-guidning till aktuell onboardingmotor; skapa inte från den 1 448 commits gamla grenen. Identifiera en aktuell preview innan klickprovet.
3. Kör ny firma → Bolagsverket → jobbtyp → sparat första offertutkast med kontrollerade avbrott.
4. Kör portal → offert → kundaccept → projekt med två testidentiteter; prova tappat svar och uppföljningsstopp.
5. Kör samma projekt från mobilrapport till godkänd ÄTA och fakturaförhandsvisning; jämför varje belopp mellan projekt, underlag och faktura.
6. Utför Fortnox-/mejl-/telefonprov separat med verifierade testmottagare. Skickat är inte levererat och levererat är inte betalt.

