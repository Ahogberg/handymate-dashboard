# Designprompt till Claude Design — bokföringen, version 2

> Claude 2026-09-15. Ersätter [version 1](BOKFORING_UI_DESIGNPROMPT.md) efter Andreas genomgång av den första
> canvasen. Tre saker ändras: Karin bokför, fyra saknade ytor läggs till, och byrån får en egen ingång.
> Grunden är [roadmapens](../HANDYMATE_ACCOUNTING_ROADMAP.md) §2.1 och §8: Handymate Accounting är inte ett
> bokföringsverktyg utan en tjänst som bokför själv och eskalerar undantag till människor.
> Klistra in allt mellan linjerna i Claude Design.

---

## Uppdrag

Designa huvudstrukturen och elva skärmar för bokföringen i **Handymate**, en svensk plattform för
hantverksföretag. Handymate gör i dag allt från kundkontakt till faktura och synkar till Fortnox. Vi bygger
bokföringen själva för att ersätta Fortnox för en första kundgrupp den 1 januari 2027.

Det som skiljer Handymate från Fortnox är inte fler skärmar. Fortnox får dig att bokföra. **Handymate bokför,
och visar dig.** Bokföraren heter Karin. Hon är en av Handymates namngivna AI-kollegor och sköter redan
fakturor, påminnelser och skattedeadlines. Designa så att det är hennes arbete man ser, inte en tom
instrumentpanel som väntar på att fyllas i.

Leverera en pan- och zoombar canvas med elva artboards.

## 1. Tre användare, inte två

**Hantverkaren** äger företaget och är på telefon, ofta i bil eller på tak. Hen vill inte bokföra. Hen vill
veta att det är skött och få en fråga när det behövs. Hens vanligaste egna bokföringshändelse är ett kortköp på
Ahlsell med ett kvitto i fickan. Hen kan inte redovisningstermer och ska inte behöva lära sig dem.

**Redovisningskonsulten** arbetar på en byrå med flera klientföretag vid en stor skärm. Hen är den som avgör om
kunden vågar lämna Fortnox. Hens jobb i Handymate är inte att bokföra utan att **granska Karins arbete och ta
undantagen**. Hen blir irriterad av förenklingar som döljer vad hon behöver, och hen är ansvarig när hon
signerar, så hon måste kunna se exakt vad som gjordes och varför.

**Karin** är den tredje. Hon syns i gränssnittet som avsändare av förslag och som den som gjort arbetet.
Hon har ett namn och en ton, aldrig en robotikon. Hon förklarar alltid med en anledning, inte en procentsiffra:
*"Samma leverantör och samma konto som 38 gånger tidigare"*, inte *"92 % säker"*.

**Designkonsekvens:** Skärm 2 är för telefon. Skärm 3 till 11 designas för 1440 px och behöver bara vara
läsbara på mobil.

## 2. Förtroendemodellen — det viktigaste i hela prompten

Frågan "är de trygga med AI i bokföringen" avgörs inte av om Karin bokför, utan av att man alltid kan se vad
hon gjorde, varför, och stänga av henne. Designa dessa fem regler så att de syns:

**Karin bokför inom konsultens regelbok.** Hon hittar aldrig på ett konto. Reglerna är konsultens, Karin
tillämpar dem. Varje verifikat hon skapar säger vilken regel som gällde: *"Bokfört enligt regel 4, kundfaktura
med ROT"*. Om ingen regel passar frågar hon.

**Tre nivåer per typ av händelse, och de syns.** För varje slags bokföringshändelse befinner sig Karin på en av
tre nivåer, och konsulten ser var:

| Nivå | Vad Karin gör | Hur det ser ut |
|---|---|---|
| **Frågar** | Föreslår, väntar på ett ja | Ett kort med förslaget, anledningen och tre svar: ja, ändra, nej |
| **Bokför och visar** | Bokför direkt, listar varje post i morgonkvittot | Raden i kvittot med *"Stäng av"* bredvid |
| **Bokför, du ser antal** | Bokför direkt, räknas per typ | *"Karin bokförde 38 kundfakturor"* |

Hon flyttas uppåt när konsulten godkänt samma slags förslag utan ändring tillräckligt många gånger. Det är
samma förtroendetrappa som Handymate redan använder för utskick. Visa trappan för en typ på konsultens
översikt.

