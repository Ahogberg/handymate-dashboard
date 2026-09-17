# Det bästa offertflödet — research och målbild

Skrivet 2026-09-17 på Andreas begäran: "kan vi inte göra lite research på hur de allra
bästa produkterna för just offertskapande gör?" Underlag för att bygga offertflödet en
gång ordentligt, med två vägar in, desktop och i synnerhet mobil. Bygger på fyra
marknadsgenomgångar (Norden, USA, UK/Australien, frågestyrd/AI-estimering) och en
kartläggning av er egen kod från offert till faktura.

**Metodnot.** Miljöns nätverksproxy blockerade fulltextläsning av hjälpcenter och
recensionssajter, och sökbudgeten var begränsad. Fakta nedan kommer från
sökmotorutdrag ur primärkällor (hjälpartiklar, release notes, recensioner) med URL
per påstående i de fyra delrapporterna. Joist och Workiz är tunt täckta. Inga
siffror nedan är påhittade, men leverantörernas egna siffror är just det.

## Huvudfynd i fem punkter

1. **Ingen gör hela kedjan, men delar av den finns.** Frågestyrd offertering per
   jobbtyp, där svaren sätter mängder på FLERA artikelrader i samma offert, hittades
   inte hos någon av de 25 produkter vi tittade på. Att kalla det "ingen gör det ni
   bygger" är dock för starkt (rättat 2026-09-17): måttstyrd prissättning är etablerad.
   Närmast är Housecall Pros mätformulär (ett radpris ur längd × bredd),
   ServiceTitans "configurable services" (välj variant, priset följer) och Bolsters
   assemblies (formler mot dimensioner, desktop, byggentreprenad). Det är en lucka i
   marknaden, inte ett bevisat mönster. Det betyder både chans och risk.
2. **Kit finns överallt, men som fasta rader utan drivare.** Tradify Kits, Fergus
   Favourites, simPRO Pre-builds, ServiceM8 Bundles, Fortnox paketartiklar: en samling
   material och timmar med fasta mängder. Skalning sker bara genom kit-antalet. Er
   koppling svar → enhet → mängd är steget ingen tagit.
3. **Kundens val på offertsidan är det som bevisat höjer snittet.** Jobbers tillval
   med live-summa, Bolsters "upgrades, options, selections" (leverantörens siffra:
   15 % större jobb, 20 % högre avslut), ServiceTitans bra/bättre/bäst ur
   "upgrade"-relationer i prisboken. Houzz 2026 (över 20 000 husägare): 37 %
   överskred budgeten, vanligaste orsaken var dyrare materialval än planerat. Prissatta
   uppgraderingar ska visas innan beslutet. Ni har tillvalsrader och live-total på
   kundsidan redan. Ingen kombinerar nivå + tillval + live-pris i samma vy.
4. **AI är utkast åt proffset, aldrig kundens konfigurator.** Handoff, Jobber AI,
   Tradify SmartWrite, Fergus röst (lanserat 13 sep 2026), Commusoft AI:den. Alla ger
   rader från text, foto eller röst och lämnar pris och marginal till hantverkaren.
   Handoffs sämsta recension: 8 dörrar målade för 7 500 dollar, "customers would laugh
   at". Er princip "gissat pris märks, aldrig tyst" är rätt.
5. **Prisboken är den största smärtan hos de stora.** ServiceTitan: 42 % har inte
   prisboken klar efter tre månader. Housecall Pro: enkelriktad synk prisbok → mall.
   Jobber: mallar och textrader kan bara skapas på webben. Bolster: "roofing and
   bathroom templates never got finished". Seedade upplägg per bransch med firmans
   egna priser är er största fördel, och den faller om jobbtypens upplägg inte är
   klart när frågorna ställs.

## Vad de bästa gör, mekanik för mekanik

### Starten
- Alla börjar med **kund först, sedan rader** (Bygglet, Fortnox, Jobber, Housecall Pro,
  Tradify, Workiz). ServiceTitan är undantaget: offerten hänger på ett pågående jobb
  och första inmatningen är namn + sammanfattning. Ingen börjar med jobbtyp. Er start
  med jobbtyp först är ovanlig och rätt för ert mål, men kunden måste kunna vara
  frivillig tills skicka, som i dag.
- Bygglet frågar även efter referens och projektadress direkt i starten. Adressen
  följer med hela vägen. Ni har adress på offerten men ingen adresskolumn på projekt.
- Mobilappen är ofta "andra klassens editor": Jobber och Housecall Pro bygger mallar
  bara på webben, Fortnox och Visma skapar inte offert i appen alls. Full mobilparitet
  är en tydlig differentiering.

