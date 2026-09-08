# Design-brief 11 — Partnerportalen (vägen in)

Skapad 2026-09-08. Att klistra in i Claude Design. Ny yta vid sidan av varumärkeslagrets 1–10: den här handlar inte om vad hantverkarens **kund** ser, utan om vad en **säljande partner** ser — från ansökan till första provisionen.

**Läget:** dashboarden (`/partners/dashboard`) designades om 2026-09-07 efter en Claude Design-mockup och säljmaterialet (partnerdeck, demo-manus, leave-behind) kom också från Design. Men **vägen in har aldrig varit hos Design**: ansökan, kvittot, inloggningen och avtalsgrinden ligger kvar i gamla `gray-*`-klasser från före designsystemet. Det är precis de fyra skärmarna en potentiell partner ser först — och de enda som demonstreras för någon som ännu inte är partner.

**Varför nu:** handymate.se/partners skrevs om 2026-09-08 från tipsportal till säljpartner ("Vi bygger produkten. Du tar affären."). Landningssidan lovar nu ett proffsigt samarbete. Portalen bakom knappen måste hålla det. Andreas demar för potentiella partners 2026-09-09.

---

## Prompt

Du designar **Handymates partnerportal** — de skärmar en säljande partner möter från ansökan till att hen är inne och har material i handen.

Handymate är ett AI-drivet back-office för svenska hantverkarfirmor med 5–20 anställda: agentteamet tar samtalen firman missar, skriver offerten, följer upp fakturan. Firmorna betalar 5 995 kr/mån (Firman) eller 11 995 kr/mån (Storfirman), exkl. moms.

**Användaren är inte en hantverkare.** Det är en person som **säljer** Handymate vidare: en redovisningskonsult med sextio hantverkarklienter, en säljare på en byggmaterialleverantör, en fristående säljare med nätverk i branschen. Hen får 20 % av kundens abonnemang i 36 månader. Hen är van vid CRM och provisionsrapporter, är misstänksam mot luftiga påståenden, och öppnar portalen i mobilen mellan två kundmöten — på en parkering, i en hiss. Hen ställer tre frågor och inga andra:

1. **Vad tjänar jag, och när får jag det?**
2. **Vad ska jag säga i mötet — har jag något att visa?**
3. **Är det här på riktigt, eller är jag en rad i någons affiliate-lista?**

Portalen är **Handymates** yta. Inte hantverkarens varumärke, inte partnerns. Tonen är kollega till kollega mellan två yrkesmänniskor — aldrig peppig affiliate-retorik, aldrig "börja tjäna pengar idag".

### Skärm 1 — Ansökan (`/partners/register`)

Första intrycket, och idag det svagaste: en generisk formulärruta. Fälten är **Namn**, **Företag (valfritt)**, **E-post**, **Lösenord** och en obligatorisk kryssruta "Jag har läst och godkänner Handymates partneravtal".

Sidan ska svara på "vad ansöker jag egentligen till?" **innan** hen fyller i. Vid sidan av (desktop) eller ovanför (mobil) formuläret: en kort, saklig sammanfattning av samarbetet — 20 % av abonnemanget i 36 månader, utbetalning månadsvis via självfakturering, materialet du får, att vi tar start och support. Inga siffror om hur många partners som finns (det är två) och inga intäktslöften.

Formuläret får kännas som en ansökan, inte en registrering: det finns en granskning i andra änden. Visa vägen — **Ansökan → granskning inom 24 timmar → avtal → portal** — som en diskret trerad, inte som ett stort stegdiagram.

Fel- och laddlägen: "Registrering misslyckades" (serverns text visas ordagrant), "Skickar…". Lösenordet är minst 8 tecken.

### Skärm 2 — Kvitto ("Ansökan skickad")

Idag: en bock, en mening, en länk tillbaka. Hen har just lämnat ifrån sig sina uppgifter och får ingenting.

