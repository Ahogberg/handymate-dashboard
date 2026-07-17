# HANDYMATE — STRATEGISK PLAN

_Version 2026-07-17. Del 1 är faktabaserad från kodbasen och databasen med
samma ärlighetsdisciplin som `tasks/capability-inventory.md` (LIVE = prod-
verifierat, BYGGT = i main/deployat men ej prod-verifierat, SPEC = ej byggt).
Siffror märkta [UPPSKATTNING] är härledda, inte mätta. Frågor märkta
[ANDREAS: ...] är medvetet öppna — de kräver ägarens svar, inte AI:ns._

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## DEL 1 — PRODUKTSTATUS (från kodbasen)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 1.1 Vad som är byggt och deployat

**Kärnprodukten** (allt deployat på app.handymate.se): AI-team med 6 agenter
(Matte chefsassistent/chatt, Lisa telefoni/SMS, Daniel sälj, Karin ekonomi,
Lars projekt, Hanna marknad) ovanpå en delad verktygsmotor, med **godkännande-
kön som central interaktionsyta** — sedan 2026-07-15 är 100 % av system-
initierade agent-utskick gatade genom kön eller förtjänad autonomi
(facit-låst beslutslogik). CRM, offerter (produktbank, tillval, ROT/RUT +
grön teknik-avdrag, visningsnivåer, PDF, e-signering), fakturor (Fortnox-synk,
påminnelser, ROT till Skatteverket), projekt (8-stegs workflow, ÄTA med
kundsignering, ekonomi/marginal med ärlighetsgrindning), bokningar/schema
(Google-synk), tidrapportering med attestering, kapacitetsmotor (v1),
lärande (förtjänad autonomi, preferenser, mönster, veckovärde).

**Cron-jobb/agentloopar** (27 st i vercel.json, dagliga om ej annat anges):
nattlig företagsanalys (agent-context 05:00) · 5 agent-observationsloopar
(06:00–06:20, Sonnet + thinking, skapar insikter + gatade förslag) ·
fakturapåminnelser (07:00 + 10:00) · offert-uppföljning (08:00) ·
Hanna-reaktivering (08:30) · recensionsförfrågningar (09:00) ·
kapacitetsfyllnad (måndagar 07:00 — tunn vecka → kö-förslag) · nurture-steg ·
Fortnox-synk (betalningar/kunder) · Gmail-lead-import · kampanjutskick ·
mönster-extraktion · månadsrapport · kalendersynk · underhåll.

**Frontend:** ~20 dashboardsidor (Idag-vyn med godkännandekö som primär yta,
godkännanden, kunder, offerter, fakturor + ROT-inlämning, projekt, kalender,
schema, tid, verksamhetsöversikt/pipeline, analys, kampanjer, leads, team,
inställningar, AI-widget-konfiguration). **Mobilapp** (Expo): Idag-hemskärm
med kö + "på väg"-SMS, godkännanden, projekt, offert-kamera, tid/attestering,
Matte-chatt med röst-in, ÄTA. *(Mobilkoden är komplett och mergad — men
inget EAS-bygge sedan maj: det som kör på telefoner är en gammal version.
Bygget är en manuell knapp som återstår.)*

**Integrationer:**
| Integration | Status | Kommentar |
|---|---|---|
| 46elks (telefoni/SMS) | **LIVE** | Samtalsrouting, SMS, nummer auto-provisioneras vid köp |
| Stripe (egen billing) | **BYGGT** | Checkout utan trial, webhook-idempotens — **B7-testköpet ej kört: betalvägen obevisad** |
| Fortnox | **BYGGT, licens-blockerad** | Kod + onboarding-import klara; kräver kundens integrationslicens 149 kr/mån |
| Google (kalender/Gmail) | **BYGGT** | OAuth + tokenrefresh + webhook-synk |
| OpenAI Whisper | **BYGGT** | Röstmeddelanden + mobil röst-in på svenska |
| Vapi/röstplattform | **SPEC** | Röst-Lisa har design-spec (tasks/rost-lisa-spec.md); RETELL-env-nyckel från tidigare experiment finns |

**De tre portalerna:**
1. **Kundportal** (`app/portal/[token]`) — **LIVE-klass**: fakturor (Swish-QR
   + "Jag har betalat"-bekräftelse), offerter med signering, projekt,
   meddelanden, rapporter, aktivitet. Mognast av de tre.
2. **Partnerportal** (`app/partners` + `/api/partners/dashboard` +
   admin-hantering + referral-belöning i billing-webhooken) — **BYGGT**:
   partner kan följa hänvisningar; provisionflödet kopplat till betalning.
   Ej prod-verifierad med riktig partner.