**Av med ett tryck, per typ, och det håller.** Konsulten kan stänga av Karin för en enskild typ. Det gäller
direkt, hon frågar igen från nästa gång, och hon erbjuder inte att ta över igen på en månad. Visa var knappen
sitter och hur det ser ut efteråt.

**Tre saker Karin aldrig gör.** Hon låser aldrig en period, hon skickar aldrig momsen, och hon rättar aldrig i
en stängd period. De tre är alltid en människa. Designa så att det är uppenbart: de knapparna har inget
Karin-avsändare.

**Allt hon gjort går att spåra hem.** Från varje belopp till verifikatet, från verifikatet till affärshändelsen,
från händelsen till källan: fakturan, kvittofotot, bankraden. Visa kedjan som klickbara brödsmulor:
`Kvitto 14 sep → Karin, regel 7 → Verifikat V-241`.

## 3. Ärlighetsregler för texten

- Skilj alltid på **föreslaget**, **bokfört** och **granskat**. Tre ord, tre tillstånd.
- Ett utfall som inte är bekräftat heter *"inte bekräftat"*, aldrig "klart".
- Karin *föreslår* och *har bokfört enligt regel*. Skriv aldrig "AI:n", "automatiskt", "systemet har bestämt".
- Inga interna termer: aldrig "kernel", "event", "intent", "flagga".
- Svenska. Hantverkarens ord i skärm 2, fackspråk i resten.
- Belopp `12 480,50 kr`. Datum `14 sep` eller `2026-09-14`.

## 4. Varumärket — exakt dessa värden

```
Typsnitt
  Rubriker      Space Grotesk
  Brödtext      DM Sans
  Siffror       JetBrains Mono — endast stora belopp och räknare i hero-ytor, aldrig löptext

Färger
  Primär teal   50 #f0fdfa · 100 #ccfbf1 · 300 #5eead4 · 500 #14b8a6
                600 #0d9488 · 700 #0f766e · 800 #115e59 · 900 #134e4a
  Sekundär blå  500 #0ea5e9 · 700 #0369a1   (sparsamt: länkar, sekundära tillstånd)
  Sidomeny      #1a3a4a, mörkare #0f2a35, ljusare #2a4a5a
  Bakgrund      #f8fafc
  Text          #1e293b

Gradienter — bara på stora ytor
  Mörk hero     linear-gradient(135deg, #0f2e2a, #134e4a)
  CTA-knapp     linear-gradient(135deg, #0f766e, #14b8a6)
  Svag ton      linear-gradient(135deg, rgba(13,148,136,.10), rgba(20,184,166,.04))

Radier        kort 16px · fält 10px · hero 20px
Rörelse       snabb 150ms · normal 250ms · långsam 400ms · ease cubic-bezier(.2,.8,.2,1)
```

Lugn och kompetent, inte pigg. Vitt kort på ljusgrå bakgrund, generös luft. Teal är accent, inte fond.
Inga illustrationer, inga emoji. **Färg bär aldrig information ensam**: ett fel har ord och ikon.

Karins avsändarmarkering ska vara diskret och konsekvent: samma lilla namnmärke överallt, aldrig en
chattbubbla.

## 5. Informationsarkitektur — artboard 1

Behåll version ettens beslut: bokföringen är **ett eget läge** man växlar in i från Handymates sidomeny, med
egen navigation och *Tillbaka*. Hantverkaren som aldrig växlar in märker bokföringen på högst tre ställen.

Nytt: **byrån har en egen ytterdörr.** Konsulten loggar inte in i Handymate och letar sig fram. Hen landar
direkt i byråvyn, som kan bära egen identitet, till exempel *Handymate Byrå*, med samma varumärke men utan
offerter, bokningar och allt annat hon inte bryr sig om. Från byråvyn går hen in i ett klientföretags
bokföring. Rita båda dörrarna på kartan och skriv en mening om varför det är samma produkt och inte två.

## 6. Skärmarna — artboard 2 till 11

**2 · Karins rapport** *(telefon, hantverkaren)*. Ersätter version ettens bokföringsöversikt. Det här är inte
en instrumentpanel utan ett besked: *"Bokföringen är i fas. Karin bokförde 41 poster den här veckan. En fråga
väntar på dig."* Frågan är ett kort med samma tre svar som i Godkännanden. Nästa momsdatum. Ett foto-kvitto
kan tas härifrån. Inget annat.

