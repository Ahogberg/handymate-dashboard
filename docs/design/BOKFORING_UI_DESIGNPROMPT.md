# Designprompt till Claude Design — bokföringsplattformens ytor (version 1, ersatt)

> **Ersatt 2026-09-15 av [version 2](BOKFORING_UI_DESIGNPROMPT_V2.md)** efter Andreas genomgång av den första canvasen: Karin bokför, fyra saknade ytor, byrån får egen ingång. Behålls för diffen mot den första canvasen.

> Skriven av Claude 2026-09-15 som svar på förmågematrisens rad C5 och C2
> ([FORTNOX_CAPABILITY_MATRIX.md](../roadmap/FORTNOX_CAPABILITY_MATRIX.md)).
> Varumärkestokens nedan är lästa ur `tailwind.config.ts`, `app/layout.tsx` och `app/globals.css`, inte hittade på.
> Klistra in allt mellan linjerna i Claude Design. Redigera gärna scenariot i §7 om du vill se andra siffror.

---

## Uppdrag

Designa huvudstrukturen och åtta skärmar för bokföringsdelen av **Handymate**, en svensk plattform för
hantverksföretag. Handymate gör i dag allt från kundkontakt till faktura och synkar till Fortnox. Vi bygger nu
bokföringen själva och ska ersätta Fortnox för en första kundgrupp den 1 januari 2027.

Leverera en pan- och zoombar canvas med åtta artboards: en informationsarkitektur och sju skärmar.

## 1. De två användarna, som är helt olika

**Hantverkaren** äger företaget och ska nästan aldrig behöva vara i de här skärmarna. Hen är på telefon, ofta
i bil eller på tak, och vill se ett lugnt besked att bokföringen är hanterad. När något behöver hens beslut ska
det vara en fråga, inte en rapport. Hen kan inte redovisningstermer och ska inte behöva lära sig dem.

**Redovisningskonsulten** arbetar på en byrå, har flera klientföretag och sitter vid en stor skärm. Hen ska
kunna stämma av en månad, hitta och rätta ett fel, och signera att perioden är klar. Hen kan allt om debet och
kredit och blir irriterad av förenklingar som döljer det hon behöver. Hon är den som avgör om kunden vågar
lämna Fortnox.

**Designkonsekvens:** det här är den första delen av Handymate som är skrivbordsfokuserad. Skärm 1 ska fungera
på telefon för hantverkaren. Skärm 2 till 7 designas för 1440 px och behöver bara vara läsbara på mobil, inte
arbetsbara. Säg det i noteringarna på canvasen.

## 2. Den bärande idén: varje siffra ska gå att spåra hem

Handymates hela argument mot Fortnox är att bokföringen inte är en separat värld som någon matar. Varje
verifikat uppstår ur en verklig affärshändelse som redan finns i systemet: en faktura skickades, en betalning
kom in, en ROT-ansökan gick iväg. Vi har en händelselogg som aldrig skrivs om.

Designa så att det syns. Från varje belopp ska man kunna klicka sig till verifikatet, från verifikatet till
affärshändelsen, och från händelsen till källan: fakturan, betalningen, kortet där någon godkände något. Den
kedjan är produkten. Om en skärm visar en summa utan väg till sitt ursprung har vi designat fel.

Konkret: visa gärna kedjan som ett litet brödsmulespår i verifikatvyn, ungefär
`Faktura 2026-118 → Betalning 14 sep → Verifikat V-241`, där varje led är klickbart.

## 3. Ärlighetsregler som styr texten

Handymate har en språkregel som gäller här också: vi påstår aldrig mer än vi vet.

- Ett utfall som inte är bekräftat heter **"utfallet är inte bekräftat"**, aldrig "klart" eller "misslyckades".
- Skilj alltid på **förberett**, **skickat** och **bekräftat**. Tre olika ord, tre olika tillstånd.
- Inga interna termer i gränssnittet. Skriv aldrig "kernel", "event", "intent", "consumer", "flagga".
- All text på **svenska**, med hantverkarens ord i skärm 1 och fackspråk i skärm 2 till 7.
- Belopp i svenskt format: `12 480,50 kr`. Datum som `14 sep` eller `2026-09-14`, aldrig amerikanskt.

## 4. Varumärket — använd exakt dessa värden

```
Typsnitt
  Rubriker      Space Grotesk
  Brödtext      DM Sans
  Siffror       JetBrains Mono — endast stora belopp och räknare i hero-ytor, aldrig löptext

Färger
  Primär teal   50 #f0fdfa · 100 #ccfbf1 · 300 #5eead4 · 500 #14b8a6
                600 #0d9488 · 700 #0f766e · 800 #115e59 · 900 #134e4a
  Sekundär blå  500 #0ea5e9 · 700 #0369a1   (används sparsamt, för länkar och sekundära tillstånd)
  Sidomeny      #1a3a4a, mörkare #0f2a35, ljusare #2a4a5a
  Bakgrund      #f8fafc
  Text          #1e293b

Gradienter — sparsamt, bara på stora ytor
  Mörk hero     linear-gradient(135deg, #0f2e2a, #134e4a)
  CTA-knapp     linear-gradient(135deg, #0f766e, #14b8a6)
  Svag ton      linear-gradient(135deg, rgba(13,148,136,.10), rgba(20,184,166,.04))

Radier        kort 16px · fält 10px · hero 20px
Rörelse       snabb 150ms · normal 250ms · långsam 400ms · ease cubic-bezier(.2,.8,.2,1)
```