3. **Lead-leverantörsportal** (`app/lead-portal/[code]`) — **BYGGT**:
   leverantörsvy för lead-leverans/uppföljning med kategorier. Ej skarpt använd.

### 1.2 Tekniska styrkor att lyfta i säljmöten

**Unikt och svårt att replikera** (konkurrensresearch juli 2026, källbelagd):
- **Agentteam bakom EN godkännandekö med förtjänad autonomi.** Ingen aktör
  globalt skeppar mönstret (ServiceTitan Max = agera-först-eskalera-sen,
  enterprise; Jobber/HCP = singelfunktions-AI). Sedan TD-52-gatingen är
  claimen kod-bevisbar — och EU AI Act art. 14 (aug 2026) gör
  människa-godkänner-före-handling till compliance-fördel, inte bara UX.
- **Svensk back-office-vertikal:** ROT/RUT/grön teknik-avdrag med årstak och
  personnummer, produktbank med ROT-split på arbetsandel, Skatteverkets
  XML-inlämning, Fortnox-loop. Detta är moaten — agenttekniken är commodity
  (GoHighLevel talar svenska för $0.16/min), *domänmodellen* är det inte.
- **Lärandet:** approve-streaks → autonomierbjudanden, nattlig preferens-
  inlärning, offert-vinnaranalys, scope-creep-mönster — data som kompondar
  per kund och gör byte dyrare för varje månad.
- **Kapacitetsmotorn** (ServiceTitans viktigaste mekanik, förenklad för
  1–5-mannalag): en siffra alla kanaler läser; driver redan Hannas
  tunn-vecka-förslag, byggd för Röst-Lisas bokningar.

**Kan demonstreras live IDAG** (LIVE eller A-test-verifierat — inget BRANCH):
missat samtal → SMS → bokning (kärnkilen) · Idag-vyn med kön · tillvalsflödet
med kundsignering · produktbanken + visningsfilter (verifierad mot pilotens
riktiga data) · Pengar in-radarn · Förtroendetrappan · onboarding-wow-kedjan
(signup → Fortnox/CSV-import → payoff) · offert-vinnaranalysen · grön
teknik-avdrag på offert. **Får EJ demoas som beprövat:** Stripe-betalning
(B7), mobilens senaste version (EAS), röst-AI (finns ej).

### 1.3 Tekniska gap

**Blockerar betald kund 1:**
1. **B7 Stripe-testköpet** — betalvägen är aldrig bevisad end-to-end.
   Rigg klar (preview-branch + automatisering); ~1 timme av Andreas tid.
2. **EAS-mobilbygge** — säljlöftet "app i telefonen" kräver att bygget körs.
3. *(mjukt)* Migrations-svepet v68–v71 bekräftat i prod-Supabase.
Inget annat blockerar kund 1 — onboarding är self-serve hela vägen.

**Blockerar kund 10:** cron-arkitekturen (se 1.4) börjar slå i tak;
kostnadsattribution saknas för chatt-flöden (Anthropic-fakturan är en
klumpsumma — TD-36); korrektivt datastäd per pilot måste bli noll.

**Blockerar kund 50–100:** multi-tenancy-isolationen (se 1.4) måste få
DB-backstop; cron-fanout måste bli köbaserad; supportytan (idag: Andreas).

### 1.4 SKALNINGSANALYS

**Cron-kapacitet — första väggen, vid ca 10–20 kunder.**
Observations- och uppföljningscronerna itererar ALLA businesses sekventiellt
i en enda Vercel-invocation, en Sonnet-thinking-anrop per business i serie.
Flera av de tunga (agent-observations, quote-follow-up) saknar maxDuration-
konfiguration; taket är 60s (Pro-plan). Redan dokumenterat i tech-debt:
communication-check brände 3,97M tokens på 16 entiteter. **Vid 50–100
businesses timar looparna ut mitt i — senare kunder processas tyst aldrig.**
Fixen är känd och avgränsad: batching/kö (fan-out till per-business-
invocations) + dvala-filter för inaktiva konton. Uppskattad insats: dagar,
inte veckor. Ska göras före kund 20. Kostnadssidan är däremot INTE väggen —
cost-cap $5/dag/kund finns redan per business.

