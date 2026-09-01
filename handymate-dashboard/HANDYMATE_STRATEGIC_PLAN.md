# HANDYMATE — STRATEGISK GTM-PLAN

_Version 2026-08-23. Ersätter juliversionens marknads- och kanalantaganden.
Det här dokumentet styr kommersiell riktning. `HANDYMATE_OPERATING_PLAN.md`
styr veckans utförande. Det ersätter inte den tekniska lanseringschecklistan
eller `docs/council/ACTIVE_ROADMAP.md`._

## 1. Målet

Handymate ska etablera en ny kategori för svenska hantverksföretag:

> **Det digitala teamet för hantverksföretag.**

Vägen till 300 kunder börjar inte med maximal räckvidd. Den börjar med tre
bevis:

1. att rätt typ av hantverksföretag förstår kategorin;
2. att de upplever ett tydligt värde i en kort demo;
3. att en repeterbar kanal kan skapa betalande kunder till hållbar kostnad.

De första 10 betalande externa kunderna är därför en lärandefas. Kund 10–100
är distributionsfasen. Kund 100–300 är nordisk kategorietablering.

## 2. Den strategiska tesen

Gamla affärssystem lagrar information och väntar på att användaren ska göra
nästa sak. En chattbot ovanpå samma system förändrar inte arbetsfördelningen.
Handymate är byggt runt motsatt modell:

```text
Företagaren anger mål eller godkänner ett förslag
                         ↓
Matte samordnar rätt specialist i teamet
                         ↓
Teamet förbereder eller utför arbetet bakom tydliga säkerhetsgränser
                         ↓
Handymate visar vad som hände och vad resultatet faktiskt bevisar
```

Kärnpositioneringen är:

> **De ger dig ett verktyg. Vi ger dig ett team.**

Utåt säger vi inte “Mission Control” som huvudproduktnamn. Funktionen heter
**Uppdrag** i produktberättelsen och Matte introduceras som **din chefsagent**.
“Mission Control” får användas internt när vi diskuterar arkitekturen.

## 3. Varför vi kan vinna

### 3.1 Produkten gör, inte bara svarar

Handymate kan samordna offerter, projekt, kundkontakt, fakturering,
uppföljning och tillväxt. Viktiga kund- och pengahandlingar går genom en
godkännandegräns. Företagaren behåller kontrollen utan att själv behöva komma
ihåg varje nästa steg.

### 3.2 Svensk verksamhet är en del av motorn

ROT/RUT och grön teknik, svenska offert- och fakturaflöden, Fortnox-koppling,
ÄTA, projektekonomi och kundkommunikation är inte översatta eftertankar. De är
delar av datamodellen. Det gör Handymate svårare att ersätta med en generell
AI-assistent.

### 3.3 Tre sammanhängande kedjor är byggda

- **Mission Control / Uppdrag:** mål → sanningsmärkt plan → specialister →
  godkännande → verifierat resultat → lärande.
- **Promise-to-Proof:** daterat kundlöfte → bevakning → utförd handling med
  bevis.
- **Evidence-to-Payment:** utfört projekt → namngivna bevisluckor → korrekt
  faktureringsberedskap → fakturaunderlag.

Till detta kommer bland annat projektavslut, digitalt jobbpass, kundportal,
reaktivering, supportagent med mänsklig eskalering och en gemensam
fakturasändningsväg. Produktens bredd ska dock aldrig bli en funktionsparad i
demon. Vi visar den kedja som löser prospektets största problem.

### 3.4 Systemet får inte hitta på framgång

Identifierad potential, utförd handling, fakturerat och bekräftat betalt hålls
isär. Det är både en förtroendefördel och en produktmässig moat. Vårt bevis är
inte “AI-insikter genererade” utan vad företaget faktiskt fick gjort.

## 4. Marknadsrealitet och sanningsgräns

Betalvägen är testad end-to-end. Den gyllene vägen är körd genom skarp kod,
tvåtenant-isoleringen är bevisad mot riktig databas och produktens supportloop
är byggd. Det ger en stark produktgrund inför lanseringen. Det faktiska
go/no-go-beslutet ligger fortfarande i den separata tekniska
lanseringschecklistan.

