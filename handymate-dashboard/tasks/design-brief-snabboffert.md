# Designbrief: Snabbofferten

> **Till Claude Design.** Du har repot och har redan format det mesta av produktens
> formspråk — den här briefen upprepar det inte. Den innehåller bara det du **inte** kan läsa
> dig till: varför flödet ser ut som det gör, vilka begränsningar som är hårda och varför, och
> tre fällor i offertdokumentet som är osynliga i koden men gör ett förslag oanvändbart om de
> förbises.
>
> Skrivet 2026-08-06, direkt efter att mekaniken byggts och deployats med avsiktligt
> funktionell styling. DOM-strukturen är bestämd och stabil — du lägger design ovanpå en
> fungerande yta, inte på en mockup.

**Filer att läsa först:**

| Roll | Fil |
|---|---|
| De fyra nya ytorna | `app/dashboard/quotes/new/components/quick/Quick{Intake,Building,ReviewBar,Receipt}.tsx` |
| Sektionsfokus (CSS) | `components/quotes/document/modern-css.ts` — sök `data-section` |
| Sektionsattributen | `components/quotes/document/QuoteDocument.tsx` — funktionen `section()` |
| Skalningen | `components/quotes/document/DocumentScaler.tsx` |
| Tillståndsmaskinen | `app/dashboard/quotes/new/page.tsx` — sök `quickMode` |
| Sektionsdefinitionerna | `lib/quotes/section-handlers.ts` |

---

## 1. Vad flödet är, och varför

Användaren är en hantverkare — snickare, elektriker, målare — som **står på en telefon hemma
hos en kund** och ska skriva en offert på plats.

**Snabbofferten:** hantverkaren berättar om jobbet i fritext eller med rösten, AI:n bygger
utkastet, och hantverkaren granskar det **sektion för sektion**: Inkluderat → Ej inkluderat →
Reservationer → Prisbild. Sedan en översikt, och skicka.

Bakgrunden är pilotkunden Christoffers omdöme om den gamla offertskaparen: **"för mycket,
rörigt, man får inte med allt — blir galen."** Den hade ~33 interaktiva kontroller på en tom
offert och sju av fjorton fält gömda bakom en "Mer"-rad. Snabboffertens intagsskärm har tre
kontroller.

Diagnosen bakom ombyggnaden: free-form-redigering i dokumentet är ett proffsverktygsparadigm
som förutsätter att användaren vet vad en komplett offert innehåller. Christoffer är expert på
jobbet, inte på dokumentet.

**Designkonsekvens: ytorna ska bli lugnare, inte rikare.** Se avsnitt 5 om tonläge — det är det
avsnitt som oftast går fel först, och det är den enda delen av briefen som handlar om smak.

---

## 2. Hårda ramar

### 2.1 ALDRIG `transform` inuti `.quote-document`

Den viktigaste regeln i briefen, och den enda som tyst förstör produkten om den bryts.

`DocumentScaler` skalar hela A4-sidan (793,7px) med **`transform: scale()` +
`transform-origin: top left`**. På en 375px-skärm blir skalan ~0,36–0,47. En **andra** transform
i den kedjan gör pointer-koordinater opålitliga — tryck hamnar fel. Projektet har redan valt
bort dnd-kit i offertraderna av exakt det skälet.

**Allt visuellt lyft inuti dokumentet måste göras med `opacity`, `background`, `box-shadow`,
`border`, `outline`, `border-radius` eller pseudo-element.** Inte `scale`, `translate` eller
`rotate`.

Följdeffekt av skalan: **brödtexten i dokumentet blir ~5px på telefon.** Räkna inte med att
något som står inne i dokumentet är läsbart på mobil — bärande information hör hemma i
granskningsbaren utanför. Av samma skäl ligger "+ Lägg till rad" medvetet **utanför**
DocumentScaler; inuti blev knappen ~15px hög.

### 2.2 `tailwindcss-animate` är inte installerat

Bekräftat mot `package.json` 2026-08-06. Varken `tailwindcss-animate` eller `framer-motion`
finns som beroende, och ingen ska läggas till för det här arbetet.

