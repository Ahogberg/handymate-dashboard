# Autopilot-revisionen — arbetar teamet för kunden, och vet kunden om det?

> 2026-09-04, elva dagar före lansering. Frågan från Andreas: *hur nära är vi
> att kunden känner "de arbetar för mig som en riktig anställd och
> rapporterar" — och inte "ännu ett system att klicka i hela dagarna"?*
>
> Allt nedan är läst ur produktionsdatabasen och koden i dag. Inga
> uppskattningar. Siffror utan källa finns inte i dokumentet.

---

## Kort svar

**Teamet arbetar. Kunden får inte veta det. Arbetet försvinner.**

Agenterna har kört 1 385 gånger och skapat 413 kort. Men **ingen kund har
någonsin fått en enda push-notis** — 0 prenumerationer, 0 skickade — och
**74 % av korten har gått ut orörda**. För två betalande konton är siffran
100 %: elva respektive sex kort skapade, noll öppnade, noll godkända.

Det är inte "ännu ett system att klicka i". Det är värre: ett system som
arbetar i tysthet, lägger resultatet i en låda kunden inte vet finns, och
sedan tömmer lådan. Kunden upplever ingenting alls. Och tokens har kostat
pengar för att producera arbete som avdunstat.

Det som är byggt för att visa arbetet — "Skött utan dig sedan i går" och
"Det här sköter teamet" på startsidan — är rätt ytor och väl gjorda. De
fungerar bara om kunden **öppnar appen**, och dygnsfönstret är 24 timmar.
En hantverkare som inte loggat in sedan i tisdags ser ingenting av vad som
hände i onsdags.

Loopen *agent → kort → kund → beslut → rapport* bryts alltså i tredje steget,
och allt före det blir osynligt.

---

## Siffrorna

| | |
|---|---|
| Konton | 27, varav 6 betalande, 11 med klar onboarding |
| Agentkörningar totalt / senaste 7 dagarna | 1 385 / 57 |
| Kort skapade / väntande | 413 / 28 |
| **Kort som gått ut orörda** | **304 (74 %)** |
| **Push-prenumerationer / skickade pushar, någonsin** | **0 / 0** |
| Rader i `next_best_action`, någonsin | 0 |

Per betalande konto:

| Konto | Kort | Utgångna | Godkända | Senast agerade |
|---|---|---|---|---|
| Bee Service AB (comp) | 140 | 108 | 22 | 30 aug |
| Nordström El AB | 125 | 87 | 33 | 31 aug |
| Svensson Bygg AB | 89 | 72 | 4 | 27 aug |
| Bee Service AB (active) | 11 | **11** | **0** | aldrig |
| Elexperten Stockholm AB | 6 | **6** | **0** | aldrig |
| Andreas Bygg | 0 | — | — | — |

*(Två konton heter Bee Service AB. Om det är en dubblett bör den städas
innan lansering — den ena räknas som betalande utan att någon någonsin
tittat.)*

Vilka kort blir godkända? **De som rör pengar.**

| Korttyp | Skapade | Godkända | Utgångna |
|---|---|---|---|
| `time_attestation` | 12 | 11 | 0 |
| `ata_signed_notification` | 3 | 3 | 0 |
| `invoice_reminder` | 4 | 3 | 0 |
| `karin_deadline` | 9 | 4 | 2 |
| `agent_observation` | 105 | 1 | **104** |
| `dispatch_suggestion` | 36 | 0 | **35** |
| `monthly_review` | 12 | 0 | **12** |
| `checklist_forslag` | 25 | 2 | 23 |
| `automation` | 87 | 16 | 69 |

Kunden agerar på fakturor, tider och deadlines. Observationer, förslag och
månadsgenomgångar dör till 92–100 %. Det är den viktigaste produktinsikten i
hela dokumentet: **kunden bryr sig om det som rör kassan, och inget annat
får lika mycket plats.**

---

## Var loopen bryts

### 1. Ingen får veta — push har aldrig fungerat

Tre saker på rad, alla verifierade i koden:

**a. Tabellen fanns inte.** `push_subscriptions` saknades i produktionen
tills `v198` kördes den 2 september. Varje prenumerationsförsök före det
gav 500.

