# De intelligenta motorerna — enkelt förklarat

_Partnerpaketet, dokument 3. Det här är dokumentet som gör att partnern kan
svara tryggt när prospektet frågar "men hur funkar AI-delen egentligen?".
Varje motor förklaras med (1) vad den gör, (2) hur den funkar i lekmanna-
termer, (3) repliken att använda. Ärlighetsgränserna står i kursiv._

## Grundidén: sensorer, hjärna, händer — och en chef

Tänk på Handymate som en anställd med tre delar:

1. **Sensorer** — allt som händer i firman flödar in: samtal, SMS, offerter
   som öppnas, tid som rapporteras, fakturor som förfaller, kalendern.
2. **Hjärnan** — AI:n (samma teknik som ChatGPT, men tränad att jobba med
   verktyg, och matad med DIN firmas priser, kunder och historik) avgör vad
   händelsen betyder och vad som borde hända härnäst.
3. **Händerna** — systemet kan självt göra saker: slå upp kunden, skriva
   SMS-utkastet, bygga offertraderna, förbereda fakturan.

Och så det som gör det tryggt: **chefen är du.** Allt som ska ut till en
kund blir ett kort i din godkännandekö. Hjärnan föreslår — du bestämmer.

En viktig konstruktionsprincip som skiljer Handymate från "AI-tillägg":
**AI:n räknar aldrig själv.** All matematik — ROT, marginaler, prognoser —
görs av vanlig, exakt programkod. AI:n används för det den är bra på:
förstå text, känna igen situationer, formulera förslag. Därför kan systemet
aldrig "hitta på" en siffra.

## Motor för motor

### 1. AI-teamet — sex specialister, inte en robot

**Vad:** Sex kollegor (Matte, Lisa, Daniel, Lars, Karin, Hanna) med varsitt
ansvarsområde, varsin personlighet och varsina verktyg.

**Hur:** När något händer — ett missat samtal, en offert som legat tyst,
en förfallen faktura — väcks rätt specialist. Den får situationen, firmans
inställningar och sina minnen av liknande lägen, och producerar ett färdigt
förslag. Kollegorna kan också lämna över till varandra: Lisa fångar
samtalet, Daniel tar över säljfrågan.

**Replik:** _"Det är inte en AI. Det är sex — och de har olika jobb,
precis som på ett riktigt kontor."_

### 2. Godkännandekön — säkerhetsspärren som är hela poängen

**Vad:** En enda kö där allt teamet vill göra mot omvärlden ligger som
färdiga kort: SMS:et färdigskrivet, påminnelsen färdigräknad. Godkänn
eller avvisa, ett tryck.

**Hur:** Tekniskt kan ingenting nå en kund utan att passera kön — det är
inte en inställning, det är hur systemet är byggt.

**Replik:** _"En robot som agerar helt själv är läskig, en assistent som
bara chattar är värdelös. Mitten — någon som förbereder allt och frågar —
är det som faktiskt går att lita på."_

### 3. Förtroendetrappan — självständighet som förtjänas

**Vad:** Rutinsaker (fakturapåminnelser, bokningspåminnelser,
offertuppföljnings-SMS, recensionsförfrågningar) kan en kollega med tiden
få skicka själv.

**Hur:** Bara efter en lång svit godkännanden i rad av exakt den typen av
förslag erbjuds du att släppa den — och även då gäller beloppsgränser
(stora belopp kräver alltid ditt OK). En enda avvisning nedgraderar
automatiskt, och du kan ta tillbaka ratten när som helst.

**Replik:** _"Första veckan frågar teamet mycket. Efter tre månader vet
det hur du prissätter och vilka kunder som betalar sent. En chatbot är
lika dum dag 100 som dag 1."_

### 4. Facit-maskinen — firmans egen historik som grund

**Vad:** För varje avslutat projekt fryser systemet facit: vad
offererades, vad tog jobbet faktiskt, vad fakturerades, vad blev
marginalen.

**Hur:** Facitet byggs automatiskt från dag ett. När underlaget räcker
(minst tre liknande jobb) används det överallt: offertgeneratorn hämtar
lärdomar från samma jobbtyp, verklighetskollen jämför dina timmar mot
utfallet.

**Ärlighetsgräns:** _Säg "systemet samlar ditt facit från dag 1" — aldrig
"AI:n prissätter åt dig". Prissättningen är din; facitet gör dig träffsäker._

**Replik:** _"Systemet ser vad du offererade, vad jobbet faktiskt tog och
vad du fakturerade. Från första jobbet samlas ditt facit — grunden för att
veta om du prissätter rätt."_

### 5. Verklighetskollen på offerter

**Vad:** Innan en offert skickas jämförs den mot dina egna avslutade jobb
av samma typ: offererade timmar mot typiskt utfall, rekommenderad buffert,
historisk marginal — och hur starkt underlaget är (begränsat/gott/starkt).

**Hur:** Ren jämförelse mot facit-maskinen. Ingen AI räknar, inget pris
ändras automatiskt — du får en varningsbanner och bestämmer själv.

