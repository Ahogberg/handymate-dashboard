> ## ⚠️ Granskningsnot — läs före avsnitt 4 (Claude Code, 2026-08-06)
>
> Dokumentets **strategiska analys är riktig** och avsnitt 2 är dess starkaste
> sida: att uttryckligen avfärda chatbot, namngiven agent och dashboard som
> moats matchar vår egen konkurrensanalys — agent-tekniken är commodity, moaten
> är den svenska back-office-vertikalen.
>
> Men dokumentet **vet inte vad som redan är byggt**, och grundat mot kod ser
> bilden annorlunda ut. Åtta av tjugo initiativ finns redan i produktion, sex
> saknas helt, och ett är byggt men har ingen anropare.
>
> ### Finns redan och ÄR inkopplat
>
> | § | Initiativ | Verkligt läge |
> |---|---|---|
> | 7 | **Offer-to-Reality** | **Mest kompletta punkten i hela dokumentet.** `freezeProjectOutcome` körs vid BÅDA projektavsluts­vägarna (`projects/route.ts:598`, `booking/complete-job:143`) plus lat backfill, och `pricing-engine.ts:211` läser frusna rader för jobbtypskalibrering. Sluten loop redan i dag. |
> | 14 | **Constraint-aware Scheduling** | Brett inkopplat — UI, två cronjobb, agentverktyg. Tar hänsyn till kompetens, krockar, lediga timmar och frånvaro. **Inte** restid, material eller väder. Varnar aldrig blockerande, med flit. |
> | 5 | **Company Model** | Finns, men som **fyra osammanhängande spår**: `business_preferences`, `ai_learned_preferences`, `pricing_intelligence` och reservationsinlärningen. Nattlig cron kl 05:00. Ingen läser dem tillsammans. |
> | 13 | **Revenue Recovery** | **3 av 6** detektionsregler. Förfallen faktura är komplett (två cron). Avslutat projekt utan faktura är en *reaktiv trigger*, inte ett svep — missas det vid avslut hittas det aldrig. Material och godkänd ÄTA saknas som detektion; siffrorna visas bara. |
> | 17 | **Computer Vision** | Bild→egenkontroll är produktions­komplett med cost-guard, dedup och fail-safe. Bild→scope är en bild i prompten. Bild→progress och bild→ÄTA finns inte. |
> | 9 | **Trade Packs** | Innehållet är nära (13 branscher, artiklar, mallar, reservationer med triggers). **Strukturellt inte alls ett pack:** TypeScript-konstanter i repot, ingen tabell, ingen version, kopieras per företag vid onboarding. Att uppdatera ett pack kräver kodändring, deploy och manuell backfill. `sku`/`system_key` är dock rätt primitiv att bygga versionering på. |
> | 12 | **Margin Insurance** | Före, under OCH efter finns — men alla tre är **passiva kort**. Inget genererar en approval, ett SMS eller en blockering. |
> | 11 | **Evidence (insamling)** | Foton, egenkontroll, signaturer och tid samlas in och analyseras. **Noll koppling till fakturering** — `autoInvoiceOnComplete` körs dessutom FÖRE `freezeProjectOutcome` och utan någon bevis-kontroll. |
>
> ### Saknas helt
>
> **§4 Outcome Graph** — värre än frånvarande: 11-stegsmotorn `advanceDealFlow`
> är byggd men har **ingen anropare** (redan flaggad i
> `tasks/value-chain-plan.md:98`). Och `v71` lade 16 FK:er utan att någon av dem
> är lead→quote→project→invoice. Det finns ingen graf att traversera, bara
> id-strängar.
>
> **§6 Decision Replay** — noll träffar på `model_version`/`prompt_version` i
> hela repot. Modellnamn är hårdkodade konstanter per fil.
>
> **§8 Skill Capture**, **§10 Job Genome** (`job_types` är namn, slug, färg och
> ikon — en etikett), **§15 Promise Ledger**, **§18 Handymate Protocol**
> (`docs/api/openapi.yaml` dokumenterar EN endpoint och pekar på fel server —
> dött dokument). Ingen `lib/events`; 34 cronjobb, direkta imports och
> `pending_approvals` som asynkron kö bär i praktiken hela kedjan.
>
> ### Det viktigaste enskilda fyndet
>
> **Inlärningsdatan samlades in men landade tyst i papperskorgen.**
> `learning_events` fångar exakt det dokumentet efterfrågar — vad agenten
> föreslog, vad hantverkaren ändrade till, om det accepterades eller avvisades.
> Men kolumnen `reference_id` var `UUID` medan koden skickar TEXT
> (`appr_<tid>_<slump>`), så varje insert avvisades av Postgres. Felet loggades
> i `learning-engine.ts` men **anroparen kontrollerar aldrig returvärdet**
> (`approvals/[id]/route.ts:245`, "Non-blocking"). Röret lagades i `v78` (körd
> 2026-08-03) — men **all inlärningsdata före det datumet är borta**, och en
> framtida insert-failure är fortfarande osynlig för anroparen.
>
> ### Där jag inte håller med
>
> **Flywheelen kräver volym vi inte har.** "Fler kunder → fler jobb → bättre Job
> Genomes" förutsätter kunder. Vi har **en pilot**, som ännu inte validerat
> offertflödet. En datamoat byggd på ett företags data är ingen moat.
> Outcome Graph, Company Model, Job Genome och Trade Packs ligger alla nedströms
> kunder vi inte har.
>
> **35 % på datagrund före produkt-marknadspassning** (§32) är det klassiska
> plattformsmisstaget.
>
> **Trust-moaten är undersåld.** `lib/autonomy/earned-autonomy.ts` är en
> fungerande förtroendetrappa — 15 raka godkännanden över 60 dagar, inkopplad på
> fem ställen, med automatisk nedgradering vid avvisning. Vår konkurrensanalys
> säger att **ingen konkurrent skeppar approval-kö-autonomi**. Vi är längst fram
> just där, medan dokumentet listar trust som en av fyra jämbördiga moats.
> Begränsningen är att trappan har två lägen över fyra av dussintals
> åtgärdstyper — vägen till en 0–4-modell är kortare än dokumentet antar.
>
> ### Uppdelningen dokumentet inte gör
>
> Sekvenseringen i §§23–25 är faser, inte **färskvara mot uppskjutbart**. Vissa
> saker går bara att fånga när de händer; fångar vi dem inte nu är de borta för
> alltid och ingen senare utveckling återskapar dem. Andra kan byggas när som
> helst — men först när det finns volym.
>
> - **Färskvara:** beslutsposter (modell, promptversion, indata, utfall),
>   utfallsfrysning, evidenskoppling. Billiga nu, omöjliga i efterhand.
> - **Uppskjutbart:** Job Genome, Trade Packs, benchmarking, Outcome Graph som
>   verklig graf. Kräver volym för att vara meningsfulla.
>
> Prioriterad lista utifrån detta: `tasks/utvecklingsplan-2026-08.md`.

