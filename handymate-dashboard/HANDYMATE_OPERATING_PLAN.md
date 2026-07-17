# HANDYMATE — OPERATIV ARBETSPLAN

_Version 2026-07-17. Systerdokument till HANDYMATE_STRATEGIC_PLAN.md:
strategin säger VAR VI STÅR — detta säger HUR VI ARBETAR. Där strategin har
öppna [ANDREAS:]-frågor sätter denna plan REKOMMENDERADE DEFAULTS (märkta
▸DEFAULT) som gäller tills Andreas säger annat. En arbetsplan får inte ha hål._

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## NORDSTJÄRNA OCH TRE HORISONTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Nordstjärnan:** varje vecka ska en hantverkare kunna säga _"teamet tjänade
in sin kostnad den här veckan"_ — mätt i veckovärdes-siffran de själva ser.
Allt annat (features, kanaler, pitch) är medel.

- **H1 — BEVISA & SÄLJ (nu → kund 10):** betalvägen bevisad, appen i händer,
  EN kanal som repeterbart ger kunder, känd CAC. Allt annat väntar.
- **H2 — SKALA (kund 10 → 100):** skalningsinsatserna (cron-kö, RLS),
  Röst-Lisa, self-serve utan handpåläggning, första anställningen.
- **H3 — MOAT & EXIT (kund 100 → 300):** AI-prissättning ur jobb-facit-datan,
  "Mitt hem"-portalen, exit-förberedelse enligt strategins Del 4.

**Regeln som styr allt: teknik följer kunder.** Ingen H2-teknik byggs i H1
utom när ett kundantal-tröskelvärde triggar den (se Teknisk roadmap).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ROLLER OCH VECKORYTM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Andreas (produkt/teknik/kapital):** grind-beslut, demos med teknisk tyngd,
Stripe/Apple/Supabase-knappar, finansieringsspåret, Byglo-balansen.
**Christoffer (sälj/trovärdighet):** ansiktet utåt — hantverkare som säljer
till hantverkare. Nätverkslistan, demos, pilotfeedback, case study-huvudperson.
**Claude + agentteamet (verkstaden):** bygger enligt denna plan autonomt på
brancher, granskar, verifierar, deployar efter grönt; researchar kanaldata;
uppdaterar dokument och mätetavla. Rapporterar per våg/vecka.

**Veckorytmen (▸DEFAULT måndagar):**
1. **Måndag — styrmöte 30 min** (Andreas + Christoffer, Claude förbereder
   underlaget söndag kväll): förra veckans mätetal, veckans 3 viktigaste,
   blockerare. Claude levererar en automatisk veckorapport som underlag.
2. **Tis–fre — exekvering:** Christoffer säljer (mål: 3 demos/vecka i Fas 1),
   Andreas tar grindbeslut inom 24h, Claude bygger nästa insats ur planen.
3. **Fredag — logg:** vad stängdes, vad lärde vi, beslutslogg uppdateras.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## FAS 1 — BEVISA (nu → kund 1) · mål: 2 veckor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Grindarna (Andreas, i ordning — allt annat väntar på dessa):**
- [ ] `npx eas-cli submit --platform ios --latest` → build 9 till TestFlight
      (SISTA steget — bygget är redan klart och väntar). Bjud in Christoffer.
- [ ] B7 Stripe-testköp: klistra sk_test/pk_test → Claude automatiserar
      resten av riggen → kort 4242 → `subscription_status='active'` bevisat.
- [ ] v68–v71 migrations-koll i Supabase (5 min SQL, Claude levererar frågan).
- [ ] Supabase-länk för typgenerering (2 min, stoppar typ-drift-klassen).

**Case-studyn (Andreas + Christoffer, ~2 timmar):**
- [ ] Genomkörning: en riktig lead → offert (med tillval + produktbank) →
      accept/signering → projekt → faktura → "Jag har betalat" → Vunnen.
      Filma/screenshotta varje steg. Detta blir (a) sista BYGGT→LIVE-flytten,
      (b) demo-manuset, (c) case-studyns råmaterial.
