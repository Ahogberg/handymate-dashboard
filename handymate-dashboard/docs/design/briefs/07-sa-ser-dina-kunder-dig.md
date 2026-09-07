# Design-brief 7 — "Så ser dina kunder dig"

Skapad 2026-09-07. Att klistra in i Claude Design. Intern dashboard-yta som gör pitchen "du ser mer professionell ut" upplevd inne i produkten — och fungerar som säljvy i demokontot.

---

## Prompt

Du designar en ny sida i Handymates dashboard, under Inställningar: **"Så ser dina kunder dig"**. Handymate är ett AI-drivet back-office för svenska hantverkarfirmor med 3–20 anställda. Användaren är ägaren av en sådan firma — ofta i mobilen, ofta på kvällen, inte designintresserad men stolt över sitt företag.

### Problemet sidan löser

I dag laddar hantverkaren upp sin logotyp på en inställningssida, väljer accentfärg och offertmall (Modern / Premium / Vänlig) på en annan — och ser aldrig resultatet. Hen vet inte hur offertmailet, fakturan, kundportalen eller SMS:en faktiskt ser ut för kunden. Löftet "dina kunder ser dig som ett proffs" förblir abstrakt.

Sidan ska ge känslan: *jag laddade upp min logga och 30 sekunder senare såg jag hela min kundresa i mina färger — det här ser proffsigt ut.* Samma sida används i säljmöten i vårt demokonto ("så här ser era kunder er").

### Designsystem att hålla sig till

Handymates dashboard: teal `#0F766E` som primärfärg, systemtypsnitt, kort på ljusgrå grund, svenska, du-tilltal. Lugnt och kompetent, inte lekfullt. Mobilen är en förstaklassyta (390 px), inte en nedskalning.

### Innehåll

**Vänster/överst — reglagen (få, tydliga):**
- Logotyp: uppladdning med direkt förhandsvisning. Visa hur den ser ut på vit grund och i sidhuvudet. Tips vid dålig fil ("Logotypen har vit bakgrund — den syns bäst som PNG utan bakgrund"), men aldrig blockerande.
- Accentfärg: 5–6 kurerade presets som alla funkar med vit text, plus fritt hex-fält. Varna vänligt om kontrasten mot vit text blir för låg.
- Offertmall: Modern / Premium / Vänlig som miniatyrer (finns i dag, kan förbättras).
- SMS-signatur: hur firmanamnet skrivs sist i varje SMS (`//Ekström Bygg`).

**Höger/under — kundresan, live i valt varumärke:**
En rad kontaktpunkter i den ordning kunden möter dem, varje som en riktig miniatyr (inte ikon):
1. Offertmailet
2. Offertsidan (i mobilram — det är kundens första riktiga intryck)
3. Bokningsbekräftelse-SMS (chattbubbla med signaturen)
4. Kundportalen
5. Jobbpasset ("Ditt hem")
6. Fakturan (mail + PDF-sida)
7. Omdömesförfrågan

Klick/tryck på en kontaktpunkt öppnar en stor förhandsvisning, med växling mobil/desktop där det är relevant. Byte av färg eller logotyp slår igenom i alla sju direkt.

**"Färdig att skicka"-mätaren:**
En positiv checklista, inte en tjatig varning: Logotyp · Accentfärg · Swish-nummer · Bankgiro · Org.nr · Kontaktuppgifter · Google-omdömeslänk. Varje saknad rad har en direkt åtgärd. Ramen är "det här gör intrycket komplett", inte "du har fel".

**Stämpeln:**
Förhandsvisningarna visar ärligt raden "Skickat via Handymate" i sidfoten. Bredvid: en kort förklaring och en länk till partnerprogrammet (stämpeln är länkad och kan ge hantverkaren provision). Inget döljs.

**"Skicka ett testmail till mig":**
Föreslå placering och utseende. Funktionen bygger vi.

### Sanningsregler

- Förhandsvisningarna använder riktig data från kontot när den finns (senaste offerten, riktig kund), annars neutral exempeldata: Ekström Bygg AB, kund Anna Lindqvist, "Badrumsrenovering Sjövägen 4", 84 500 kr, preliminärt ROT −18 000 kr.
- ROT är alltid "preliminärt". Inga BankID-påståenden. Inga påhittade kundcitat eller siffror om "hur mycket proffsigare" något blir.
- Inga emojis som ikoner.

### Tillstånd att designa

- **Tomt konto** (ny användare, ingen logotyp, teal-default): sidan ska ändå se fin ut och locka till att fylla i.
- **Komplett konto** (allt ifyllt): känslan av stolthet.
- **Demoläge**: samma sida med en diskret annotering som säljaren kan använda i mötet.

### Leverabler

- Desktop (1280) och mobil (390) för alla tre tillstånden.
- Stor förhandsvisning öppen (offertsidan i mobilram).
- Komponentlista: reglagepanel, kontaktpunktskort, förhandsvisningsram (mobil/desktop), mätaren, stämpelförklaringen.