# Handymate — Moat Strategy & Innovation Roadmap

**Datum:** 2026-08-06  
**Syfte:** Definiera långsiktiga, svårkopierade produktfördelar för Handymate och översätta dem till en genomförbar utvecklingsroadmap.  
**Målgrupp:** Claude Code, produktledning och utvecklingsteam.  
**Status:** Strategiskt arbetsdokument. Läs tillsammans med `handymate_full_kartlaggning_och_genomforandeplan.md`.

---

# 1. Instruktion till Claude Code

Detta dokument innehåller långsiktiga produkt- och moatinitiativ. Implementera inte allt parallellt.

För varje initiativ:

1. verifiera vilka datakällor och domänobjekt som redan finns
2. identifiera återanvändbara komponenter
3. definiera minsta möjliga closed-loop-version
4. skapa tydliga datakontrakt
5. definiera mätbar affärseffekt
6. bygg observability från start
7. implementera bakom feature flag
8. testa på pilotföretag
9. jämför rekommendation mot faktiskt utfall
10. skala först när datakvaliteten är tillräcklig

## Grundregel

En ny feature ska helst förstärka minst en av följande:

- datamoat
- workflow-moat
- trust-moat
- distributionsmoat
- switching cost
- ekonomiskt bevisat kundvärde

Bygg inte lösningar som enbart är “mer AI”.

---

# 2. Vad som faktiskt är en moat

En moat är inte:

- en chatbot
- en namngiven agent
- en AI-genererad text
- en dashboard
- en enskild integration
- en funktion som konkurrenten kan kopiera på några månader

En riktig moat blir starkare när:

- fler kunder använder produkten
- fler projekt slutförs
- fler beslut och korrigeringar samlas
- fler utfall kan jämföras
- fler workflows flyttas in i Handymate
- systemet lär sig varje företags unika arbetssätt
- kunderna får ett högre värde ju längre de stannar

Handymates långsiktiga mål bör vara:

> **Det operativa intelligenslagret som vet hur lönsamma hantverksjobb ska säljas, planeras, utföras, dokumenteras och få betalt.**

---

# 3. Den strategiska moat-modellen

Handymate bör bygga fyra samverkande moats.

## 3.1 Datamoat

Handymate lär sig sambandet mellan:

- lead
- kunddialog
- offert
- kalkyl
- planering
- faktiskt arbete
- ÄTA
- faktura
- betalning
- marginal
- kundutfall

## 3.2 Workflow-moat

Handymate blir platsen där jobbet faktiskt drivs framåt:

- nästa action
- approvals
- agentutförande
- projektstatus
- kundlöften
- dokumentation
- fakturering

## 3.3 Trust-moat

Handymate blir mer autonomt först när det bevisat att det förtjänar det:

- explainability
- decision replay
- action ledger
- outcome tracking
- earned autonomy
- undo och revoke

## 3.4 Distributionsmoat

Handymate blir ett ekosystem genom:

- trade packs
- playbooks
- leverantörskopplingar
- finansiering
- partners
- verified contractor passport
- integrationsprotokoll

---

# 4. Handymate Outcome Graph

## Vision

Skapa en graf över hela jobbets livscykel:

```text
Lead
→ kundkontakt
→ platsbesök
→ offert
→ beslut
→ planering
→ arbete
→ tid och material
→ ÄTA
→ faktura
→ betalning
→ faktisk marginal
→ kundomdöme
→ återkommande jobb
```

