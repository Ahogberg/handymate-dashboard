# HANDYMATE — BRAIN VISIBILITY WEEKEND
## Operativt styrdokument för Codex och Claude
### 11–13 september 2026

> **AUTHORITATIVE PROGRAM DOCUMENT**
>
> Detta dokument är styrande för Handymates Brain Visibility-arbete under 11–13 september 2026.
>
> Skapa inte ett separat roadmap-, strategi- eller planeringsdokument för samma arbete.
> Uppdatera detta dokument när faktisk repo-/runtime-verklighet ändras.
>
> **Aktuell `main`, `ARCHITECTURE.md`, kanoniska domänregler, säkerhetsregler och verifierad runtime-verklighet väger alltid tyngre än antaganden i detta dokument.**

---

# 0. Uppdraget

## Make Handymate’s existing intelligence impossible for the customer to miss.

Handymate ska inte bara **vara intelligent i backend**.

Kunden ska tydligt kunna uppleva:

- vad Handymate har sett
- vad Handymate förstår
- vad Handymate bevakar
- vad Handymate arbetar med
- vad som händer härnäst
- vad som väntar på någon annan
- vad som behöver användarens beslut
- vad Handymate redan har löst
- varför Handymate rekommenderar något
- vilken faktisk effekt arbetet har fått

Detta ska ske utan att göra produkten till en chatbot, AI-demo eller aktivitetsfeed.

Handymate ska kännas som:

> **ett administrativt operativsystem som driver firman medan användaren arbetar.**

---

# 1. Produktprincip

Handymate ska inte vinna på att kunden kan göra flest saker.

Handymate ska vinna på att kunden behöver göra minst möjligt administrativt arbete.

Den centrala produktfrågan är därför:

> **Hur tydligt kan kunden se att Handymate håller firman under kontroll utan att själv behöva sköta administrationen?**

North Star för programmet:

> **Ägaren arbetar i firman. Handymate dokumenterar, bevakar och driver den administrativa firman.**

---

# 2. Problemformulering

Handymate har redan ett omfattande substrat av:

- AI-agenter
- automationer
- approval rail
- kvitton
- agentminne
- företagspreferenser
- kundminne
- offertintelligens
- uppföljning
- projektintelligens
- ekonomiska flöden
- missions/uppdrag
- rekommendationer
- rapportering
- mobil
- integrationslogik

Men en capability som existerar i kod är inte automatiskt en fungerande produktcapability.

För varje smart capability måste följande skiljas åt:

1. Koden finns.
2. Runtime-triggern finns.
3. Riktig data når motorn.
4. Motorn producerar rätt output.
5. Outputen kopplas till rätt affärsobjekt.
6. Eventuell consequential action går via rätt approval/autonomy-väg.
7. Resultatet verifieras.
8. Ett beständigt kvitto finns.
9. Kunden kan se och förstå intelligensen.
10. Mobilupplevelsen fungerar där det är relevant.
11. Hela flödet är verkligt E2E-testat.

Brain Visibility-programmet ska därför inte börja med antagandet att funktioner behöver byggas.

Default är:

> **REUSE → CONNECT → ACTIVATE → EXPOSE → PROVE**

Nybyggnation är sista alternativet.

---

# 3. Statusmodell

Alla capabilities ska klassificeras med EN primär status.

## BUILD
Capabilityn eller en nödvändig domänprimitive saknas faktiskt.

Använd endast när inventeringen visar att befintlig arkitektur inte kan lösa behovet genom rimlig utökning.

## CONNECT
Nödvändiga delar finns men kedjan mellan dem är inte komplett.

Exempel:

- agentoutput saknar koppling till quote_id
- UI läser inte receipt
- mobile och backend använder olika state
- trigger skapar output som inte når canonical domain engine

## ACTIVATE
Capabilityn finns och är tekniskt inkopplad men används inte i verkligheten.

Exempel:

- kräver företagsmål som inga konton har
- automation är aldrig aktiverad
- capability saknar riktig trigger
- capability får aldrig data i normal kundresa

## EXPOSE
Handymate gör eller vet något viktigt men kunden ser det inte, ser det för sent eller förstår inte värdet.

Exempel:

- kvitto finns endast i auditlogg
- agent arbetar men offertvyn visar bara "Skickad"
- risk upptäcks men syns endast i Behöver dig utan evidens eller nästa steg

## PROVE
Capabilityn ser ut att vara komplett men verklig E2E-/provider-/mobilverifiering saknas.

## SCALE
Capabilityn är:

- inkopplad
- kundsynlig
- sanningsenlig
- verifierad
- användbar

Därefter kan adoption, performance, kostnad och UX optimeras.

---

# 4. Styrkontrakt

Dessa regler gäller under hela programmet.

## 4.1 Reuse before build

Sök alltid efter befintlig implementation innan nya:

- tabeller
- services
- agent tools
- domänmotorer
- event
- approvaltyper
- receiptformat
- UI-modeller

skapas.

Dokumentera vad som återanvänds.

## 4.2 No fake intelligence

UI får aldrig antyda att Handymate:

- sett något
- analyserat något
- bevakat något
- utfört något
- sparat pengar
- sparat tid
- fått providersvar
- kontaktat en kund

om runtime inte kan bevisa påståendet.

Tillåtna formuleringar måste följa faktisk state.

Exempel:

**Bra**
> 12 400 kr identifierat som möjligt fakturaunderlag.

**Inte tillåtet utan bevis**
> Handymate räddade 12 400 kr.

## 4.3 No parallel engines

Brain Visibility får inte bli ett nytt business-logic-lager.

UI och agentorkestrering ska läsa/agera genom befintlig canonical state.

Exempel:

- Field Command får inte skapa sin egen tidsmotor.
- Brain Home får inte ha ett eget separat "nästa steg"-system om motsvarande state redan finns.
- Quote Brain får inte implementera alternativ offertuppföljning.

