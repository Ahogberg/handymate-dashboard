# Konkurrentresearch: vad Handymate bör lära, visa och bygga

Datum: 2026-08-31. Beslutsunderlag för Andreas och Christoffer.

Status: research och rekommendationer, inte beslutad roadmap. Ingen produktkod, prissättning eller drift har ändrats. Detta dokument ersätter inte ACTIVE_ROADMAP eller lanseringsgrinden.

## 1. Slutsatsen först

Handymate har en intressant position, men **inte en tom marknad**. Konkurrensen kommer från tre håll:

1. Etablerade svenska/nordiska system som redan äger kundrelationen, arbetsflödena och integrationsytorna.
2. Smalare svenska AI-produkter som säljer en lättbegriplig uppgift: offert, uppföljning eller receptionist.
3. Internationella plattformar som visar vart kategorin är på väg: AI i det faktiska fältarbetet, inte bara på kontoret.

En viktig korrigering av vår tidigare diskussion: Easofts svenska lanseringssida säger uttryckligen att agentplattformen är live, att första kunder använder den och anger 4 februari 2026 som officiellt lanseringsdatum. Det är ett leverantörspåstående, inte ett oberoende produkttest, men det är en tydlig lanseringsindikation. Vi bör inte längre beskriva Easoft AI som bara en landningssida. Vi har heller inte belägg för att implementationen måste vara långsam eller dyr. [Easofts lanseringssida](https://easoft.se/ai-agentplattform-lansering/).

Min huvudrekommendation:

> Sälj ett sammanhängande, bevisbart arbetsflöde. Utveckla därefter hjälpen före och under jobbet — på samma grund som redan hjälper företaget efteråt.

Tre prioriteringar:

- **Inför lansering:** bevisa tre vardagsflöden, hjälp kunden att komma igång och visa den verkliga kostnaden. Fler funktionsnamn är inte huvudbehovet.
- **Nästa produktfördjupning:** ett källbundet ”Inför nästa jobb” från Lars genom Matte, som återanvänder bokning, projekt, installationshistorik och bekräftade arbetssätt.
- **Nästa kommersiella fördjupning:** säkerställ kopplingen mellan installerad utrustning, befintliga serviceavtal och nästa kundbesök. Bygg inte ytterligare ett serviceavtalssystem.

## 2. Metod och begränsningar

Researchen bygger på officiella produktsidor, prislistor, hjälpartiklar och leverantörernas lanseringsinformation. Jag har också läst relevanta delar av Handymates lokala kod och styrdokument för att undvika dubblettförslag.

Ingen konkurrentprodukt har provkörts inloggad. Inga demos har bokats, samtal ringts eller konton skapats. Handymates produktion och mobilapp har inte nyverifierats i detta pass. Kod som finns är inte automatiskt samma sak som aktiverad, fungerande kundfunktion.

Evidensnivåerna nedan:

- **Dokumenterat arbetsflöde:** konkret hjälpdokumentation beskriver användning och begränsningar. Starkare än en reklamsida, men inte oberoende bevis på felfri drift.
- **Erbjuds/uppges live:** officiellt erbjudande eller lanseringspåstående. Exakt leverans och användning behöver verifieras.
- **Beta/pilot/förannonserat:** leverantören anger själv begränsad mognad.
- **Ej belagt:** inget tillräckligt stöd hittades i urvalet. Betyder inte att funktionen saknas.

Kunders antal, effektprocent, betyg och besparingar från leverantörernas egna sidor behandlas inte som oberoende belagda resultat. Olika produkter inom samma koncern tillskrivs inte automatiskt varandras funktioner. Fieldly.com är exempelvis inte samma företag som den separat hittade tjänsten fieldlyai.com.

## 3. Sverige och Norden: de viktigaste etablerade alternativen

| Aktör | Vad som faktiskt framgår offentligt | Viktigaste lärdomen för oss |
|---|---|---|
| **Easoft** | Uppger lanserad agentplattform för befintliga ERP-kunder, inom flera verksamhetsområden. Bredd, standardpaket och installationskostnad är inte fastställda här. [Lansering](https://easoft.se/ai-agentplattform-lansering/) | Visa varför någon ska byta eller börja med Handymate när AI också erbjuds i det befintliga systemet. |
| **SmartCraft** | Beskriver praktisk AI och riktade piloter, men placerar gemensam Core och partner-marknadsplats i framtidsbilden. [AI-strategi](https://smartcraft.com/technology-and-ai/) | Branschdata, distribution och etablerade arbetsflöden är starka tillgångar även om agentupplevelsen inte är enhetlig ännu. |
| **Cordel / SmartCraft Flow** | Beskriver kalkylpaket, planritningar, AI-offerttext och överföring av accepterad offert till Cordel. Mobil offertapp anges som kommande. [Flow](https://cordel.no/smartcraft-flow/) | Strukturerade branschpaket kan göra ett offertflöde mer tillförlitligt än en friare prompt. Det betyder inte att Flow redan finns i Bygglet. |
| **Bygglet** | Sammanhållet projektverktyg; beskriver hjälp, utbildning och support som inkluderat. [Produkt](https://bygglet.com/), [FAQ](https://bygglet.com/faq/) | Konkurrera även om enkelheten att byta, lära sig och få hjälp — inte bara antal automationer. |
| **Hantverksdata Entré** | Aktuell nyhetssida beskriver mobilfunktioner och AI-assistent; webb/API/agentfunktioner presenteras delvis som kommande. [Produktnyheter](https://www.hantverksdata.se/det-har-ar-nytt-i-entre/) | Mobil användbarhet och integration med kundens arbetsvardag är konkurrensytor i sig. Datera varje AI-jämförelse. |
| **Fieldly** | Bob dokumenteras som beta för bland annat textstöd och sammanfattning i en äldre hjälpartikel. Den bevisar inte aktuell bred agentorkestrering. [Bob](https://support.fieldly.com/sv/articles/8412983-sag-hej-till-bob-var-nya-ai-assistent) | Skilj på textassistans och faktisk verkställighet när vi demonstrerar skillnaden. Påstå inte att Fieldly saknar all annan AI. |
| **Blikk** | Positionerar ett sammanhållet projekt-/tidssystem med svenska ekonomiintegrationer och tydlig support. [Produkt](https://www.blikk.se/), [Support](https://www.blikk.se/support) | Trygg daglig drift och snabb hjälp behöver vara synliga delar av Handymates erbjudande. |

### Vad SmartCraft-spåret betyder strategiskt

SmartCraft uppger en kundbas på över 13 300 företag i fyra länder. Siffran är deras egen, men illustrerar att etablerade leverantörer kan distribuera nya AI-funktioner genom en redan befintlig relation. [SmartCraft AI](https://smartcraft.com/technology-and-ai/).

Min bedömning: vårt försvar kan inte vara att etablerade aktörer aldrig kan bygga AI. Det behöver vara att vi gör kundens hela arbetsflöde lättare att förstå och genomföra, med lägre friktion och synligt ansvar. Detta måste mätas i riktiga kundkonton, inte härledas ur kodmängd.

## 4. Svenska AI-utmanare: närmare än ”gamla affärssystem”

Det här var ett viktigt fynd. Urvalet visar att svenska AI-nativa erbjudanden redan överlappar våra ingångar. Det säger inte att deras produktdjup eller driftsäkerhet motsvarar Handymates.

| Aktör | Överlapp och evidens | Vad vi kan lära |
|---|---|---|
| **KlarOffert / Klara** | Marknadsför offert → projekt → faktura, mejlintag, automatiska uppföljningar och prisförslag utifrån tidigare jobb. Officiell funktionssida, inte provkörd. [Funktioner](https://klaroffert.se/features) | En namngiven AI-assistent och svensk ekonomianpassning är inte unikt i sig. Helhetsbevis och verklig avlastning måste bära skillnaden. |
| **Hantverk.ai** | Beskriver röst → offert → kundgodkännande → projekt/ÄTA. Prissidan anger inför-lansering och att betalpriser kommer vid lansering. [Produkt](https://www.hantverk.ai/), [Status/pris](https://www.hantverk.ai/pricing) | Ett mycket enkelt ingångsbudskap. Vi kan sälja ett första jobb att få gjort utan att börja med hela agentorganisationen. |
| **OffertIVA** | Marknadsför AI-offert, intern marginalkalkyl, prisstöd och vinstchans. Kund-/effektsiffror är inte oberoende verifierade här. [Produkt](https://offertiva.se/) | Synlig affärsnytta nära offerten. Kopiera inte sannolikhetstal utan validering eller måtttolkning ur foton som vore de säkra mätningar. |
| **ByggAgent** | Erbjuder analys av förfrågan, risker, följdfrågor och offertutkast. Offentlig produkt-/prissida, ingen verifierad användning. [Produkt](https://byggagent.se/) | Frågorna som saknas kan vara lika värdefulla som snabbare textgenerering. |
| **ChatAssist** | Svensk hantverkarinriktad receptionist med bokning och uppföljning; uppsättning erbjuds som tjänst. Beskriver sig uttryckligen som tidig pilot. [Produkt](https://chatassist.se/) | ”Vi hjälper dig få det fungerande” är ett eget säljargument. Anta inte mogen helhetsautomation från ett samtalsexempel. |
| **Svea AI** | Branschsida beskriver kundkontakt, offertunderlag och kopplingar till flera svenska system. De faktiska integrationernas djup är inte verifierat. [Hantverkare](https://sveaai.se/branscher/hantverkare) | Ett AI-lager ovanpå befintligt system kan konkurrera med ett systembyte. Vi behöver en tydlig bytes- och integrationsberättelse. |

**Slutsats:** vi konkurrerar både mot hela system och mot att kunden köper en smal assistent och behåller resten. En jämförelse som bara visar Handymate mot manuell administration missar ett viktigt alternativ.

## 5. Internationella förebilder

### HERO: tydlighet om vad som är tillgängligt

HERO skiljer på Voice som live och Command/Report som kommande på samma AI-sida. De visar också en möjlighet att prova rösten. Det är bättre evidens om tillgänglighet än en lista där allt presenteras likadant. [HERO AI](https://hero-software.de/ai).

Lärdom: märk Handymates demonstrerbara funktioner, funktioner som kräver aktivering och senare funktioner konsekvent. Varken säljsida, demo eller support bör lova aktiverad Lisa Live om kundens telefon-/policyförutsättningar inte är uppfyllda.

HERO erbjuder även Voice separat från det stora systemet. [Voice Standalone](https://hero-software.de/ai/voice/standalone). Det är en intressant framtida ingångsprodukt, men inte ett skäl att före lansering skapa ytterligare en produktlinje, onboarding och supportmodell hos oss.

### Jobber: mobila handlingar och tydliga behörighetsgränser

Jobbers hjälpartikel, uppdaterad 16 juni 2026 och märkt beta, beskriver röst för exempelvis offertskapande, fakturasändning och schemauppslag. Den skiljer dessutom mellan chatten och röstens skrivmöjligheter samt mellan administratörer och andra användare; utökad medarbetarröst är planberoende. [AI Voice and Chat](https://help.getjobber.com/en/articles/jobber-ai-voice-and-chat-beta/).

Lärdom: definiera vilka handlingar en montör faktiskt kan göra med röst och provkör dem som montör, inte bara som ägare. ”Logga tiden på rätt projekt” är ett starkare lanseringsbevis än ”prata med din AI”.

Jobber dokumenterar också kundval av offerttillval. [Tillvalsflödet](https://help.getjobber.com/en/articles/optional-line-items-on-quotes/). **Detta är inte ett nytt byggförslag:** Handymate har redan `item_type: 'option'`, `option_selected` och `option_default`.

### Housecall Pro: AI:n blir bara så bra som tjänstekatalogen

Housecall Pro marknadsför ett AI-team. CSR AI omfattar samtal/chatt, medan text anges som alpha på erbjudandesidan. [CSR AI](https://www.housecallpro.com/features/ai-team/csr-ai/).

Den mer intressanta källan är supporten: bokningsförmågan beror på rätt tjänster, aktivering för onlinebokning och tillgänglighet. [Best practices](https://help.housecallpro.com/en/articles/12001958-csr-ai-best-practices-and-faqs).

Lärdom: bättre agentkvalitet kan komma från att företagaren bekräftar tjänster, område, besökstid och vad som kräver platsbesök — inte från ännu en större systemprompt. Katalogen ska återanvändas i onboarding, inflöde, offert och bokning.

Serviceplanernas dokumenterade förnyelseflöde går vidare från avtal till kundbekräftelse och ny aktiv period. [Förnyelser](https://help.housecallpro.com/en/articles/6879916-service-plan-renewals). Lärdomen för oss är sammanhängande återbesök, inte att börja om med serviceavtal.

### ServiceTitan: starkaste inspirationen för nästa produktlager

Atlas positioneras uttryckligen som en AI-chefsfunktion. Agentnamn och chefsagentbegreppet är alltså inte en unik marknadsposition. [Atlas-positionering](https://www.servicetitan.com/guides/ai-automation-playbook/ai-chief-of-staff).

Samma guide beskriver dessutom koppling mellan schemabeläggning och kampanjer, affärsmöjligheter ur jobbanteckningar samt uppslag av utrustningens servicehistorik. Överlappet med vår riktning är alltså funktionellt, inte bara språkligt. Tillgänglighet per plan, godkännandegränser och utfall har inte provats här. Vi kan därför varken avfärda det som en chattbot eller fastställa att deras kedja motsvarar Handymates sanningskontrakt. [Atlas-guiden](https://www.servicetitan.com/guides/ai-automation-playbook/ai-chief-of-staff).

Field Pro beskriver stöd före och under besöket: korta ljudgenomgångar, utrustningsinformation med källhänvisning och diagnostikstöd. Ett merförsäljningsmoment anges separat som Early Access. Detta är produktpåståenden, inte provkörd kvalitet. [Field Pro](https://www.servicetitan.com/features/pro/field).

Det intressanta för Handymate är närheten till det fysiska arbetet. Vår variant bör hjälpa hantverkaren vara förberedd och dokumentera rätt — inte börja med automatisk övervakning, inspelning av alla besök eller att pressa fram merförsäljning.

### CompanyCam: fånga information en gång

CompanyCam dokumenterar hur foton och röstanteckningar kan användas till bland annat sammanfattningar och rapporter som kan granskas och delas. [AI-guide](https://companycam.com/resources/user-guides/ai).

Lärdom: dokumentationsögonblicket kan ge flera användbara underlag. Men intern observation, föreslagen ÄTA och kundpublicerad rapport måste förbli olika saker. En bild som visar något är inte i sig bevis för vad kunden beställt eller godkänt.

### Boligmappa: kundrelationen kan överleva själva projektet

Boligmappa beskriver dokumentation via fagsystem och att hantverkarens digitala kontaktuppgifter finns kvar för dagens och framtida bostadsägare. [För hantverksföretag](https://www.boligmappa.no/for-bedrifter/handverksbedrift).

Lärdom: Jobbpass och installationshistorik kan bli en återkommande servicekontakt, inte bara leveransdokument. Inför Norge bör vi undersöka integration/partnerskap med befintlig infrastruktur, inte anta att ett eget bostadsregister är den bästa vägen.

### Viktor: gör arbetet och kostnaden begripliga

Viktors prissida visar exempel på små uppgifter och större arbetsflöden tillsammans med kreditintervall, delad förbrukning och påfyllning. Den innehåller samtidigt motstridig prisinformation: Team-kortet visar 100 dollar/månad medan sidtitel/sluttext nämner 50. Därför använder jag inte ett entydigt startpris i jämförelsen. [Viktor priser](https://viktor.com/pricing).

Lärdom: visa vad Bränslet räcker till med uppmätta exempel och tydliga förbehåll. Men kopiera inte siffror eller lova att ett visst antal krediter alltid räcker till samma antal uppdrag.

## 6. Vad Handymate redan har — så vi inte föreslår samma bygge igen

Följande är belagt genom lokal kodläsning, inte ny driftverifiering:

| Grund som finns | Exempel på läst kod | Konsekvens för förslagen |
|---|---|---|
| Agentorkestrering och uppdragslärande | `lib/agent/orchestration.ts`, `lib/mission/mission-learning.ts` | Ingen ny chefagent, generell agentplattform eller parallell lärandemotor. |
| Bekräftade arbetssätt inför projekt | `lib/playbook/kickoff-candidates.ts` | Nästa-jobb-stödet ska fördjupa detta, inte skapa en konkurrerande kickoffmotor. |
| Installationsregister och källmärkta serviceintervall | `lib/installation/installation.ts` | Ingen ny utrustningsdatabas behövs som start. En materialrad är fortfarande inte en bekräftad installation. |
| Serviceavtal, intervall, bokningar och fakturaunderlag | `lib/agreements/schedule.ts`, `lib/agreements/invoice-visit.ts`, `lib/agents/lars/service-bookings.ts` | Förslaget gäller koppling och användarresa, inte att uppfinna återkommande service. |
| Kundens Jobbpass och portalåtkomst | `lib/jobbpass/jobbpass.ts`, `app/api/portal/[token]/jobbpass/route.ts` | Använd befintliga publiceringsgränser, skapa inte en ny kundportal. |
| Fakturans bevismanifest | `lib/invoices/evidence-manifest.ts` | Inget nytt generellt bevisregister eller dubbelt betalningsmått. |
| Kanalhälsa | `lib/onboarding/channel-health.ts` | Första verifierade kundinflödet kan mätas på befintliga signaler. |
| Röstanalysens avgränsning | `lib/voice/analysis-scope.ts` | Återanvänd analys-/förslagskedjan i stället för en separat foto-/röstagent. |
| Offerttillval | `lib/types/quote.ts`, `lib/quotes/generated-to-quote-items.ts` | Tillval är inte en ny konkurrentinspirerad funktion. |
| Kundimport | `app/api/customers/import/route.ts` | Förbättra importens verifiering och kvittens i befintlig väg. |

Styrande referenser: [ACTIVE_ROADMAP](../council/ACTIVE_ROADMAP.md) och [Synlig intelligens](../design/SYNLIG-INTELLIGENS.md). Roadmapens grindar för datamängd, bevis och nya datalager gäller även när en konkurrent marknadsför något mer långtgående.

## 7. Fem konkreta produktmöjligheter

Detta är mina härledda rekommendationer. De är inte bevis för att konkurrenterna har löst allt eller att Handymate helt saknar motsvarande delar.

### A. ”Inför nästa jobb” — min favorit för nästa fördjupning

**Kundögonblick:** medarbetaren öppnar nästa bokning och får det viktigaste inför just det besöket.

Illustrativt, inte verklig kunddata:

> Lars inför ditt besök: Kunden har bett om byte av blandare. Offerten omfattar montage, men vilken blandare kunden har köpt är ännu inte dokumenterat. I senaste meddelandet bad kunden er ringa före ankomst.

Ytan visar vad som är belagt, vad som saknas och var uppgifterna kommer från. Matte kan föreslå nästa steg, men skickar inte kundfrågor utan rätt godkännande eller befintligt mandat.

**Minsta användbara omfattning:** en läsande sammanställning från bokning, rätt projekt/kund, godkänd omfattning, senaste relevanta kommunikation, installationer och befintliga checkpoints. Kort text först; valfri uppläsning därefter. Ingen ny agent eller generell arbetsflödesmotor.

**Varför nu:** projektavslut och uppföljning fångar problem sent. Förberedelsen kan fånga dem före resan eller innan arbetet börjar.

**Vad som behöver verifieras först:** jag hittade inte en dedikerad sådan sammanställning i de granskade modulerna, men morgonbrief, kickoff-copilot och andra projektytor finns redan. Gör en smal anrops-/UI-genomgång innan beslut om nya filer.

**Säkerhetsgräns:** medarbetaren får bara se sin behöriga kontext; osäker kundmatchning stoppar förslaget; intern marginal eller privata anteckningar får inte läsas upp för kunden. Ingen påhittad lagerstatus, måttuppgift eller fackmässig säkerhetsbedömning.

**Mät:** hur ofta underlaget används, hur ofta en saknad uppgift blir bekräftad före besöket och faktisk rapporterad ombokningsorsak. Påstå inte ”undvikna bomkörningar” bara för att ett kort öppnats.

### B. Återkommande affär på rätt installation

**Kundögonblick:** företaget kan se vilken utrustning som behöver vilken service, vilket avtal som gäller och vad som faktiskt är bokat eller utfört.

Bygg vidare på installation → serviceintervall → befintligt avtal/besök → utfört underlag → nästa tillfälle. Den exakta kopplingen installation–avtal har inte belagts i de granskade filerna; detta är första kontrollpunkten, inte ett påstående om att hela återbesökskedjan saknas.

**V1:** en läsande vy över bekräftade installationer som saknar entydig avtals-/besökskoppling. Ett förslag kan därefter använda befintlig godkännandekedja. Dubbelkontroll mot befintligt avtal och bokning före skapande.

**Kundnytta:** mindre letande, färre dubbla kontakter, ett lättare nästa köp för kunden. Detta kan bli en starkare långsiktig tillgång än generella SMS-kampanjer.

**Gränser:** gissa inte serviceintervall. Avtalsstart, garanti och senaste service är olika fakta. Ett intresse är inte en bokning, en bokning är inte utfört arbete och en faktura är inte betalt. Ägarbyte och delning över företagsgränser hör inte till denna V1.

**Mät:** giltiga serviceförslag → accepterade besök → utförda besök → betalda fakturor. Behåll varje steg separat.

### C. Ett dokumentationstillfälle, flera granskbara underlag

**Kundögonblick:** hantverkaren tar foton och lämnar en kort egen röstanteckning på rätt projekt.

Samma källor kan ge utkast till arbetsanteckning, ett möjligt ÄTA-underlag, kunduppdatering och komplettering av Jobbpass. Befintlig röstanalys, projektfoton och beviskedja ska återanvändas.

**Skillnaden mot ”mer AI”:** användaren behöver inte komma ihåg fyra olika registreringsställen. Originalkälla och granskningsstatus följer med.

**V1:** börja med två utdata, intern anteckning och föreslagen kunduppdatering. Ett konstaterat merarbete får föreslås som ÄTA, aldrig märkas som beställt av en bildtolkning.

**Mät:** sparade/granskade underlag per dokumentationstillfälle, rättelser och misslyckade uppladdningar. Först stabil filhantering och rätt projektkoppling, sedan fler automatiska utdata.

### D. Ett startpaket för ett faktiskt yrke och jobbslag

**Kundögonblick:** ett litet VVS-serviceföretag får relevanta inställningsförslag, inte en tom generell AI.

Återanvänd företagets tjänster, priser, checklistor och mallar. Samla dem till ett bekräftat startpaket för ett konkret jobbslag: vanliga följdfrågor, när platsbesök behövs, vad som ska dokumenteras och vilka kundmeddelanden som är aktiverade.

**V1:** ett jobbslag för pilotföretagen. Inga nya generella branschprisdatabaser. Ägaren bekräftar vad som gäller; branschförslag får aldrig framställas som företagets egen erfarenhet.

**Varför viktigt:** detta hjälper Lisa fråga rätt, Daniel begära rätt underlag och Lars förbereda rätt besök. Bättre indata kan förbättra flera agenter samtidigt.

**Mät:** tid till verifierat första inflöde och första accepterade offertutkast, samt hur ofta förslagen behöver omfattande rättelse.

### E. Ett tryggt systembyte med importkvitto

**Kundögonblick:** företagaren får veta vilka poster som importerats, uppdaterats, inte kunnat kopplas eller misslyckats — inte bara ett grönt totalantal.

Det finns redan kundimport och ekonomiintegration. Första steget är att bevisa dem och göra felbegränsningarna synliga. Ett framtida större historikbyte kan därefter omfatta relationer mellan kunder, projekt och dokument, med förhandsgranskning.

**Konkret lokalt fynd:** kundimportens uppdatering av en befintlig kund väntar på Supabase-anropet men läser inte dess `error`; räknaren `success` ökas efteråt. Därför kan kvittot rapportera framgång vid ett returnerat uppdateringsfel. Nyinsättningen läser däremot fel. Detta är ett kodbelagt felvägsproblem, inte en reproducerad produktionsincident. Se `app/api/customers/import/route.ts`, uppdateringsgrenen omkring rad 70–80. Ingen fix gjord i detta researchpass.

**Min rekommendation:** rätta och regressionstesta den grenen innan ni använder ”trygg import” som säljbevis. Ett litet kvalitetsarbete här kan ha större konverteringsvärde än ännu en agentfunktion.

## 8. Positionering och paketering

### Budskapet bör tåla att konkurrenterna också har AI

Rekommenderad huvudformulering:

> **AI-teamet för svenska hantverksföretag — från första förfrågan till betalt och nästa jobb.**

Det är en positionsriktning, inte ett påstående om att varje kanal och varje automatisk handling är aktiverad för alla kunder. Publicerad copy ska matcha lanseringsgrinden.

Behåll ”Hittar pengar. Skyddar marginalen. Minskar admin.” som nyttokompass. Gör sedan varje del konkret:

| Nytta | Vad demonstrationen ska visa |
|---|---|
| Fler jobb tas om hand | En riktig förfrågan blir rätt kund/affär och synlig uppföljning. |
| Mer utfört arbete kommer med i underlaget | Ett faktiskt extraarbete blir granskat underlag och därefter korrekt fakturering, när godkännandena finns. |
| Mindre kvällsadministration | Ett riktigt röst-/mobilmoment sparar på rätt projekt och ger synligt resultat. |
| Fler återkommande kunder | Rätt installation/servicebehov blir en relevant, godkänd kontakt — inte ett massutskick utan grund. |

Undvik ”inga konkurrenter”, ”Sveriges första” och ”alla andra är bara gamla menyer”. Researchen stödjer inte de påståendena. Humor om administrativ friktion fungerar bättre än sakpåståenden om att namngivna system saknar funktioner.

### Prissättningssignaler — inte en rekommendation att sänka priset

| Exempel, avläst 2026-08-31 | Vad som faktiskt står | Tolkning |
|---|---|---|
| KlarOffert | Plus 249 kr/mån och Premium 499 kr/mån, exklusive moms; anger Fortnox-koppling i betalda planer. [Prislista](https://klaroffert.se/pricing) | Svensk AI-/offertcopy möter redan låga prisankare. Paketens faktiska kvalitet är inte provad. |
| HERO Voice separat | 89 euro/mån vid månadsavtal eller 69 euro/mån vid 12 månader med månadsbetalning; 150 minuter ingår, därefter 0,30 euro/minut. Prislista daterad juli 2026. Momsgrund behöver kontrolleras för jämförelse. [Prisvillkor](https://hero-software.de/rechtliches/agb/preisuebersicht-hero-ai) | Ett tydligt avgränsat problem och en begriplig förbrukningsenhet. Inte jämförbart med hela Handymate. |
| Hantverk.ai | Provperiod erbjuds; betalda priser anges komma vid lansering. [Priser](https://www.hantverk.ai/pricing) | Skilj ett tidigt erbjudande från en etablerad intäktsmodell. |
| Viktor | Synlig intern prisinkonsistens; kreditpaket och påfyllning framgår. [Priser](https://viktor.com/pricing) | Kostnadskommunikation är viktig, men osäkra rubrikpriser ska inte användas som benchmark. |

Handymate bör inte motivera priset med antal agenter eller amerikanska agentkonsulters fakturor. Motivera det med sammanhängande arbete, lokal anpassning, support, dokumenterat resultat och tydliga gränser för förbrukning.

Bränslet/Tanka finns redan som produktidé och systemdel. Nästa uppgift är begriplighet: inkludering, hårt tak, varning och påfyllnad måste överensstämma mellan hemsida, app, faktura och support. Visa uppmätta normalexempel med variation, inte garanterade uppdrag per kredit.

## 9. Distribution: sådant vi kan ta efter utan mer produktplattform

### 1. Sälj den första fungerande arbetsdagen

Bygglet beskriver inkluderad utbildning/support, och Jobber visar praktisk apputbildning med vardagsmoment. [Bygglet FAQ](https://bygglet.com/faq/), [Jobbers mobilguide](https://help.getjobber.com/en/articles/jobber-app-basics/).

Förslag för Christoffer: erbjud ett avgränsat ”kom igång tillsammans”-pass med en kundimport eller ett verifierat inflöde och ett genomfört kärnflöde. Ange vad kunden behöver förbereda. Lova inte tidsåtgång förrän ni mätt de första passen.

### 2. Sälj en situation per landningssida, en produkt bakom

Exempel:

- ”Telefonen ringer medan du står hos kund.”
- ”Extraarbetet utfördes — kom det med på fakturan?”
- ”Kunden behöver service igen — vem följer upp?”

Samma Handymate, samma verkliga komponenter, olika första behov. Ingen anledning att bygga tre fristående produkter.

### 3. Välj en liten branschgrupp att lära med

Testa först med en tydlig grupp, exempelvis små VVS-serviceföretag. Samla verkliga invändningar, aktiveringshinder och återkommande rättelser. Gruppvalet är en hypotes att pröva, inte ett belagt optimalt segment.

Möjliga partners att undersöka är branschutbildare, redovisningsbyråer med hantverkarkunder och leverantörer nära yrket. Researchen belägger inte att någon viss organisation vill samarbeta med oss. Välj partners efter faktisk tillgång till rätt företag och förmåga att hjälpa dem igång, inte enbart löfte om många leads.

### 4. Bygg kundbevis som går att kontrollera

För varje case: utgångsläge, period, vad som aktiverats, antal relevanta händelser, vad som faktiskt utförts och vad kunden själv säger. Potential och bekräftat utfall ska vara separata även i marknadsföringen.

Mät kedjan demo → aktiverad kanal → första genomförda arbetsflöde → fortsatt veckovis användning → betalande/behållen kund. Klick och agentmeddelanden är inte samma sak som värde.

## 10. Vad som kan bli en verklig långsiktig fördel

Min bedömning är att de starkaste byggstenarna redan finns hos er. Fördelen uppstår först när de används tillförlitligt av kunder:

1. **Projektets sammanhang:** beställt, ändrat, utfört och fakturerat hålls samman utan att blandas ihop.
2. **Företagets bekräftade arbetssätt:** erfarenheter påverkar rätt kommande jobb, utan att gissningar blir företagsregler.
3. **Installationshistoriken:** vad som finns hos kunden kopplas till relevant framtida service.
4. **Kundens förtroende:** begriplig dokumentation, pålitliga besked och lätt väg tillbaka till hantverkaren.
5. **Pålitlig vardagsanvändning:** personalen vill faktiskt använda mobilen, inte bara ägaren som köpte systemet.

Detta är inte automatiskt exklusivt. Andra aktörer kan bygga liknande kedjor. Vår möjlighet är kvaliteten på sammankopplingen, lokal passform och hur snabbt kunderna får användbar egen historik.

Bygg inte nu:

- ytterligare agentframework, generell replay-/beslutsgraf eller lärandedatabas;
- egen marknadsplats för att konkurrera med alla andra distributionskanaler;
- nya utrustnings- eller serviceavtalstabeller innan befintliga kopplingar granskats;
- AI-uppskattad vinstchans presenterad som kalibrerad sannolikhet utan bevis;
- automatisk inspelning eller medarbetarpoängsättning som oreflekterad import från amerikanska produkter;
- generisk fackrådgivare som ersätter behörig bedömning;
- anonymiserade ”branschinsikter” utan de datagrindar, rättigheter och verkliga observationer som krävs;
- en separat Lisa-produkt före bevisad stabilitet och ett uttryckligt kommersiellt beslut.

## 11. Rekommenderad ordning

Detta är en rekommendation, inte nya åtaganden eller ändrad freeze.

| När | Prioritet | Leverans | Klart när |
|---|---|---|---|
| Före lansering | 1 | Korrigerad konkurrens-/säljberättelse | Inga obevisade först-/ensam-/alltid-påståenden; tre tydliga behov och verkliga demonstrationer. |
| Före lansering | 2 | Kärnflödesbevis med realistiska roller | Mobil tid/underlag, inkommande lead och faktureringskedja fungerar; fel syns; det är rätt kund och företag hela vägen. |
| Före lansering | 3 | Ärligt import- och aktiveringskvitto | Felaktig import räknas inte som lyckad; minst en inflödeskanal är faktiskt provad för den kund som påstås vara aktiverad. |
| Första kundveckorna | 4 | Ett branschspecifikt aktiveringspaket | Pilotgruppen kommer snabbare till användbart resultat med färre manuella räddningar. |
| Efter stabil kärna | 5 | ”Inför nästa jobb” V1 | Befintliga källor visas med rätt behörighet; osäkerheter är synliga; ingen ny motor behövs. |
| Därefter | 6 | Installation ↔ serviceavtal/besök | Samma installation kan följas utan dubbla avtal, kontakter eller bokningar. |
| Baserat på användningen | 7 | Foto/röst till fler underlag | Färre dubbelregistreringar utan fler felaktiga ÄTA-/kundpåståenden. |

### Likvärdiga prov att be konkurrenterna demonstrera

Nästa researchsteg bör vara faktisk produktprövning, inte fler reklamsidor. Be Easoft, en SmartCraft-produkt, HERO och någon svensk AI-utmanare visa samma scenario. Kontakter/demos är inte initierade här.

1. En befintlig kund skickar en ny förfrågan: rätt kund, ingen dubblett, rätt nästa objekt.
2. Kunden ändrar omfattningen efter accepterad offert: vad är förslag, godkänt och faktureringsbart?
3. En montör loggar tid med röst: rätt behörighet, rätt projekt, tydlig kvittens.
4. Ett verktyg eller en integration misslyckas: säger AI:n att det är klart ändå?
5. Visa en verkligen inkommande betalning och exakt vad AI:n får ta åt sig äran för.
6. Export, import, support, aktiveringstid och samtliga kostnader för ett litet företag.
7. Vad fungerar på svenska i dag, i vilken plan, och vad är pilot eller roadmap?

Fråga efter produktutfall, inte bara ett filmat idealscenario. Kör motsvarande prov på Handymate. Samma ribba för båda sidor.

## Slutbedömning

Vi bör gå ut med självförtroende, men inte med antagandet att ingen annan bygger åt samma håll. Researchen visar tydlig konkurrens både om AI-budskapet och om de konkreta arbetsmomenten.

**Den bästa vägen framåt är inte att samla ännu fler funktioner före lansering. Det är att göra det befintliga teamets arbete lätt att köpa, lätt att aktivera och lätt att lita på — och sedan föra samma intelligens närmare hantverkaren före och under nästa jobb.**