Traditionella affärssystem lagrar objekten separat.

Handymate ska förstå sambanden mellan dem.

## Frågor grafen ska kunna besvara

- Vilken första kontakt leder oftast till platsbesök?
- Vilken offertstruktur ger högst acceptans?
- Vilka reservationer minskar tvister?
- Vilka projektmönster leder till ÄTA?
- Vilka kunder tenderar att betala sent?
- Vilka jobbtyper blir felprissatta?
- Vilka arbetsmoment skapar återbesök?
- Vilka beteenden korrelerar med hög marginal?

## Föreslagen datamodell

```text
outcome_event
outcome_entity
outcome_relationship
outcome_metric
outcome_attribution
```

### Exempel på events

```text
lead.received
lead.contacted
site_visit.booked
quote.created
quote.sent
quote.accepted
project.started
time.logged
material.added
ata.detected
ata.approved
work.completed
invoice.sent
invoice.paid
review.received
project.closed
```

## MVP

1. definiera gemensamt eventformat
2. registrera kritiska lifecycle-events
3. länka event till customer, lead, quote, project och invoice
4. bygg första outcome-frågorna:
   - offertacceptans per offerttyp
   - uppskattad mot faktisk arbetstid
   - färdigt jobb till faktura
5. bygg en enkel feature store för modeller och rekommendationer

## Moatvärde

Varje slutfört jobb förbättrar framtida beslut.

**Moatstyrka:** 10/10  
**Tidshorisont:** 6–18 månader  
**Beroenden:** stabil eventmodell, kontrakt och god datakvalitet

---

# 5. Handymate Company Model

## Vision

Varje kundföretag ska få en levande digital modell av hur verksamheten fungerar.

Det är mer än inställningar.

Modellen ska förstå:

```text
hur företaget prissätter
hur risk bedöms
hur företaget kommunicerar
vilka jobb som är attraktiva
vilka kunder som bör prioriteras
vilka marginaler som krävs
när ägaren vill bli tillfrågad
vad personal får besluta
hur olika moment brukar genomföras
```

## Datakällor

- explicita företagsregler
- offerter
- approvals
- avvisade förslag
- redigerade agentutkast
- projektutfall
- kommunikation
- margin outcomes
- roll- och behörighetsbeslut
- användarfeedback

## Föreslagen struktur

```text
company_policy
company_preference
company_pattern
company_exception
company_decision
company_outcome
company_model_version
```

## Viktiga designprinciper

- varje regel har provenance
- systemet skiljer mellan explicit regel och infererad preferens
- infererade regler visar confidence
- användaren kan rätta och låsa regler
- modeller versioneras
- systemet kan förklara varför en regel används

## MVP

- tonalitet
- standardpåslag
- minsta jobbvärde
- målmargin
- approval thresholds
- föredragna jobbtyper
- serviceområde
- offertriktlinjer

## Moatvärde

Byte till ett annat system innebär att kunden förlorar en operativ modell som byggts upp över tid.

**Moatstyrka:** 10/10  
**Tidshorisont:** 6–24 månader

---

# 6. Decision Replay & Counterfactual Learning

## Vision

Varje viktigt AI-beslut ska kunna spelas upp i efterhand.

Exempel:

> Varför rekommenderade Handymate ett högre pris?

Systemet ska kunna visa:

```text
Liknande jobb: 17
Genomsnittlig faktisk arbetstid: 96 timmar
Aktuell kalkyl: 78 timmar
Historisk materialavvikelse: +11 %
Målmarginal: 24 %
Förväntad marginal: 13 %
```

## Decision Replay ska innehålla

- använd data
- använda minnen
- aktiva regler
- prompt/model version
- confidence
- rekommenderad action
- användarens beslut
- faktiskt utfall

## Counterfactual Learning

Systemet ska senare kunna jämföra:

- vad som hände
- vad modellen förutspådde
- vad som sannolikt hade hänt om rekommendationen följts

## Föreslagen datamodell

```text
decision_record
decision_evidence
decision_policy
decision_response
decision_outcome
counterfactual_estimate
```

## MVP

Börja med:

- offertprissättning
- ÄTA
- projektmarginal
- fakturauppföljning

## Moatvärde

Det skapar:

- förtroende
- träningsdata
- bättre autonomi
- mätbar modellkvalitet
- revisionsbar historik

**Moatstyrka:** 9/10  
**Tidshorisont:** 3–12 månader

---

# 7. Offer-to-Reality Engine

## Vision

Jämför automatiskt vad företaget trodde skulle hända med vad som faktiskt hände.

| Kalkyl | Utfall |
|---|---|
| Rivning: 12 timmar | 18,5 timmar |
| Material: 8 000 kr | 9 750 kr |
| Två hantverkare | Tre behövdes |
| Klart fredag | Klart tisdag |
| Ingen ÄTA | 14 500 kr ÄTA |

## Motorn ska förbättra

- framtida kalkyler
- produktbank
- standardtider
- materialpåslag
- riskreservationer
- bemanning
- offertpris
- marginalprognos