Designa den som ett **kvitto med nästa steg**: vi granskar inom 24 timmar, du får ett mejl till *din@epost.se* när kontot är godkänt, och sedan läser och godkänner du partneravtalet i portalen. Ge något att göra under tiden: läs partneravtalet i sin helhet (öppen länk), se hur produkten ser ut för hantverkaren (handymate.se). Inget nyhetsbrev, ingen "dela redan nu"-uppmaning — hen har ingen länk än.

### Skärm 3 — Inloggning (`/partners/login`)

Liten yta, men den bär samma identitet: Handymate-märket, PARTNER-etiketten, e-post + lösenord, "Har du inget konto? Ansök". Ska kännas som en portal, inte som ett admingränssnitt. Ett fellägе ("Fel e-post eller lösenord").

### Skärm 4 — Avtalsgrinden (`AgreementGate`)

Innan portalen öppnas stoppas partnern av en grind: hen måste ha godkänt gällande partneravtal (version visas datadrivet). Idag är den en vit ruta med en länk och en kryssruta — den läser som en cookie-banner, fast det är ett affärsavtal som styr provision i tre år.

Designa den som **ett ögonblick värt att ta på allvar**: hälsning med partnerns namn, vad avtalet reglerar i tre punkter (ersättning, hur den räknas, hur den betalas), knapp "Läs partneravtalet" (öppnas i ny flik), kryssruta med versionsnumret i klartext, sedan "Godkänn avtalet". Ingen väg förbi. Ingen skrämsel heller — det här är rutin mellan företag.

Rita också **avtalssidan** (`/partners/avtal`): ett långt juridiskt dokument, ~20 numrerade avsnitt plus en sammanfattningstabell (Provisionssats, Provisionsperiod, Utbetalning, Minsta utbetalning). Det behöver inte dekoration — det behöver **läsbar dokumenttypografi**: mätt radlängd, tydlig avsnittsnumrering, en tabell som håller på 390 px, och en sticky rad i foten på mobil med "Godkänn" när man läst klart.

### Skärm 5 — Portalen tom (det nya partnern faktiskt ser)

**Detta är den viktigaste skärmen i briefen.** En partner som precis kommit in har noll hänvisningar. Då renderas inget av det som gör portalen imponerande — ingen provision, inga kunder, inga underlag. Hen ser en mörk "Kom igång"-ruta med tre steg, en länkruta, en materiallista och två tomma sektioner. Det är en ärlig men trist första kväll — och det är den vyn som visas när Handymate demar portalen för någon som funderar på att bli partner.

Lös det utan att ljuga. Tomma läget ska innehålla tre saker:

1. **Kom igång — tre steg** (finns): skriv ner tre hantverkare du känner · berätta vad de slipper göra på kvällarna · dela din länk. Behåll innehållet, höj hantverket.
2. **Din länk och ditt material**, i samma andetag — det är allt hen behöver för möte ett. Länken med kopiera-knapp och delningsvägar (e-post, WhatsApp, SMS), materialet som tre tydliga kort: Partnerdeck för mobilen (11 slides), Leave-behind (A4, skriv ut), Demo-manus (20 minuter).
3. **"Så ser portalen ut när du har kunder"** — ett medvetet **exempelblock**, tydligt märkt som exempel, i dämpad/inaktiv form: upplupen provision, aktiva kunder, en kundrad, ett provisionsunderlag. Det säljer samarbetet utan att påstå att siffrorna är hens. Märkningen ska vara omöjlig att missa och får aldrig se ut som riktig data.

### Skärm 6 — Portalen med kunder (finns, ska förfinas)

Den designades 2026-09-07 och byggdes: mörkt teal hero med **Upplupen provision** + statusnål "Väntar på din granskning", ett vitt kort **Din nivå** (procentsats + trappa när partnern har en), en statrad (Hänvisade företag · Aktiva kunder · Utbetalt totalt), **Behöver dig** (uppgifter härledda ur riktig data), **Din länk**, **Säljmaterial**, **Dina kunder** (utfällbara kort med uppföljning 1/2/3), **Provisionsunderlag**, **Självfakturering** och **Fakturauppgifter**.