- [ ] Christoffer formulerar sin egen siffra: "X missade samtal fångade,
      Y timmar admin sparad, Z kr offerter skickade" — ur veckovärdes-vyn.

**Säljmaterialet (Claude bygger utkast, Christoffer/Andreas godkänner):**
- [ ] Pitch deck 8–10 sidor ur strategidokumentet ("verktyg vs team",
      demo-skärmar, Christoffers siffror, pris).
- [ ] Demo-manus 15 min: Idag-vyn med kön (30 sek wow) → missat samtal-SMS →
      offert med tillval → kundportal + signering → veckovärdet. STRIKT enligt
      inventeringens "får inte sägas"-lista (ingen röst-AI, ingen betalning
      förrän B7 grön, inget "beprövat i drift" om nya features).
- [ ] Onboarding-följeskrift: "första veckan med ditt team" (1 sida).

**Kund 1-kandidaten:** ▸DEFAULT Christoffers nätverk — han väljer de 3
varmaste av sina 5–10 och kör demos vecka 2. Kund 1 får pilotpris?
▸DEFAULT NEJ — fullt pris 5 995 med garantin (pengarna-tillbaka), annars
bevisar vi inte betalviljan. Rabatt = data vi inte kan använda.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## FAS 2 — KANALTEST (kund 1 → 10) · mål: vecka 3–12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Metod:** EN kanal i taget, 2 veckor per test, förbestämda mätpunkter,
döda eller dubbla. CAC-tröskel ▸DEFAULT 10 000 kr (≈ 1,7 månaders intäkt;
vid 93–98 % bruttomarginal betalar den sig <2 månader).

**Kanal A (vecka 3–4): Christoffers nätverk + hantverkare-till-hantverkare**
▸DEFAULT förstavalet — CAC ≈ 0, högst trovärdighet, snabbast lärande.
Playbook: 10 personliga kontakter → 5 demos → mål 2–3 kunder. Varje demo:
Christoffer visar SITT företags konto, inte en demo-miljö. Mät: kontakt→demo-
kvot, demo→köp-kvot, invändningarna ordagrant (Claude kategoriserar → pitch
justeras varje vecka).

**Kanal B (vecka 5–6): Kalla SMS** — bara om A inte nått 3 kunder.
Playbook: Claude scrapar 200 hantverkare (Google Maps/Hitta.se, org 3–20
anställda, ej storstadskedjor) → tvätt mot spärrlistor → 100 SMS via egen
kampanjmotor (dogfooding = demon i sig): _"Hej! Vi byggde en AI-assistent som
svarar när du inte kan — [Christoffers företag] använder den. 15 min demo?"_
— avsändare Christoffer, inte bolaget. Mät: svar %, demo %, kostnad/demo.
Juridik: B2B-SMS till näringsidkare på företagsnummer — Claude verifierar
marknadsföringslagens krav innan utskick [research-grind].

**Kanal C (vecka 7–8): Google Ads "Bygglet alternativ"/"Easoft alternativ"**
Budget ▸DEFAULT 5 000 kr test. Landningssida: jämförelsetabell verktyg-vs-
team + demo-bokning (Claude bygger sidan på site-motorn). Mät: CPC, demo-CAC.

**Kanal D–F (vecka 9+, om behövs):** FB-grupper (Christoffer-innehåll,
3 inlägg/vecka), brevutskick via leads-modulen (BYGGT — 15 kr/brev, 500 brev
= 7 500 kr test), partnerportalen (först vid kund 10+, kräver bevis).

**Parallellt hela Fas 2:**
- Onboarding-friktion → noll: varje ny kunds första vecka loggas; allt som
  krävde handpåläggning blir en fix inom 7 dagar.