## Matchningsnivåer

1. projekt
2. offertsektion
3. arbetsmoment
4. produkt/material
5. medarbetare/kompetens
6. fastighetstyp
7. Job Genome

## MVP

- länka offertsektioner till projektutfall
- jämför estimerad och faktisk tid
- jämför estimerad och faktisk materialkostnad
- visa variance
- låt användaren godkänna föreslagen ny standard
- spara korrigering till Company Model

## Acceptance criteria

- varje stängt projekt kan efterkalkyleras
- större avvikelser kan förklaras
- systemet föreslår en konkret förändring
- förändringen kräver godkännande
- framtida offert kan använda den nya regeln

## Moatvärde

Varje avslutat projekt förbättrar nästa offert.

**Moatstyrka:** 10/10  
**Tidshorisont:** 3–12 månader  
**Prioritet:** Mycket hög

---

# 8. Skill Capture

## Vision

Fånga den kunskap som idag finns i huvudet på seniora hantverkare.

Kunskap kan fångas när en användare:

- ändrar tidsåtgång
- lägger till material
- korrigerar en offert
- avvisar ett AI-förslag
- upptäcker en risk
- lägger till en reservation
- förklarar ett avvikande arbetsmoment

## Mikrofrågor

Efter en korrigering kan Handymate fråga:

> Varför behövs sex extra timmar här?

Svaret kan bli en företagsregel:

> I hus före 1970 räknar vi normalt med extra tid för äldre gjutjärnsanslutningar.

## Struktur

```text
skill_rule
skill_context
skill_exception
skill_evidence
skill_owner
skill_confidence
skill_usage
```

## Designprinciper

- mycket korta frågor
- aldrig störa arbetsflödet
- föreslå regel, tvinga inte
- bekräfta innan bred återanvändning
- koppla till verkligt utfall
- markera vem kunskapen kommer från

## Moatvärde

Handymate blir företagets kunskapsminne och minskar personberoende.

**Moatstyrka:** 9/10  
**Tidshorisont:** 6–18 månader

---

# 9. Trade Packs

## Vision

Skapa självlärande operativa paket per yrkesområde:

- VVS
- el
- målning
- tak
- badrum
- mark
- ventilation
- solceller
- pool
- service

## Ett Trade Pack ska innehålla

- arbetsmoment
- standardtider
- materialfamiljer
- vanliga risker
- reservationer
- egenkontroller
- relevanta regler
- offertstruktur
- vanliga ÄTA
- krav på bildbevis
- beroenden
- benchmarks

## Nätverkseffekt

Varje företag förbättrar den anonymiserade modellen för sin bransch.

## Governance

- ingen kundspecifik information får exponeras
- minimum sample size
- privacy-preserving aggregering
- regionala och företagsstorleksbaserade segment
- tydlig confidence
- möjlighet att välja bort benchmarking

## MVP

Börja med en vertikal där Handymate redan har flera pilotkunder.

## Moatvärde

Ger snabbare time-to-value och en vertikal datanätverkseffekt.

**Moatstyrka:** 9/10  
**Tidshorisont:** 9–24 månader

---

# 10. Job Genome

## Vision

Skapa en strukturerad kod för varje jobb.

Exempel:

```text
Typ: Badrumsrenovering
Fastighet: Villa, 1968
Storlek: 7,2 m²
Åtkomst: Våning 2
Kundtyp: Privat
Tätskikt: Fullt byte
Rörstatus: Okänd
Materialklass: Premium
Riskfaktorer: 6
```

## Användning

Job Genome används för:

- liknande projekt
- kalkyl
- tidsprognos
- material
- bemanning
- pris
- ÄTA-risk
- försening
- tvist
- marginal

## Föreslagen modell

```text
job_genome
job_genome_attribute
job_genome_version
job_similarity
job_cluster
```

## MVP

- definiera 15–30 attribut för en första yrkeskategori
- skapa genome vid offert/projektstart
- hitta liknande historiska jobb
- visa median och intervall för tid/material
- logga om rekommendationen användes

## Moatvärde

Ger bättre jämförelser än grova projektkategorier.

**Moatstyrka:** 9/10  
**Tidshorisont:** 6–18 månader

---

# 11. Evidence-to-Payment Protocol

## Vision

Varje fakturerbar händelse ska kunna byggas upp av verifierade bevis:

```text
Arbetsmoment
+ tid
+ foto
+ plats
+ person
+ material
+ kundgodkännande
+ ÄTA
= faktureringsklar enhet
```

## Value Unit

Skapa ett gemensamt objekt:

```text
value_unit
```

Det kan representera:

- arbetsmoment
- milstolpe
- servicebesök
- ÄTA
- levererat material
- godkänd avvikelse

## Föreslagna fält

```text
id
project_id
work_type
description
amount
status
performed_at
performed_by
evidence_ids
customer_confirmation
ata_id
invoice_id
verification_status
```

## Användningsområden

- snabbare fakturering
- mindre bortglömd intäkt
- färre tvister
- verifierad progress
- framtida fakturafinansiering
- försäkring
- beställarrapportering

## Långsiktig möjlighet

> Handymate Verified Work