Det betyder inte att allt är marknadsbevisat:

- Organisk användningshistorik från många externa kunder saknas fortfarande.
- Publicerbara kundcase med verifierade resultat ska skapas med de första
  kunderna, inte simuleras.
- Fortnox kräver rätt licens och ska bara utlovas med den brasklappen.
- Full talande röstagent är efter lansering. Lisa fångar förfrågningar idag,
  men ska inte beskrivas som en AI-röst som för samtal.
- Interna namn som Mission Control, Value Ledger och Margin Guardian är inte
  automatiskt publika produktnamn.

Aktuella funktionspåståenden kontrolleras före publicering mot
`tasks/capability-inventory.md` och den faktiska produkten. Kanoniskt
säljspråk finns i `tasks/sales-arsenal.md`.

## 5. Idealkunden

### Primär beachhead

Ett svenskt hantverksföretag med ungefär 3–15 personer där ägaren fortfarande
är operativ och känner att administrationen följer med hem. Företaget har
ofta:

- ett befintligt kundregister och återkommande jobbtyper;
- flera samtidiga offerter och projekt;
- missade samtal eller långsam återkoppling under arbetsdagen;
- fakturering och uppföljning som blir personberoende;
- ett befintligt system som används ofullständigt, eller flera lösa verktyg;
- en ägare som vill växa utan att omedelbart anställa mer kontorspersonal.

### Starka köpsignaler

- “Jag gör administrationen på kvällarna.”
- “Vi har kunderna i systemet men gör inget med dem.”
- “Offerter och fakturor blir liggande.”
- “Jag vet inte alltid vad som är klart att fakturera.”
- “Vi betalar redan för ett system som personalen inte använder.”
- “Allt hänger på att jag själv kommer ihåg nästa steg.”

### Lägre prioritet i första vågen

- enmansföretag utan stabil omsättning eller tydlig administrativ smärta;
- företag som bara söker billigaste faktureringsprogrammet;
- stora bolag med lång upphandling, komplex koncernstruktur eller krav på
  specialintegrationer före första värde;
- prospekt som kräver den framtida röstagenten som villkor för köp.

Planen **Firman** passar de flesta firmor oavsett antal anställda (inget
användartak sedan 2026-09-01), men den kommersiella beachheaden är snävare:
företag där 5 995 kr/mån kan motiveras av ett konkret operativt och
ekonomiskt problem.

## 6. Erbjudande och prissättning

Det publika standardutbudet är:

| Plan | Pris exkl. moms | Passar | Princip |
|---|---:|---|---|
| **Firman** | 5 995 kr/mån | de flesta firmor | hela agentteamet, obegränsade användare, kärnprodukten |
| **Storfirman** | 11 995 kr/mån | hög volym | hela agentteamet, obegränsade samtal och SMS-utrymme |

Årsbetalning innebär betala för 10 månader och få 12. Båda årsplanernas
Stripe-priser verifierades i den körande databasen 2026-08-23. Bas/Starter
finns av bakåtkompatibilitet men marknadsförs inte publikt.

Lanseringserbjudandet **Grundarkunderna** gäller de första 20 riktiga
betalande företagen: låst pris, direktlinje till grundaren under första året
och den ordinarie 30-dagars pengarna-tillbaka-garantin. Vi visar aldrig en
påhittad platsräknare.

Priset presenteras efter att prospektets problem och relevant arbetskedja har
visats. Handymate jämförs med kostnaden för kvarvarande administration,
missade affärer och mer kontorskapacitet — inte med billigaste ERP-licensen.

## 7. Produktberättelserna vi säljer

Alla demos börjar i prospektets verklighet. Välj högst två berättelser:

| Prospektets problem | Primär berättelse | Bevis i demon |
|---|---|---|
| Ägaren är flaskhals | Matte + Uppdrag | mål, plan, specialistansvar och väntande beslut |
| Pengar blir liggande | Från utfört till betalt | namngiven blockerare, fakturaunderlag, uppföljning |
| Offerter kallnar | Daniel | uppföljning som förbereds och godkänns |
| Kundregistret används inte | Hanna | segmenterad reaktivering mot befintliga relationer |
| Kunden jagar status | Kundportalen | samma riktiga dokument, status och kommunikation |
| Projekt tappar marginal eller bevis | Lars + projektavslut | bevisluckor, ÄTA, foton, jobbpass |
| Missade förfrågningar | Lisa | fångad kontakt och snabb återkoppling, inte talande AI |

Den starkaste generella demon är: **“Ge Matte ett mål.”** Den visar att
Handymate är ett arbetande team utan att kräva en meny- eller funktionsrunda.

## 8. Kanalstrategi — kund 1 till 10

Kanaler testas sekventiellt i tvåveckorsfönster. Vi skalar inget innan vi kan
mäta kontakt → samtal → demo → köp.

### Kanal A — Christoffers nätverk och peer selling

Förstavalet. Christoffer är hantverkaren som använder och visar produkten,
inte en traditionell mjukvarusäljare. Personliga introduktioner, telefonsamtal
och demos har högst förväntad trovärdighet och snabbast lärande.

### Kanal B — grundarlett innehåll och social proof

Andreas bygger kategorin publikt. Christoffer gör innehållet trovärdigt genom
egna erfarenheter, kommentarer och verkliga kundsamtal. LinkedIn-serien
**Framtidens hantverksföretag**, Instagram-materialet och videoplanen är
produktionssatta i `docs/marketing/content-library-v1/`.

Innehåll är inte en separat varumärkesövning. Varje kvalificerad reaktion ska
kunna leda till ett samtal, en demo eller en introduktion.

### Kanal C — introduktioner och selektiva partners

Revisorer, redovisningsbyråer, leverantörer, branschprofiler,
webb-/marknadsbyråer och rådgivare med förtroende hos hantverkare kan bli
distributionspartners. Standardlinjen är 20 % på betald abonnemangsintäkt i
12 månader. Kom igång-paket kan ge partnern 50 % när partnern faktiskt
levererar arbetet. Kärnprodukt, fakturering och Handymates IP lämnas aldrig
bort.

Partners aktiveras först efter att de kan visa demon korrekt och har godkänt
den uttryckliga “får inte säga”-listan.

### Kanal D — hög köpintention

Jämförelse- och sökinnehåll för personer som redan söker alternativ till
äldre affärssystem. Börja organiskt med jämförelsesida och artiklar. Testa
Google Ads först när de första 8–10 demosamtalen har gett ett stabilt språk
och en konverterande landningssida.

### Kanal E — riktad prospektering efter juridisk och kvalitativ grind

Handymate ska inte börja med massutskick till okända personer. Särskilt kalla
SMS är inte standardkanal. GDPR och marknadsföringslagen är två separata
gränser, och företagsnummer kan ändå vara personuppgifter eller nå en enskild
näringsidkare.

Tillåten V1 är manuell, relevant och dokumenterad kontakt där mottagare,
laglig grund, kanalregel och enkel invändningsväg är bedömda. Köpta listor,
scraping till mass-SMS och agentdriven autonom prospektering är parkerade till
ett separat juridiskt granskat program efter lansering.

## 9. Säljmodellen

Funneln är enkel:

```text
Kvalificerat företag
  → 15 min problemintervju
  → relevant 20 min demo
  → tydligt nästa steg inom 24 timmar
  → gemensam onboarding
  → första verifierade värdet
  → case / introduktion
```

En demo utan överenskommet nästa steg räknas inte som en vunnen möjlighet.
Ett registrerat konto räknas inte som en kund. En kund är en extern firma med
aktiv betalning.

Första kundernas onboarding är en del av försäljningen. Målet är inte bara att
få kortuppgifter, utan att hjälpa kunden till sitt första meningsfulla
Handymate-ögonblick och därefter mäta vad som faktiskt hände.

## 10. Mätning och beslut