## 4.4 Vertical slices only

Arbetet ska byggas i kompletta vertikaler.

Varje slice ska om möjligt innehålla:

**evidence  
→ interpretation  
→ system state  
→ recommendation/action  
→ approval/autonomy  
→ execution  
→ verification  
→ receipt  
→ customer-facing presentation  
→ test**

Undvik breda backend-refactors som inte ger ett verifierbart kundutfall.

## 4.5 Customer-visible value wins

Om två möjliga arbeten har liknande risk:

Prioritera det som gör verklig befintlig intelligens:

- mer synlig
- mer begriplig
- mer användbar
- mer förtroendeingivande

för kunden.

## 4.6 Brain ≠ chatbot

Synlig intelligens ska primärt uttryckas genom produktstate.

Exempel:

- nästa steg
- observation
- risk
- väntar på
- behöver dig
- hanterat
- resultat
- evidens
- agent ownership

Inte genom att lägga Matte-chatten överallt.

## 4.7 Owner by Exception

Brain Visibility får inte leda till mer brus.

Vi vill inte maximera:

- notifications
- cards
- agent messages
- activity rows

Vi vill maximera kontroll med minimalt behov av mänsklig handling.

Bra slutstate:

> Handymate hanterade 14 saker.  
> 3 väntar på andra.  
> 2 behöver dig.

## 4.8 Mobile counts

En capability som naturligt hör hemma ute på bygget är inte komplett om endast desktop fungerar.

Mobile ska bedömas för varje relevant slice.

Särskilt viktigt för:

- Matte
- Field Command
- rapportering
- tid/material
- ÄTA
- kundlöften
- återbesök
- approvals
- dagens jobb
- receipts

## 4.9 Money claims require evidence

Ekonomiskt språk ska vara semantiskt korrekt.

Skilj alltid på exempelvis:

- möjligt värde
- identifierat värde
- godkänt värde
- utfört arbete
- fakturaunderlag
- fakturerat
- provider-accepterat
- betalt

UI-copy ska spegla exakt state.

## 4.10 Explainability without chain-of-thought

Kunden ska kunna förstå varför Handymate säger något.

Visa konkret evidens och affärslogik.

Exempel:

> Kunden bad om två extra uttag den 10 september.  
> De finns inte i accepterad offert.  
> Därför markerar Handymate detta som möjligt ÄTA.

Visa inte intern modellresonemang eller dold chain-of-thought.

## 4.11 Consequential actions remain controlled

Brain Visibility får aldrig bli en genväg runt:

- permissions
- tenant isolation
- approval rail
- earned autonomy
- financial safeguards
- customer communication safeguards

Synligare AI får inte innebära mindre säker AI.

## 4.12 Idempotency remains mandatory

Alla nya CTA:er och presentationslager som utlöser befintliga actions måste tåla:

- dubbelklick
- retry
- response loss
- reload
- concurrency

utan duplicerade affärsobjekt eller actions.

## 4.13 Partial failure must remain visible

Om ett multi-action-flöde delvis misslyckas:

> 3 av 5 klara.

Inte:

> Klart.

Brain Visibility ska göra sanningen tydligare, inte dölja komplexitet.

## 4.14 Cost awareness

Varje ny LLM-användning måste motiveras.

Fråga alltid:

- Kan befintlig lagrad state användas?
- Kan deterministisk kod lösa presentationen?
- Finns redan en agentoutput att återanvända?
- Riskerar vi att köra samma analys flera gånger för att visa samma UI?

Målet är inte maximalt antal LLM-anrop.

Målet är maximal kundupplevd intelligens per faktisk computation.

Dokumentera nya kostnadsdrivande anrop.

## 4.15 Checkpoint after every slice

Efter varje större vertikal ska detta dokument uppdateras.

Nästa session ska kunna fortsätta utan att behöva rekonstruera föregående sessions intention.

---

# 5. Kundens mentala modell

Handymates intelligens ska kunna förstås genom sju enkla frågor.

## 1. Vad såg Handymate?
Exempel:
> Kunden bad om två extra uttag.

## 2. Vad betyder det?
> De finns inte i accepterad offert.

## 3. Vad gör Handymate?
> Jag har förberett ett möjligt ÄTA.

## 4. Vad händer härnäst?
> Väntar på ditt beslut.

## 5. Vad behöver Handymate från mig?
> Granska pris och omfattning.

## 6. Vad blev resultatet?
> ÄTA accepterat av kunden: 7 800 kr.

## 7. Varför?
> Visa relevant evidens och source objects.

Detta är standardmodellen för hur hjärnan ska exponeras genom produkten.

---

# 6. Övergripande presentationsmodell

När lämpligt ska befintliga vyer kunna uttrycka följande states:

## HANDYMATE SER
Observationer från verklig data.

## HANDYMATE FÖRSTÅR
Härledd betydelse, risk, möjlighet eller relation.

## HANDYMATE GÖR
Pågående eller planerad handling.

## VÄNTAR PÅ
Extern part eller framtida trigger.

## BEHÖVER DIG
Beslut som verkligen kräver användaren.

## HANTERAT
Verifierade handlingar som är klara.

## RESULTAT
Faktisk konsekvens:

- accepterat
- bokat
- faktureringsklart
- skickat
- provider-accepterat
- betalt
- annan verifierad outcome

Alla ytor behöver inte visa alla kategorier.

Använd endast det som ger hög signal.

---

# 7. Capability Reality Audit

Detta är programmets första arbetsfas.

## Målet

Skapa en komplett inventering av befintlig smart funktionalitet på:

- dashboard/web
- backend
- agentlager
- automationer
- mobile
- integrationslager

Auditens syfte är inte bara att hitta filer.

Den ska kartlägga verklig runtime.

## 7.1 Minsta auditmatris

Skapa och underhåll matrisen nedan i detta dokument.

