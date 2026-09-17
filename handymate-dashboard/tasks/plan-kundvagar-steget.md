# Kundvägarna — eget onboardingsteg, med bevis som håller för garantin

Beslut Andreas 2026-09-17: eget steg, starkt rekommenderat men möjligt att
hoppa över, och **kopplade ytor ska gå att spåra — en del av garantin kommer
att hänga på att kunden faktiskt gjort det.**

Kartlagt mot `main` samma dag.

---

## 0. Blockeraren: garantin säger fyra olika saker

Innan ett bevis är värt att samla måste det finnas ett villkor att bevisa
mot. Produkten säger i dag:

| Var | Text |
|---|---|
| `app/dashboard/settings/billing/page.tsx:481` | "{guaranteeDays} dagars pengarna-tillbaka-garanti. **Inga frågor.** Gäller även årsavtal." |
| `app/onboarding/components/Step5Activate.tsx:459` | "täckt av vår {guaranteeDays}-dagars **resultatgaranti**" |
| `app/onboarding/components/Step5Activate.tsx:499` | "Pengarna tillbaka om **garantin inte infrias**" |
| Sales Experience-skissen | "**Aktivera och använd tjänsterna** för att spara tid. Är det inte värt det, säg till före dag 90" |

Fyra formuleringar, tre olika löften. Den första upphäver uttryckligen varje
villkor — *"Inga frågor"*. Den tredje är cirkulär: den säger att pengarna
betalas tillbaka om garantin inte infrias, men aldrig vad garantin är.

**Ingen mängd spårning räddar ett villkor som produkten själv har avsagt sig
på en annan sida.** Nekas en återbetalning med hänvisning till att kunden
inte kopplat sina kanaler, och kunden pekar på "Inga frågor", är det den
texten som gäller.

Det finns heller ingen villkorssida i den här appen (`app/terms` saknas);
`docs/PRODUCTION_SETUP.md` anger `https://handymate.se/terms` som Terms of
service mot Google, alltså i landningsrepot.

**Att göra först, och det är Andreas beslut, inte ett kodval:** bestäm vad
garantin faktiskt lovar, skriv det på ett ställe, och låt alla fyra ytorna
läsa därifrån — precis som `getPlanCommercialFacts()` redan gör för priset.
Ett rimligt hem är `lib/feature-gates.ts` bredvid `STANDARD_GUARANTEE_DAYS`
och `FOUNDERS_GUARANTEE_DAYS`.

Först därefter är spårningen nedan meningsfull.

---

## 1. Varför `channel-health` inte kan bära garantin som den är

Modellen är bra och ska inte ändras. `lib/onboarding/channel-health.ts`
håller tre kanaler (`phone`, `email`, `web`) i fyra nivåer, med den rätta
principen: *"en inställningsflagga kan bara säga 'aktiverad'. Först ett
faktiskt kanalbevis får flytta nivån vidare."*

Men `loadChannelHealth` är **helt härledd vid läsning**. Den frågar sju
tabeller och räknar ut nuläget. Tre konsekvenser:

1. **Den svarar på "är det kopplat nu", inte "var det kopplat då".** En
   garantifråga ställs i efterhand och gäller en period.
2. **Bevisraderna är föränderliga och raderbara.**
   `email_inbound_route.last_received_at` skrivs över av varje nytt mejl.
   `app/api/google/disconnect` tar bort kopplingsraden. En affär kan
   raderas. Kopplar kunden bort i månad två är beviset från dag sju borta.
3. **Den kastar vid läsfel** (`failOnReadError`) — rätt för vägledning,
   *"okänt underlag får aldrig bli en gissad kanalstatus"* — men det betyder
   att man inte får något svar alls om en av sju tabeller strular den dagen
   frågan ställs.

Slutsats: behåll `deriveChannelHealth` orörd som levande vägledning, och
lägg en **append-only bevislogg** bredvid.

---

## 2. Bevisloggen

Ny tabell, aldrig uppdaterad, aldrig raderad. Varje rad är en iakttagelse,
inte ett tillstånd.

| Kolumn | Varför |
|---|---|
| `business_id` | tenant |
| `channel` | `phone` \| `email` \| `web` |
| `state` | nivån som nåddes (`enabled`, `channel_verified`, `lead_verified`) |
| `proof` | `ChannelProof` — vilket slags bevis |
| `source_type`, `source_id` | raden som bevisade det, så påståendet går att granska |
| `occurred_at` | när beviset uppstod |
| `recorded_at` | när vi skrev raden |

Bara **övergångar** skrivs: samma nivå två dagar i rad ger ingen ny rad.
Nedgångar skrivs också (kunden kopplade bort) — annars blir loggen ett
enkelriktat lyckoprotokoll.