**AI-inferenskostnad per kund/månad — MÄTT (30 dagar, riktig databas):**
| Flöde | Mätvärde | Kommentar |
|---|---|---|
| Nattliga agentloopar (6 agenter, Sonnet+thinking) | **$0,11–1,56/kund** (1–16 kr) | Mest aktiva kontot (Bee, 93 runs): $1,56. Typiskt konto: $0,11 |
| Matte-chatt/widget/offert-AI (Sonnet) | **EJ ATTRIBUERAT** (TD-36) | Loggas inte per kund idag — [UPPSKATTNING] 2–10× nattliga vid aktiv användning |
| Skydd | Cost-cap $5/dag/kund | ≈ 550 kr/mån absolut värsta fall; praktiken ligger 50–500× under |

Konservativ totalbudget: **30–150 kr AI-kostnad/kund/månad** vid aktiv
användning. Router-mönstret (Haiku för bakgrund ~10× billigare, Sonnet för
kvalitet) är redan implementerat i trigger-routern; ~20 ställen har dock
Sonnet hårdkodat där Haiku skulle räcka — känd optimering, inte akut.

**46elks per kund/månad [UPPSKATTNING — verifiera mot avtal]:**
nummerhyra ~30–40 kr + SMS ~0,35–0,50 kr/st (pilotens volym: 4–35 SMS/mån
= under 20 kr; budgetera 100 SMS = ~45 kr) + vidarekopplade samtalsminuter
(största rörliga posten; 100 min ≈ 40–80 kr). **Totalt ~70–160 kr/kund/mån.**

**BRUTTOMARGINAL vid 5 995 kr/mån:**
COGS per kund ≈ AI (30–150) + 46elks (70–160) + infra-andel (Vercel Pro +
Supabase + Resend, fasta ~500–1000 kr/mån totalt → 5–100 kr/kund beroende på
antal) = **~100–400 kr/kund/mån → bruttomarginal 93–98 %.**
→ **Exit-matematiken i Del 4 hotas inte av COGS.** Det som avgör EBITDA är
löner och CAC, inte molnkostnad. Röst-Lisa ändrar kalkylen (röstminuter är
dyra — därav usage-komponent i dess prissättning, se spec).

**Multi-tenancy — ärlig bedömning: håller INTE obevakat till 100 kunder.**
All isolation sker i applikationskod (`.eq('business_id')`) — servern kör
service-role-nyckel som kringgår RLS, och kärntabellerna (customer, quotes,
invoice, booking, business_config) saknar RLS helt. En enda glömd filter-rad
= cross-tenant-läcka, utan databas-backstop; buggklassen har redan inträffat
internt. Vid dagens 1 pilot är risken hanterbar; **före kund 50 krävs
RLS-härdning på kärntabellerna + audit av alla queries.** Uppskattad insats:
en fokuserad vecka. (Positivt: allt är redan business_id-scopat i datamodellen
— det som saknas är skyddsnätet, inte arkitekturen.)

**Manuellt arbete per ny kund — nästan noll (verifierat i kod):**
Automatiskt vid signup→betalning: plan/status, **telefonnummer köps och
konfigureras av webhooken** (voice/SMS-webhooks + inspelning), automations-
defaults seedas, referral-belöning. Kundens egna steg (self-serve):
vidarekoppling av sin telefon (guidad, självbekräftad), Fortnox-OAuth (kräver
kundens egen licens), prislista/produktbank via import eller manuellt.
**Andreas per-kund-arbete idag: korrektivt datastäd hos piloter (ska bli
noll), inget provisioneringsarbete.** Dold kostnad per kund ≈ supporttid,
inte provisionering. Vapi förekommer inte i onboarding (röst = SPEC).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## DEL 2 — MARKNAD OCH POSITIONERING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**MÅLGRUPP (avatar):** Hantverkarföretag, 3–20 anställda, 5–50 MSEK
omsättning. Ägaren ofta tidigare hantverkare, inte tekniker. Skeptisk mot
IT-system, bränd av krångel. Använder idag Easoft/Bygglet eller Excel+pärm.
_Produktkonsekvens (redan byggd in): svenska rakt igenom, inga tekniska
termer, mobil-först för fältet, "teamet" som metafor istället för
"systemet", payoff med kundens egna siffror inom minuter i onboardingen._

**POSITIONERING:** _"De ger dig ett verktyg. Vi ger dig ett team."_
Konkurrenterna säljer ERP/projektverktyg med regelbaserad automatik —
användaren gör jobbet i systemet. Handymate säljer medarbetare som gör
jobbet och lär sig företaget, med ägaren som godkännare. Kategoriskillnad,
inte featureskillnad. Kodbeviset finns: godkännandekön är produktens
primära yta, inte en inställningssida.