Rita om den bara i den mån den behöver bli konsekvent med skärm 1–5 — den ska inte tänkas om. Två saker får gärna skärpas: (a) hierarkin mellan Upplupen provision och Din nivå på 390 px, (b) hur "Behöver dig" ser ut när den innehåller både en självfaktura att granska och tre kunduppföljningar.

### Skärm 7 — Mobil 390

Alla skärmar ovan i 390 px. Partnern står på en parkering och ska kunna: kopiera länken, öppna partnerdecken, se vad hen tjänat. Det ska gå med tummen.

### Designsystem

Handymates eget system, samma som dashboarden hantverkaren använder:

- **Teal:** `--primary-700 #0F766E` (accent, länkar), `--primary-800 #115E59` (knappar), `#0f2e2a` som mörk hero-grund, `teal-50 #F0FDFA` för ljusa ikonplattor, `teal-300/400` som accent på mörk grund.
- **Neutraler:** slate-skalan (`slate-50` sidgrund, `slate-200` kanter, `slate-500` sekundärtext, `slate-900` rubriker). Vita kort, `rounded-2xl`, mjuk skugga.
- **Amber** `#F59E0B` endast som statusfärg för "behöver din åtgärd" — aldrig dekorativt.
- Typografi: systemtypsnitt, `tracking-tight` på rubriker, versaletikett i 11 px med brett teckenavstånd som sektionsmarkör (mönstret finns).
- Ikoner: lucide, tunna. **Inga emojis.** Ingen dekorativ animation.

### Sanningsregler (avvikelser här är fel, inte smak)

Portalen hanterar riktiga pengar. Språket följer status:

- **"Upplupen provision" är inte utbetald provision.** Kalla den aldrig "Nästa utbetalning", "Intjänat" eller "Din balans".
- Provisionen är **20 % av vad kunden faktiskt betalat, exkl. moms**, i **36 kalendermånader** från kundens första godkända betalning, därefter 0 %. Utbetalning **månadsvis i efterskott via självfakturering** — Handymate utfärdar fakturan i partnerns namn, partnern granskar och kan invända. Minsta utbetalning 500 kr, lägre belopp rullas vidare.
- **Ingen trappa får ritas som om den vore standard.** Standard är en fast sats; en trappa finns bara för partners som fått en.
- **Ingen "din länk spåras i X dagar"** — någon sådan tidsgräns finns inte.
- Fristen "utbetalning kan ske 10 dagar efter utfärdandet utan invändning" visas **bara** när det finns en faktisk faktura att granska.
- **Inga påhittade siffror om partnerprogrammet.** Inte "237 partners", inte "snittpartnern tjänar 18 000 kr/mån". Det finns två partners och noll hänvisningar. Exempelblocket i tomma läget är den enda platsen där siffror utan täckning får synas, och då märkta som exempel.
- Partnern får **aldrig** se kundens betalningsuppgifter eller belopp — bara sin egen intjäning. "Vi visar bara din intjäning, aldrig kundens belopp" är en regel, inte en formulering.
- API-nyckel och webhook-secret visas aldrig i vyn förrän partnern begär det.

### Exempeldata

Partner: **Marika Sund**, Sundberg Redovisning AB, partner sedan augusti 2026, avtal 1.0. Länk `app.handymate.se/registrera?ref=P-SUN-2941`.
För exempelblocket (skärm 5) och för skärm 6: 4 hänvisade företag, 3 aktiva kunder, upplupen provision 3 597 kr, utbetalt totalt 14 388 kr, självfaktura SF-2026-0004 på 4 496 kr inkl. moms som väntar på granskning, kundrader "Nordströms El AB" (kund i 4 månader), "Bygg & Kakel i Sollentuna" (onboardar), "Rörjouren Väst AB" (kund i 7 månader).

