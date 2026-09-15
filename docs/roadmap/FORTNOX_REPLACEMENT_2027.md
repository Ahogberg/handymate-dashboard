# Ersätta Fortnox inför bokföringsåret 2027

Datum: 2026-09-15. Ägare av produktmålet: Andreas. Gemensamt planeringsunderlag för Andreas, Codex och Claude.

## Målet

Handymate ska vara tillräckligt komplett och verifierat för att en tydligt definierad första kundgrupp ska kunna lämna Fortnox och börja bokföringsåret 2027 i Handymate från **1 januari 2027**.

Andreas har angett årsskiftet som produktmål och vill kunna pitcha ”börja nya året med oss på alla fronter”. Tidsramarna nedan är Codex föreslagna arbetsplan, inte en verifierad leveransprognos eller ett ovillkorligt kundlöfte. Septemberinventeringen ska visa om omfattning, kapacitet och externa beroenden ryms.

Vi behöver ersätta allt den valda kundgruppen faktiskt använder Fortnox till. Vilka företagsformer, bokföringsmetoder, transaktioner och tilläggstjänster som ingår ska uttryckligen fastställas. Ett företag vars nödvändiga flöden saknar stöd kvalificerar inte för full övergång.

## Baklängesplan

| Period | Arbete | Underlag som ska finnas vid periodens slut |
|---|---|---|
| **15–30 september 2026** | Definiera första kundgruppen och dess fullständiga behov. Inventera återstående produktluckor och beroenden. Säkra redovisningskonsult och tillgång till Christoffers relevanta underlag. Börja historiska prov. | Förmågematris med status, ansvarig, verifieringsprov och blockerare. Beslutad första omfattning. Plan för referensdata och konsultgranskat facit. |
| **Oktober 2026** | Slutför nödvändiga bokföringsflöden. Kör historisk återspelning och kompletterande specialfall. Starta avgränsad livepilot parallellt med ordinarie bokföring. | Reproducerbara provresultat, dokumenterade avvikelser och en fungerande pilot med tydlig källa för ordinarie bokföring. |
| **November 2026** | Prova hela kund- och konsultresan: bokföring, avstämning, rättelser, rapporter, åtkomst och export. Repetera övergången från Fortnox. | Belagd täckning av den valda kundgruppen, godkända övergångsprov och tydlig lista över kvarvarande begränsningar. |
| **Senast 30 november 2026** | Besluta vilka kunder och flöden som får gå över den 1 januari. | Dokumenterat beslut om lansering, avgränsad lansering eller uppskjutande, med namngivna ansvariga och hänvisningar till bevisen. |
| **December 2026** | Stabilisering, införande och kundförberedelser. Stäm av ingående balanser, öppna fakturor, historikåtkomst och ansvarsfördelning med konsulten. | Företagsvis övergångsplan, avstämningar, supportberedskap och hantering om övergången måste skjutas upp. |
| **1 januari 2027** | Starta de godkända företagen i Handymate enligt deras övergångsplan. | Kontrollerad start och fortsatt integritetskontroll. Inga företag flyttas enbart för att kalenderdatumet har inträffat. |

December ska huvudsakligen vara införande och stabilisering. Om centrala flöden fortfarande saknar bevis den 30 november måste omfattning eller startdatum omprövas.

## Verifieringsstrategi: kortare väntan genom bättre täckning

Tre underlag kompletterar varandra:

1. **Offentliga regler och officiell integrationsdokumentation:** underlag för hur bokföring och gränssnitt ska fungera. Konkurrenternas interna implementation är inte vårt facit.
2. **Redovisningskonsult:** granska konteringar, avgränsningar, undantag och förväntade resultat. Öppna frågor ska få dokumenterade svar som blir regler och prov.
3. **Historiska underlag och livepilot:** bevisa att Handymates implementation ger rätt resultat och fungerar i faktisk drift.

Christoffers bokföringsår är ett föreslaget referensunderlag; tillgång, omfattning och konsultgranskning är ännu inte bekräftade här. Begär även ursprungsunderlag: fakturor, kreditfakturor, betalningar, relevanta datum och manuella rättelser. En bokföringsexport kan bidra till jämförelsen men visar inte nödvändigtvis händelseordningen eller vad som var känt vid varje beslut. Historiken får inte behandlas som automatiskt felfri.

Historisk återspelning sker **i isolerad testmiljö**. Den är inte en importmetod för att återskapa gamla affärshändelser i produktionsledgern. Befintlig arkitektur för brytdatum, ingående balanser och tidigare perioder gäller vid riktig migrering.