### Rader, kit och prisbok
- Radtyper som återkommer: arbete (timpris × timmar, egen typ), material, paket,
  fritext. Arbete separat från material överallt. Ni har det (tredelning per rad).
- Två presentationslägen för kit: "en rad, dold sammansättning" (simPRO pre-build,
  ServiceM8 bundle) och "exploderad till rader" (Tradify vid överföring, Fergus
  favourite). Ni har båda: komponentrader under en artikel, och upplägg som rader.
- ServiceTitan Configurable Services: hantverkaren väljer variant av material inne i
  en tjänst, priset ändras, vald variant skrivs in i beskrivningen. Det är exakt
  formen på "koppla artiklar redan i frågeflödet" som Andreas beskriver.
- Grossistprisfiler finns bara i de tunga nordiska (Hantverksdata, Bygglet, delvis
  Fieldly). AI-nykomlingarna saknar dem helt.

### Mängd ur svar
- Bolster: dimensioner (golvyta, väggyta, omkrets, takhöjd) ritas eller skrivs en gång,
  varje artikel har en mängdformel mot dimensionerna, allt räknas om när ett mått ändras.
- Hover: åtta guidade foton runt huset ger mått, mallar per jobbtyp omvandlar mått till
  materiallista som kan beställas.
- ResponsiBid: "specs" per tjänst är frågor kunden svarar på webben, direkt knutna till
  prisregler, och verktyget bygger tre paket automatiskt.
- Målningskalkylatorer: väggyta = omkrets × höjd, minus 20 sq ft per dörr och 15 per
  fönster. Formlerna är enkla och publika.
- Housecall Pro Pricing Forms: längd × bredd × höjd ger kvadratmeter, som ger ett
  radpris. Bara en rad per formulär.

### Kundens val
- Jobber: valfria rader med kryssruta, förvalda eller inte, summan och
  procentdepositionen uppdateras live, avvalda rader försvinner ur jobbet.
- Housecall Pro: flera "options" i samma offert, kunden godkänner en, resten avböjs
  automatiskt. Side-by-side "good, better, best" i Sales Proposal Tool.
- ServiceTitan: "upgrade"-relationer i prisboken genererar bättre/bäst automatiskt.
  Tekniker markerar rekommenderat i presentationsläge på plattan.
- PandaDoc och Qwilr: sektioner med "välj exakt en", valfria rader, antal inom ett
  intervall, allt låses vid signering. Klagomål: valfria rader kan inte göras
  obligatoriska. Konfiguratorer behöver regler (min/max, välj en, förvalt).
- Tradify: en sektion markeras valbar, kunden bockar och får ny total vid accept.

### Kundsidan
- E-signatur + deposition i samma steg är normen (Jobber "Approve & Pay Deposit",
  Housecall Pro, ServiceTitan, Payaca via Stripe, Fergus 50 % default).
- Bygglet är den enda etablerade nordiska som låter **kunden fylla i ROT-uppgifter
  själv** i godkännandesteget. Ni gör det också.
- BankID hos Hantverksdata, SmartCraft Spark, Trygg Offert och de svenska
  AI-nykomlingarna. Byggahus-tråden: kunder är skeptiska till okända
  signeringstjänster och vill att båda parter signerar.
- Nästan ingen låter kunden ställa en fråga i offerten (bara YourTradebase) eller
  välja startdatum vid godkännande (ingen). Ni har båda.

### Från offert till faktura
- Deposition följer automatiskt med till fakturan hos alla tre amerikanska.
- Betalplan som procent eller fasta belopp finns hos Jobber, Tradify, Fergus, simPRO.
  Jobbers begränsning: måste sättas i offertstadiet. Ni har betalplanen på offerten
  men ingen kod som gör den till delfakturor.
- Offert och jobb frikopplas efter konvertering (Jobber, Housecall Pro). Ni har i
  stället referensmodell: projektet läser alltid aktuell offert. Det är bättre men
  olåst, en offert som redigeras efter signering ändrar projektets underlag.
- ÄTA finns bara i de tunga (Fergus variations, simPRO linked variation quotes,
  Bygglet). Ni har ÄTA med egen livscykel och fakturering.

### AI och visualisering
- Foto → offert finns inte på riktigt hos någon etablerad. Tradify SmartRead läser
  leverantörsfakturor. Hover mäter husets utsida.
- Röst → offert: Fergus (pressrelease), KlarOffert, OffertDirekt, Bliqat (svenska
  nykomlingar 2025–26). Ni har röst → text sedan länge.