### Leverabler

- Skärm 1–5 i mobil (390) och desktop (1280).
- Avtalsgrinden + avtalssidan (mobil + desktop).
- Tomma lägets exempelblock som egen komponent — märkningen "exempel" är designbeslutet som ska lösas.
- Fel- och laddlägen för ansökan och inloggning.
- Komponentlista: ansökningsformulär, kvittokort, avtalsgrind, länkkort med delningsvägar, materialkort, exempelblock, statusnål.

---

## Kodfakta för bygget (inte till Design)

- **Routes:** `app/partners/register/page.tsx`, `login/page.tsx`, `avtal/page.tsx`, `avtal/acceptera/page.tsx` (engångslänk med HMAC), `components/AgreementGate.tsx`, `dashboard/page.tsx` (orkestrerare; korten i `dashboard/components/`), `material/{partnerdeck,leave-behind,demo-manus}` bakom `usePartnerMe`.
- **Data:** `GET /api/partners/dashboard` → `{partner, stats, referrals, statements, self_billing_batches, events_by_business}`. Tabellerna är `partners`, `referrals`, `partner_commission_ledger`, `partner_followups`, `partner_events`, `partner_payout_batch`. Hemligheter via `GET /api/partners/webhook` på begäran.
- **Grinden är facit-låst** (`tests/partner-attribution-lock.spec.ts:98`): `if (partner.agreement_required)` måste ligga före `const referralUrl =`, och `<AgreementGate` måste finnas i page.tsx. `tests/partner-self-billing-portal.spec.ts` låser `<BillingProfileCard`, `<SelfBillingSection` och `profile={partner.billing_profile}`. Elva partner-facit finns i `tests/partner-*.spec.ts` — kör dem alla efter ombyggnad.
- **Register/login/avtal använder `gray-*`** medan resten av portalen är `slate-*` + `primary-*`. Migreringen är halva jobbet och kan göras utan att vänta på Design.
- **Tomma läget är inte ett kantfall — det är normalläget.** Prod har (2026-09-08) två partners, varav en aktiv (Elexperten, avtal 1.0 accepterat), och **noll rader i `referrals`** i hela systemet. Hero, statrad, "Behöver dig", kundlista, provisionsunderlag och självfakturor renderar alltså ingenting. Vid en demo visas bara "Kom igång"-rutan, länken och materialet.
- **Två vägar till en säljbar demo**, att välja mellan:
  1. **Exempelblocket** (som briefen beskriver) — ärligt, permanent värde för varje ny partner, ingen data i prod. Rekommenderas.
  2. **Seedad demopartner** i stil med demo-företaget för yta 9: en partner med påhittade hänvisningar och en självfaktura, städad av cron. Snabbare att visa, men skapar rader i prod och riskerar att blandas ihop med riktig data i provisionsavstämningen (`lib/partners/commission-reconciliation.ts`).
- **Pitch-decken (16:9)** ligger kvar hos Design bakom två P0-fixar (Bee-transparensen, "Kommer härnäst"-raderna). Den är den fjärde säljmaterialdelen; materiallistan i portalen ska inte lova den förrän den finns.
- **Kostnadsfri kontroll före demo:** partnerinloggning + avtalsgrind + material fungerar redan; det som saknas är hantverket. Ingen migration krävs för skärm 1–5.

### Beslut för Andreas

1. Exempelblock eller seedad demopartner inför demon? (Rekommendation: exempelblocket — det överlever demon och blir varje ny partners första kväll.)
2. Ska ansökan fråga efter **telefonnummer**? Idag gör den inte det, vilket betyder att en godkänd partner bara går att nå via mejl — för en säljpartner är det bakvänt.
3. Ska "Företag" vara obligatoriskt? Avtalet tillåter privatperson (org- eller personnummer), men självfaktureringen behöver uppgifterna innan första utbetalningen ändå.