Komplettera historiken med relevanta fall som saknas, exempelvis ROT, delbetalning, kredit, återföring, omvänd byggmoms och periodgränser. Livepiloten provar dessutom dubbla och försenade händelser, avbrott, återförsök och ändringar i anslutna system.

Styr efter **bevisade flöden och täckning**, inte bara ett godtyckligt antal veckor. Historiska prov kan förkorta liveperioden, men ersätter inte bevis för produktionsdrift. Befintliga C6-/S1-/S2-grindar fortsätter gälla; ändringar av dem kräver ett separat dokumenterat beslut. En grön jämförelse av synkade uppgifter får inte beskrivas som oberoende bevis för egen bokföringsberäkning.

## Första arbetsleveransen: förmågematris

Codex och Claude ska utgå från aktuell kod och paketlogg och fylla i en gemensam matris:

| Förmåga | Kundbehov/avgränsning | Aktuell implementation | Saknat arbete | Ansvarig | Godkännandeprov och bevis | Målperiod |
|---|---|---|---|---|---|---|
| Fylls i vid septemberinventeringen | | | | | | |

Inventeringen ska minst omfatta kund- och leverantörsfakturor, betalningar och avstämning, vald bokföringsmetod, kontering och moms, ROT/RUT där relevant, krediter och rättelser, perioder, rapporter, konsultåtkomst, spårbarhet, export och övergång från Fortnox. Lön, deklarationsinlämning och andra beroenden måste uttryckligen klassificeras som ingående, externt lösta eller uteslutna för första kundgruppen. Inget av dessa områden markeras färdigt av denna plan.

Varje punkt måste skilja mellan **byggd**, **testad**, **pilotverifierad** och **aktiverad**. Gröna tester eller mergad kod är inte i sig ett driftsatt kundflöde.

## Beslutet den 30 november

Före godkänd övergång ska vi kunna visa att:

- Kundens samtliga nödvändiga flöden ryms i den verifierade omfattningen.
- Konsultgranskat facit och prov täcker relevanta regler och undantag.
- Inga oförklarade avvikelser återstår i de flöden som ska aktiveras.
- Övergången har repeterats med balanser, öppna poster, historik och konsultens arbetsflöde.
- Driftfel, osäkra utfall och rättelser har fungerande hantering och tydligt ansvar.
- Kunden förstår eventuella externa tjänster och begränsningar.

Målet om januariövergång är inte ett beslut om pilotföretag, flaggor, retention, nya API-avtal eller produktionsmigreringar. Dessa beroenden ska följas upp separat, med ansvarig och datum.

## Kundbudskap

Målbild: **”Börja nya året med Handymate — från första kundkontakt till bokföring.”**

Innan full ersättning är verifierad säljer vi in en planerad, kvalificerad övergång. Vi lovar inte att varje Fortnox-kund kan lämna samtliga externa system den 1 januari.

Övriga förbättringar av Handymates kundupplevelse kan levereras medan bokföringsövertagandet verifieras.

## Så används och uppdateras planen

- Denna fil är den gemensamma tidsplanen för årsskiftesmålet.
- [Accounting Roadmap](../HANDYMATE_ACCOUNTING_ROADMAP.md) beskriver den bredare produktstrategin.
- [Financial Kernel Package Log](../strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md) är källa för aktuell paketstatus och nästa implementation.
- [Development Orchestration](../strategy/FINANCIAL_KERNEL_DEVELOPMENT_ORCHESTRATION.md) styr ansvar, granskning och merge.
- [Shadow Architecture](../strategy/FINANCIAL_KERNEL_SHADOW_ARCHITECTURE.md) styr vilken evidens skuggjämförelsen faktiskt ger.
- [SE Ledger Review](../strategy/FINANCIAL_KERNEL_SE_LEDGER_REVIEW.md) samlar frågor till redovisningskonsulten.

Planen ändrar inga tekniska kontrakt eller aktiveringsgrindar. Vid varje större milstolpe uppdateras förmågematrisen och en daterad notering nedan med bevis, blockerare och påverkan på årsskiftesmålet.

### Ändringslogg

- **2026-09-15:** Andreas mål om Fortnox-ersättning inför 2027 och Codex föreslagna september–decemberplan dokumenterade. Beslutspunkt föreslagen till 30 november. Historiska prov, konsultgranskning och avgränsad livepilot kombineras; inga nya produktionsbeslut fattade.