Klasserna `animate-in`, `fade-in`, `zoom-in`, `slide-in-from-*` är alltså **döda** — de gör
ingenting alls. De används idag på tre ställen som därmed inte animerar:

- `components/WelcomeModal.tsx:29`
- `app/dashboard/agent/page.tsx:579`
- `app/admin/page.tsx:851`

(`app/site/[slug]/StorefrontClient.tsx` använder `animate-in` som sitt **eget** klassnamn med
egen CSS på rad 357 — den är korrekt och ska inte röras.)

Om du vill kunna använda de klasserna framåt: säg det uttryckligen som ett separat förslag, så
tar vi beslutet om beroendet för sig. Blanda inte in det i den här leveransen.

Tillgängligt utan nya beroenden: `@keyframes`, CSS-transitions, och Tailwinds inbyggda
`animate-spin` / `animate-pulse` / `animate-bounce` / `animate-ping`.

### 2.3 Rörelse-tokens finns men är inlåsta

`--ob-t-fast/base/slow/bounce` och `--ob-sh-sm/md/lg/glow` är definierade i
`app/onboarding/onboarding.css` — alltså **inte** tillgängliga i offertflödet. `app/globals.css`
har inga keyframes och inga rörelse-tokens alls, och `tailwind.config.ts` har inga
`animation`/`keyframes`-extensions.

**Uppgift:** ta ställning till var de ska bo för att gälla globalt, och skriv det som färdig
kod. Om de flyttas ut ur onboarding-scopet, föreslå neutrala namn och säg det uttryckligen.

### 2.4 Plattform

- 44px minsta träffyta — hantverkare med arbetshandskar.
- `env(safe-area-inset-bottom)` i allt som är fäst nedtill.
- `prefers-reduced-motion: reduce` i **varje** keyframe-block. Idag hanterar bara två ställen i
  hela kodbasen det (`modern-css.ts` och `QuickBuilding.tsx`); vi vill inte lägga till fler som
  struntar i det. Notera att `rowsheet-fade`/`rowsheet-up` saknar den — bygger du vidare på dem,
  lägg till den.
- Z-index är taget: sticky headers `z-30`, granskningsbaren `z-40`, fullskärmsoverlays `z-50`,
  bottom sheets `z-[70]`.
- All text på svenska, inga tekniska termer synliga för användaren.

---

## 3. Koreografin — uppdragets kärna

Tre övergångar. **3B är den viktigaste och den största luckan.**

### 3A. Utkastet landar (reveal)

**Teknisk förutsättning du inte kan se i koden:** övergången går från en fullskärmsoverlay till
huvudlayouten via **tidiga returns** i `page.tsx` (sök `quickMode === 'intake'` och
`=== 'building'`). React river hela DOM-trädet däremellan.

En delad-element-morph — skelettrader som blir riktiga rader — är alltså inte möjlig utan
omstrukturering, och är **medvetet bortvald**. Skälen, så du inte föreslår den: skelettet ligger
på vit fullskärm och granskningen på en `slate-50`-dashboard, så en morph mellan två visuellt
olika sammanhang läses som en glitch snarare än som hantverk. Och skelettet har fem rader medan
svaret har 8–12 — en morph mellan olika antal kräver antingen trunkering eller påhittade rader.

**Vad vi vill ha:** en enter-animation vid montering, som fungerar utmärkt eftersom elementen är
nya. Riktvärde för sekvensen, total budget **~1,2 s**:

```
titel                    ▸ 0ms
raderna, staggade        ▸ 120ms, +60ms per rad
summan                   ▸ 400ms
villkorsstycket          ▸ 520ms
reservationsblocket sist ▸ 640ms
```

Hakar: varje sektion bär `data-section` med värdet `inkluderat` / `exkluderat` /
`reservationer` / `prisbild`. Attributet sätts **alltid**, även utanför granskningsläget, just
för att animationer ska ha stabila fästen. Dokumentroten bär `data-focus-section` vid fokus.

Sifferuppräkning på totalen är önskvärd (elementet har redan `tabular-nums`), men får inte
kräva JS-timers — en `scrollIntoView`-effekt körs redan vid montering och en konkurrerande
timer skulle slåss med den. Föreslå en ren CSS-lösning, eller markera tydligt att den kräver JS.

