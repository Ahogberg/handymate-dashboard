# Offertflödets ytor — brief till Claude Design

**Uppdaterad 2026-09-19.** Underlag för ingången till en ny offert, på webb
och i appen. Läs den här filen före kanvasen.

> **Vad som ändrats sedan 2026-09-18:** ingången görs om. Andreas efter
> klickprov: *"jag tycker att det är ett jättekonstigt sätt in."* En mellansida
> med två boxar ersätter dagens startskärm. De sex ytor som redan levererats
> kastas INTE — se "Vad som redan är ritat och ska återanvändas".

## Varför den här filen finns

Säljytans README bär lärdomen, och den är dyrköpt:

> *"Kanvasen exporterar designen, inte våra funktionella krav."*

Där var det två rader i `componentDidMount` som måste överleva varje export —
faller de bort tappas partnerns provision **tyst**. Samma sak gäller här, fast
med större konsekvens: de här ytorna avgör vad som hamnar på en offert till
kund, och vad kunden betalar.

Därför är det här inte bara en beskrivning utan ett **kontrakt**.
`tests/design-offertflodet-kontrakt.spec.ts` kör i kontraktsgrinden och faller
om något i listorna nedan försvinner. Faller den efter en designexport är det
exporten som ska rättas, inte testet.

**Undantaget, och det enda:** när Andreas ändrar själva kravet skrivs den här
filen om FÖRST, sedan facit, sedan ritas det. Facit som ändras utan att
briefen skrivits om är inte ett beslut — det är en borttagen spärr.

---

## Ytorna

| Yta | Fil i dag | Status |
|---|---|---|
| **Mellansidan (NY)** | finns inte | **rita** |
| Startskärmens innehåll | `app/dashboard/quotes/new/components/quick/QuickIntake.tsx` | delas upp i boxarna |
| Frågeflödet | `components/quotes/IntakeQuestionFlow.tsx` | behålls, får ny inramning |
| Jobbtypsytan | `app/dashboard/settings/job-types/page.tsx` | **egen beställning** — se `tasks/jobbtypsytan-2026-09-19.md` |
| Offertdokumentet | `components/quotes/document/QuoteDocument.tsx` | **rör inte** |
| Byggaren | `app/dashboard/quotes/_shared/QuoteBuilder.tsx` | **rör inte** |

Dokumentet och byggaren är beteende, inte yta. Dokumentet är dessutom sedan
rivningen **enda radeditorn** — den rollen ska inte spridas ut igen.

---

## Mellansidan — den nya ingången

Två boxar. Inget mer.

### Box 1 — "Skapa offert genom frågeflöde"

Hantverkaren väljer **vilket** frågeflöde som ska starta. Jobbtyperna ligger
**synliga direkt i boxen** — inte bakom ett andra klick.

Det är inte en detalj utan hela villkoret för att mellansidan ska vara värd
sin plats: i dag är vägen *tryck jobbtyp → frågor*, två steg. Göms jobbtyperna
bakom ett klick blir det tre, och då har vi gjort det vanligaste fallet
långsammare för att göra det tydligare. Det bytet går vi inte med på.

Boxen har också **"Skapa nytt frågeflöde"**, som leder till jobbtypsytan.
Den ytan görs om separat (49 kontroller i dag, mätt 2026-09-19) — här behövs
bara ingången, inte ytan.

### Box 2 — "Skapa ny offert"

Rakt in i offertskaparen. I boxen finns:

- **Textfält och mikrofon** för att starta med en beskrivning. Det här ÄR
  dagens "Bygg utkast": Matte bygger ett utkast ur beskrivningen. Ingen ny
  väg, bara en flytt.
- **Blankstart** rakt in i dokumentet, det skrivna följer med som beskrivning.
- **Foto** och **kund**, båda frivilliga.

### Vad som måste finnas kvar — oförhandlat

1. **Exakt två sätt att starta.** Box 1 och box 2. Båda slutar i samma
   dokument. **Lägg aldrig till en tredje box.** Det fanns fyra vägar t.o.m.
   2026-09-17: en headerlänk "Öppna editorn direkt", en mellanskärm som
   frågade efter titel och kund som dokumentet ändå frågar om, och "Använd en
   mall" med en mallista. 2 av 39 offerter i produktionen använde en mall.
2. **Kunden är frivillig.** Hantverkaren står hemma hos någon som ännu inte
   finns i systemet. Ett tvingande kundval före beskrivningen är precis den
   grind som gör att offerten skjuts till kvällen och sedan aldrig skrivs.
   **Den gamla mellanskärmen dog av just det här** — den nya får inte
   återuppfinna felet i snyggare form.
3. **Rösten landar redigerbar** i textrutan, aldrig som en svart låda. Whisper
   hör fel på fackord, och felet blir dyrare att upptäcka om det går direkt in
   i genereringen.
4. **Jobbtyperna syns utan extra klick** i box 1. Se ovan.
5. **Blankstart döljs när offerten redan har rader** — en blankstart ovanpå
   ett inlagt upplägg är inte en väg, det är en förlust.
6. **Exempelchipsen** mot tomma-sidan-paralysen: klick fyller rutan, texten
   förblir redigerbar, chipsen döljs så fort något står i rutan.