### 6. Marginalvakten — larmet som går innan det är för sent

**Vad:** Bevakar varje pågående projekt: tid + material + tillägg mot
offerten. Larmar "marginal i riskzon" eller "över budget" medan det
fortfarande går att göra något.

**Hur:** Räknar löpande på riktiga tidrapporter och materialrader. Varje
larm har orsaksrader i klartext, ärligt märkta **KÄNT** eller
**UPPSKATTAT**. Ser överdraget ut som oskrivet tilläggsarbete länkar
larmet direkt till ett färdigt ÄTA-utkast.

**Replik:** _"Ett jobb som drar över med tjugo procent syns i vanliga
system först när det är klart. Här ser du det medan du kan ta betalt."_

### 7. Pengar på bordet + nattliga svepet

**Vad:** Systemet letar bakåt efter pengar som redan är intjänade men inte
fakturerade: godkända ÄTA utan faktura, ofakturerat material, avslutade
projekt utan faktura, förfallna fordringar, offerter som ligger tysta.

**Hur:** Ett nattligt svep genom firmans data. Bara fynd över en
miniminivå visas — kön ska aldrig lära dig att vifta bort kort.

### 8. Pengar in-radarn — kassaflödesprognosen

**Vad:** Fem veckor framåt: hur mycket pengar kommer in, och kommer en dipp?

**Hur:** Tre siffror som aldrig blandas: fakturerat (säkert), vägd
pipeline (offerter × sannolikhet per steg) och normalnivå (din historik).
Systemet lär sig dina kunders faktiska betaltider — och vägrar gissa om
underlaget är för tunt.

### 9. "Gör detta först" — prioriteringsmotorn

**Vad:** När flera kort konkurrerar om din uppmärksamhet rankas de: störst
ekonomisk påverkan och mest bråttom först, med motivering.

**Hur:** Rankar bara när det finns riktiga alternativ och regler DU satt
(t.ex. "kassaflöde före allt"). Finns inget underlag visas ingen låtsad
prioritering — hellre tyst än påhittad.

### 10. Lärdomar → mönster → firmaregler → experiment

**Vad:** När ett projekt avslutas svarar du på några korta frågor. Ur
svaren letar systemet mönster ("badrumsjobb i äldre hus drar alltid över
på rivning") — och ett bekräftat mönster blir en firmaregel som formar
varje framtida offert av den typen. På toppen kan systemet föreslå ett
kontrollerat test: "ska vi prova regeln på nästa fem jobb och mäta?"

**Hur:** Medvetet försiktigt — mönster kräver flera oberoende belägg, och
"inget tydligt mönster" är ett helt godkänt svar. Du bekräftar alltid
själv innan något blir regel.

**Replik:** _"Firmans dyrköpta erfarenhet brukar bo i ägarens huvud. Här
blir den regler som sitter kvar — även den dag du anställer nästa
projektledare."_

### 11. Mötesassistenten

**Vad:** Tryck "Starta mötesinspelning" hos kund. Efteråt: sammanfattning,
offertutkast, uppföljningar och kundfakta — som kort i kön.

**Hur:** Ljudet skrivs ut till text på svenska och raderas sedan — bara
texten sparas. Samtyckestext visas alltid innan start. Portkoder och
liknande är spärrade från att extraheras.

**Ärlighetsgräns:** _Ny funktion — demoa gärna, lova inte drifthistorik._

### 12. Uppdrag — från mål till plan

**Vad:** Säg ett mål till Matte: "Frigör 150 000 kr före 30 september."
Matte föreslår en konkret plan i steg (jaga de här fordringarna, följ upp
de här offerterna, fyll de här veckorna) — du godkänner, och målet följs
upp på startsidan.

### 13. Värdekvittot — beviset

**Vad:** Varje vecka och månad: _"X kr i identifierade möjligheter, Y kr
agerat på, Z kr fakturerat, W kr bekräftat betalt"_ — plus fångade samtal
och uppskattad sparad tid.

**Hur:** Kategorierna hålls strikt isär — bekräftade kronor kommer från
riktiga fakturor, aldrig från kortens egna uppskattningar, och blandas
aldrig ihop med "potential" till en fluffig ROI-siffra.

**Replik:** _"Du ska aldrig behöva tro att Handymate lönar sig. Du ska
kunna läsa det på kvittot."_

## Om prospektet frågar "vilken AI är det?"

Ärligt och kort: _"Anthropic Claude — samma modellfamilj som storbolagen
använder — plus taligenkänning för svenska. Men det viktiga är inte
modellen, det är bygget runt: din data, dina priser, din
godkännandekö. AI:n formulerar — den räknar aldrig, och den skickar
inget utan ditt OK."_

## Sammanfattningen att lära sig utantill

> Sensorerna ser allt som händer i firman. Hjärnan förstår det och
> förbereder nästa steg. Händerna gör jobbet. Och du är chefen — inget går
> ut utan ditt OK, förrän du själv valt att släppa det. För varje vecka
> som går kan mer skötas av teamet — och kvittot visar vad det var värt.