### 3B. Helhet ↔ sektion — DEN VIKTIGASTE

Revealen ses **en gång** per offert. Sektionsväxlingen ses **fyra**. Det är här hantverkaren
tillbringar sin tid, och det är här budgeten ska ligga.

**Luckan:** dagens CSS dimmar de andra sektionerna (`opacity: .28` + `pointer-events: none`) men
**den fokuserade sektionen får ingenting alls**. Ingen bakgrund, ingen ram, ingen markering.
"Zooma in på en del" betyder just nu enbart att resten försvinner. Kommentaren i koden lovar
"bakgrund och ram" — den lovar något som aldrig implementerades.

**Tre fällor du måste ta ställning till.** De syns inte när man läser CSS:en och gör förslaget
oanvändbart om de förbises:

**(i) Sektionerna är fyra olika elementtyper.** Ditt lyft måste fungera på alla:

| Sektion | Element |
|---|---|
| `inkluderat` | `<table>` — hela radtabellen |
| `exkluderat` | `<p class="terms">` — ett textstycke |
| `reservationer` | `<div class="reservations">` — rubrik + `<ul>` |
| `prisbild` | `<div class="totals-wrap">` **och** `<div class="payment-plan">` |

Ett kortliknande lyft på ett `<table>` kräver särskild omsorg: `border-radius` biter inte utan
`border-collapse: separate`, och tabellen har redan egen radstyling.

**(ii) `prisbild` matchar TVÅ element som inte ligger intill varandra.** Summeringsblocket och
betalplanen skiljs åt av ett betalningsavsnitt. Ta explicit ställning: två separata lyft, eller
en visuell gruppering som binder ihop dem? (Notera också att `scrollIntoView` bara träffar det
första.)

**(iii) `reservationer` och `payment-plan` kan saknas helt i DOM:en.** En offert utan förbehåll
eller utan delbetalningsplan är **helt normal** — inte ett fel. Designen får inte anta att
elementet finns och får inte se trasig ut när sektionen är tom.

### 3C. Sektion → sektion, och sektion ↔ översikt

**Det mest märkbara problemet idag:** granskningsbarens innehåll byts vid varje sektionsbyte —
en textarea vid *Ej inkluderat*, en knapp vid *Inkluderat* och *Reservationer*, ibland
ingenting. **Barens höjd hoppar** därför okontrollerat, och eftersom baren är fäst nedtill
flyttar sig hela sidans bottenkant.

Föreslå en höjdövergång eller en reserverad minsta höjd. **Kopplat krav:** dokumentets
`scroll-margin-top` är hårdkodad till `96px` i `modern-css.ts` för att ge plats åt just den
här baren. Är baren högre hamnar sektionens överkant under den. Föreslå en CSS-variabel som
baren sätter och dokumentet läser.

**Sektion → översikt** delar DOM-träd och är fritt animerbart: dokumentet tänds helt (alla
`data-dimmed` försvinner) samtidigt som kvittokortet monteras i sidokolumnen. Kvittots fyra
statuscirklar är den naturliga haken för en bock-in-animation — läs avsnitt 5 innan du gör den
festlig.

**Översikt → sektion** går baklänges: hantverkaren trycker på en rad i kvittot, dokumentet
dimmas igen och scrollar till sektionen.

---

## 4. De fyra ytorna — vad som saknas

Läs komponenterna för strukturen. Här står bara vad som är otillräckligt idag och vilka
tillstånd som är lätta att missa.

### Intaget (`QuickIntake.tsx`)
Platt vit yta utan hierarki — inget leder ögat.

**Mic-knappen har tre skepnader** som byts hårt: vilande (`bg-primary-50`, mikrofon),
inspelning (`bg-red-600`, stoppikon), transkribering (spinner). Det är ytans mest laddade
kontroll och den enda som byter betydelse.

**Statusraden** visar ett av fem tillstånd: inget · `Lyssnar… 0:12` med pulserande prick ·
`Skriver ner…` · ett amber felmeddelande · "Mikrofonen är blockerad". Höjden är redan
reserverad (`min-h-[20px]`) så den kan animeras utan layout-shift.

Foto-thumbs poppar in utan entré. "Bygg utkast" är `opacity-40` tills det finns text.