- Visualisering och pris är frikopplade nästan överallt. Undantag där bild och pris
  hänger ihop: Hover (riktiga produkter i 3D-modellen) och Kaboodle (stycklista live).
  Disclaimers är korta: "Colors may vary with lighting, surfaces and screen settings."
  Kostnad per bild 1–8 krediter, alltid visad före generering.

## Det ingen gör bra, och som ni kan göra

| Lucka | Vem är närmast | Vad ni har | Vad som saknas |
|---|---|---|---|
| Frågor per jobbtyp som sätter mängder | Bolster (desktop), ResponsiBid (kund, webb) | Byggt i dag | Artiklar valbara i frågan, kundsvar före besök |
| Nivå + tillval + live-pris i samma kundvy | Jobber (tillval), ST/HCP (nivåer) | Tillval med live-total | Nivåer (varianter per jobbtyp), regler min/max |
| Kunden frågar och bokar på offertsidan | YourTradebase (fråga) | Båda | Inget |
| ÄTA för småföretag | Fergus, simPRO | ÄTA-livscykel | Kunden godkänner delta på samma sida |
| Full mobilparitet | Tradify, Fergus Go | Editor på mobil | Efter rivningen: en editor, inte två |
| Seedade upplägg per bransch med egna priser | ServiceTitan Smart Start | Mallbank + jobbtyper | Kopplingen mall ↔ jobbtyp för alla seedade |
| Rader som följer med hela vägen | Ingen | Rader → faktura med tredelning | Betalplan → delfakturor; skillnaden dold-för-kund / ej-vald / ska-ej-faktureras |

## Var ni står: från offert till faktura i dag

Kartläggningen av koden visar att kärnan är starkare än hos de flesta konkurrenter
(en väg in i offerter, tredelning per rad, ROT-bas per rad, ett projekt per offert,
Fortnox med husarbete). Men femton luckor hittades. De som rör målbilden:

| Lucka | Bevis | Konsekvens för hantverkaren |
|---|---|---|
| Betalplan blir aldrig delfakturor | `quotes.payment_plan` läses bara av PDF; `InvoiceType 'partial'` finns oanvänd | Skriver delfakturor för hand trots att planen står i offerten |
| Jobbtyp når inte projektet via "Skapa projekt"-knappen | `POST /api/projects` tar bara jobbtyp från affären, aldrig från offerten | Projekt utan jobbtyp får inga lärdomar och ingen efterkalkyl per jobbtyp |
| Jobbtyp når aldrig fakturan | 0 träffar på `job_type` i fakturakoden | Ingen lönsamhet per jobbtyp på fakturanivå |
| Svaren från frågeflödet dör med offerten | `intake_answers` har ingen läsare i projekt eller faktura | Projektet vet inte att kunden sa "6,5 m² och golvvärme" |
| Dolda rader faktureras | Mapparen filtrerar tillval men läser aldrig `is_hidden` | Offert och faktura kan visa olika radlistor |
| ÄTA-rader tappar tredelningen | ÄTA-rader byggs utan `labor_amount` | ROT-basen för ÄTA räknas på hela beloppet |
| Två projektskapare divergerar | Knappen ärver affär, auto-vägen ärver lead, en tredje i AI-motorn | Samma offert ger olika projekt beroende på väg |
| Fortnox-offertsynken är död kod | `@deprecated` men anropas fortfarande | Risk för tomma rader om någon slår på den |

## Målbilden: två vägar in, ett dokument, en väg ut

### Väg A. Eget upplägg (hantverkaren vid datorn eller i bilen)
1. **Jobbtyp** kommer från affären eller projektet om den finns, annars väljs den.
   Kund likaså. Det finns redan (ärvd jobbtyp, `?deal_id`, `?customer_id`).
2. **Upplägget** för jobbtypen läggs in med firmans egna priser. Finns redan.
3. **Dokumentet** är editorn. Rader läggs till ur artikelregistret, mängder och priser
   ändras i dokumentet. Efter rivningen finns bara den editorn.
4. **Fyll på** från en annan jobbtyp. Finns sedan i dag.

### Väg B. Frågeflödet (hantverkaren hos kunden, telefon)
1. **Jobbtyp** väljs, upplägget visas som en rad: "Badrum · 12 rader · dina priser · 5 frågor".
2. **Frågorna** i en skärm. Tre typer av svar, varav den tredje är ny:
   - Mått och antal sätter mängd på rader med samma enhet. Finns.
   - Ja/nej kryssar tillval. Finns.
   - **Artikelval**: frågan "Vilket kakel?" visar artiklar ur registret med pris per
     enhet, valet byter ut artikeln på raden. Det är ServiceTitans configurable
     service, fast som en fråga. Kräver en ny frågetyp `article` med artikel-id:n och
     vilken rad den styr. Ingen ny tabell.
