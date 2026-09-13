# Branschpaket och kundintag i onboarding

2026-09-11. Implementerat på arbetsgrenen; inte produktionsverifierat.

## Produktbeslut

Fem breda förslag per namngiven bransch. 3–5 val är en rekommendation, aldrig en gräns; en specialist kan välja ett jobb och kunden får lägga till fler eller egna. Övrigt börjar med egna namn och har frivilliga exempel. Tidigare kundnamn, sluggar, artikelpriser och mallar skrivs inte om. Gamla, smalare exempel finns kvar under Visa fler.

**Användarens korrigering:** Starter finns inte längre som aktuellt erbjudande. Offertmallar och jobbtypsupplägg ska inte begränsas till fem. Antalstaket har tagits bort i featuredefinitionen, vanliga mall-API:t och skapandet av standardupplägg. Äldre lagrade planvärden får inte återinföra taket. Inget antalstak identifierades i jobbtyps-API:t. Andra förbruknings- eller faktureringsregler ändras inte av detta paket.

## Startpaket och avlastning per bransch

Katalogens fulla omfattning, arbetsartikel, materialidéer och kompletteringsfrågor finns i `lib/onboarding/trade-start-packages.ts`. Förslagen är redaktionella, inte statistik eller tekniska installationsinstruktioner. Kundens svar på var förfrågningarna kommer in styr prioriteringen; tabellen är exempel på nyttan, inte ett automatiskt kanalval.

| Bransch | Fem startpaket | Exempel på första avlastning |
|---|---|---|
| Elektriker | Service och felsökning; El vid renovering; Elcentral och elsäkerhet; Laddbox; Belysning | Fånga telefonförfrågan eller inkommande mejl; fråga efter omfattning och utrustning inför offert |
| VVS | Service och reparation; Badrum; Kök och vatteninstallationer; Värmeinstallation; Avlopp | Fånga serviceförfrågningar och särskilj felbeskrivning från större offertunderlag |
| Bygg/snickeri | Invändig renovering; Köksrenovering; Altan och utebyggnation; Fönster och dörrar; Tillbyggnad | Samla kundens omfattning och avgränsningar från mejl/formulär; komplettera saknade uppgifter |
| Måleri | Invändig målning; Fasadmålning; Snickerimålning; Tapetsering; Trapphus och gemensamma utrymmen | Samla ytor, underlag, kulör och åtkomst inför offert |
| Tak/plåt | Takomläggning; Takservice och reparation; Takavvattning; Takfönster; Byggnadsplåtslageri | Skilj reparationsförfrågan från planerat projekt; fråga efter taktyp och omfattning |
| Mark/anläggning | Markförberedelse; Dränering och dagvatten; Stenläggning och uppfart; Grundarbete; Utomhusmiljö | Samla yta, nivåer, åtkomst, massor och återställning |
| Totalentreprenad | Bostadsrenovering; Badrum; Kök; Tillbyggnad; Nybyggnation | Samla handlingar och ansvarsfördelning; inga antagna UE-kostnader eller dubbeldebiterat arbete |

Måleriets tidigare förslag Underhållsmålning överlappade övriga paket. Det ersätts i starturvalet av Trapphus och gemensamma utrymmen med tydligare omfattning.

## Det kunden kan göra

1. Välj breda jobbtyper, fler exempel eller egna namn i befintligt jobbtypssteg. Tidigare val som ligger utanför de fem syns som fler valda jobb och kan inte försvinna bakom kompakteringen.
2. Förbered en jobbtyp i befintlig offertuppsättning. Paketet beskriver omfattning, arbetskostnad, materialidéer och vilka frågor som måste besvaras för den aktuella kunden.
3. Återanvänd en artikel från företagets register, eller öppna befintlig produkteditor med ett förslag. Arbetsförslag har tim som föreslagen enhet och arbetskategori; material har st som redigerbart förslag. Namn, produktspecifikation, enhet och eget pris granskas innan sparning. Inga paketpriser eller uppdragsmängder läggs in automatiskt. Inga ROT-/RUT-behörigheter aktiveras från paketnamn.
4. En skapad artikel väljs i befintlig radeditor och kopplas efter uttryckligt mängdval. Priset delas med andra jobb som använder samma artikel. Befintlig servervalidering, idempotent artikelhantering och mallens versionskontroll återanvänds.
5. Arbetskostnaden visas som saknad om ingen kopplad artikel har arbetskategori eller uttrycklig arbetsandel. Ett fastprispaket med arbetsandel kan uppfylla detta utan extra timrad. Det är en kontroll av underlaget, inte ett löfte om färdig prissättning eller korrekt ROT-beräkning.

## Integrationsvägen

Kontaktsteget frågar ”Var kommer flest nya kundförfrågningar in?”: telefon, e-post, hemsida/formulär, annat/vet inte. Val och eventuell e-postleverantör sparas via befintligt onboarding_data, utan nya DB-kolumner eller nytt huvudsteg. Kunden kan avstå.

- Telefon: vägledning till befintligt nummer- och samtalsprov. Ett kanalval skapar inget bevis och ändrar inget agentmandat.
- E-post: läs aktuell vidarebefordringsadress från befintligt API. Kunden kan uttryckligen skapa adressen via samma provisionering som inställningarna använder. Först därefter visas instruktion att vidarebefordra och skicka prov. En ny adress får aldrig visas som provad.
- Gmail/Google Workspace respektive Microsoft/Outlook kan anges som behov, men presenteras inte som färdiga direktkopplingar. [Separat integrationsplan](../runbooks/MAIL_INTEGRATIONS_PREPARATION.md) gäller fortfarande.
- Webb/formulär: vägledning till e-post från befintligt formulär eller befintlig widgetkonfiguration efter onboarding. Installation och mottaget kundärende måste provas separat.
- Fortnox följer sitt befintliga anslutningsflöde; bransch- eller kanalvalet aktiverar det inte.

Vidarebefordran ger inte åtkomst till historiska mejl och bevisar inte sändning som företagets adress. Inaktiv adress, läsfel och provisioneringsfel visas. Kundmatchning och svar provas separat. Inga riktiga adresser skapas i demon.

## Acceptans och kvarvarande prov

88 godkända riktade kontrakts-, DOM- och lokala databastester täcker katalogen, arbetskostnadens metadata, bevarade kundjobb, fler än fem mallar, mall-/artikelägarskap och priser samt kanalval/provisionering/fel. Typkontroll godkänd med 8 GB heap. DOM-tester är inte en visuell webbläsargranskning.

Liveprov av återupptagen onboarding, liten skärm, sparade steg över ny inloggning, mottaget vidarebefordrat mejl och faktisk offertresa återstår enligt tidigare uppskjutet browserprov. Ingen proddata har massändrats eller seedats i detta arbete. Branschpersoner bör fortsatt granska paketens benämningar och omfattning inför senare katalogförfining.
