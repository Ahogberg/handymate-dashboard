# Design-brief 9 — "Skicka en demo-offert till dig själv"

Skapad 2026-09-07. Att klistra in i Claude Design. Ett block på handymate.se där en hantverkare skriver in sitt mobilnummer och inom en minut får en riktig offert i mobilen — exakt som hens kund skulle få den. Blocket är Handymates enda säljyta som **bevisar** varumärkeslagret i stället för att beskriva det: prospektet håller kundupplevelsen i handen innan hen har köpt något.

---

## Prompt

Du designar ett **block på Handymates landningssida** (handymate.se) och de två små sakerna det utlöser: ett SMS och en "efteråt"-vy. Handymate är ett AI-drivet back-office för svenska hantverkarfirmor med 5–20 anställda: Matte tar samtalen, offerten går ut i firmans varumärke, kunden godkänner i mobilen, Karin fakturerar. Besökaren är en **ägare eller arbetsledare på en hantverkarfirma**, ofta på mobilen, ofta skeptisk: "en AI-offert, jaha — hur ser den ut för min kund egentligen?"

Blocket svarar på den frågan genom att göra det, inte säga det: **"Skicka en offert till dig själv. Du får den som din kund får den."** Besökaren skriver namn + mobilnummer (+ valfritt sitt firmanamn), trycker, och får ett SMS med en länk till en riktig offert från en fiktiv firma (eller från "sin egen" firma om hen skrev namnet). Hen öppnar offerten i mobilen, ser ROT-avdraget preliminärt, ser "Godkänn offert · 38 750 kr", och kan faktiskt godkänna. Då visar sidan vad som just hände hos hantverkaren.

### Problemet blocket löser

- Landningssidan **beskriver** ("offerten går ut i ditt varumärke", "kunden godkänner i mobilen") men visar inget som prospektet kan hålla i. Skärmbilder tros inte på — alla SaaS-sidor har fina skärmbilder.
- Det finns redan en "Gratis offertgenerator" (bygg din egen offert-PDF) och en "Interaktiv demo" (chatta med Matte/Karin). Ingen av dem visar **kundens** upplevelse — den som avgör om offerten blir godkänd samma kväll eller ligger i en inkorg i två veckor.
- Säljargumentet är kundupplevelsen: SMS-länk → mobil → ROT redan uträknat → ett tryck. Det tar 40 sekunder att uppleva och 4 minuter att förklara.

### Vad som faktiskt händer (sanningen bakom knappen)

Designa mot detta:
1. Besökaren fyller i **Ditt namn**, **Mobilnummer** och valfritt **Ditt firmanamn**. Trycker "Skicka offerten till mig".
2. Inom en minut kommer ett **SMS** — samma text som en riktig kund får: "Hej Anders! Här är offerten från Ekström Bygg AB: {länk}" (eller från "Anders Bygg AB" om hen skrev det). Ingen Handymate-avsändare i SMS:et — det är poängen.
3. Länken öppnar den **riktiga offertsidan** (samma sida som riktiga kunder får — den ska INTE designas om här): Ekström Bygg AB:s logotyp/namn, "Badrumsrenovering, Sjövägen 4", rader, moms, ROT-avdrag **preliminärt**, "Du betalar 38 750 kr", knappen "Godkänn offert · 38 750 kr" (namn + kryss, ingen BankID), stämpeln "Skickat via Handymate" i sidfoten.
4. Om besökaren godkänner händer det som alltid händer: offerten blir accepterad, ett **projekt** skapas, affären blir **vunnen**, kunden får en bekräftelse. I demon visas det som en **efteråt-vy** — på landningssidan (blocket byter läge när offerten godkänts) och som ett andra SMS: "Klart. Hos hantverkaren skapades nu ett projekt och affären blev vunnen — utan att någon rörde datorn. Så här ser det ut: {länk till blocket}".
5. Offerten är en riktig rad i ett demo-företag; den gäller i 7 dagar och raderas sedan. Max **3 offerter per mobilnummer och dygn**, max 5 per IP och timme. Felmeddelanden: ogiltigt nummer ("Skriv ett svenskt mobilnummer, t.ex. 070-123 45 67"), för många försök ("Du har redan fått tre offerter i dag — kolla SMS:en"), SMS-tjänsten nere ("Vi kunde inte skicka just nu. Prova igen om en stund eller boka en demo.").
6. Inget konto skapas, inget nyhetsbrev, ingen säljare ringer automatiskt. Numret sparas som lead bara om besökaren kryssar i "Ja, kontakta mig" (valfritt, avkryssat som standard).