**b. Klienten markerar sig som prenumererad oavsett svar.**
`components/PWAInstallBanner.tsx`:

```ts
await fetch('/api/push/subscribe', { ... })      // svaret läses aldrig
setPushGranted(true)
localStorage.setItem(PUSH_SUBSCRIBED_KEY, '1')  // körs även vid 500
```

Varje pilot som försökte före den 2 september har alltså en webbläsare som
tror att den är prenumererad, medan servern har ingenting — och **den
försöker aldrig igen**, för `localStorage`-flaggan stoppar nästa försök
innan det börjar. Samma felklass som `save-lead.js`: ett kvitto utan
täckning, fast här låser det dessutom dörren.

**c. Bara installerade PWA:er tillfrågas.**
`if (!isStandalone || !PUBLIC_VAPID_KEY) return` — en kund som använder
appen i en vanlig webbläsarflik får aldrig frågan. iOS kräver installation
(CLAUDE.md), men Android och desktop-Chrome klarar push i en flik. De
kunderna tillfrågas inte alls, och det finns **ingen knapp** för att slå på
notiser medvetet.

Konsekvens: allt som byggts ovanpå push — tysta timmar, morgonsammanfattning,
godkännandepushar — har aldrig levererat ett enda meddelande till någon.

**d. Och även när push fungerar pushar de flesta cronar inte.** Push är
inte automatisk vid kortskapande — den kopplas manuellt på ~15 ställen
(`lib/notifications/approval-push.ts:4-8`). Av alla cronar pushar bara
`hemsida-forslag`, `review-requests`, `driftlarm` och agentobservationerna.
Dessa landar **tyst i inkorgen** tills kunden öppnar appen: `missad_intakt`,
`karin_deadline`, `cert_expiry_reminder`, `promise_deadline_signal`,
`expectation_drift_signal`, `seasonal_campaign`, `tidrapport_forslag`,
`proactive_care`, `warranty_followup`, båda playbook-typerna och
`profitability_warning`. Karins deadline-kort — ett av de få kunden faktiskt
agerar på — skickar ingen notis.

**e. Morgonbriefen skickas inte, den läggs.** `lib/matte/morning-brief.ts`
skriver JSON till `business_preferences` (`morning_brief_latest`). Ingen
kanal. Den "morgonrapport" agenterna producerar varje dag klockan 05:30 är
något kunden ser bara om hen öppnar appen — samma dag.

### 2. Arbetet försvinner — korten går ut i tysthet

`maintenance`-cronen sätter `status = 'expired'` när `expires_at` passerat.
Ingenting händer sedan: ingen rad i digesten, ingen notis, inget spår för
kunden. Ett kort som ingen såg är detsamma som ett kort som aldrig fanns.

Livslängden är typiskt 7–14 dagar. Med noll pushar och 24 timmars synligt
fönster på startsidan är det nästan garanterat att en kund som inte loggar
in dagligen missar det mesta.

### 3. "Vad ska jag göra nu" har aldrig svarat

`next_best_action` har noll rader. Rotorsaken är inte en bugg utan ett
beroende som inget fyller: `lib/jarvis/next-best-action.ts` kräver
`MIN_PRINCIPLES = 1` rad med `knowledge_type = 'priority_rule'` i
`business_knowledge`, annars `skipped_no_principles`. **Inget betalande
konto har en enda sådan rad.** Cronen kör klockan 07 varje dag och hoppar
över alla.

### 4. Teamet pratar för mycket, i för många röster

**63 distinkta korttyper** i koden. Nio `team_intro`-kort från onboardingen
ligger fortfarande som väntande — det första kunden ser är tre kort som
aldrig löses. Månadsgenomgången (`monthly_review`) har skapats tolv gånger
och öppnats noll.

Ett kort ska betyda "jag behöver ditt beslut". När 74 % av korten inte
behöver något beslut lär sig kunden på en vecka att korten kan ignoreras —
och då ignoreras även fakturapåminnelsen.

---

## Vad som faktiskt fungerar

- **Agenterna kör.** 57 körningar senaste veckan, `automation_rule`-körningar
  med riktiga verktygsanrop. Motorn går.