| Capability | Code | Trigger | Real data | Can act | Approval/autonomy | Receipt/audit | Web exposure | Mobile exposure | Live/E2E proof | Cost concern | Status | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Company Scan | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Value Receipts | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Next Best Action | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Company Goals | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Customer Memory | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Business Preferences / Rules | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Quote Intelligence | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Quote Follow-up | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Meeting Intelligence | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Work Report | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Voice / Matte field input | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| ÄTA detection | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Customer promises | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Project intelligence | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Profitability / Margin | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Invoice / accounting intelligence | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Fortnox | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| ROT/RUT | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Missions / agent work | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Approval rail | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Operating Experiments | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |
| Partner / referral capability | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | AUDIT | |

Lägg till capabilities som hittas.

Slå ihop redundanta namn när samma motor ligger bakom flera ytor.

---

# 8. Auditkrav per capability

För varje capability ska Codex svara på:

### EXISTENCE
- Var finns implementationen?
- Vilken kod är canonical?
- Finns gammal/död parallell implementation?

### INPUT
- Vad triggar capabilityn?
- Vilken riktig data kräver den?
- Får den denna data i normal produktion?

### INTELLIGENCE
- Vad tolkar AI?
- Vad är deterministisk affärslogik?
- Vad lagras?

### ACTION
- Kan capabilityn agera?
- Genom vilken canonical service?
- Krävs approval?
- Finns earned autonomy?

### VERIFICATION
- Hur vet systemet att handlingen faktiskt lyckades?
- Är agent-run success felaktigt likställt med business outcome någonstans?

### RECEIPT
- Finns objektkopplat beständigt kvitto?
- Kan UI använda det?

### CUSTOMER VISIBILITY
- Var ser kunden detta?
- Förstår kunden vad Handymate gör?
- Förstår kunden varför?
- Förstår kunden nästa steg?

### MOBILE
- Är capabilityn relevant i mobilen?
- Finns den?
- Är state konsekvent?

### PROOF
- Unit?
- Contract?
- E2E?
- Authenticated?
- Live provider?

### STATUS
Klassificera:
BUILD / CONNECT / ACTIVATE / EXPOSE / PROVE / SCALE.

---

# 9. Prioriteringsmodell efter audit

När auditen är tillräckligt stabil ska nästa arbete prioriteras efter:

## P1 — Kundvärde
Hur mycket bättre blir upplevelsen av att Handymate driver firman?

## P2 — Existing leverage
Hur mycket befintlig intelligens kan aktiveras eller exponeras med liten ny kod?

## P3 — Revenue relevance
Påverkar detta:

- offert
- ÄTA
- fakturering
- betalning
- marginal
- kundrelation

## P4 — Frequency
Hur ofta möter kunden situationen?

## P5 — Pitch value
Hur tydligt demonstrerar förbättringen Handymates unika kategori?

## P6 — Risk
Hur stor risk har ändringen att destabilisera launch-kritiska flöden?

Föredra:

> hög kundnytta + hög befintlig leverage + låg arkitekturrisk

---

# 10. Den vertikala arbetskön

Ordningen nedan är default.

Codex får ändra ordningen endast om Capability Reality Audit visar en tydlig teknisk eller produktmässig anledning.

Dokumentera i så fall varför.

---

# SLICE 0 — Capability Reality Audit

## Goal
Skapa en sann karta över den befintliga hjärnan.

## Deliverables

- auditmatris
- canonical primitives
- dead/sovande code paths
- runtime triggers
- missing connections
- invisible intelligence
- unproven intelligence
- duplicationsrisk
- highest-leverage interventions

## Definition of Done

Auditen är tillräckligt komplett för att nästa slice inte riskerar greenfield-byggnation av något som redan finns.

---

# SLICE 1 — Brain Surface / Home

## Goal

Gör startsidan till den tydligaste upplevelsen av att firman är under kontroll.

Den ska inte bli en traditionell KPI-dashboard.

Den ska besvara:

> Vad händer i firman och vad gör Handymate åt det?

## Önskade informationskategorier

Endast där runtime har stöd:

### Firman är under kontroll

Exempel:

> 14 saker hanterade  
> 3 väntar på andra  
> 2 behöver dig

### Behöver dig
Endast riktiga beslut.

### Handymate arbetar
Verkliga pågående/bevakade saker.

### Väntar på
Kund, leverantör, teammedlem, provider, datum eller framtida trigger.

### Pengar
Verifierade relevanta ekonomiska states.

Exempel:

- möjligt fakturaunderlag
- faktureringsklart
- förfallet
- möjlig ÄTA
- väntar på kundbeslut

## Restrictions

- Ingen fake activity feed.
- Ingen egen parallell taskmotor.
- Ingen dubblering av Behöver dig.
- Ingen påhittad ROI.
- Undvik agent-avatar-teater.

## Definition of Done

En användare kan öppna Home och inom 10 sekunder förstå:

1. om firman är under kontroll
2. vad Handymate hanterar
3. vad som verkligen behöver människan
4. vilka ekonomiska eller kundmässiga saker som är viktigast

Allt ska komma från verifierbar befintlig state.

---

# SLICE 2 — Quote Brain

## Goal

En offert ska kännas bevakad av Handymate, inte som ett statiskt dokument.

## Exempel på kundsynligt state

> Daniel bevakar denna offert.

> Kunden öppnade den igår 20:43.

> Ingen respons ännu.

> Nästa uppföljning är planerad fredag enligt er regel.

> Väntar på kunden.

Efter handling:

> Uppföljning skickad 09:03.  
> Väntar nu på svar.

## Måste kopplas till riktig offert

Verifiera:

- quote ID
- follow-up round
- approval
- send attempt
- provider/result
- customer response
- stop condition
- receipt

## Explainability

Exempel:

> Varför följer Handymate upp fredag?