3. **Varianter**: jobbtypen kan ha flera upplägg (bas, rekommenderat, utökat). Finns i
   datamodellen redan (flera mallar per `job_type_slug`). Frågorna ställs en gång och
   svaren appliceras på alla varianter, så kunden får tre prissatta alternativ ur ett
   besök. Nytt: visa varianterna för kunden.
4. **Offerten** öppnas prissatt. Hantverkaren granskar i dokumentet. Samma editor.

### Kundsidan (samma för båda vägarna)
- Varianterna sida vid sida, kunden väljer en. Under den bockar kunden tillval, summan
  och "att betala efter ROT" räknas om live. Finns för tillval, saknas för varianter.
- Regler: förvald variant, tillval min/max, "välj exakt en". Lärdom från PandaDoc.
- Signera med namn och kryss, ROT-uppgifter fylls i av kunden, starttid väljs.
  Finns.
- Mockup ur före-bild och svar kommer senare, med två spärrar (märkt illustration,
  godkänd av hantverkaren först). Kostnaden per bild visas alltid före generering.

### Vägen ut (samma för båda)
- Signerad offert blir projekt med jobbtyp, adress, svar och förbehåll. Kräver
  luckorna 2, 4 och 13 stängda.
- Betalplan blir delfakturor automatiskt, deposition först. Kräver lucka 2 stängd.
  Det är det största enskilda lyftet mot "kopplar in i faktureringen".
- Referensmodellen låses vid signering (snapshot), så en offert som ändras efteråt inte
  flyttar projektets underlag.

## Vad som byggs, i ordning

Rivningen först. Den ger en editor, en start och 4 000–5 000 rader mindre att slipa.
Sedan fyra byggpaket, vart och ett med kontraktstest och mutationstest som i dag.

| Paket | Innehåll | Bygger på | Rör inte |
|---|---|---|---|
| R | Rivningen enligt inventeringen, paket A–D | | Databas, scheman, jobbtyper |
| B1 Artiklar i frågan | Frågetyp `article`: artikel-id:n + styrd rad. Editorn för frågor får ett artikelval. Svar byter artikel och pris på raden | v253, prisupplösningen | Artikelregistret |
| B2 Varianter | Flera upplägg per jobbtyp visas som bas/rekommenderat/utökat. Svaren appliceras på alla. Kundsidan visar dem sida vid sida med tillval och live-summa | `quote_templates.job_type_slug`, tillvalsmotorn | Signeringen |
| B3 Vägen ut | Betalplan → delfakturor. Jobbtyp och svar → projekt via båda skaparna. Dolda rader filtreras. ÄTA-rader får tredelning. Snapshot vid signering | `InvoiceType 'partial'`, referensmodellen | Fortnox-synken av fakturor |
| B4 Matte som utkast | Foto eller röst hos kunden → Matte fyller i frågeflödets svar, hantverkaren ser dem förifyllda. Aldrig ett pris som inte är firmans | Frågeflödet, transkriberingen | Godkännandegränsen |
| Senare | Kundsvar före besöket (portal → lead → förifyllda frågor). Mockup ur före-bild | B1, B4 | |

Varje paket rör bara kod. Tabeller och kolumner som finns ändras inte. B1 och B2
läggs till i jsonb-fält som redan finns (`intake_questions`, `default_items`), B3
använder kolumner som redan finns men aldrig läses.

## Tre beslut för Andreas och Christoffer

1. **Varianter per jobbtyp i B2 eller senare?** De är bevisat säljande (Bolster,
   ServiceTitan, Houzz) men kräver att varje jobbtyp får tre upplägg i stället för ett.
   Rekommendation: bygg mekaniken i B2, seeda bara "rekommenderat" och låt firman
   lägga till bas och utökat själv.
2. **AI i frågeflödet (B4) före eller efter kundsvar före besöket?** Rekommendation:
   B4 först. Det är vägen hem för hantverkaren som inte orkar trycka på telefonen, och
   den bygger på det som redan finns (röst, foto, Matte).
3. **Lås referensmodellen vid signering?** Alla konkurrenter frikopplar. Ni läser
   alltid aktuell offert. Rekommendation: snapshot av rader vid signering, projektet
   läser snapshoten, ÄTA är vägen för ändringar. Det är det ni redan lovar kunden.

## Källor

De fyra delrapporterna med URL per påstående ligger i sessionens transkript och kan
läggas till i denna mapp på begäran. Kartläggningen offert → faktura har fil och rad
per påstående och bör ligga som eget dokument när B3 planeras.