## Moatvärde

Kan utvecklas till ett förtroende- och finansieringslager.

**Moatstyrka:** 10/10  
**Tidshorisont:** 12–36 månader  
**Komplexitet:** Mycket hög

---

# 12. Margin Insurance Engine

## Vision

Skydda projektets marginal före, under och efter arbetet.

## Före projektstart

- kalkylstress-test
- riskjusterad marginal
- materialscenario
- frånvaroscenario
- försening
- rekommenderad buffert
- betalplan
- reservationer

## Under projektet

- tidsavvikelse
- materialavvikelse
- odokumenterad ÄTA
- bemanningsrisk
- betalningsrisk
- scope creep

## Efter projektet

- rotorsaksanalys
- nya standardtider
- nya prisregler
- nya reservationer

## MVP

- scenarioanalys i offert
- forecast margin
- tre största riskdrivers
- rekommenderad åtgärd
- faktisk jämförelse vid projektstängning

## Långsiktig möjlighet

Samarbete med:

- försäkringsbolag
- finansbolag
- factoring
- leverantörskredit

## Moatvärde

Kopplar Handymate direkt till kundens ekonomiska resultat.

**Moatstyrka:** 9/10  
**Tidshorisont:** 6–24 månader

---

# 13. Autonomous Revenue Recovery

## Vision

En agent vars enda uppgift är att hitta redan intjänade eller sannolika intäkter som annars riskerar att missas.

## Agenten söker efter

- utfört men ej fakturerat arbete
- tid utan fakturaunderlag
- material utan fakturakoppling
- möjlig ÄTA i SMS, e-post eller anteckning
- accepterade tillval som inte prissatts
- färdiga projekt utan faktura
- sena fakturor
- offerter som bör följas upp
- serviceintervall
- gamla kunder som bör återaktiveras

## Mätvärden

```text
identifierat värde
godkänt värde
fakturerat värde
betalt värde
återvunnet värde
```

## MVP

1. färdigt men ej fakturerat
2. tid/material utan fakturaunderlag
3. ej behandlad ÄTA
4. accepterad offert utan nästa steg
5. förfallen faktura

## Produktbudskap

> Handymate hittade 47 300 kr den här månaden.

## Moatvärde

Mycket stark kommersiell ROI och bra data för framtida automation.

**Moatstyrka:** 8/10  
**Kommersiell styrka:** 10/10  
**Prioritet:** Mycket hög

---

# 14. Constraint-aware Scheduling

## Vision

Planera inte bara tid. Planera verkliga arbetsberoenden.

## Constraints

- kompetens
- geografi
- restid
- materialleverans
- kundtillgänglighet
- föregående moment
- torktid
- verktyg
- fordon
- underentreprenör
- arbetstidsregler
- projektmarginal
- risk

## Exempel

> Johan är sjuk. Två servicejobb har flyttats till Emma. Målningen flyttas en dag på grund av torktid. Berörda kunder har fått utkast till information.

## MVP

- definiera resurskompetenser
- definiera projektconstraints
- föreslå omplanering
- visa påverkan
- kräva approval
- logga utfall

## Moatvärde

Systemet lär sig verkliga tids- och beroendemönster per företag.

**Moatstyrka:** 8/10  
**Tidshorisont:** 6–18 månader

---

# 15. Customer Promise Ledger

## Vision

Extrahera och följ varje löfte som ges till kunden.

Exempel:

- vi hör av oss fredag
- klart före midsommar
- bortforsling ingår
- elektrikern kommer tisdag
- vi återkommer med nytt pris

## Datakällor

- telefonsamtal
- SMS
- e-post
- offert
- anteckningar
- projektuppdateringar

## Föreslagen modell

```text
customer_promise
promise_source
promise_owner
promise_deadline
promise_status
promise_risk
promise_action
```

## MVP

- extrahera promises från SMS/e-post/anteckning
- visa i kund- och projektvy
- påminn före deadline
- föreslå kunduppföljning
- markera fulfilled/broken

## Moatvärde

Skyddar kundrelation och gör Handymate till aktiv relationsmotor.

**Moatstyrka:** 8/10  
**Prioritet:** Hög

---

# 16. Dispute Prevention Engine

## Vision

Identifiera signaler som ofta föregår en tvist.

## Signaler

- offert och kommunikation beskriver olika scope
- återkommande prisfrågor
- arbete före godkänd ÄTA
- saknade bilder
- negativ tonalitet
- flyttad deadline
- faktura avviker från offert
- otydligt materialval
- muntligt löfte utan dokumentation

## Output

> Kunden verkar uppfatta målningen som inkluderad, men den ligger under “ej inkluderat”. Bekräfta omfattningen skriftligt innan nästa moment.

## MVP

- scope mismatch
- saknat ÄTA-godkännande
- saknat evidence
- sentiment shift
- promise risk

## Mätvärden

- flaggade risker
- användaråtgärder
- undvikna krediteringar
- undvikna tvister
- förbättrad betalningstid

## Moatvärde

Kopplar samman kommunikation, dokument och verkligt projektutfall.

**Moatstyrka:** 9/10

---

# 17. Computer Vision för hantverksföretag

