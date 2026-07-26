---
typ: agent-artikel
målsökord: offert uppföljning hantverkare, offerter utan svar, vinna fler jobb offert
status: UTKAST — ej godkänd
---

# Daniel — den som följer upp offerterna du hinner skicka men inte jaga

## Problemet

Du lägger en timme på en offert. Skickar den. Sedan tystnad.

Att ringa upp och fråga känns påträngande, och veckan går. Efter tre veckor är
det för sent att höra av sig utan att det blir konstigt — och du får aldrig veta
om kunden valde någon annan, sköt upp jobbet, eller bara glömde bort det.

De flesta offerter som förloras, förloras inte på priset. De förloras på
tystnaden efteråt.

## Vad Daniel gör

Daniel är teamets säljare. Hans jobb är att se till att ingen offert dör av
förbiseende:

- **Håller reda på vilka offerter som inte fått svar** och hur länge de legat.
- **Föreslår en uppföljning** när det gått lagom lång tid — med ett färdigt
  utkast till meddelande som du kan skicka som det är eller skriva om.
- **Ser vilka offerter kunden faktiskt öppnat**, så en påminnelse till någon som
  läst tre gånger kan låta annorlunda än till någon som aldrig öppnat.

Som allt annat i teamet: förslaget hamnar i din kö. Du bestämmer om, när och
med vilka ord.

## Varför uppföljning är obekvämt — och därför värdefullt

Uppföljning är en av de mest lönsamma sakerna en hantverksfirma kan göra, och
en av de minst gjorda. Inte för att den är svår, utan för att den kräver att
någon håller reda på datum och vågar höra av sig.

En påminnelse som kommer från "ditt kontor" i stället för från dig personligen
tar bort mycket av obehaget. Det är lättare att skicka "hej, hörde inget — är
offerten fortfarande aktuell?" när någon annan redan formulerat den och du bara
behöver säga ja.

---

## Källkontroll

| Påstående | Stöd | Bedömning |
|---|---|---|
| Håller reda på obesvarade offerter | Daniel `quote-follow-up`-cron, **BYGGT** | OK — funktionellt, ingen drift-historik |
| Föreslår uppföljning med färdigt utkast | Daniel **BYGGT**, gatad via approval | OK — "föreslår", aldrig "skickar själv" |
| Ser om kunden öppnat offerten | Offert-spårning finns (vinnaranalys/öppnat-data) | OK funktionellt |
| Förslaget hamnar i kön, du bestämmer | Godkännandekö **LIVE** | OK |

**⚠ STATUS-FLAGGA:** Daniel är **BYGGT**, inte LIVE — "end-to-end i prod EJ
bekräftat" enligt inventeringen. Texten beskriver därför bara VAD han gör,
aldrig hur väl det fungerat, och innehåller ingen statistik, inga
konverteringssiffror och inga omdömen om utfall. Godkänn medvetet: är du bekväm
med att beskriva en BYGGT-funktion i nutid på en permanent sida? Alternativ
formulering om du vill vara strängare: *"Daniel är byggd för att hålla reda
på…"*.

**Medvetet utelämnat:** siffror på hur många fler jobb uppföljning ger,
"vinnaranalysen" (deployad 07-15, ingen har använt den skarpt), allt om
automatisk sändning utan godkännande.