### Byggkänslan (`QuickBuilding.tsx`)
Rubriken byter text **fyra gånger** utan övergång: `Läser din beskrivning…` (0 s) →
`Hämtar dina priser…` (3,5 s) → `Bygger offerten…` (8 s) → `Tar längre än vanligt…` (25 s).

Statusraden är **medvetet ärlig** — den beskriver vad som faktiskt sker, och vi hittar inte på
fler steg för att fylla tiden. Behåll den principen; gör den inte till en falsk progressmätare.

Skelettet har redan staggad `animationDelay` och en `prefers-reduced-motion`-skyddad shimmer
(`qb-shimmer`, en ren opacity-puls, inte en gradient-sweep). Behåll återhållsamheten, förfina
utförandet.

### Granskningsbaren (`QuickReviewBar.tsx`)
Höjdhoppet (3C) är det mest märkbara. Textkolumnen byter innehåll utan enter/exit.
Progressprickarna animerar redan bredd och färg — den enda befintliga rörelsen i komponenten.

### Kvittot (`QuickReceipt.tsx`)
Inline-kort utan entré. Statuscirklarna byter färg och ikon hårt.

**Viktigt:** Skicka spärras **aldrig** av en amber-varning. Amber betyder "titta på det här",
inte "du får inte" — hantverkaren kan ha fullgoda skäl att skicka utan personnummer. Produkten
föreslår, hantverkaren beslutar. Designen får inte få det att se ut som en spärr.

---

## 5. Tonläge

Sparsamhet är en **produktprincip här, inte en stilpreferens**. Genom hela flödet används amber
bara vid verkliga hinder — aldrig för "det här är tomt". En offert utan reservationer eller utan
"ej inkluderat" är helt normal. Att färga den hade lärt hantverkaren att ignorera färgen, och då
hade signalen varit sämre än ingen alls. Samma logik gäller rörelse.

**Undvik:** allt som pulserar konstant utan att bära information · konfetti och firande (att
skicka en offert är vardag, inte en bragd) · övergångar som tvingar användaren att vänta ·
gradienter och glasmorfism, som inte finns i produkten · fler färger än teal, slate, amber och
en sparsam grön för pengar.

**Sikta på:** rörelse som **förklarar vad som hände** — vad som ändrades, vart något tog vägen,
vad som väntas härnäst · snabbt in, långsammare ut · att den fokuserade sektionen känns
framlyft och trygg, inte inramad och krävande · att någon som står bredvid sin kund känner
**kontroll**, inte underhållning.

Måttstock: om animationen skulle irritera vid den fyrtionde offerten är den för mycket.

---

## 6. Leverans

Svara med **kod som går att applicera direkt** — inte bilder, inte enbart prosa.

1. **CSS för sektionslyftet** (3B), redo att klistras in i `modern-css.ts`. Med
   `prefers-reduced-motion`. **Ingen `transform`.**
2. **Keyframes och rörelse-tokens** för `app/globals.css`, plus eventuella
   `tailwind.config.ts`-tillägg som färdigt configobjekt.
3. **Klassändringar per komponent** i de fyra `quick/`-filerna, angivna så de går att applicera
   utan gissning.
4. **Ett kort motiv per val** — vad rörelsen kommunicerar, inte bara hur den ser ut. Det låter
   oss bedöma förslaget mot principerna i avsnitt 5 i stället för mot smak.

Om en begränsning gör en idé omöjlig: säg det uttryckligen i stället för att gissa. Det är
billigare att justera ramen än att applicera fel design.

---

## Bilaga: det som är lätt att glömma

- Ingen `transform` inuti `.quote-document`. Vanligaste fällan.
- `tailwindcss-animate` finns inte — `animate-in`/`fade-in`/`zoom-in` gör ingenting.
- `reservationer` och `payment-plan` kan saknas helt i DOM:en. Normaltillstånd.
- `prisbild` är två separata, icke-angränsande element.
- Dokumentets brödtext är ~5px på telefon. Bärande information hör hemma i baren utanför.
- Skicka spärras aldrig av en amber-varning.
- `intake → building → review` river DOM-trädet. `review ↔ overview` gör det inte.
