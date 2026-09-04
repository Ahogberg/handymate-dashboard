# Urval till Grundarprogrammet — 50 handplockade firmor

**Status: FÖRSLAG för Andreas (2026-09-04).** Underlag till `docs/gtm/grundarprogrammet.md`
och till Launch Desks källbibliotek (`lib/launch-desk/`).

Målet är inte volym. Det är **tio kunder du personligen kan ta genom dag 0–14**.
Räkna baklänges: 10 kunder ← ~25 bokade samtal ← ~50 handplockade firmor där du
har något konkret att säga. Inte 50 000 touches.

---

## Del 1 — Urvalskriterierna

### Måste (annars ingen plats i listan)

| Krav | Varför |
|---|---|
| **Aktiebolag** (inte enskild firma) | `lib/launch-desk/policy.ts` stänger kall kontakt för enskild och okänd bolagsform. AB + offentligt professionellt kontaktunderlag öppnar e-post; allt annat kräver varm grund. Bolagsformen är alltså det som avgör om firman ens är kontaktbar. |
| **2–20 anställda** | Under 2: har inte problemet (ingen administration att tappa). Över 20: har redan en kontorsanställd och en inköpsprocess som tar månader. `scoring.ts` ger redan 25 p för 2–49 — snäva till 2–20 för grundarurvalet. |
| **ROT-tung bransch** | El, VVS, bygg, snickeri, måleri, tak. Där är ROT-korrektheten värd pengar och vårt branschpaket finns. `TRADE_TERMS` i `scoring.ts` täcker listan. |
| **Verifierbar telefon** | Telefon är kanalen. En firma vi bara kan mejla är inte ett grundarprospekt. |

### Bör (rangordnar listan)

1. **Rekryterar just nu** — starkaste köpsignalen vi har. En firma som annonserar
   har mer jobb än den hinner med, vilket är exakt smärtan. Redan byggt
   (`rekryteringssignal.ts`, `platsbanken-kalla.ts`).
2. **Auktoriserad/certifierad** i sin bransch — betalar redan för kvalitetsstämplar,
   alltså en firma som bryr sig om att göra rätt. Vår ROT-argumentation landar.
3. **Köper leads idag** (Offerta, Servicefinder) — bevisad betalningsvilja för
   kundanskaffning och bevisad smärta kring uppföljning.
4. **Använder Fortnox** — vår integration blir ett direkt argument, ingen migrering.
5. **Svaga digitala spår** — ingen offertfunktion, "ring för offert", gammal sida.
   Redan byggt som deterministiska signaler med citatkrav (`signaler.ts`).

### Diskvalificerande

- Enskild firma eller okänd bolagsform (tills varm grund finns)
- Enmansföretag utan anställda
- Rena underentreprenörer utan egna slutkunder (ingen offert- eller ROT-smärta)
- Firmor i Bee Services närområde där Christoffer konkurrerar — intressekonflikt

---

## Del 2 — Källor utöver Platsbanken

Rangordnade efter vad de tillför **utöver** det vi redan har. Varje källa anges med
vad den ger, hur den passar policyn, och vad som behöver verifieras innan bygge.

### Nivå A — myndighet och öppna register (högst tillit, bäst juridisk grund)

**A1. Bolagsverket — näringslivsregistret** ⭐ *viktigast*
Ger **bolagsform**, SNI-kod, säte, registreringsår, styrelse. Det här är nyckeln som
låser upp hela kanalpolicyn: utan bolagsform faller varje prospekt till `unknown`
och därmed till "kräver manuell bedömning". Med `limited_company` + publikt
kontaktunderlag öppnas e-postkanalen automatiskt.
Vi har redan påbörjat Bolagsverket för onboarding-prefill ([[bolagsverket-onboarding-v1]])
— samma anslutning kan mata Launch Desk.
*Att verifiera:* aktuell API-produkt, pris per uppslag, om registreringen är klar.

**A2. Elsäkerhetsverkets register över elinstallationsföretag**
Alla företag som utför elinstallationsarbete **måste** vara registrerade. Det ger en
komplett, offentlig lista över elfirmor med verksamhetstyp och auktorisationsomfattning
— alltså både branschfilter och kvalitetssignal i samma källa. El är dessutom vår
största kundgrupp (15 av 27 konton) och den bransch vars paket är längst kommet.
*Att verifiera:* om registret har öppet API eller bara söksida (då: manuell export).

**A3. SCB:s företagsregister**
Storleksklass (anställda), SNI, geografi — exakt de fält `scoring.ts` viktar. Bra som
*komplement* för att fylla `employee_band` när andra källor saknar det.
*Att verifiera:* uttagspris; SCB tar betalt för registerutdrag.

**A4. Skatteverket — F-skattregistret**
Verifierar F-skatt. Låg signalvinst i urvalet (nästan alla har det), men ett billigt
sanity-filter mot vilande bolag.

### Nivå B — branschregister (kvalitetssignal + exakt branschtillhörighet)

Dessa listor är korta, aktuella och innehåller *seriösa* firmor — precis vår kund.
De ger också en naturlig öppningsreplik: firman har själv investerat i behörigheten.