Visa regel och relevant offertstate.

## Definition of Done

En verklig offert kan följas från skickad → bevakad → uppföljd → kundrespons → stop condition med sanningsenligt UI och kvitto.

---

# SLICE 3 — Project / Job Brain

## Goal

Jobbvyn ska visa den administrativa verkligheten kring jobbet.

Inte bara projektdata.

## Möjliga kategorier

### Nästa steg
Vad händer konkret härnäst?

### Handymate har koll
Vad bevakas?

### Behöver dig
Vad blockerar?

### Väntar på
Kund, team, provider, datum.

### Pengar
ÄTA, faktureringsunderlag, marginal, ekonomisk risk — endast där befintlig state stöder det.

### Hanterat
Nyligen verifierade actions.

## Definition of Done

Jobbvyn ska besvara:

> “Om jag bara gör själva jobbet, vad sköter Handymate administrativt runt omkring?”

---

# SLICE 4 — Customer Brain

## Goal

Kundvyn ska exponera relevant minne och relationell intelligens.

## Möjliga exempel

- senaste löften
- väntande beslut
- aktuell offert
- nästa bokning
- relevant kommunikationshistorik
- fakta Handymate använder
- varför ett kundrelaterat förslag ges

## Guardrail

Kunden ska inte framställas genom spekulativa personbedömningar.

Prioritera verifierbara fakta, historik och obligations.

## Definition of Done

Användaren ska kunna förstå:

> vad Handymate vet om relationen, vad som är öppet och vad nästa administrativa steg är.

---

# SLICE 5 — Explainability Layer

## Goal

Gör Handymates rekommendationer förtroendeingivande.

Standardmönster:

> **Varför säger Handymate detta?**

Visa:

- source objects
- konkreta datum
- accepterad offert
- kundmeddelande
- arbetsrapport
- status
- affärsregel

Undvik:

- modellens fria resonemang
- ogrundade tolkningar
- tekniska AI-termer

## Definition of Done

Minst de viktigaste recommendation/approval-flödena har begriplig, objektbaserad evidens.

---

# SLICE 6 — Proof of Work / Value Receipts

## Goal

Gör redan utförd administration tydligt värdefull för kunden.

## Exempel

### Medan du arbetade idag

✓ 4,5 h registrerades  
✓ material lades till  
✓ ett kundlöfte bevakas  
✓ två offerter följdes upp  
✓ ett fakturaunderlag blev komplett

> Du behövde fatta två beslut. Handymate hanterade resten.

Endast om underlaget stödjer påståendet.

## Audit requirement

Undersök befintlig receipt/value/audit-infrastruktur innan ny representation skapas.

## Definition of Done

Verifierade actions går att presentera som meningsfull proof-of-work nära den kontext där kunden upplever nyttan.

---

# SLICE 7 — Mobile Brain Visibility

## Goal

Kunden ska känna samma operativa intelligens i fickan.

Prioritera:

- dagens jobb
- Matte
- röst
- arbetsrapport
- tid
- material
- möjligt ÄTA
- kundlöfte
- nästa steg
- approvals
- receipts

## Product principle

Ideal field interaction:

> öppna mobilen  
> säg vad som hände en gång  
> granska vid behov  
> tillbaka till jobbet

## Definition of Done

Minst de mest frekventa field flows visar korrekt brain state och fungerar autentiserat i faktisk app/build.

---

# SLICE 8 — Field Command 2.0 / Say It Once

## Goal

Utöka befintligt substrat, inte greenfield-bygg.

Exempel:

> “Klart hos Andersson. Jag och Johan körde tre timmar. 15 meter kabel. Kunden ville ha två extra uttag och vi lovade att komma tillbaka på tisdag.”

Handymate föreslår ett reviewable multi-action package.

## Default scope

Efter audit, återanvänd:

- transcribe
- Matte
- project resolution
- time
- material
- work report
- booking/promise
- ÄTA
- approval
- receipt

## Definition of Done

En verklig fälthändelse dokumenteras en gång och blir korrekt, idempotent state genom befintliga domänmotorer.

---

# SLICE 9 — Money Brain

## Goal

Gör Handymates ekonomiska intelligens konkret.

Inventera först vad som redan finns.

Prioriterad möjlig expansion:

### Invoice Readiness
Kan jobbet faktureras nu?

### Revenue Rescue
Vilka pengar riskerar att försenas eller tappas?

### Change Order Radar
Vilket utfört/efterfrågat arbete kan ligga utanför accepterad scope?

## Definition of Done

Handymate kan inte bara visa ekonomiska KPI:er utan förklara:

- vad som blockerar pengar
- vad den kan lösa
- vad användaren måste besluta
- vad som faktiskt flyttades framåt

---

# SLICE 10 — Full Journey Proof

Programmet avslutas inte med UI.

Slutbevisa minst följande kundresor.

## Journey A — Lead → Quote → Customer → Project

**förfrågan  
→ agentarbete  
→ offertutkast  
→ approval  
→ skickad offert  
→ bevakning  
→ uppföljning  
→ kundrespons  
→ stop condition  
→ projekt  
→ receipt**

Kunden ska se hjärnan genom resan.

## Journey B — Field Work → ÄTA

**mobil/röst  
→ arbetsrapport  
→ tid/material  
→ möjligt extra scope  
→ review/approval  
→ ÄTA  
→ kundbeslut  
→ receipt**

## Journey C — Work → Money

**klart jobb  
→ fakturaunderlag  
→ ROT/RUT  
→ faktura  
→ Fortnox/ekonomisystem  
→ provider/result  
→ receipt**

## Definition of Done

Resorna är:

- autentiserade
- tenant-säkra
- reload-säkra
- retry-säkra
- sanningsenliga
- visuellt begripliga
- testade genom faktisk relevant UI/mobile/provider

---

# 11. Vad Codex INTE ska göra denna helg