### Kontrollbudget — 12 på mellansidan

Pilotkunden Christoffer om den gamla offertskaparen: *"för mycket, rörigt, man
får inte med allt — blir galen."* Mätningen gav ~33 interaktiva kontroller på
en **tom** offert. Dagens startskärm har tre: berätta, foto, kund.

Box 2 riskerar att svälla — textfält, mikrofon, foto, kund, två knappar — och
box 1 bär en jobbtyp per chip. **Taket är 12 synliga kontroller på
mellansidan, jobbtypschipsen inräknade.** Går designen över taket är det ett
tecken på att något hör hemma längre in, inte att taket är fel.

### Fritt att rita om
Boxarnas form och vikt, hur de ligger mot varandra på 375 px och på bred
skärm, typografi, hur jobbtyperna presenteras i box 1, hur fotona visas.

---

## Frågeflödet — behålls, får ny inramning

Frågorna bor på jobbtypen. Svaren sätter mängder på **utpekade rader** i
upplägget, kryssar tillval, och lägger in vald produkt som en rad.

### Måste finnas kvar

1. **Under varje fråga står vad svaret ändrar.** `Sätter: Klinker golv,
   Tätskikt` för mängd, `Kryssar: Golvvärme` för tillval, `Lägger in:` för val
   med artikel.

   **Det här är den viktigaste raden i hela briefen.** Första versionen
   matchade på enhet i stället för rad och gav golvytan till både golv och
   vägg — samma enhet, olika betydelse. Utan den här texten kan hantverkaren
   inte se vilken rad ett tal hamnar på, och felet upptäcks först hos kunden.
2. **En skärm, alla frågor.** Ingen guide med steg. På telefon är det snabbare
   att scrolla än att bläddra, och hantverkaren ser direkt vad som är kvar.
3. **Varje fråga går att hoppa över.** Ett tomt svar rör ingen rad.
   "Hoppa över frågorna" ger upplägget orört. "Tillbaka" lämnar allt som det var.
4. **Räknaren** "X av Y besvarade" — den visar att det går att gå vidare utan
   att fylla i allt.
5. **Röst per fritextfråga**, samma regel som mellansidan: texten landar
   redigerbar.
6. **Valfrågans alternativ är knappar**, inte en rullgardin. Det är ett val
   hantverkaren gör tillsammans med kunden, ofta stående.

---

## Vad som redan är ritat och ska återanvändas

Leveransen 2026-09-18 innehöll sex ytor. De kastas inte:

| Levererad kanvas | Vad den blir nu |
|---|---|
| `Startskarm-webb.dc.html` | **box 2:s innehåll** — textfält, mikrofon, foto, kund, exempelchips. Den ritade precis den ytan. |
| `Fragefloedet-webb.dc.html` | **oförändrad** — frågeflödet står kvar som det är |
| `App-startskarm.dc.html` | appens box 2 |
| `App-fragefloedet.dc.html` | **oförändrad** |
| `App-jobbtypsval.dc.html` | **box 1:s innehåll** — jobbtypsvalet, nu inuti en box i stället för som egen skärm |
| `Offertflodet-oversikt.dc.html` | ritas om — flödet har fått en ny första ruta |

Det som saknas är alltså **inramningen**: mellansidan som håller de två
boxarna, och hur de redan ritade innehållen sitter i dem.

---

## Appen ingår i samma beställning

Andreas 2026-09-18: appens ytor ska ingå, inte komma efter. `handymate-mobile`
behöver mellansidan också.

Appen har redan sin egen struktur som designen ska fylla, inte ersätta: fyra
flikar (Hem, Godkänn, Projekt, Mer), ChipRow (`＋ Offert`, `⏱ Tid`, `📷 Foto`)
och AllArketSheet. Offertguiden är fyra steg — kund, jobb, foton, förslag.

Underlaget finns i `tasks/gapanalys-mobilen-2026-09-18.md`.

---

## Gemensamt för alla ytor

- **Svenska.** Inga engelska termer, inga tekniska ord ("payload", "token").
- **Ljust tema, teal `#0F766E`.** Aldrig mörkt, aldrig lila.
- **375 px är huvudmåttet.** Hantverkare står på bygget med telefonen i handen.
  Ingen horisontell scroll. Minst 44 px träffyta — ofta med handskar på.
- **Ingen siffra får hittas på.** En summa räknas ur raderna, ett ROT-avdrag
  räknas av servern. En yta som visar ett tal måste kunna peka på var det kom
  ifrån.

## Hur en export blir kod

Som säljytan: designen ägs av `.dc.html`-filen, `scripts/dc_till_react.py`
kompilerar den, och den genererade filen redigeras aldrig för hand. Kör
kontraktsgrinden efter varje export — den säger vad som tappades.

**Obs om facit:** `tests/design-offertflodet-kontrakt.spec.ts` låser
fortfarande dagens form (knapparna "Bygg utkast" och "Bygg själv" på
startskärmen). Det är med flit — facit flyttas till den nya formen i samma
ändring som bygger den, inte i förväg. Tills dess vaktar det att dagens yta
inte tappar något medan den nya ritas.
