# Handymate — nästa operativa expansionsytor och informationsgränser

**Datum:** 2026-09-19  
**Status:** Strategisk riktning, inte implementationsspec.  
**Princip:** Bygg inte fler moduler för modulernas skull. Expansion ska flytta verkligt administrativt arbete från hantverkaren till Handymates agenter och helst stänga en mätbar loop.

## Utgångspunkt

Handymate täcker redan en stor del av kundresan och den interna jobbresan. Nästa stora produktsteg är därför inte fler fristående CRM-funktioner, utan att låta Handymate se och agera över de informationsgränser som fortfarande ligger utanför systemet.

Prioriterad produktfråga:

> Vilket återkommande arbete gör hantverkaren fortfarande därför att Handymate inte ser informationen, inte kan koppla den till rätt jobb eller inte kan slutföra nästa handling?

---

## 1. Leverantörs- och materialflödet

### Vision
Äg kedjan:

```text
grossist
→ pris
→ beställning
→ orderbekräftelse
→ restnotering
→ leverans
→ följesedel
→ faktisk mängd och kostnad
→ leverantörsfaktura
→ rätt projekt
→ vidaredebitering
→ faktisk marginal
```

Agenten ska kunna läsa leverantörsmail, orderunderlag, följesedlar och fakturor, matcha dem mot rätt projekt och artiklar, upptäcka avvikelser och föra kostnaden vidare till projektekonomin.

Exempel på önskat resultat:

> Ahlsells order 48291 kom in. 17 av 19 artiklar levereras imorgon. Två är restnoterade. 14 artiklar hör till jobb Andersson. Faktiskt inköpspris är 1 840 kr högre än kalkylen. Tre artiklar saknas i kundens debiteringsunderlag. Jag har förberett uppdateringen och flaggat marginalavvikelsen.

Nästa nivå är proaktivitet före jobbet:

> Jobbet på Storgatan börjar i morgon 07:00. Materialet verkar inte komplett. Två artiklar saknas. Jag har förberett nästa åtgärd.

### Kodbasens byggblock 2026-09-19
Det finns redan betydande fundament: `supplier_invoices` kopplade till projekt, projektkostnad/påslag/debiterbarhet, supplier registry/adapters, produktbank/priskontext, inbound e-post/attachments, dokumenthantering, job preparation och marginal-/projektekonomi.

Viktig begränsning: Ahlsell-adaptern är uttryckligen en stub i `lib/suppliers/ahlsell.ts`; riktig grossist-API-kapacitet beror på kommersiell/API-åtkomst. Därför bör första closed loop kunna fungera via e-post/PDF/orderunderlag utan att kräva grossist-API.

### Första möjliga closed loop
**Leverantörsmail/faktura → identifiera leverantör → extrahera order/fakturarader → matcha projekt → föreslå/registrera faktisk materialkostnad → räkna om marginal → kvittens/approval vid osäkerhet.**

---

## 2. UE-/partnernätverket — Handymate som koordinator mellan företag

### Vision
Små och medelstora hantverksfirmor samordnar löpande elektriker, VVS, målare, grävare, ställning, maskin, besiktning och andra underentreprenörer.

Handymate ska kunna bära kedjan:

```text
behov i projekt
→ rätt UE/partner
→ scope + underlag
→ tillgänglighetsförfrågan
→ svar
→ bokning/åtagande
→ dokument och instruktioner
→ status/löften
→ utfört underlag
→ faktura/kostnad
→ projektutfall
```

Agenten ska förbereda eller, inom förtjänad autonomi, sköta kommunikationen. Företagaren ska inte manuellt jaga svar, vidarebefordra ritningar, minnas löften eller matcha UE-fakturan i efterhand.

Exempel:

> För badrumsjobbet behövs elektriker vecka 42. Bergs El har gjort liknande jobb åt er tidigare. Jag har förberett arbetsunderlag med omfattning, adress, bilder och önskat datum. [Skicka förfrågan]

### Strategisk möjlighet
Hantverkspoolen kan på sikt bli mer än lead referrals: ett agentdrivet Handymate-till-Handymate-nätverk där strukturerade behov, tillgänglighet, arbetsunderlag, status och ekonomiska utfall kan överföras utan dubbeladministration.

### Kodbasens byggblock 2026-09-19
Det finns projekt, bokningar/kalender, dokument, kommunikationskanaler, approvals/earned autonomy, partnerdomän, avtal, serviceavtal, fakturor/kostnader och job preparation.

Det som inte framstår som en färdig domän är ett projektbundet UE-engagemang med scope, status, löften, dokumentutbyte, tillgänglighet och ekonomisk avstämning. Befintlig `lib/partners` är huvudsakligen Handymates kommersiella partner-/provisionssystem och ska inte återanvändas semantiskt utan verifiering.

### Första möjliga closed loop
**Projekt behöver extern kompetens → välj befintlig UE-kontakt → agenten förbereder scope + tider + dokument → approval → e-post/SMS → svar fångas och kopplas till förfrågan → valt åtagande visas i job preparation.**

Detta kan byggas utan Handymate-till-Handymate-nätverk först. Nätverket blir en senare distributions-/workflow-moat.

---

## 3. ”Jobbet är inte redo” — pre-flight för varje arbetsdag

Handymate ska avgöra om morgondagens jobb faktiskt går att utföra.