| Källa | Bransch | Vad den ger |
|---|---|---|
| **B1. Säker Vatten** | VVS | Auktoriserade VVS-företag. Branschregler kräver digitalt intyg inom fyra veckor efter avslutat arbete — en dokumentationsplikt vi kan automatisera. Stark hook. |
| **B2. GVK** | Våtrum | Auktoriserade våtrumsentreprenörer |
| **B3. Byggkeramikrådet (BKR)** | Plattsättning | Behöriga företag |
| **B4. Måleriföretagen** | Måleri | Medlemsföretag; även MVK-behöriga för våtrumsmålning |
| **B5. Installatörsföretagen** | El/VVS/vent | Medlemsregister |
| **B6. Byggföretagen** | Bygg | Medlemsregister |
| **B7. Incert / Kiwa** | Vent, kyl | Kylcertifikat (F-gas), OVK-behörighet N/K |

*Att verifiera per källa:* om medlemslistan är publik och sökbar, och om användnings-
villkoren tillåter systematisk insamling. Flera av dem är sökformulär utan API —
då är rätt väg manuell plockning av 20–30 firmor per bransch, vilket räcker gott
för 50 prospekt.

### Nivå C — marknadsplatser (bevisad betalningsvilja)

**C1. Offerta.se / Servicefinder / Byggahus**
En firma som betalar för leads har **budget för kundanskaffning** och **bevisad smärta
kring uppföljning** — de köper leads men hinner inte svara. Det är vår starkaste
säljberättelse: *"du betalar redan för leads du inte hinner följa upp."*
Vi har dessutom dessa som lead-källor i produkten redan (`app/onboarding/constants.ts`),
så integrationen är begriplig för kunden.
*Obs:* här är firmorna offentligt listade som leverantörer — publikt professionellt
kontaktunderlag i policyns mening. Men läs villkoren; systematisk insamling kan
strida mot användarvillkoren även när datan är publik.

**C2. Reco.se, hitta.se, Google Maps**
Recensioner, betyg, bilder, öppettider. Ger Levis poäng: du ser gapet innan du ringer.
Bäst som **anrikning** av en redan vald firma, inte som primär källa — ett dåligt
Google-kort säger inget om bolagsform eller storlek.

### Nivå D — timingsignaler (när, inte vem)

**D1. Kommunala bygglovsdiarier** ⭐ *underskattad*
Beviljade bygglov är offentliga och sökbara i de flesta kommuner. Ett beviljat lov =
ett jobb som ska utföras inom kort. Kopplar man lovet till entreprenören får man en
firma med **känd, tidsatt arbetsbelastning**. Starkare än rekryteringssignalen i
precision, svagare i täckning (entreprenören anges inte alltid).
*Att verifiera:* format skiljer sig per kommun; börja med Stockholm/Göteborg/Malmö.

**D2. Bolagsverkets kungörelser**
Nyregistrerade bolag och ändringar. Ett nystartat hantverksbolag har inga vanor att
bryta — men också ingen volym än. Bäst som separat segment, inte i grundarurvalet.

**D3. Offentliga upphandlingar (e-Avrop, Mercell, TendSign)**
Firmor som vinner kommunala ramavtal har dokumentationskrav som vi automatiserar
(egenkontroll, ÄTA, dagbok). Längre säljcykel — spara till efter lansering.

**D4. Byggfakta / Sverige Bygger**
Kommersiell projektdatabas med byggprojekt i pipeline. Stark signal, betaltjänst.
Utvärdera först när de tio första är i hamn.

---

## Del 3 — Rekommenderad ordning

**Vecka 1 (räcker till de 50):**
1. **Bolagsverket** kopplas som berikning — utan bolagsform är kanalpolicyn blind. Detta är den enda tekniska investeringen som är nödvändig nu.
2. **Elsäkerhetsverkets register** + **Säker Vatten** manuellt: 25 elfirmor, 15 VVS-firmor med AB-form och 2–20 anställda.
3. **Platsbanken-korsning** (redan byggt): markera vilka av dem som rekryterar → de ringer du först.
4. **Offerta/Servicefinder**: 10 firmor som köper leads.

Det ger ~50 med tre oberoende kvalitetssignaler var — utan en enda rad ny skrapkod.

**Efter GO:**
5. Bygglovsdiarier som timingsignal (störst uppsida, mest arbete)
6. Reco/Maps som automatisk anrikning av valda prospekt
7. Byggfakta om ekonomin motiverar

---

## Del 4 — Vad vi INTE gör

- **Ingen kall e-post till enskilda firmor.** Policyn stänger det redan; det är också
  rätt sak. Hantverkare i enskild firma nås via telefon eller varm väg.
- **Ingen inbox-flotta.** 35 domäner och 105 brevlådor är en teknik för att kringgå
  spamfilter. Vi säljer regelefterlevnad — vi kan inte spamma.
- **Inga kontaktuppgifter ur jobbannonser.** Redan dokumenterat i
  `platsbanken-kalla.ts`: namn och nummer till rekryterande chefer publiceras för
  frågor om en *tjänst*, inte för säljlistor.
- **Ingen SMS-kanal** i prospekteringen. Finns inte i Launch Desk V1, ska inte läggas till.
- **Ingen volym utan kapacitet.** Tio platser i Grundarprogrammet är en sann gräns —
  fyll inte en kalender vi inte kan leverera på.