- **Pengakorten fungerar.** Tidsattest, ÄTA-signering, fakturapåminnelser
  och Karins deadlines har hög andel godkända. Där kunden bryr sig, klickar
  kunden.
- **Rapporteringsytorna finns och är rätt.** `SkottUtanDig` skiljer
  autonomt från godkänt, ljuger inte om sitt fönster, visar tomt läge
  ärligt. `TeamBevakning` säger "Karin bevakar 4 fakturor" i stället för
  ett avatargrid. Designen är klar — det är leveransen som saknas.
- **Ärlighetsarkitekturen är rätt.** Agenter förbereder, kunden godkänner.
  Utgående automationer är avstängda som standard (46c9f7d). Det ska inte
  ändras för att fejka autopilot — se "Vad jag inte föreslår".
- **Intjänad autonomi finns och är rätt tänkt.**
  `lib/autonomy/earned-autonomy.ts`: 15 godkännanden inom 60 dagar låser
  upp fyra åtgärdstyper (fakturapåminnelse, bokningspåminnelse,
  offertuppföljning, omdömesförfrågan) med beloppstak. Det är den ärliga
  vägen till autopilot — kunden bevisar först att agenten föreslår rätt, och
  först då får agenten skicka själv. Mekanismen kan bara verka om kunden ser
  och godkänner korten, vilket är hela poängen med åtgärd 1–3.
- **Veckans innehåll finns redan.** `lib/weekly-value.ts` räknar "Din vecka
  med Handymate" och visas på dashboarden. Det som saknas är bara att
  *skicka* den.

---

## Åtgärder, i prioritetsordning

### Före lansering

**1. Laga push-prenumerationen.** `components/PWAInstallBanner.tsx` och
`app/api/push/subscribe/route.ts`. Utan det här är allt annat teori.
- Läs svaret från `/api/push/subscribe`. Sätt `PUSH_SUBSCRIBED_KEY` **bara**
  vid `res.ok`. Samma regel som väntelistan: kvittot först när servern sagt
  ja.
- Rensa den gamla flaggan: byt nyckelnamn (t.ex. `_v2`) så alla piloter som
  låstes före `v198` får en ny chans automatiskt.
- Tillåt prenumeration i flik på Android/desktop, inte bara i standalone.
  Behåll iOS-instruktionen som den är.
- Lägg en tydlig **"Aktivera notiser"**-knapp i Inställningar. Kunden ska
  kunna slå på det medvetet, inte bara råka få frågan.
- Facit: källskanning att `setItem(PUSH_SUBSCRIBED_KEY` inte förekommer före
  `res.ok`.

*Ungefär två timmar. Det här är den enskilt viktigaste raden i dokumentet.*

**1b. Pusha vid kortskapande, inte per anropsställe.** När push väl når
fram måste korten faktiskt använda den. I stället för att koppla
`sendApprovalPush` på ett sextonde ställe: gör pushen till en del av
kortskapandet (en gemensam `skapaKort()` som pushar enligt typens
`push_class`), så en ny korttyp aldrig kan glömma den. Börja med de kort
kunden redan agerar på: `karin_deadline`, `missad_intakt`,
`fakturera_projekt`, `tidrapport_forslag`.

*En kväll för hjälparen, sedan en rad per anropsställe.*

**2. Kort som går ut ska synas, inte försvinna.** I `maintenance` steg 1: när
kort expirerar, skriv en digestrad per konto — "3 förslag gick ut utan
beslut: X, Y, Z". Och **en push dagen före**: "Två förslag går ut i morgon."
Kunden får veta att teamet gjort något, även när kunden inte hann. Det är
skillnaden mellan en anställd som säger "jag lade förslaget på ditt bord i
måndags" och en som tyst river det.

*En kväll.*

**3. Kortdiet.** Korttyper med > 90 % utgång slutar vara kort:
`agent_observation`, `dispatch_suggestion`, `monthly_review`,
`checklist_forslag`. De blir **rader i digesten** — synliga, ingen knapp,
inget beslut. Kort reserveras för det som faktiskt kräver ett ja eller nej.
Då betyder ett kort något igen, och fakturapåminnelsen drunknar inte.

*Ett pass per typ; börja med `agent_observation` som är 105 av 413.*