## 17.1 Bild till scope

Ett foto kan föreslå:

- arbetsmoment
- mängder
- material
- risker
- frågor
- preliminär offert

## 17.2 Bild till progress

Bilder över tid kan visa:

- vad som förändrats
- färdiga moment
- återstående arbete
- avvikelser
- dokumentationsluckor

## 17.3 Bild till ÄTA

Möjliga triggers:

- fukt
- gammal installation
- extra rivning
- oförutsedd konstruktion
- kundens tillägg

## 17.4 Bild till egenkontroll

Kontrollera att rätt bevis finns innan moment byggs in.

## Designprinciper

- AI får föreslå, inte certifiera
- användare bekräftar
- originalbild sparas
- modellversion loggas
- confidence visas
- beslut kan granskas

## Moatvärde

Bilddata blir stark när den kopplas till pris, tid och utfall.

**Moatstyrka:** 8/10  
**Komplexitet:** Hög

---

# 18. Handymate Protocol

## Vision

Skapa ett agentoberoende event- och integrationslager.

## Exempel på events

```text
lead.received
customer.promise_created
quote.generated
quote.accepted
project.risk_detected
work.completed
ata.detected
evidence.missing
invoice.ready
payment.overdue
```

## Integrationskällor

- Fortnox
- telefoni
- e-post
- kalender
- grossister
- webbplatser
- externa appar
- sensorer
- partnerverktyg

## Tekniska komponenter

```text
event schema
event registry
event bus
webhook subscriptions
idempotency keys
event versioning
dead-letter queue
replay
audit
```

## Strategisk betydelse

Handymate kan bli det intelligenta orkestreringslagret ovanpå andra system.

Det gör att Handymate inte alltid behöver ersätta Easoft eller Bygglet direkt.

## Moatvärde

Teknisk switching cost och bred integrationsposition.

**Moatstyrka:** 9/10  
**Tidshorisont:** 6–24 månader

---

# 19. Autonomy Marketplace

## Vision

Distribuera färdiga arbetsflöden och playbooks.

## Exempel

- Offertuppföljaren
- Fakturajägaren
- ÄTA-vakten
- Marginalvakten
- Servicebokaren
- Omdömesinsamlaren
- Kundlöftesvakten
- Tom-kalender-fyllaren

## Varje playbook innehåller

- triggers
- conditions
- actions
- approvals
- risknivå
- autonominivå
- resultatmått
- branschvariant

## Framtida creators

- Handymate
- partners
- redovisningsbyråer
- konsulter
- grossister
- franchisekedjor
- större kunder

## Säkerhetskrav

- sandbox
- deklarerade permissions
- versionshantering
- review
- rollback
- begränsad access
- transparent kostnad

## Moatvärde

Ekosystem och distribution.

**Moatstyrka:** 8/10  
**Tidshorisont:** 18–36 månader

---

# 20. Supplier Intelligence Network

## Vision

Lär av inköp och leveranser.

## Systemet kan förstå

- verkliga inköpspriser
- prisförändringar
- leveranstid
- substitutionsprodukter
- materialåtgång
- reklamationer
- regional tillgänglighet
- konsolideringsmöjligheter

## Exempel

> Materialkorgen är 8,4 % billigare hos leverantör B, men leveranstiden ökar projektrisken. Leverantör A ger högre förväntad totalmarginal.

## Möjliga intäktsmodeller

- affiliate/revenue share
- grossistpartnerskap
- automatiska beställningar
- samlade inköpsavtal
- embedded procurement

## Moatvärde

Datamoat, distribution och nya intäktsströmmar.

**Moatstyrka:** 9/10  
**Tidshorisont:** 18–36 månader

---

# 21. Verified Contractor Passport

## Vision

Skapa ett verifierat operativt kvalitetspass.

## Möjliga mått

- leveransprecision
- svarstid
- dokumentationsgrad
- kundnöjdhet
- tvistfrekvens
- fakturakorrekthet
- behörigheter
- försäkring
- garantier
- projektutfall
- återkommande kunder

## Användning

- vinna större jobb
- fastighetsbolag
- finansiering
- försäkring
- leverantörskredit
- underentreprenörsnätverk
- konsumenttrygghet

## Governancekrav

- transparent beräkning
- rättelseprocess
- ingen godtycklig svartlista
- tydlig datakälla
- tidsbegränsning
- möjlighet att bestrida
- privacy review

## Moatvärde

Kan bli ett operativt trust-lager i marknaden.

**Moatstyrka:** 9/10  
**Tidshorisont:** 24–48 månader

---

# 22. Homeowner Twin

## Vision

Skapa en digital historik för kundens fastighet.

## Innehåll

- byggår
- installationer
- tidigare arbeten
- produkter
- garantier
- serviceintervall
- foton
- mätvärden
- planerade behov

## Exempel

> Värmepumpen installerades för fyra år sedan. Service bör bokas före oktober.

## Starkast för

- VVS
- el
- ventilation
- pool
- värme
- tak
- solceller
- återkommande service

## Affärseffekt

- återkommande intäkter
- högre retention
- proaktiv service
- enklare offert
- bättre kundupplevelse

## Moatvärde