Om inte en blockerande lucka absolut kräver det:

- bygg inte ny generell agentarkitektur
- bygg inte ny generell memory engine
- bygg inte nytt generellt event-system
- bygg inte ny knowledge graph
- bygg inte Hantverkspoolen
- bygg inte nya stora roadmap-features
- bygg inte ny KPI-dashboard
- bygg inte agent-avatar-teater
- bygg inte gamification
- bygg inte om onboarding från grunden
- byt inte canonical source of truth för att förenkla UI
- gör inte bred estetisk redesign utan brain-value
- skapa inte fake demo states i produktion

Default denna helg:

> **CONNECT → ACTIVATE → EXPOSE → PROVE**

---

# 12. Onboarding under helgen

Nuvarande onboarding ska inte automatiskt byggas om.

Fokus:

> **PROVE before REBUILD**

Verifiera att en ny användare kan gå från:

**ny kund  
→ företag förstått  
→ riktig data sparad  
→ första verkliga nyttan**

Notera friktion.

Endast launch-blockerande problem ska fixas direkt.

En större Matte-led onboarding V3 ska baseras på riktig observation efter launch/cold-user test, om det fortfarande behövs.

---

# 13. Claude + Codex arbetsmodell

Ingen hård regel:

- Claude = UI
- Codex = backend

I stället:

## Vertical owner

Den agent som får en slice äger hela vertikalen där den har förmåga att arbeta säkert.

## Cross-review

Den andra agenten granskar mot:

- architecture
- canonical writes
- truth semantics
- security
- approvals
- idempotency
- partial failure
- UI truthfulness
- customer value
- mobile relevance

## Regel

> Arkitekturen och integrationskontraktet bestämmer gränsen, inte vilket agentnamn som gjorde ändringen.

---

# 14. Session boot protocol

Varje ny Codex-session ska börja med:

1. Läs detta dokument.
2. Läs aktuell `main`.
3. Läs aktuell `ARCHITECTURE.md`.
4. Läs relevanta launch/task-dokument.
5. Läs `CURRENT PROGRAM STATE` längst ner i detta dokument.
6. Kontrollera senaste commits/ändringar från föregående slice.
7. Bekräfta att verklig runtime fortfarande stämmer med dokumenterad status.
8. Fortsätt på `NEXT ACTION`.

Ingen ny strategiplan ska produceras om inte faktisk verklighet gör planen ogiltig.

---

# 15. Session close protocol

Innan en session avslutas ska Codex uppdatera detta dokument med:

## DONE
Vad blev faktiskt klart?

## REUSED
Vilka befintliga primitives återanvändes?

## NEW
Vad behövde byggas och varför?

## VERIFIED
Vad har faktiskt testats?

## NOT VERIFIED
Vad ser rätt ut men saknar riktig proof?

## CUSTOMER IMPACT
Vad kan kunden nu se/förstå/göra som den inte kunde före ändringen?

## RISKS
Nya eller kvarvarande risker.

## STATUS CHANGES
Vilka capability-statusar ändrades?

Exempel:

`Quote Follow-up: CONNECT → PROVE`

## NEXT ACTION
Exakt nästa vertikal eller blocker.

---

# 16. Testing gate per slice

En slice får inte markeras SCALE enbart utifrån unit tests.

Bedöm åtminstone:

### DOMAIN
Är affärsreglerna rätt?

### TENANT
Kan data läcka mellan företag?

### PERMISSIONS
Kan rätt roller göra/läsa rätt sak?

### IDEMPOTENCY
Tål actions retry/dubbelklick?

### PARTIAL FAILURE
Är state sanningsenlig om bara delar lyckas?

### UI
Visas korrekt state?

### RELOAD
Finns state kvar?

### MOBILE
När relevant.

### PROVIDER
När påståendet kräver extern provider.

### CUSTOMER JOURNEY
Kan en verklig användare genomföra flowet?

---

# 17. Brain Visibility copy rules

Språket ska vara konkret.

## Föredra

> Kunden öppnade offerten igår.

> Daniel följer upp fredag.

> Väntar på kundens svar.

> Två extra uttag verkar ligga utanför accepterad offert.

> Fakturaunderlaget saknar 3 timmar.

> Karin har förberett fakturan.

## Undvik

> AI insights generated.

> Smart analysis completed.

> Agent workflow active.

> Confidence score: 0.87.

> Handymate thinks...

Kunden ska förstå affärshändelsen, inte modellen.

---

# 18. Agent presence rules

Agentnamn får användas där ownership ökar begriplighet.

Exempel:

> Daniel bevakar offerten.

> Karin förbereder fakturan.

Men agentpersonligheter får inte ersätta korrekt state.

Bra:

> Daniel följer upp offerten fredag enligt er regel.

Sämre:

> Daniel jobbar hårt i bakgrunden! 🤖

Agents should feel like accountable roles, not mascots.

---

# 19. Home / Mission Control design hypothesis

Detta är en hypotes som ska valideras mot befintliga primitives.

En möjlig struktur:

# Firman är under kontroll

### Hanterat
Verifierade completed actions.

### Arbetar med
Pågående/bevakade riktiga items.

### Väntar på
Extern part eller future trigger.

### Behöver dig
Riktiga approvals/decisions.

### Pengar
Ekonomiska states som förtjänar uppmärksamhet.

### Senaste resultat
Värdekvitton.

Målet är INTE att skapa fem nya datamodeller.

Dessa ska härledas från befintlig canonical state där möjligt.

---

# 20. Pitch test

Varje större Brain Visibility-förbättring ska klara denna fråga:

> Om vi delar skärmen med en potentiell kund, kan vi visa varför Handymate är något mer än ett vanligt affärssystem med AI-chat?

Bra demo:

> Handymate såg detta.  
> Den gjorde detta.  
> Den väntar på detta.  
> Du behöver bara besluta detta.  
> Här är varför.  
> Här är resultatet.