RLS på, inga policyer, all åtkomst via servern — samma mönster som
`sales_case` (v231).

### Vem skriver den

**Räddningskö-cronen** (`app/api/cron/raddningsko/route.ts`, `25 5 * * *`)
räknar redan ut `deriveChannelHealth` batchat för alla kandidater varje natt.
Den behöver bara skriva ner övergångar. Det är nästan gratis och beviset
börjar samlas direkt.

**En sak att lösa:** kandidatlistan är `is_pilot` ELLER skapad/klar senaste
**30 dagarna** (rad 138). Grundarkundernas garanti är **90 dagar**
(`FOUNDERS_GUARANTEE_DAYS`). Efter dag 30 slutar alltså härledningen täcka
just de kunder vars garanti är längst. Fönstret måste följa den längsta
garantin, inte tvärtom.

Dygnsgranularitet räcker: frågan är "kopplades det under perioden", inte
"vilken minut".

---

## 3. Steget

Eget steg. `TOTAL_STEPS` går 9 → 10, och det är inte en textändring:
dashboard-grinden läser `onboarding_step >= 9` och `saveProgress` når som
högst 8 — bara finalize skriver 9/10 (`app/dashboard/layout.tsx`, se även
CLAUDE.md:s fallgrop om stegindex). Hela kedjan flyttas i takt, annars låses
konton ute mitt i onboardingen.

**Rubrik:** "Nu kopplar vi in era kundvägar."
**Underrad:** "Vi är inte klara när du klickat — vi är klara när ett
provmeddelande kommit fram."

Rader, var och en med nuläge ur `channel-health` och en åtgärd:

| Rad | Går att koppla i dag | Bevis |
|---|---|---|
| Telefon | ja, numret finns från Step4 | provsamtal mottaget |
| SMS | samma nummer | ingår i provsamtalet |
| Företagsmejlen | ja, adress + **instruktion för Gmail/Outlook** (saknas helt i dag) | provmejl mottaget |
| Formuläret på hemsidan | ja, via vidarebefordran av formulärets mottagaradress | provförfrågan mottagen |
| Kalender | ja, Google | kopplad |

Hemsidewidgeten och Handymate-sidan står kvar som dolda
(`website_widget`, `my_website` i `lib/launch-visibility.ts`) och ska **inte**
listas förrän de släpps på.

### Överhoppningen är också ett bevis

Kunden får hoppa över. Men steget ska skriva en rad när det sker: *erbjuden,
överhoppad, av vem, när*. I en garantidiskussion är "kunden erbjöds den 3
oktober och valde att gå vidare" precis lika mycket bevis som en koppling.
Utan den raden finns bara tystnad, och tystnad tolkas till kundens fördel.

### `primaryLeadChannel` blir kvar

Den säger vad som är vanligast och styr agenternas prioritering. Men den ska
sluta avgöra **vad som sätts upp** — dagens
`const email = data.primaryLeadChannel === 'email'` gör att en firma som
väljer Telefon aldrig ens ser e-postadressen.

---

## 4. Byggordning

1. **Bestäm garantins villkor** och samla texten på ett ställe (avsnitt 0).
   Utan det är resten bevis utan påstående.
2. **Bevisloggen**: migration + skrivning från räddningskö-cronen, och utöka
   dess fönster till den längsta garantin.
3. **Vidarebefordringsinstruktionen** för Gmail och Outlook. Störst hävstång
   av allt här: koden bakom är klar, Gmails bekräftelsekod hanteras redan
   automatiskt (`app/api/email/inbound/route.ts:171`), men ingenstans i
   produkten står det hur kunden ställer in det.
4. **Steget**, med stegindexkedjan flyttad i takt.
5. **Bevisa e-postvägen en gång skarpt.** Båda raderna i
   `email_inbound_route` i produktion är testkonton med `last_received_at`
   null — inget mejl har någonsin nått inflödet.
6. **Garantivyn**: en sida som visar kundens egna kopplade ytor och när de
   bevisades. Samma data, vänd mot kunden. Den gör villkoret rimligt i
   stället för att kännas som en efterhandskonstruktion.

---

## 5. Att inte göra

- **Ändra inte `deriveChannelHealth`** till att läsa loggen. Den ska förbli
  levande nuläge; loggen är historik. Två frågor, två svar.
- **Uppdatera aldrig en bevisrad.** Ny iakttagelse = ny rad.
- **Lista aldrig en dold funktion** i steget. Det var precis felet i
  `intakeNextStep('website')` som rättades 2026-09-17.
- **Låt inte steget blockera.** Det får vara starkt rekommenderat; ett steg
  som inte går att passera gör att kunden inte blir kund.
- **Använd inte loggen för att neka något** som en annan yta lovat utan
  villkor. Se avsnitt 0.