**KONKURRENTLANDSKAP (research verifierad juli 2026, källor i
tasks/gap-backlog.md + minnesanteckningar):**
- **Bygglet** (SmartCraft): projektverktyg, ingen skeppad AI (verifierat —
  hela SmartCraft-portföljen saknar AI-features). Omsättning ~153M
  [ANDREAS: VERIFIERA SIFFRAN — ur din research, ej min].
- **Easoft** (EG Group): ERP med regelautomatik, ingen AI-medhjälpare.
- **BuddyPro** (NGM via ANTCO): städsektor-fokus. **WOOS:** skal.
- **Det verkliga hotet är inte FSM-bolagen** utan horisontella svenska
  AI-receptionister (Skaala 299 kr/mån med hantverkar-vertikal, Svaria m.fl.)
  som commoditiserar rösten underifrån — de svarar i telefon men äger inte
  back-officen. Globalt: ServiceTitan Max/Avoca bevisar betalviljan
  ($1–3k/mån) men finns inte på nordiska språk och gate:ar inte som vi.
- **Fönstret är öppet men stängs:** Simpro replatformade AI-first i maj
  2026 med Amsterdam-kontor som beachhead.

**PRISSÄTTNING:** Pro 5 995 kr/mån — allt ingår (verifierat i billing_plan:
Bas 2 495 / Pro 5 995 / Business 11 995, live-price-ids seedade).
[ANDREAS: bekräfta nivåerna + vad som skiljer Bas/Pro/Business i pitch —
koden har tre planer men positioneringen ovan nämner bara Pro/Enterprise.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## DEL 3 — GO-TO-MARKET: VÄGEN TILL KUND 1–10
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**UTGÅNGSLÄGE (ärligt):** Noll betalande kunder. Bee Service = pilot +
co-founder-bolag, comp. Christoffer Thanger äger 50 % och går mot att lämna
Bee för att sälja Handymate heltid. Databasen: 18 konton varav ~16 är
testkonton — inget aktivt konto representerar extern betalande kund.

**KANALHYPOTESER (otestade — rankade efter CAC-potential och tempo):**
1. **Christoffer som referens/hantverkare-till-hantverkare** — starkaste
   tillgången: en av dem som visar sitt eget företag live, inte en säljare.
   Kostnad ≈ 0, trovärdighet max. Kräver: case study från genomkörningen.
2. **Kalla SMS till hantverkare** — konkurrenterna gör det aldrig; vi har
   dessutom kampanjmotorn själva (dogfooding som demo). Lead-scraping via
   Google Maps/Hitta.se/Ratsit → CSV → kampanj. [Verktyg: OpenClaw SKILL.md]
3. **Google Ads "Bygglet alternativ" / "Easoft alternativ"** — fångar aktiv
   bytesintention; liten volym men het.
4. **Facebook-grupper för hantverkare** — konkurrenterna frånvarande;
   Christoffers röst passar formatet.
5. **Leads-modulen som hook** — brevutskick finns BYGGT i produkten
   (`lib/leads/api/brevutskick.ts`, Infoservice ~1,30 kr/adress → ~15 kr/brev);
   ingen konkurrent har det. Gratis demo som dörröppnare.
6. **Partnerportal** — byråer hänvisar mot provision (BYGGT, oanvänd).

**Första jobbet är inte att sälja till 100 — det är att hitta EN kanal som
ger kund 1–10 repeterbart med mätbar CAC.** Testa sekventiellt (2 veckor per
kanal), mät svar/demo/köp, döda det som inte funkar.
[ANDREAS: korrigera rankingen — vilken kanal tror du mest på?]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## DEL 4 — MILSTOLPAR OCH EXIT-MATEMATIK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**EXIT-KALKYL** — och Del 1:s dom över den: **bruttomarginalen (93–98 %)
bär kalkylen.** COGS per kund är 100–400 kr mot 5 995 kr i intäkt; AI-
kostnaden är inte risken. Riskerna mot 55 % EBITDA är löner, CAC och churn
— alla okända tills kanaltesterna körts.

    100 kunder × 5 995 × 12   = 7,2M ARR
    + Leads/brev/SMS-tillägg  ≈ 8M ARR
    × ~55 % EBITDA            ≈ 4,4M resultat
    × 8x ARR                  ≈ 60–70M värdering
    → 100 kunder = självförsörjande + gamla exit-målet

    300 kunder ≈ 25M ARR ≈ 13M EBITDA
    × 8x ARR / 15x EBITDA     ≈ 200M SEK
    → 300 kunder = 200M-målet

_Teknisk fotnot till kalkylen: vägen till 100 kunder kräver de två
skalningsinsatserna i Del 1.4 (cron-kö före kund 20, RLS-härdning före
kund 50) — båda är avgränsade veckoinsatser, inga ombyggen._

**Milstolpar [ANDREAS: sätt datum]:**
- Kund 1 (betald, ej comp): ______
- Kund 10 (kanal bevisad, CAC känd): ______
- Kund 50: ______
- Kund 100: ______
- Kund 300 / exit-förberedelse: ______

**EXIT-SCENARION:**
1. **Industriell köpare:** SmartCraft (Bygglet), EG Group (Easoft), Visma,
   Fortnox — köper marknadsandel + AI-kapabilitet de bevisligen saknar
   (verifierat: noll skeppad AI i deras portföljer juli 2026).
2. **Strategisk/PropTech:** nordisk eller internationell aktör som vill in
   i svensk hantverkarmarknad (jfr Simpros Amsterdam-beachhead).
3. [ANDREAS: finns ett tredje? T.ex. amerikansk field-service-konsolidering
   (ServiceTitan/Avoca-sfären) som köper Norden-ingång + gating-IP:t?]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## DEL 5 — NÄSTA 90 DAGAR (operativt)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[ANDREAS: fyll datum och namn — detta är delen där Byglo-planen har
Damir/Emma/Mikael och Handymate har ingen. Det ÄR problemet 90 dagarna
ska lösa.]