### Designsystem att hålla sig till

Detta är **Handymates** yta — här gäller landningssidans eget system, inte hantverkarens varumärke:
- Följ handymate.se:s befintliga tokens (teal-skalan, `--teal-950` som mörk grund, den ljusa gradienten `#E6FFFA → #F8FAFC`, befintlig rubriktypografi och knappstil `.btn-primary`). Blocket ska kännas som en sektion på sidan, inte som ett inbäddat verktyg.
- Men **offerten som visas i blocket** (förhandsbild/telefonram) bär Ekström Bygg AB:s varumärke (amber `#F59E0B`-ramp, systemtypsnitt, mörka knappar `#0F172A`) — kontrasten mot Handymate-teal runt omkring är poängen: "det här är din kunds upplevelse, inte vår".
- Systemtypsnitt i telefonramen. Inga emojis som ikoner. Ingen dekorativ animation utom ett lugnt "SMS på väg"-läge.
- Mobil 390 först (hälften av trafiken), desktop 1280.

### Skärm 1 — blocket på landningssidan

Placering: efter "AI:n jobbar medan du jobbar" (how-it-works) och före "Systemet får inte hitta på framgång" (bevis) — blocket ÄR beviset.

- **Rubrik + underrad:** "Skicka en offert till dig själv." / "Du får den som din kund får den — i mobilen, med ROT-avdraget uträknat och en knapp." Ingen "prova gratis"-retorik, det är inte en trial.
- **Vänster (desktop) / överst (mobil): formuläret.** Ditt namn, Mobilnummer, Ditt firmanamn (valfritt — "Offerten kommer då från din firma"), knapp "Skicka offerten till mig", mikrotext "Ett SMS, ingen uppföljning. Offerten är på låtsas — knappen är på riktigt." + valfri kryssruta "Ja, ni får ringa mig om Handymate".
- **Höger / under: telefonramen** med den riktiga offertsidan så som den ser ut i mobilen — Ekström Bygg AB, "Badrumsrenovering", "Du betalar 38 750 kr", "Godkänn offert". Statisk bild/mock av den befintliga sidan, INTE en ny design.
- **Lägen:** (a) tomt formulär, (b) skickar ("Skickar SMS till 070-123 45 67 …"), (c) skickat — formuläret byts mot "Kolla mobilen. SMS:et kom från Ekström Bygg AB, inte från oss — det är så din kund får det." + liten rad "Fick du inget? Skicka igen (2 kvar i dag)", (d) godkänd — se skärm 3, (e) fel: ogiltigt nummer, för många, tjänsten nere — som lugna inline-meddelanden.

### Skärm 2 — SMS:en (som verklig text)

Rita båda SMS:en i en meddelandebubbla på mobil, som de ser ut i Meddelanden:
1. Offert-SMS:et: "Hej Anders! Här är offerten från Ekström Bygg AB: handymate.se/q/a8f3k2 " — avsändare visas som firmans nummer/namn, aldrig "Handymate".
2. Efteråt-SMS:et (bara om hen godkände): "Klart. Hos Ekström Bygg AB skapades nu ett projekt och affären blev vunnen — utan att någon rörde datorn. Så gick det till: handymate.se/#demo-offert"

### Skärm 3 — efteråt-vyn ("Det här hände hos hantverkaren")

När besökaren godkänt offerten i mobilen och kommer tillbaka till blocket (eller följer länken i SMS 2) visar blocket, i stället för formuläret, en kort **händelselista i Handymate-vy** — tre rader med tid:
- 14:02 Offerten godkändes av Anders Nilsson (namn + kryss)
- 14:02 Projekt "Badrumsrenovering, Sjövägen 4" skapades
- 14:02 Affären flyttades till Vunnen · 38 750 kr

Under: "Det här är vad din arbetsledare slipper göra på kvällen." + två handlingar: primär "Boka en demo" (Calendly), sekundär "Se priserna". Rita som Handymates gränssnitt (mörk teal, kort), inte som hantverkarens.