Om förbättringen inte stärker produktupplevelsen eller denna berättelse bör den sannolikt inte prioriteras denna helg.

---

# 21. Adoption efter launch

När riktiga kunder finns måste Brain Visibility mätas.

Exempel på senare mätpunkter:

- hur många intelligenta ytor kunden faktiskt möter
- hur många recommendations som öppnas
- hur många approvals som går till handling
- hur ofta explainability öppnas
- vilka kvitton som leder till fortsatt användning
- vilka smarta capabilities som aldrig triggas
- vilka capabilities som triggas men aldrig syns
- vilka capabilities kunden korrigerar ofta

Använd befintligt adoption-mått om det redan är canonical.

Bygg inte ett separat metricsystem denna helg om det redan finns.

---

# 22. Cost gate

Brain Visibility får inte automatiskt innebära dyrare produktion.

För varje ny LLM-baserad presentation:

Dokumentera:

- model/anrop
- triggerfrekvens
- om output kan cacheas
- om samma analys redan görs
- ungefärlig per-business cost-risk
- om deterministisk state hade räckt

Detta är särskilt viktigt för:

- Home
- Company Scan
- Next Best Action
- Project summaries
- customer summaries
- recurring scans

---

# 23. Fortnox + ROT/RUT

Dessa är inte sidointegrationer i produktlöftet.

För målgruppen är de del av back office-kedjan.

Brain Visibility ska därför kunna göra sista metern till pengar begriplig.

Exempel:

> Fakturan är klar.

> ROT-underlaget är komplett.

> Skickad till Fortnox.

> Fortnox accepterade fakturan 14:08.

eller, om blockerat:

> Fakturan kan inte skickas ännu. Personnummer saknas för ROT.

All copy måste följa faktisk state.

---

# 24. Launch safety

Brain Visibility-arbetet får inte destabilisera launch.

Om en förbättring kräver stor förändring i:

- auth
- payment
- onboarding
- invoice core
- ROT/RUT core
- Fortnox core
- critical approval engine
- tenant model

ska den först bedömas mot launchrisk.

Visual/read-model improvements kan prioriteras före farlig core-refactor.

Men felaktig canonical business logic som blockerar huvudresorna ska fixas.

---

# 25. Definition of success för helgen

Helgen är framgångsrik om vi på söndag kväll har:

1. en sann Capability Reality Audit
2. tydlig separation mellan BUILD / CONNECT / ACTIVATE / EXPOSE / PROVE / SCALE
3. gjort ett antal av de högst värderade befintliga intelligensförmågorna kundsynliga
4. förbättrat Home/Mission Control så att hjärnan känns närvarande
5. förbättrat minst offert- och jobbupplevelsen med riktig brain state
6. gjort recommendations mer explainable
7. produktiserat verkliga receipts bättre
8. inkluderat mobile där relevant
9. verifierat de viktigaste ändringarna E2E
10. lämnat en uppdaterad, sann arbetskö för nästa vecka

Framgång mäts INTE i antal commits eller antal nya features.

---

# 26. Slutmål för kundupplevelsen

Kunden ska kunna öppna Handymate och känna:

> **Firman är under kontroll.**

> Jag ser vad Handymate har gjort.

> Jag ser vad den arbetar med.

> Jag ser vad den väntar på.

> Jag ser exakt vad den behöver från mig.

> Jag förstår varför.

> Jag ser vad resultatet blev.

Och sedan gå tillbaka till sitt riktiga arbete.

---

# 27. CURRENT PROGRAM STATE
## Detta avsnitt SKA uppdateras löpande av varje session

### PROGRAM
Brain Visibility Weekend

### DATES
2026-09-11 → 2026-09-13

### OVERALL STATUS
NOT STARTED

### CURRENT SLICE
SLICE 0 — Capability Reality Audit

### CURRENT OBJECTIVE
Kartlägg den faktiska intelligensen på aktuell `main` och mobile innan någon större ny implementation görs.

### DEFAULT NEXT ORDER
1. Capability Reality Audit
2. Brain Surface / Home
3. Quote Brain
4. Project / Job Brain
5. Customer Brain
6. Explainability
7. Proof of Work / Value Receipts
8. Mobile Brain Visibility
9. Field Command 2.0
10. Money Brain
11. Full Journey Proof

### KNOWN HIGH-PRIORITY QUESTIONS

- Hur mycket av Company Scan är faktiskt aktivt, kundsynligt och E2E-bevisat?
- Hur används Value Receipts i riktig UI idag?
- Finns NBA/Company Goals men saknar real-world consumer/data?
- Hur mycket av Field Command-substratet finns redan?
- Är ÄTA-detection från samtal/möten runtime-aktiv och säkert kopplad till rätt projekt/offert?
- Vilka kundlöften finns redan och vad saknas för full Promise Engine?
- Vilken rule/memory-logik har faktisk downstream consumer?
- Vad är Operating Experiments verkliga runtime-status?
- Vad består befintligt partnerprogram av och vad är endast referral/provision?
- Vilken intelligent state finns idag men är dold i auditloggar/backend?
- Vilka smarta capabilities fungerar på web men inte mobile?
- Vilka LLM-anrop görs i onödan eller flera gånger?
- Var saknas provider-proof trots gröna tester?
- Kan Home redan byggas huvudsakligen som read model ovanpå befintliga primitives?

### KNOWN LAUNCH-CRITICAL JOURNEYS

A. Onboarding → First Real Value  
B. Inquiry → Quote → Follow-up → Customer Decision → Project  
C. Work → Time/Material/ÄTA → Invoice Basis → ROT/RUT → Fortnox

### PROGRAM DEFAULT
CONNECT → ACTIVATE → EXPOSE → PROVE

### NEW BUILD POLICY
BUILD only when audit proves the required capability/primitive does not already exist.