**3 · Konsultens översikt** *(skrivbord)*. Periodens läge, Karins arbete sedan senast, undantagen som väntar,
förtroendetrappan per händelsetyp med av-knapparna, nästa momsdatum, periodlåsets status. Ska svara på "vad
behöver jag titta på?" på tre sekunder. Det är konsultens startsida för ett klientföretag.

**4 · Verifikationer.** Lista och detalj. Filtrerbar på period, konto, belopp, typ och *vem som bokförde*
(Karin eller människa). Detaljen visar debet och kredit, regeln som gällde, och brödsmulorna hem. Visa också
**ett manuellt verifikat som skapas** av konsulten, för periodisering eller rättelse, och hur en återföring
pekar på originalet. Det manuella verifikatet har inget Karin-märke.

**5 · Huvudbok och rapporter.** Kontoöversikt med saldon, klick ner i ett konto. Balans- och resultaträkning
med jämförelse mot föregående period. Täthet före luft.

**6 · Avstämning.** Bankens rader till vänster, systemets poster till höger, matchade par i mitten. Tre
tillstånd: Karins säkra match, Karins föreslagna match som väntar på ja, och rad utan motsvarighet. Det sista
är det viktiga fallet.

**7 · Kvitton och utlägg** *(ny)*. Hantverkarens kortköp. Ett fotograferat kvitto, Karins tolkning bredvid:
leverantör, belopp, moms, föreslaget konto, anledning. Visa tre lägen: Karin är säker och har bokfört, Karin
frågar, och ett kvitto som inte gick att läsa. Visa också vad hantverkaren ser i telefonen när hen tar fotot.

**8 · Leverantörsbetalningar** *(ny)*. Leverantörsreskontran: vad vi är skyldiga, till vem, när det förfaller.
Attest. Och vägen att betala: en betalfil till banken eller en markering att det betalats manuellt. Utan den
här skärmen kan kunden inte lämna Fortnox.

**9 · Momsunderlag.** Deklarationens rutor, beloppen, och vägen ner till verifikaten bakom varje ruta.
Signeringen hos Skatteverket görs alltid av den skattskyldige, aldrig av en leverantör. Designa tillståndet
*"underlaget är förberett och skickat till Skatteverket, du signerar där"* med en tydlig knapp vidare. Den
knappen har inget Karin-märke.

**10 · Periodavslut och arkiv.** Checklistan som blir grön: allt avstämt, inga oförklarade differenser,
momsen klar, Karins öppna frågor besvarade. Sedan lås. Visa hur man låser upp, vem som gjorde det, att det
loggas. Och **arkivet**: bokföringslagen kräver att underlagen bevaras i sju år. Visa var kvittofoton,
fakturor och bankfiler ligger, per period, och hur man tar ut dem.

**11 · Byråvyn.** Konsultens ytterdörr. Klientföretagen i en lista: periodens läge, Karins arbete, antal
undantag, nästa moms. Härifrån in i ett företag. Visa också ägarens spegelbild: vem på byrån som har åtkomst,
sedan när, och spåret över vad de gjort. Det är en förtroendefråga för hantverkaren.

## 7. Siffror att designa mot

Ett mindre AB: ungefär 40 kundfakturor och 25 leverantörsfakturor i månaden, 60 kortkvitton, omsättning
runt 3,5 miljoner om året, moms kvartalsvis, ROT på en tredjedel av kundjobben, ett bankkonto. Karin står på
nivå tre för kundfakturor, nivå två för leverantörsfakturor och nivå ett för kvitton. Konsulten i byråvyn har
sex klientföretag.

Trovärdiga svenska namn. Minst ett problemfall per skärm: en bankrad utan matchning, ett oläsligt kvitto, en
differens på 1,50 kr, en leverantörsfaktura som förfaller i morgon.

## 8. Vad som inte ska designas

Lön, årsredovisning, anläggningsregister och deklarationer utöver momsen ligger utanför. Ingen inloggning,
ingen onboarding, inga inställningsskärmar. Inte Fortnox-migreringen som egen yta.

---

## Så används resultatet

Canvasen är underlag för förmågematrisens rader C2, C5 och de fyra nya ytorna, och för novembers genomgång av
konsultresan. Ta med den till redovisningskonsulten när en är på plats. Hens reaktion på förtroendemodellen i
§2 är det viktigaste vi kan få: om hon inte litar på trappan litar ingen konsult på den.

Implementationen väntar på konteringsmotorn C8. Designen väntar inte på något.