**Vecka 1–2 — Gör piloten bevisad:**
- [ ] Genomkörning med Christoffer: Golden Path lead→offert→projekt→faktura→
      Vunnen (förvandlar sista BYGGT→LIVE, ger case study). _A-testet A1–A5 +
      wow-kedjan är redan godkända 2026-07-15 — det som återstår är
      betalsteget och en dokumenterad hel-kedja._
- [ ] Stripe-testköp B7 (4242 mot preview) → betalvägen bevisad. Riggen står;
      Claude automatiserar B3/B4/B6 när testnycklarna klistras.
- [ ] EAS-mobilbygge → appen (med nya Idag-skärmen + korrekta kö-kort) på
      riktiga telefoner. Allt kod-klart; kommandot finns i LAUNCH-GUIDE.md.
- [ ] v68–v71 migrations-status verifierad i prod-Supabase (5 min SQL).
→ **Utan dessa kan inget säljas: du kan inte demoa betalning, ta betalt,
   eller visa mobilen.**

**Vecka 3–6 — Kanaltest:**
- [ ] Välj EN kanal från Del 3, kör 50–100 kontakter, mät svar → demo → köp.
- [ ] Christoffer i sitt nätverk: 5–10 hantverkare han känner.
- [ ] Pitch deck klar (underlag: detta dokument + capability-inventory +
      "Får inte sägas i demo"-listan) + case study från genomkörningen.
→ **Mål: kund 1–3 betalande.**

**Vecka 7–12 — Repeterbarhet:**
- [ ] Kanal 2 om kanal 1 inte gav CAC under [ANDREAS: tröskel, t.ex. 10 000 kr].
- [ ] Self-serve onboarding verifierad med kund N (ingen handpåläggning).
- [ ] Cron-kö-ombyggnaden (Del 1.4) senast när kund 15 närmar sig.
→ **Mål: kund 5–10, känd CAC, känd churn.**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## DEL 6 — FINANSIERING OCH ORGANISATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[ANDREAS: fyll — detta saknas helt i underlaget och kan inte härledas
ur kodbasen:]
- Nuläge: bootstrappat? Byglo är parallellt projekt — hur fördelas din tid?
- Christoffer: när lämnar han Bee? Vad lever han på tills Handymate betalar lön?
- Kapital: Almi? Vinnova? Seed vid X kunder? Eller bootstrap till 100?
- Break-even: vid hur många kunder betalar bolaget två löner?
  _(Räknehjälp från Del 1: vid 93–98 % bruttomarginal är break-even för
  2 × [ANDREAS: lönenivå] + fasta kostnader ≈ [2 × lön + ~15 tkr] / ~5 700 kr
  ≈ grovt 15–25 kunder vid normala lönenivåer — verifiera med riktiga tal.)_

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## KÄLLOR OCH DISCIPLIN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Del 1: kodbasen (git main 2026-07-17), riktig prod-databas (read-only-
mätningar 30 dagar), tasks/capability-inventory.md, tasks/tech-debt.md,
tasks/launch-verification.md. Konkurrensfakta: webbverifierad research
2026-07-11/12 med källor (minnesanteckningar + tasks/gap-backlog.md).
Allt omärkt är verifierat; [UPPSKATTNING] är härlett; [ANDREAS: ...] är öppet.
Dokumentet uppdateras vid varje större statusskifte (nästa: efter B7 + EAS).