Kundrelationen fortsätter långt efter projektets slut.

**Moatstyrka:** 9/10  
**Tidshorisont:** 12–36 månader

---

# 23. Handymate Economic Copilot

## Vision

Ägaren ska inte få ännu en dashboard.

Ägaren ska få veckans viktigaste ekonomiska beslut.

## Exempel

1. Fakturera 186 000 kr färdigt arbete.
2. Godkänn två ÄTA värda 31 400 kr.
3. Följ upp tre offerter.
4. Flytta resurs från lågmarginalprojekt.
5. Höj servicepris med 7 %.
6. Kontakta två kunder med betalningsrisk.

## Varje rekommendation innehåller

- belopp
- förväntad effekt
- confidence
- källor
- färdig action
- risk
- deadline

## MVP

- fem prioriterade actions varje vecka
- rangordning efter ekonomisk påverkan
- one-click approval
- faktisk outcome tracking
- “Handymate skapade/skyddade X kr”

## Moatvärde

Blir den vy som direkt motiverar abonnemanget.

**Moatstyrka:** 8/10  
**Kommersiell styrka:** 10/10

---

# 24. Prioritering

## Tier 1 — börja först

### 1. Offer-to-Reality Engine

Skapar dataflywheel och bättre prissättning.

### 2. Autonomous Revenue Recovery

Ger tydlig och snabb ROI.

### 3. Customer Promise Ledger

Relativt genomförbart och starkt kundvärde.

### 4. Project Autopilot

Samlar produkten kring nästa bästa action.

### 5. Decision Replay

Skapar trust och grund för autonomi.

---

## Tier 2 — bygg ovanpå Tier 1

### 6. Company Model

Lär sig hur varje företag arbetar.

### 7. Outcome Graph

Binder ihop hela livscykeln.

### 8. Job Genome

Ger bättre jämförelser och prognoser.

### 9. Dispute Prevention Engine

Använder kommunikation, löften och evidence.

### 10. Economic Copilot

Paketerar datan till konkreta ägarbeslut.

---

## Tier 3 — större strategiska satsningar

### 11. Evidence-to-Payment

Grund för trust och fintech.

### 12. Trade Packs

Vertikal nätverkseffekt.

### 13. Constraint-aware Scheduling

Operativ optimering.

### 14. Homeowner Twin

Retention och återkommande intäkter.

### 15. Supplier Intelligence

Distribution och inköpsdata.

---

## Tier 4 — långsiktig plattform

### 16. Handymate Protocol

Orkestreringslager.

### 17. Autonomy Marketplace

Ekosystem.

### 18. Verified Contractor Passport

Marknadsförtroende.

### 19. Margin Insurance

Finans- och försäkringslager.

---

# 25. Rekommenderad byggordning över 12–18 månader

# Fas 1 — Datagrund och ROI

## Månad 1–3

- lifecycle events
- action ledger
- Offer-to-Reality MVP
- Revenue Recovery MVP
- Promise Ledger MVP
- veckovis Economic Copilot
- feature flags
- outcome metrics

## Huvudmål

Bevisa att Handymate:

- hittar pengar
- sparar tid
- förbättrar offertkvalitet
- minskar glömda kundlöften

---

# Fas 2 — Projektintelligens

## Månad 4–6

- Project Mission
- Project Autopilot
- margin forecast
- risk engine
- Decision Replay
- första Company Model-reglerna

## Huvudmål

Handymate ska aktivt driva projektet framåt.

---

# Fas 3 — Lärande system

## Månad 7–10

- Outcome Graph
- Job Genome
- Skill Capture
- förbättrad memory graph
- counterfactual evaluation
- trade-specific attributes

## Huvudmål

Varje projekt ska förbättra nästa projekt.

---

# Fas 4 — Trust och ekosystem

## Månad 11–18

- Evidence-to-Payment MVP
- Constraint-aware Scheduling
- Trade Pack beta
- Homeowner Twin
- Handymate Protocol
- playbook foundation

## Huvudmål

Bygga switching cost, partnerpotential och nya distributionskanaler.

---

# 26. Gemensamma tekniska byggblock

Flera moatinitiativ delar samma grund. Bygg dessa en gång.

## 26.1 Event Registry

```text
event_name
version
schema
producer
consumer
retention
sensitivity
```

## 26.2 Feature Store

Lagrar beräknade egenskaper:

- historisk variance
- kundrisk
- jobbtyp
- margin drivers
- approve-rate
- project similarity

## 26.3 Decision Store

Lagrar:

- rekommendation
- data
- policy
- användarbeslut
- utfall

## 26.4 Outcome Store

Lagrar:

- faktiskt ekonomiskt resultat
- tidsresultat
- kundresultat
- kvalitetsresultat

## 26.5 Evidence Store

Lagrar:

- bilder
- dokument
- signaturer
- plats
- timestamp
- actor
- relation till value unit

## 26.6 Policy Engine

Hanterar:

- autonominivå
- beloppsgräns
- roll
- confidence
- kund
- action
- risk

---

# 27. Mätmodell för varje initiativ

Varje initiativ måste ha ett tydligt outcome.