### Sanningsregler

- Offertsidan, SMS-texten och stämpeln är de **riktiga** — ändra inte ordalydelse eller knapptext. ROT alltid "preliminärt". Ingen BankID.
- Inga påhittade siffror om Handymate ("2 000 offerter skickade", "godkänns på 12 min"). Händelselistan i efteråt-vyn får bara innehålla det som systemet faktiskt gör (accepterad, projekt, vunnen, bekräftelse).
- Exempeldata: **Ekström Bygg AB** (org.nr 556123-4567, F-skatt, Nacka), offert O-2026-0147 "Badrumsrenovering, Sjövägen 4": rivning + VVS + kakel + el, delsumma 62 000 kr ex moms, moms 15 500 kr, ROT-avdrag preliminärt −38 750 kr, **du betalar 38 750 kr**. Besökare: Anders Nilsson, 070-123 45 67, "Nilssons Bygg AB". Godkänt 2026-09-14 kl 14:02.
- "Offerten är på låtsas — knappen är på riktigt" är den ärliga ramen: ingen ska tro att hen beställt ett badrum.

### Leverabler

- Blocket mobil (390) + desktop (1280) i lägena tomt, skickar, skickat, godkänd, fel (tre varianter).
- SMS 1 + SMS 2 som meddelandebubblor.
- Efteråt-vyn (mobil + desktop).
- Komponentlista: formulär (3 fält + kryss), telefonram med befintlig offertsida, status-rad "kvar i dag", händelselista med tidsstämplar, CTA-par.

---

## Kodfakta för bygget (inte till Design)

- Landningssidan är ett **eget repo** (`C:\Users\Gaming\handymate-landing`, statisk HTML + Vercel-funktioner i `api/`). Blocket läggs i `index.html` mellan `#how-it-works` och `#bevis`. Sidans befintliga takräknare (`api/demo.js`) är in-memory per instans — duger inte för SMS-kostnad. Routen ska ligga i dashboard-repot med `checkPublicRateLimitDb` (`lib/rate-limit-db.ts`) och CORS för handymate.se.
- **Ny publik route** `POST /api/public/demo-quote` (force-dynamic): validera namn (bokstäver/mellanslag/bindestreck, ≤ 40 tecken — namnet hamnar i ett SMS, får inte bära fri text), `normalizeSwedishPhone`, firmanamn ≤ 40 tecken samma regel; grindar: 3/nummer/dygn, 5/IP/timme, **globalt dygnstak** (t.ex. 200) mot SMS-bombning; skapa offert i demo-företaget (fast `business_id`, seedad rad "Ekström Bygg AB" med logotyp + amber; firmanamn-override sätts på offertens `business_name`-snapshot om det finns ett sådant fält — annars alltid Ekström) med `valid_until = +7 d`, `sign_token`, kund = besökaren; skicka SMS via `sendSmsViaElks` med den riktiga offert-SMS-texten (samma byggare som `quotes/[id]/send`). Godkännandet går genom `finalizeAcceptedQuote` som vanligt → projekt + vunnen deal i demo-företaget; SMS 2 skickas ur `notifyQuoteSigned`-vägen bara när `business_id` = demo-företaget.
- Efteråt-vyn: `GET /api/public/demo-quote/[token]/status` → `{accepted_at, project_created_at, deal_won_at}` ur riktiga rader; blocket pollar var 5 s i max 10 min efter "skickat".
- Städning: cron raderar demo-företagets offerter/kunder/projekt/deals äldre än 7 dygn (samma mönster som demo-reset, `tests/demo-reset.spec.ts`). Leadet sparas via landningens `api/save-lead.js` bara vid kryss.
- Kostnad: SMS 0,52 kr/del (46elks, verifierat 2026-08-14); två SMS per genomförd demo ≈ 1 kr. 46elks-krediterna var slut 2026-08-18 — kolla saldot innan blocket går live.
- Beslut för Andreas: (1) SMS (rätt upplevelse, kostar, kan missbrukas) eller e-post-fallback när numret nekas? (2) Ska firmanamnet få styra avsändarnamnet i offerten, eller alltid Ekström? (3) Calendly-länken för "Boka en demo" saknas fortfarande (lanseringspolish).