### LAST COMPLETED
None.

### VERIFIED
None in this program yet.

### NOT VERIFIED
Entire Brain Visibility program.

### OPEN RISKS
- Duplicating existing intelligence because naming differs.
- Showing agent activity without durable object linkage.
- Overstating financial value.
- Desktop-only improvements for field workflows.
- Increasing LLM cost just to generate presentation text.
- Destabilizing launch-critical flows through unnecessary refactors.
- Treating green isolated tests as live customer-journey proof.

### NEXT ACTION
Perform SLICE 0 Capability Reality Audit and update the matrix in this document with repo-grounded evidence before starting implementation.

---

# 28. Session handoff template

Kopiera och fyll i detta efter varje betydande slice.

## SESSION DATE
YYYY-MM-DD

## SLICE
...

## DONE
- ...

## CUSTOMER IMPACT
- ...

## REUSED
- ...

## NEW
- ...

## VERIFIED
- ...

## NOT VERIFIED
- ...

## TESTS
- ...

## LIVE / PROVIDER PROOF
- ...

## STATUS CHANGES
- Capability: OLD → NEW

## COST IMPACT
- ...

## RISKS
- ...

## DOCUMENTS / CODE UPDATED
- ...

## NEXT ACTION
...

---

# 29. Final instruction to Codex

Do not optimize for producing the most code.

Optimize for turning Handymate’s existing intelligence into a coherent, truthful and unmistakable customer experience.

Before building anything substantial, prove whether the capability already exists.

When it exists:

> connect it  
> activate it  
> expose it  
> prove it

When it genuinely does not exist:

> build the smallest canonical primitive required

Then return immediately to the customer journey.

The target is not “more AI”.

The target is:

# A FIRM THAT FEELS LIKE IT IS RUNNING ITSELF ADMINISTRATIVELY.

---

# 30. Model Operating Protocol

Brain Visibility-programmet ska använda modellerna som olika roller, inte som utbytbara byggare.

Grundprincip:

> **Astra tänker, utmanar och granskar.  
> GPT-5.6 Sol bygger, testar och slutför.**

Målet är att använda den dyraste kapaciteten där den skapar störst värde och låta implementationen drivas av modellen som är stark nog för uppgiften men betydligt mer kvoteffektiv.

---

## 30.1 Astra — när den ska användas

Använd GPT-6 Astra primärt för:

### A. Capability Reality Audit
- förstå stora delar av repot
- skilja canonical implementation från död/duplicerad kod
- identifiera dolda runtime-beroenden
- upptäcka parallella motorer
- klassificera BUILD / CONNECT / ACTIVATE / EXPOSE / PROVE / SCALE
- bedöma om en capability redan finns i annan form

### B. Arkitekturbeslut före en svår slice
Innan implementation av komplexa vertikaler:

- Home / Mission Control
- Quote Brain
- Field Command
- Money Brain
- Fortnox / ROT/RUT
- cross-agent / cross-domain state
- nya read models som läser många domäner

Astra ska då besvara:

1. Vad finns redan?
2. Vad är canonical?
3. Vilka primitives ska återanvändas?
4. Vad är minsta säkra vertikal?
5. Vilka risker finns?
6. Vilka claims kan UI sanningsenligt visa?
7. Vad bör uttryckligen INTE byggas?

### C. Säkerhets- och sanningskritisk review
Använd Astra när ändringen påverkar:

- tenant isolation
- permissions
- verified impersonation
- approval rail
- earned autonomy
- pengar
- customer communication
- provider semantics
- idempotency
- retries
- partial failures

### D. Post-slice architectural review
Efter större implementation ska Astra vid behov göra en oberoende review:

> Är detta faktiskt en canonical vertikal eller skapade vi en parallell väg?

> Visar UI verklig state eller presenterar vi antaganden?

> Missade vi en befintlig engine?

> Har vi skapat osynlig teknisk skuld för nästa slice?

### E. Slutlig cross-product review
När flera slices är färdiga:

- bedöm om produkten känns som EN hjärna
- identifiera duplicerade presentationsmönster
- hitta kvarvarande "invisible intelligence"
- hitta intelligence som visas utan tillräcklig proof
- prioritera nästa högsta leverage

---

## 30.2 GPT-5.6 Sol — när den ska användas

GPT-5.6 Sol är programmets primära implementationmodell.

Använd Sol för:

### A. Implementation
- React/UI
- API-kopplingar
- befintliga services
- read models
- adapters
- presentation state
- migrations där de redan är specificerade
- mobile implementation
- copy/state presentation

### B. Testarbete
- unit tests
- contract tests
- role/permission tests
- idempotency tests
- retry tests
- partial-failure tests
- regression tests
- E2E setup
- testfixar

### C. Review-fixes
Efter Astra-review:

- åtgärda konkreta fynd
- komplettera guards
- koppla missing state
- rätta UI-semantik
- förenkla implementation
- städa duplicering

### D. Tydligt specificerade vertikaler
När audit + arkitekturbeslut redan är klart:

> Låt Sol äga hela slicen tills Definition of Done eller tills ett verkligt arkitekturbeslut blockerar.

Byt inte tillbaka till Astra bara för att implementationen innehåller många filer.

---

## 30.3 Standardloop per större slice

Default arbetsloop:

### STEP 1 — ASTRA: UNDERSTAND
Läs:

- detta dokument
- aktuell main
- ARCHITECTURE.md
- relevant capability state
- senaste checkpoint

Leverera en kort, repo-grounded implementation brief.

Ingen ny generell roadmap.

### STEP 2 — SOL: BUILD
Implementera hela vertikalen enligt briefen.

Återanvänd canonical primitives.

Kör relevanta tester löpande.

### STEP 3 — SOL: VERIFY
Verifiera:

- domain correctness
- tenant
- permissions
- idempotency
- partial failure
- reload
- mobile
- provider
- customer journey