- Churn-bevakning från dag 1: veckovärde per kund < kostnad två veckor i rad
  → Christoffer ringer. (Claude bygger larmet när kund 3 finns.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## TEKNISK ROADMAP — TRIGGAD AV KUNDANTAL, INTE DATUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Trigger | Insats | Storlek | Status |
|---|---|---|---|
| Nu (Fas 1) | B7-rigg, EAS-submit, migrations-koll | Andreas-knappar | Väntar |
| Kund 1 | Kostnadsattribution för chatt-flöden (TD-36) — veta vad varje kund kostar | Dagar | Spec klar i TD |
| Kund 3 | Churn-larmet (veckovärde vs kostnad) | Dagar | — |
| Kund 5 | Pengaloop Fas 2: Stripe Connect + Swish (7 kr-tak, verifierat) — auto-avstämning | ~1 vecka | Beslutsunderlag klart |
| Kund 10–15 | **Cron-kö-ombyggnaden** (serial→fanout; väggen vid ~20) | Dagar | Analys klar |
| Kund 10 | Röst-Lisa Fas 0-spike (plattformsval, svensk TTS-test) → Fas 1 utanför arbetstid | Spike: dagar; Fas 1: veckor | Spec klar (tasks/rost-lisa-spec.md) |
| Kund 30 | **RLS-härdning kärntabeller** + query-audit (tenancy-backstop) | ~1 vecka | Analys klar |
| Kund 20+ | Serviceavtal + rrule (churn-vallgrav), BankID-signering, kvittofångst | Per gap-backlog | Backlog |
| H3 | AI-pris ur jobb-facit, "Mitt hem", grannskaps-motorn | — | Moat-minnet |

_Claude kör dessa autonomt enligt etablerad arbetsmodell (Sonnet bygger,
Fable spec/granskar/mergar, facit-tester, grön verifiering före deploy)
när triggern nås — Andreas godkänner bara det som rör pengar/schema/pris._

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## MÄTETAVLAN (Claude sammanställer varje söndag)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Sälj:** kontakter → demos → köp (per kanal) · CAC per kanal · pipeline-värde
**Kund:** betalande kunder · churn · veckovärde/kund vs 5 995 · NPS-proxy
(godkännande-grad i kön = daglig förtroendemätare; autonomi-beviljanden =
djupaste förtroendesignalen)
**Drift:** AI-kostnad/kund (mätt) · 46elks/kund · cron-körtider (väggvarning
vid 30s) · supportärenden/kund
**Tröskellarm:** demo→köp < 20 % två veckor → pitch-workshop; CAC > 10 000 kr
→ kanalbyte; cron > 30 s → kö-ombyggnad NU oavsett kundantal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## BESLUTSLOGG & DEFAULTS SOM VÄNTAR VETO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸DEFAULTS satta i denna plan (gäller tills Andreas ändrar):
1. Kund 1 betalar fullt pris med garanti (ingen pilotrabatt)
2. Kanalordning A→B→C (nätverk → SMS → Ads), CAC-tröskel 10 000 kr
3. Veckorytm: måndagsmöte 30 min + söndagsrapport från Claude
4. Teknik triggas av kundantal enligt tabellen (inte kalendern)
5. Röst-Lisa väntar till kund 10 (Skaala-hotet bevakas — trigger för
   omprövning: konkurrent lanserar hantverkar-röst MED bokning)

**Kräver Andreas aktiva svar (kan inte defaultas):**
- Del 6 i strategin: Byglo-tidsfördelningen, Christoffers Bee-exit-datum,
  kapitalspåret (bootstrap vs Almi/Vinnova/seed), lönenivåer → break-even
- Milstolpsdatum för kund 1/10/50/100 (planen föreslår: kund 1 inom 2 veckor,
  kund 10 inom 12 — bekräfta eller justera)
- TD-19-namnfrågan (2 min, kosmetisk)

**Uppdateringsdisciplin:** detta dokument revideras vid varje fasskifte och
varje dödad/bevisad kanal. Strategidokumentet vid varje större statusskifte.
Claude äger versioneringen; Andreas äger besluten.