### Ledande mått varje vecka

- nya kvalificerade företag;
- personliga kontakter;
- genomförda problemintervjuer;
- bokade och genomförda demos;
- erbjudanden och överenskomna nästa steg;
- onboardingstarter.

### Utfallsmått

- nya betalande externa kunder;
- konvertering kontakt → samtal → demo → köp;
- tid från första kontakt till köp;
- CAC per testad kanal;
- 30-dagarsaktivering och första verifierade värde;
- supportbehov och tecken på churn;
- rekommendationer och introduktioner per kund.

### Beslutsdisciplin

- Testa en huvudkanal i taget i minst två veckor eller till minsta
  urvalsstorlek har nåtts.
- Ändra inte målgrupp, budskap och kanal samtidigt; då lär vi oss ingenting.
- Dubbla en kanal först när den producerat betalande kunder, inte bara leads.
- Pausa en kanal som ger aktivitet men inga kvalificerade samtal.
- Skriv invändningar ordagrant. Produktteamet ska se verkligheten, inte
  säljarens sammanfattning av den.

CAC på 10 000 kr är en tidig varningsgräns, inte ett bevisat optimum. Den
omprövas när verklig retention och payback finns.

## 11. Vägen till 300 kunder

### Fas 1 — 0 till 10: bevisa försäljningen

Founder-led och Christoffer-led. Personlig onboarding. Skapa tre starka,
samtyckta case från olika företagstyper och hitta en kanal som kan upprepas.

### Fas 2 — 10 till 50: paketera det som fungerar

Standardisera demo, onboarding, partnercertifiering och kundbevis. Börja köpa
trafik endast på bevisade budskap. Följ skalningsgrindarna i den tekniska
roadmapen.

### Fas 3 — 50 till 100: bygg svensk kategori

Öka partners, jämförelseinnehåll, webinarier och branschnärvaro. Publicera
resultat med tydliga bevisnivåer. Gör Handymate till namnet på “ett team, inte
ett verktyg”.

### Fas 4 — 100 till 300: Norden

Norge kommer först när svensk säljmodell, support och onboarding är
repeterbara. Anpassa ekonomi, avdrag, integrationer, språk och juridik — inte
bara översättning. Tyskland är ett separat inträdesprogram efter nordiskt
bevis, med lokal domänmodell och lokala partners.

## 12. Vad vi inte gör före marknadsbevis

- Ingen bred autonom outboundmotor mot okända mottagare.
- Ingen ny prisnivå för varje feature; kärnteamet förblir begripligt.
- Ingen generell gratisperiod som drar in lågintresserade konton.
- Ingen funktionslista som huvudpitch.
- Ingen aggressiv konkurrentclaim som inte kan beläggas.
- Ingen geografisk expansion innan svensk försäljning går att upprepa.
- Ingen utveckling styrd av enstaka prospekts önskelista utan bevisad
  återkommande köpsignal.

## 13. Källor och dokumenthierarki

| Fråga | Kanonisk källa |
|---|---|
| Kommersiell strategi | detta dokument |
| Veckans säljutförande | `HANDYMATE_OPERATING_PLAN.md` |
| Säljspråk och invändningar | `tasks/sales-arsenal.md` |
| Demo | `HANDYMATE_OPERATING_PLAN.md` §8; `tasks/demo-manus.md` är stödmaterial som måste följa den nyare planen |
| Publik positionering | `docs/marketing/content-library-v1/messaging-playbook.md` |
| Publicering | `docs/marketing/content-library-v1/publishing-calendar.md` |
| Partnergränser | `docs/council/PARTNER_ADDON_PACKAGING.md` + signerat avtal |
| Produktpåståenden | `tasks/capability-inventory.md` + faktisk produktkontroll |
| Produktutveckling | `docs/council/ACTIVE_ROADMAP.md` |
| Teknisk lanseringsberedskap | den externa kanoniska lanseringschecklistan |

Strategin revideras när en kanal har testats färdigt, när pris/erbjudande
ändras eller när Sverige går från founder-led till repeterbar distribution.