**4. NBA: fyll beroendet eller stäng cronen.** Två vägar:
- Seeda `priority_rule` ur onboardingens "Så jobbar du"-svar
  (`Step3HowYouWork`) — kunden har redan sagt vad som är viktigt, det
  sparas bara inte som en princip.
- Eller sätt `MIN_PRINCIPLES = 0` med tre husregler som standard (pengar
  före allt, förfallet före kommande, kund som väntar före internt).

En cron som kör varje morgon och hoppar över alla är en kostnad utan värde.
Väljs ingen av vägarna: ta bort den från `vercel.json` tills den kan ge
något.

**5. Lös `team_intro`-korten.** Nio konton har sina tre intro-kort liggande
som väntande sedan onboardingen. Antingen auto-lös dem efter första
inloggningen, eller gör dem till det första "det här gjorde vi åt dig i
natt". Ett kort som aldrig går att stänga lär kunden att kort inte betyder
något.

### Första veckorna efter lansering

**6. Veckorapporten.** Specen finns
(`tasks/spec-sag-det-en-gang-och-veckan.md`, del B). Ett SMS eller mejl
varje fredag: "Den här veckan: Karin bevakade 4 fakturor, Daniel följde upp
2 offerter, Lisa fångade 3 samtal du missade. 2 förslag väntar." **Det är
det ögonblick Andreas beskriver** — en anställd som rapporterar. Ingen
annan åtgärd i dokumentet skapar den känslan lika direkt. Den kräver dock
att push eller SMS fungerar först, därav ordningen.

Innehållet är **redan räknat** i `lib/weekly-value.ts` — det är bara
utskicket som saknas. Det gör den billigare än den ser ut: en cron på
fredag eftermiddag som hämtar `getWeeklyValue` per aktivt konto och skickar
det som SMS via den befintliga 46elks-strypunkten. En eftermiddag.

**7. Dygnsfönstret i `SkottUtanDig`.** 24 timmar är ärligt men hårt. Visa
"sedan du var här senast" i stället — fönstret börjar vid kundens senaste
inloggning. Då ser en hantverkare som varit på bygget i tre dagar tre
dagars arbete, inte ett tomt kort.

**8. Kill-switchen har ett hål.** `app/api/cron/evaluate-thresholds/route.ts`
kontrollerar inte `agents_globally_paused` (rad 27 väljer alla företag) och
kan via v3-regler skicka SMS och e-post till kundens kunder
(`lib/automation-engine.ts:298, 354`). Reglerna är per konto och skapas av
användaren, så risken i dag är låg — men "globalt pausad" ska betyda
globalt. En rad, samma mönster som de andra cronarna.

**9. Dubbletten Bee Service AB.** Utred om det är två konton för samma firma.
Ett av dem har 11 kort, 0 öppnade och räknas som betalande.

---

## Vad jag inte föreslår

**Att slå på de utgående automationerna för att skapa autopilot-känslan.**
Det vore den snabba vägen till "wow, de skickar SMS åt mig" — och den vägen
stängdes medvetet den 2 september (46c9f7d) för att inget av det var bevisat
mot riktiga kunder. Ett SMS till en hantverkares kund som är fel är inte en
bugg, det är en förlorad kund för hantverkaren, och hantverkaren vet vem som
skickade det.

Autopilot-känslan ska komma från **rapporteringen**, inte från autonoma
utskick. "Karin förberedde tre fakturor, de väntar på dig" är en anställd
som arbetar. Kunden ska känna att någon har jobbat, inte att någon har
skickat saker i kundens namn utan att fråga. Det första är det vi lovat.
Det andra är det vi uttryckligen inte lovat.

---

## Hur det mäts

Tre tal, samma fredag som veckopulsen:

| | Nu | Mål vecka 4 |
|---|---|---|
| Push-prenumerationer per betalande konto | 0 / 6 | 5 / 6 |
| Andel kort som går ut orörda | 74 % | < 30 % |
| Konton som öppnat appen senaste 7 dagarna | *mäts inte* | alla betalande |

Det tredje talet finns inte i dag. Det borde det göra — det är det tal som
säger om kunden överhuvudtaget kommer tillbaka.