| Initiativ | Primärt mått |
|---|---|
| Revenue Recovery | betalt återvunnet värde |
| Offer-to-Reality | minskat kalkylfel |
| Promise Ledger | andel löften uppfyllda |
| Dispute Prevention | minskade krediteringar/tvister |
| Project Autopilot | minskad admin per projekt |
| Margin Engine | minskat prognosfel |
| Economic Copilot | genomfört ekonomiskt värde |
| Scheduling | minskad restid och försening |
| Evidence-to-Payment | tid från utfört till fakturerat |
| Company Model | minskad korrigeringsgrad |
| Earned Autonomy | säker autonom action-rate |

---

# 28. Pilotprinciper

Varje större initiativ bör testas med 3–10 pilotföretag.

## Pilotkrav

- tydlig baseline
- en primär målvariabel
- max tre nya workflows
- veckovis användarintervju
- agentförslag loggas
- användarändringar loggas
- faktiskt outcome loggas
- no-go-kriterier definieras

## Exempel: Revenue Recovery-pilot

### Baseline

- ofakturerat värde
- dagar från klart till faktura
- missad ÄTA
- sena fakturor

### Efter pilot

- identifierat värde
- godkänt värde
- fakturerat värde
- betalt värde

---

# 29. Anti-patterns

Undvik följande.

## 29.1 AI theatre

En funktion som ser intelligent ut men inte förbättrar ett outcome.

## 29.2 Dashboard inflation

Fler grafer utan actions.

## 29.3 Agent proliferation

Fler namn och personas utan ny kapabilitet.

## 29.4 Data utan provenance

Insikter utan källa kan inte förtjäna autonomi.

## 29.5 Automation utan rollback

Autonoma handlingar utan undo eller audit.

## 29.6 Benchmarking för tidigt

Dålig input ger trovärdigt presenterade men felaktiga riktvärden.

## 29.7 Megaprojekt

Ingen moat ska byggas som en sexmånaders big-bang-release.

---

# 30. Claude Code — föreslagen första implementation wave

## Epic 1 — Lifecycle Event Foundation

### Mål

Skapa en gemensam eventmodell för:

```text
lead
quote
project
ata
invoice
payment
promise
decision
```

### Deliverables

- schemas
- event registry
- versioning
- idempotency
- emitter helpers
- tests
- observability

---

## Epic 2 — Revenue Recovery MVP

### Detection rules

- completed project without invoice
- logged time not invoiced
- material not invoiced
- approved ATA not invoiced
- overdue invoice
- accepted quote without project

### UX

- identifierat värde
- evidens
- rekommenderad action
- approval
- outcome

---

## Epic 3 — Offer-to-Reality MVP

### Deliverables

- estimated vs actual hours
- estimated vs actual material
- variance dashboard
- proposed standard update
- approval
- Company Model storage

---

## Epic 4 — Promise Ledger MVP

### Deliverables

- promise extraction
- source link
- owner
- deadline
- reminders
- project/customer view
- fulfillment status

---

## Epic 5 — Decision Replay Foundation

### Deliverables

- decision record
- source data references
- model/prompt version
- user response
- final outcome
- replay UI

---

# 31. Definition of moat progress

Handymate bygger en moat när minst ett av följande blir sant:

- modellen blir mätbart bättre av fler projekt
- kundens historik förbättrar framtida beslut
- byte av system innebär förlust av operativ intelligens
- Handymate äger ett closed-loop-workflow
- en partner behöver Handymates data eller protokoll
- användaren låter Handymate utföra mer autonomt
- systemet kan bevisa ekonomiskt värde
- konkurrerande funktion kräver lång historisk data för att matchas

---

# 32. Rekommenderad resursfördelning

Under de kommande 12 månaderna:

- **35 %** datagrund, events, outcome tracking och evaluation
- **30 %** Offer-to-Reality, Revenue Recovery och Project Autopilot
- **20 %** trust, Decision Replay och earned autonomy
- **10 %** Trade Packs och integrationsprotokoll
- **5 %** experiment inom vision, supplier intelligence och fintech

---

# 33. Slutlig strategisk rekommendation

Handymate bör inte försöka vinna genom att vara ett traditionellt affärssystem med fler AI-knappar.

Handymate bör vinna genom att bli ett system som:

1. förstår varje jobb
2. vet vad som bör hända härnäst
3. kan utföra nästa steg säkert
4. ser när pengar håller på att missas
5. lär sig skillnaden mellan kalkyl och verklighet
6. bevarar företagets operativa kunskap
7. bygger förtroende genom verifierbara beslut
8. blir bättre för varje slutfört projekt

Den viktigaste flywheelen är:

```text
Fler kunder
↓
Fler genomförda jobb
↓
Bättre Job Genomes, Company Models och utfallsdata
↓
Bättre kalkyler, risker och actions
↓
Högre marginal och mindre administration
↓
Högre förtroende och mer autonomi
↓
Mer operativ data och högre switching cost
↓
Starkare Handymate
```

Den långsiktiga slutpositionen är:

> **Handymate är den autonoma jobbmotor som vet hur hantverksjobb ska säljas, planeras, utföras, dokumenteras och omvandlas till betald intäkt.**
