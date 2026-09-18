# Offertflödets ytor — brief till Claude Design

**2026-09-18.** Underlag för att rita om startskärmen och frågeflödet, på webb
och i appen. Läs den här filen före kanvasen.

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

## Ytorna

| Yta | Fil i dag | Rader | Status |
|---|---|---|---|
| Startskärmen | `app/dashboard/quotes/new/components/quick/QuickIntake.tsx` | 372 | rita om |
| Frågeflödet | `components/quotes/IntakeQuestionFlow.tsx` | 166 | rita om |
| Offertdokumentet | `components/quotes/document/QuoteDocument.tsx` | 893 | **rör inte** |
| Byggaren | `app/dashboard/quotes/_shared/QuoteBuilder.tsx` | 2702 | **rör inte** |

Dokumentet och byggaren är beteende, inte yta. Dokumentet är dessutom sedan
rivningen **enda radeditorn** — den rollen ska inte spridas ut igen.

---

## Startskärmen — vad den är

Pilotkunden Christoffer om den gamla offertskaparen: *"för mycket, rörigt, man
får inte med allt — blir galen."* Mätningen gav ~33 interaktiva kontroller på
en **tom** offert. Den här skärmen har tre: berätta, foto, kund.

### Måste finnas kvar

1. **Exakt två vägar ut.** "Bygg utkast" (Matte bygger ur beskrivningen) och
   "Bygg själv" (rakt in i dokumentet, texten följer med som beskrivning).
   Det fanns fyra t.o.m. 2026-09-17: en headerlänk "Öppna editorn direkt", en
   mellanskärm som frågade om titel och kund som dokumentet ändå frågar om,
   och "Använd en mall" med en mallista. **Lägg aldrig till en tredje.** Mallar
   nås via jobbtypens upplägg — 2 av 39 offerter i produktionen använde en mall.
2. **Kunden är frivillig.** Hantverkaren står hemma hos någon som ännu inte
   finns i systemet. Ett tvingande kundval före beskrivningen är precis den
   grind som gör att offerten skjuts till kvällen och sedan aldrig skrivs.
3. **Rösten landar redigerbar** i textrutan, aldrig som en svart låda. Whisper
   hör fel på fackord, och felet blir dyrare att upptäcka om det går direkt in
   i genereringen.
4. **Jobbtypsremsan ligger inuti helskärmsytan**, inte bakom dess fixed-lager.
   Ett tryck på jobbtypen ÄR valet av upplägg.
5. **"Bygg själv" döljs när offerten redan har rader** — en blankstart ovanpå
   ett inlagt upplägg är inte en väg, det är en förlust.
6. **Exempelchipsen** mot tomma-sidan-paralysen: klick fyller rutan, texten
   förblir redigerbar, chipsen döljs så fort något står i rutan.

### Fritt att rita om
Layout, typografi, färgvikter, hur de tre kontrollerna grupperas, hur fotona
visas, hur jobbtyperna presenteras (remsa, rutnät, annat).

---

## Frågeflödet — vad det är

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
5. **Röst per fritextfråga**, samma regel som startskärmen: texten landar
   redigerbar.
6. **Valfrågans alternativ är knappar**, inte en rullgardin. Det är ett val
   hantverkaren gör tillsammans med kunden, ofta stående.

### Fritt att rita om
Kortens form, hur numreringen visas, hur ja/nej och alternativen ser ut,
rubrikhierarkin, hur räknaren och knappen sitter i foten.

---

## Appen ingår i samma beställning

Andreas 2026-09-18: appens ytor ska ingå, inte komma efter. `handymate-mobile`
behöver motsvarigheter till **båda** ytorna ovan, plus jobbtypsvalet.

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