Tonen är lugn och kompetent, inte pigg. Vitt kort på ljusgrå bakgrund, tydlig hierarki, generös luft.
Teal är accentfärgen och ska inte dominera ytan. Undvik illustrationer och emoji.

**Färg får aldrig bära information ensam.** Ett fel ska ha ord och ikon, inte bara rött. Konsulten kan sitta
i dagsljus på en dålig skärm.

## 5. Informationsarkitektur — artboard 1

Handymate har i dag ett trettiotal ytor i dashboarden: hem, offerter, projekt, fakturor, kunder, kalender,
automationer, godkännanden, Impact med flera. Bokföringen ska in i den strukturen utan att svälla menyn och
utan att skrämma hantverkaren.

Visa som en enkel karta: dagens huvudnavigation, var bokföringen hakar i, och vad som händer med sidomenyn när
en konsult loggar in i stället för en ägare. Föreslå om bokföringen blir en egen sektion i sidomenyn, ett eget
läge man växlar till, eller något annat — och skriv en mening om varför.

Regeln: en hantverkare som aldrig öppnar bokföringen ska inte märka att den finns, mer än som ett lugnt besked
på hemskärmen. En konsult ska inte behöva leta.

## 6. Skärmarna — artboard 2 till 8

**2 · Bokföringsöversikt.** Navet. Periodens läge, vad som väntar på någon, nästa momsdatum, antal oavstämda
poster, om perioden är låst. Ska svara på "är vi i fas?" på tre sekunder. Den här ska också fungera på telefon
i en förenklad form för hantverkaren, där svaret oftast är "allt är hanterat, nästa moms den 12 november".

**3 · Verifikationer.** Lista och detalj. Listan filtrerbar på period, konto, belopp och typ. Detaljen visar
debet och kredit radvis, summorna, och brödsmulespåret hem till affärshändelsen enligt §2. Visa också hur en
rättelse ser ut: en återföring som pekar på originalet, aldrig en raderad rad.

**4 · Huvudbok och rapporter.** Kontoöversikt med saldon, klick ner i ett konto ger dess verifikat. Balans- och
resultaträkning för perioden. Det här är konsultens mest använda yta, så prioritera täthet och sökbarhet före
luft. Jämförelse mot föregående period ska finnas.

**5 · Avstämning.** Bankens rader till vänster, systemets fordringar och betalningar till höger, matchade par i
mitten. Visa tre tillstånd: säker match, föreslagen match som behöver ett ja, och rad utan motsvarighet. Det
sista är det viktiga fallet och ska inte gömmas.

**6 · Momsunderlag.** Deklarationens rutor med beloppen och vägen ner till verifikaten bakom varje ruta.
Viktigt om vägen framåt: signeringen hos Skatteverket görs alltid av den skattskyldige, aldrig av en
leverantör. Designa därför tillståndet "underlaget är förberett och skickat till Skatteverket, du signerar
där" med en tydlig knapp vidare — inte "Handymate har lämnat in din moms", för det vore osant.

**7 · Periodavslut.** En checklista som blir grön: allt avstämt, inga oförklarade differenser, momsen klar.
Sedan lås perioden. Visa också det omvända: hur man låser upp, vem som gjorde det och att det loggas.

**8 · Byråvyn.** Konsultens ingång: hens klientföretag i en lista med varje företags periodstatus och vad som
väntar. Härifrån går hen in i ett företag. Visa också hur åtkomsten ser ut från ägarens sida — vem på byrån
som har tillgång, sedan när, och var spåret över vad de gjort finns. Det är en förtroendefråga för
hantverkaren och ska inte vara gömd i inställningar.

## 7. Siffror att designa mot

Använd ett realistiskt litet hantverksföretag så skärmarna inte ser tomma eller absurda ut: enskild firma
eller mindre AB, ungefär 40 kundfakturor och 25 leverantörsfakturor i månaden, omsättning runt 3,5 miljoner om
året, moms kvartalsvis, ROT på ungefär en tredjedel av kundjobben, ett bankkonto. Konsulten i byråvyn har sex
klientföretag varav Handymate-kunden är ett.

Hitta på trovärdiga svenska namn och belopp. Blanda in minst ett problemfall i varje skärm där det är
relevant: en obetald faktura som gått till påminnelse, en bankrad utan matchning, en differens på 1,50 kr som
behöver avrundning.

## 8. Vad som inte ska designas

Lön, årsredovisning och deklarationsinlämning utöver momsen ligger utanför. Ingen inloggning, ingen
onboarding, inga inställningsskärmar. Designa inte Fortnox-migreringen som en egen yta i den här omgången.

---

## Så används resultatet

Canvasen är underlag för förmågematrisens rad C2 och C5, och för novembers genomgång av konsultresan. Ta med
den till redovisningskonsulten när en är på plats — hens invändningar mot skärm 4, 5 och 6 är mer värda än
våra egna åsikter, eftersom det är hon som avgör om en kund vågar lämna Fortnox.

Implementationen kan inte börja före paket C8, konteringsmotorn, eftersom skärm 3 till 7 saknar data att visa.
Designen blockeras däremot inte av något och är därför september månads arbete.