så långt miljön medger.

### STEP 4 — ASTRA: CHALLENGE
För större eller känsliga slices:

Granska implementationen oberoende mot:

- styrkontraktet
- canonical architecture
- truthfulness
- launch safety
- customer-visible value

### STEP 5 — SOL: CLOSE
Åtgärda review-fynd.

Kör tester igen.

Uppdatera `CURRENT PROGRAM STATE`.

Markera endast den status som faktiskt är bevisad.

---

## 30.4 När Astra INTE ska användas

Bränn inte Astra på:

- CSS-justeringar
- pixel polish
- ren komponentrefactor
- enkla props/state-fixar
- testfixture-arbete
- copyjusteringar med redan bestämd semantik
- mekaniska typfel
- kända lintfel
- upprepade små testfixar
- implementation där arkitekturen redan är tydligt beslutad

Om Sol kan lösa uppgiften utan nytt arkitekturbeslut ska Sol fortsätta.

---

## 30.5 Escalation rule

Sol ska eskalera tillbaka till Astra när någon av följande uppstår:

### ARCHITECTURE AMBIGUITY
Två eller fler befintliga implementationer verkar vara möjliga canonical sources.

### NEW DOMAIN PRIMITIVE
Slicen verkar kräva en ny:

- tabell
- event
- approvaltyp
- domain engine
- cross-domain read model
- persistent intelligence object

som inte tydligt redan finns.

### SAFETY CHANGE
Implementation kräver ändring av:

- auth
- tenant model
- permissions
- financial safeguards
- approval rail
- customer-facing automatic actions

### SEMANTIC AMBIGUITY
Det är oklart vilken state UI sanningsenligt får hävda.

Exempel:

- "skickat" vs "provider accepted"
- "sparat" vs "identifierat"
- "klart" vs "förberett"
- "bevakar" vs "planerat"

### LARGE CROSS-DOMAIN REFACTOR
Arbetet börjar växa från en vertikal slice till en generell systemombyggnad.

När detta händer:

> Stoppa den breda utvidgningen, checkpointa vad som är gjort och använd Astra för att fatta nästa arkitekturbeslut.

---

## 30.6 Context efficiency

Undvik att byta modell för ofta.

En ny modell/session behöver återorientera sig.

Därför:

- Astra ska lämna en konkret brief/checkpoint.
- Sol ska arbeta länge på en tydligt avgränsad vertikal.
- Astra ska inte reviewa varje liten commit.
- Sol ska inte be om ny arkitekturplan efter varje mindre hinder.
- Samma styrdokument ska användas som kontinuitetslager.

Målet är:

> **färre, tyngre modellöverlämningar — inte ständig ping-pong.**

---

## 30.7 Suggested model allocation by slice

| Slice | Planning / Audit | Implementation | Review |
|---|---|---|---|
| Capability Reality Audit | Astra | Sol för dokumentering/fixar | Astra |
| Home / Mission Control | Astra | Sol | Astra |
| Quote Brain | Astra | Sol | Astra |
| Project Brain | Astra vid komplex state | Sol | Astra vid behov |
| Customer Brain | Sol eller Astra vid memory-ambiguity | Sol | Astra vid behov |
| Explainability | Astra för semantik | Sol | Sol/Astra |
| Value Receipts | Astra vid money semantics | Sol | Astra vid claims |
| Mobile Brain Visibility | Astra endast för cross-domain design | Sol | Sol/Astra |
| Field Command 2.0 | Astra | Sol | Astra |
| Money Brain | Astra | Sol | Astra |
| Full Journey Proof | Sol | Sol | Astra slutreview |

Tabellen är default, inte absolut.

Den verkliga complexity/risk-nivån styr.

---

## 30.8 Quota discipline

Veckokvoten ska behandlas som en produktionsresurs.

Default:

> **Använd inte Astra när Sol redan har tillräcklig kontext och ett tydligt beslut att implementera.**

Prioritera Astra-kapacitet till:

1. Capability Reality Audit
2. arkitekturbeslut med stor downstream-effekt
3. money/security/approval semantics
4. Field Command
5. slutlig cross-product review

Om Astra-kvoten blir knapp:

- fortsätt implementera redan beslutade vertikaler med Sol
- dokumentera öppna arkitekturfrågor
- samla flera review-frågor till en Astra-session
- undvik små separata Astra-anrop

---

## 30.9 Model handoff format

När Astra lämnar över till Sol ska checkpointen minst innehålla:

### OBJECTIVE
Vad ska ändras i kundupplevelsen?

### VERIFIED EXISTING PRIMITIVES
Vilka befintliga engines/services/state ska återanvändas?

### CANONICAL PATH
Vilken write/read path gäller?

### DO NOT BUILD
Vilka parallella lösningar ska undvikas?

### IMPLEMENTATION SCOPE
Vilka lager behöver ändras?

### TRUTH SEMANTICS
Vilka ord/states får UI visa?

### SAFETY / APPROVAL
Vilka guards gäller?

### TEST GATE
Vad måste vara grönt?

### DEFINITION OF DONE
Vad ska kunden faktiskt kunna se/göra efteråt?

När Sol lämnar tillbaka till Astra ska checkpointen minst innehålla:

### IMPLEMENTED
Vad ändrades?

### REUSED
Vad återanvändes?

### TESTED
Vad verifierades?

### NOT PROVEN
Vad saknar live/provider/mobile proof?

### DEVIATIONS
Avvek implementationen från planen? Varför?

### REVIEW QUESTIONS
Vilka konkreta osäkerheter återstår?

---

## 30.10 Final model principle

Modellval ska inte vara prestige.

Astra används där bättre reasoning kan förhindra fel riktning.

Sol används där tydlig execution skapar mer kundvärde per token.

> **Astra prevents expensive mistakes.  
> Sol turns good decisions into product.**