Kontrollera exempelvis:
- rätt person och kompetens;
- material beställt/levererat;
- UE bekräftad;
- kunden har bekräftat tillträde;
- adress, portkod eller nyckel finns;
- bilder/ritningar/underlag finns;
- relevanta tillstånd/föranmälningar är klara;
- kritiska kontrollpunkter/risker är kända;
- tidigare kundlöften är uppfyllda.

Önskad kvittens:

> 3 jobb imorgon. 2 är körklara. Storgatan saknar bekräftad materialleverans. Anna har inte bekräftat tillträde 08:00. Jag har förberett nästa åtgärder.

Värdet är mindre bomkörning, väntetid, omplanering och stillastående personal. Befintlig `job-preparation` är ett starkt fundament; supplier- och UE-information gör pre-flight betydligt mer komplett.

---

## 4. Compliance som biprodukt av arbetet

Bygg inte ett stort separat KMA-system som första steg. Låt dokumentationen uppstå ur jobbet.

Exempel:

> ”Matte, vi river väggen i morgon. Det går el i den och vi jobbar från ställning.”

Handymate använder projekt, jobbtyp, arbetsmoment, röst/foto och befintliga kontrollpunkter för att förbereda relevant underlag.

Möjliga ytor:
- egenkontroll;
- arbetsmiljörisk;
- behörigheter/certifikat;
- fotobevis;
- tillbud;
- kontrollpunkter;
- beställarkrav.

Produktprincip:

> Dokumentationen ska i möjligaste mån vara en biprodukt av utfört arbete, inte ett separat administrativt efterarbete.

---

## 5. Externa arbetsorder

Servicefirmor får arbete från fastighetsbolag, BRF:er, försäkringsbolag, förvaltare, större entreprenörer, kommuner och andra beställare.

Handymate bör kunna bära:

```text
extern arbetsorder
→ referenser + SLA + adress + instruktioner
→ projekt/jobb
→ planering
→ utförande
→ dokumentationskrav
→ återrapportering
→ korrekt fakturareferens
```

Önskat resultat:

> Arbetsorder #58329 mottagen. Handymate skapade jobbet, identifierade adressen, läste instruktionerna, satte SLA, bifogade dokumenten och förberedde bemanning. Efter jobbet förbereds utföranderapport och fakturaunderlag enligt beställarens krav.

Validera volym och dubbeladministration hos servicefirmor innan större integrationer byggs.

---

## 6. Den ekonomiska sidan in i företaget

Handymate täcker mycket av:

`kund → offert → jobb → faktura → pengar in`.

Den andra riktningen är:

`leverantör → faktura → bank → bokföring → moms → lön → pengar ut`.

Långsiktig målbild:

> Fem leverantörsfakturor kom idag. Fyra matchades mot inköp/projekt. En avviker från registrerat material. En saknar känd beställning och behöver dig.

Supplier/material-vertikalen och den planerade bokförings-/payment-processor-expansionen möts här. Målet är att Handymate fungerar som digital kontorsanställd, inte bara jobb-CRM.

---

# Informationsgränserna

Handymates operativsystem blir väsentligt starkare när agenterna kan se fyra verkligheter samtidigt.

## A. Kundgränsen
```text
telefon + SMS + e-post + formulär/portal
→ Handymate
```

Denna gräns är redan långt utvecklad. Fokus är att stänga återstående loopar och identitets-/leveransglapp.

## B. Leverantörsgränsen
```text
prislista + order + orderbekräftelse + restnotering
+ leverans + följesedel + leverantörsfaktura
→ Handymate
```

Gör faktisk materialåtgång, kostnad, tillgänglighet och marginal synlig för agenterna.

## C. Samarbetsgränsen
```text
UE + partner + beställare + extern arbetsorder
+ åtaganden + dokument + status
→ Handymate
```

Gör Handymate till koordinator mellan organisationer, inte bara inom den egna firman.

## D. Fält-/verklighetsgränsen
```text
röst + foto + position + personal + tid
+ material + arbetsmoment + kontrollpunkter
→ Handymate
```

Gör verkligt utfört arbete till strukturerad administrativ sanning utan separat efterarbete.

---

# Slutmål

När alla fyra informationsgränserna hänger ihop ska en arbetsdag kunna se ut så här:

```text
07:00  Johan börjar jobbet. Allt material är verifierat.
09:14  Kunden ber om ett extra uttag → Handymate fångar ÄTA.
11:32  UE meddelar försening → nästa plan påverkas och åtgärd förbereds.
13:05  Grossistunderlag kommer → materialkostnaden kopplas till jobbet.
15:42  Johan säger ”klart” och tar bilder → tid, material, dagbok och dokumentation färdigställs.
15:44  Handymate hittar en materialkostnad som annars riskerat att missas.
15:46  Kunden får rätt slutunderlag.
15:47  Fakturaunderlaget är klart.
```

**Företagaren har administrerat så lite som möjligt.**

# Prioriteringsprincip

Innan en ny vertikal byggs:
1. validera med riktiga firmor hur ofta smärtan uppstår;
2. mät tid/pengaläckage;
3. definiera minsta closed loop;
4. återanvänd befintliga Handymate-byggblock;
5. bygg enligt Development Quality Gate;
6. aktivera inte externa flöden innan verklig provider-/kundresa är bevisad.

När två initiativ konkurrerar ska den väg prioriteras som mest sannolikt:
- ersätter återkommande administrativt arbete;
- stoppar konkret pengaläckage;
- förbättrar en redan stark kundresa;
- ger Handymate ny information som flera agenter kan återanvända.
